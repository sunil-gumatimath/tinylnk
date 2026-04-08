"""FastAPI URL Shortener — Main Application."""

import html
import os
import io
import secrets

from dotenv import load_dotenv
load_dotenv()  # Load .env before any os.getenv() calls

import qrcode

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware

from . import crud, models, schemas
from .database import Base, engine, get_db
from .utils import anonymize_ip, is_safe_url, is_valid_alias

# Create tables
Base.metadata.create_all(bind=engine)

# Rate limiter
limiter = Limiter(key_func=get_remote_address)

# Admin API key for protected endpoints (set TINYLNK_ADMIN_KEY env var)
ADMIN_API_KEY = os.getenv("TINYLNK_ADMIN_KEY", "")
if not ADMIN_API_KEY:
    ADMIN_API_KEY = secrets.token_urlsafe(32)
    print(f"\u26a0\ufe0f  No TINYLNK_ADMIN_KEY set. Generated ephemeral key: {ADMIN_API_KEY}")

# CORS origins (comma-separated env var, locked down by default)
ALLOWED_ORIGINS = os.getenv(
    "TINYLNK_CORS_ORIGINS", "http://localhost:5173,http://localhost:8000"
).split(",")

# Optional: show a warning page before redirecting (default: disabled)
REDIRECT_WARNING = os.getenv("TINYLNK_REDIRECT_WARNING", "false").lower() == "true"

app = FastAPI(
    title="tinylnk",
    description="A fast and modern URL shortener API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Admin-Key"],
)


# ─── Security Middlewares ─────────────────────────────────


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add standard security headers to every response."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        return response


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject requests whose Content-Length exceeds 1 MB."""

    MAX_BODY_SIZE = 1_048_576  # 1 MB

    async def dispatch(self, request: Request, call_next):
        if request.headers.get("content-length"):
            if int(request.headers["content-length"]) > self.MAX_BODY_SIZE:
                return JSONResponse(
                    status_code=413,
                    content={"detail": "Request body too large."},
                )
        return await call_next(request)


app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestSizeLimitMiddleware)

app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Please slow down."},
    )


# Mount static files
STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if not os.path.exists(STATIC_DIR):
    # Try looking for dist in a slightly different place for Docker
    STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

ASSETS_DIR = os.path.join(STATIC_DIR, "assets")

RESERVED_ALIASES = {
    "api",
    "assets",
    "docs",
    "openapi.json",
    "favicon.ico",
    "favicon.svg",
    "icons.svg",
    "recent",
    "shorten",
    "stats",
}


# ─── Helpers ─────────────────────────────────────────────


def _interstitial_page(target_url: str) -> str:
    """Render a warning page before redirecting to an external URL."""
    safe_url = html.escape(target_url)
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Redirecting — tinylnk</title>
<meta http-equiv="refresh" content="5;url={safe_url}">
<style>
body{{font-family:system-ui,-apple-system,sans-serif;background:#0a0a0a;color:#e5e5e5;
display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}}
.c{{background:#1a1a1a;border:1px solid #333;border-radius:16px;padding:2.5rem;
max-width:520px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.4)}}
h2{{margin-top:0;font-size:1.4rem}}
.u{{word-break:break-all;background:#111;padding:.75rem 1rem;border-radius:8px;
font-family:monospace;font-size:.85rem;color:#60a5fa;margin:1.25rem 0;text-align:left}}
a.b{{display:inline-block;background:#2563eb;color:#fff;padding:.65rem 1.75rem;
border-radius:8px;text-decoration:none;font-weight:500;transition:background .15s}}
a.b:hover{{background:#1d4ed8}}
.s{{color:#666;font-size:.8rem;margin-top:1.25rem}}
</style></head><body><div class="c">
<h2>\u26a0\ufe0f You are leaving tinylnk</h2>
<p>You will be redirected to an external site:</p>
<div class="u">{safe_url}</div>
<a href="{safe_url}" class="b">Continue \u2192</a>
<p class="s">Auto-redirecting in 5 seconds\u2026</p>
</div></body></html>"""


def _require_admin_key(x_admin_key: str | None) -> None:
    """Require a valid admin key for sensitive management endpoints."""
    if not x_admin_key or not secrets.compare_digest(x_admin_key, ADMIN_API_KEY):
        raise HTTPException(status_code=403, detail="Admin key required.")


# Simple bounded cache for QR images (avoids repeated CPU-heavy generation)
_qr_cache: dict[str, bytes] = {}
_QR_CACHE_MAX = 500


def _generate_qr(short_url: str) -> bytes:
    """Generate (or retrieve cached) QR PNG bytes for a short URL."""
    if short_url in _qr_cache:
        return _qr_cache[short_url]

    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(short_url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    data = buf.getvalue()

    if len(_qr_cache) >= _QR_CACHE_MAX:
        _qr_cache.pop(next(iter(_qr_cache)))  # evict oldest
    _qr_cache[short_url] = data
    return data


# ─── Routes ──────────────────────────────────────────────


@app.get("/assets/{file_path:path}")
async def serve_assets(file_path: str):
    """Serve static assets (path-traversal safe)."""
    asset_path = os.path.realpath(os.path.join(ASSETS_DIR, file_path))
    assets_root = os.path.realpath(ASSETS_DIR)
    if not asset_path.startswith(assets_root + os.sep) and asset_path != assets_root:
        raise HTTPException(status_code=403, detail="Forbidden")
    if os.path.isfile(asset_path):
        return FileResponse(asset_path)
    raise HTTPException(status_code=404, detail="Asset not found")


@app.get("/favicon.svg")
async def serve_favicon():
    """Serve the favicon from the frontend dist directory."""
    favicon_path = os.path.join(STATIC_DIR, "favicon.svg")
    if os.path.isfile(favicon_path):
        return FileResponse(favicon_path, media_type="image/svg+xml")
    raise HTTPException(status_code=404, detail="Favicon not found")


@app.get("/icons.svg")
async def serve_icons():
    """Serve the icons sprite from the frontend dist directory."""
    icons_path = os.path.join(STATIC_DIR, "icons.svg")
    if os.path.isfile(icons_path):
        return FileResponse(icons_path, media_type="image/svg+xml")
    raise HTTPException(status_code=404, detail="Icons not found")


@app.get("/", response_class=HTMLResponse)
async def serve_frontend():
    """Serve the frontend HTML page."""
    index_path = os.path.join(STATIC_DIR, "index.html")
    if not os.path.isfile(index_path):
        return HTMLResponse(
            content=(
                "<h2>Frontend build not found</h2>"
                "<p>Run <code>bun run build</code> inside <code>frontend/</code> "
                "to generate <code>frontend/dist</code>.</p>"
            ),
            status_code=503,
        )
    return FileResponse(index_path)


@app.post("/api/shorten", response_model=schemas.URLResponse)
@limiter.limit("30/minute")
async def shorten_url(
    request: Request,
    url_data: schemas.URLCreate,
    db: Session = Depends(get_db),
):
    """Create a shortened URL."""
    # Validate custom alias if provided (case-insensitive reserved check)
    if url_data.custom_alias:
        if url_data.custom_alias.lower() in RESERVED_ALIASES:
            raise HTTPException(
                status_code=400, detail="This alias is reserved and cannot be used."
            )
        if not is_valid_alias(url_data.custom_alias):
            raise HTTPException(
                status_code=400,
                detail="Invalid alias. Use 3-50 alphanumeric characters, hyphens, or underscores.",
            )
        # Check if alias already exists
        existing = crud.get_url_by_code(db, url_data.custom_alias)
        if existing:
            raise HTTPException(status_code=409, detail="This alias is already taken.")

    # URL validation — enforce http(s) scheme only
    url_str = str(url_data.url).strip()
    if not url_str.startswith(("http://", "https://")):
        url_str = "https://" + url_str
        url_data.url = url_str

    # Block internal / private network targets (SSRF prevention)
    if not is_safe_url(url_str):
        raise HTTPException(
            status_code=400,
            detail="This URL target is not allowed (internal or invalid address).",
        )

    base_url = str(request.base_url).rstrip("/")
    if url_str.startswith(base_url):
        raise HTTPException(
            status_code=400,
            detail="Cannot shorten URLs pointing to this domain.",
        )

    db_url = crud.create_short_url(db, url_data)

    # Build the short URL
    base_url = str(request.base_url).rstrip("/")
    code = db_url.custom_alias or db_url.short_code

    return schemas.URLResponse(
        id=db_url.id,
        original_url=db_url.original_url,
        short_code=code,
        short_url=f"{base_url}/{code}",
        created_at=db_url.created_at,
        expires_at=db_url.expires_at,
        max_clicks=db_url.max_clicks,
        tag=db_url.tag,
        click_count=db_url.click_count,
    )


@app.get("/api/stats/{short_code}", response_model=schemas.URLStats)
@limiter.limit("60/minute")
async def get_stats(
    short_code: str,
    request: Request,
    x_admin_key: str | None = Header(None),
    db: Session = Depends(get_db),
):
    """Get click analytics for a short URL."""
    _require_admin_key(x_admin_key)
    stats = crud.get_url_stats(db, short_code)
    if not stats:
        raise HTTPException(status_code=404, detail="Short URL not found.")
    return stats


@app.get("/api/recent", response_model=list[schemas.URLResponse])
@limiter.limit("60/minute")
async def get_recent(
    request: Request,
    x_admin_key: str | None = Header(None),
    db: Session = Depends(get_db),
):
    """Get recently created URLs (admin only)."""
    _require_admin_key(x_admin_key)
    urls = crud.get_recent_urls(db)
    base_url = str(request.base_url).rstrip("/")
    return [
        schemas.URLResponse(
            id=u.id,
            original_url=u.original_url,
            short_code=u.custom_alias or u.short_code,
            short_url=f"{base_url}/{u.custom_alias or u.short_code}",
            created_at=u.created_at,
            expires_at=u.expires_at,
            max_clicks=u.max_clicks,
            tag=u.tag,
            click_count=u.click_count,
        )
        for u in urls
    ]


@app.delete("/api/urls/{short_code}", status_code=204)
@limiter.limit("20/minute")
async def delete_url_endpoint(
    short_code: str,
    request: Request,
    x_admin_key: str = Header(..., description="Admin API key"),
    db: Session = Depends(get_db),
):
    """Delete a shortened URL and its analytics (requires admin key)."""
    if not secrets.compare_digest(x_admin_key, ADMIN_API_KEY):
        raise HTTPException(status_code=403, detail="Invalid admin key.")

    if short_code.lower() in RESERVED_ALIASES:
        raise HTTPException(status_code=400, detail="Cannot delete reserved alias.")

    success = crud.delete_url(db, short_code)
    if not success:
        raise HTTPException(status_code=404, detail="Short URL not found.")
    return None


@app.get("/{short_code}")
async def redirect_to_url(
    short_code: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Redirect to the original URL and record the click."""
    # Skip API and static routes (case-insensitive)
    if short_code.lower() in RESERVED_ALIASES:
        raise HTTPException(status_code=404, detail="Not found.")

    url = crud.get_url_by_code(db, short_code)
    if not url:
        raise HTTPException(status_code=404, detail="Short URL not found.")

    # Check expiration
    if crud.is_url_expired(url):
        raise HTTPException(status_code=410, detail="This short URL has expired.")

    # Record click (IP is anonymized before storage)
    crud.record_click(
        db,
        url,
        referrer=request.headers.get("referer"),
        user_agent=request.headers.get("user-agent"),
        ip_address=anonymize_ip(request.client.host if request.client else None),
    )

    # Optionally show an interstitial warning page before redirecting
    if REDIRECT_WARNING:
        return HTMLResponse(content=_interstitial_page(url.original_url))

    return RedirectResponse(url=url.original_url, status_code=302)


@app.get("/api/qr/{short_code}")
@limiter.limit("30/minute")
async def get_qr_code(short_code: str, request: Request, db: Session = Depends(get_db)):
    """Generate a QR code for a short URL (cached)."""
    url = crud.get_url_by_code(db, short_code)
    if not url:
        raise HTTPException(status_code=404, detail="Short URL not found.")

    base_url = str(request.base_url).rstrip("/")
    code = url.custom_alias or url.short_code
    short_url = f"{base_url}/{code}"

    return Response(content=_generate_qr(short_url), media_type="image/png")


@app.get("/api/health")
async def health_check():
    """Health check endpoint for monitoring."""
    return {"status": "ok"}
