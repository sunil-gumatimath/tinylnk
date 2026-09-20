"""FastAPI URL Shortener — Main Application."""

import html
import io
import logging
import os

from dotenv import load_dotenv
from sqlalchemy import text

load_dotenv()  # Load .env before any os.getenv() calls

from datetime import datetime, timezone

import qrcode
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from PIL import ImageColor
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware

from . import crud, models, schemas
from .auth import AuthUser, OptionalAuthUser
from .database import Base, SessionLocal, engine, get_db
from .logging_config import RequestLogMiddleware, setup_logging
from .utils import anonymize_ip, is_safe_url, is_valid_alias

# Configure structured logging (reads LOG_LEVEL / LOG_FORMAT / SENTRY_DSN env vars)
setup_logging()

# Create tables and stamp/check the schema version (fails loudly on stale DBs)
Base.metadata.create_all(bind=engine)
_startup_db = SessionLocal()
try:
    models.ensure_schema_version(_startup_db)
finally:
    _startup_db.close()

# Rate limiter
limiter = Limiter(key_func=get_remote_address)



# CORS origins (comma-separated env var, locked down by default)
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "TINYLNK_CORS_ORIGINS", "http://localhost:5173,http://localhost:8000"
    ).split(",")
    if origin.strip()
]

# Optional: show a warning page before redirecting (default: disabled)
REDIRECT_WARNING = os.getenv("TINYLNK_REDIRECT_WARNING", "false").lower() == "true"

# ─── Rate limits (per-endpoint, env-tunable) ────────────────────────────────
# Redirects and QR codes are the product's *output* — they get the most
# generous defaults because a link shared to a busy channel or a QR scanned at
# an event concentrates many visitors behind one NAT / corporate egress IP.
# Everything else (shorten, stats, tags, export, delete, update) is a
# management action and can afford to be tighter.
RL_SHORTEN = os.getenv("TINYLNK_RATE_LIMIT_SHORTEN", "30/minute")
RL_UPDATE = os.getenv("TINYLNK_RATE_LIMIT_UPDATE", "30/minute")
RL_STATS = os.getenv("TINYLNK_RATE_LIMIT_STATS", "60/minute")
RL_EXPORT = os.getenv("TINYLNK_RATE_LIMIT_EXPORT", "30/minute")
RL_RECENT = os.getenv("TINYLNK_RATE_LIMIT_RECENT", "60/minute")
RL_TAGS = os.getenv("TINYLNK_RATE_LIMIT_TAGS", "60/minute")
RL_DELETE = os.getenv("TINYLNK_RATE_LIMIT_DELETE", "20/minute")
RL_REDIRECT = os.getenv("TINYLNK_RATE_LIMIT_REDIRECT", "600/minute")
RL_QR = os.getenv("TINYLNK_RATE_LIMIT_QR", "120/minute")

# Users whose Clerk sub is in this comma-separated allowlist can manage any
# link — including ownerless legacy rows created before per-user ownership
# existed (schema v1). Keep this to yourself / your operators.
ADMIN_USER_IDS = {
    uid.strip()
    for uid in os.getenv("TINYLNK_ADMIN_USER_IDS", "").split(",")
    if uid.strip()
}

# Docs are disabled by default in production (the OpenAPI schema leaks every
# endpoint). Set TINYLNK_ENABLE_DOCS=true to expose /docs and /openapi.json.
ENABLE_DOCS = os.getenv("TINYLNK_ENABLE_DOCS", "false").lower() == "true"

app = FastAPI(
    title="tinylnk",
    description="A fast and modern URL shortener API",
    version="1.0.0",
    docs_url="/docs" if ENABLE_DOCS else None,
    redoc_url="/redoc" if ENABLE_DOCS else None,
    openapi_url="/openapi.json" if ENABLE_DOCS else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"],
    allow_headers=["Content-Type", "Authorization"],
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
app.add_middleware(RequestLogMiddleware)

app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests. Please slow down."},
    )


# Mount static files — candidate locations for the built frontend (local
# checkout layout vs Docker image layout), first existing dir wins.
_STATIC_CANDIDATES = [
    os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")),
    "/app/frontend/dist",  # Docker image layout (absolute, no guessing)
]
STATIC_DIR = next((p for p in _STATIC_CANDIDATES if os.path.isdir(p)), _STATIC_CANDIDATES[0])

ASSETS_DIR = os.path.join(STATIC_DIR, "assets")

RESERVED_ALIASES = {
    "api",
    "assets",
    "docs",
    "openapi.json",
    "favicon.ico",
    "favicon.svg",
    "recent",
    "shorten",
    "stats",
}


# ─── Helpers ─────────────────────────────────────────────


def _interstitial_page(target_url: str, code: str) -> str:
    """Render a warning page before redirecting to an external URL.

    The click is NOT counted when this page is viewed — it is recorded by the
    ``/__continue/{code}`` hop that the Continue button and the meta-refresh
    both point at, so analytics reflect only visitors who actually left.
    """
    safe_url = html.escape(target_url)
    continue_url = html.escape(f"/__continue/{code}")
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Redirecting — tinylnk</title>
<meta http-equiv="refresh" content="5;url={continue_url}">
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
<a href="{continue_url}" class="b">Continue \u2192</a>
<p class="s">Auto-redirecting in 5 seconds\u2026</p>
</div></body></html>"""






# Simple bounded cache for QR images (avoids repeated CPU-heavy generation)
_qr_cache: dict[str, bytes] = {}
_QR_CACHE_MAX = 500


def _generate_qr(
    short_url: str,
    fg_color: str = "black",
    bg_color: str = "white",
) -> bytes:
    """Generate (or retrieve cached) QR PNG bytes for a short URL."""
    cache_key = f"{short_url}:{fg_color}:{bg_color}"
    if cache_key in _qr_cache:
        return _qr_cache[cache_key]

    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(short_url)
    qr.make(fit=True)

    img = qr.make_image(fill_color=fg_color, back_color=bg_color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    data = buf.getvalue()

    if len(_qr_cache) >= _QR_CACHE_MAX:
        _qr_cache.pop(next(iter(_qr_cache)))  # evict oldest
    _qr_cache[cache_key] = data
    return data


def _parse_date(date_str: str | None) -> datetime | None:
    """Parse an ISO date string to a datetime object."""
    if not date_str:
        return None
    try:
        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


def _url_response(db_url: models.URL, base_url: str) -> schemas.URLResponse:
    """Build a URLResponse from an ORM row (alias preferred over code)."""
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
        custom_alias=db_url.custom_alias,
    )


def _record_click(db: Session, url: models.URL, request: Request) -> bool | None:
    """Atomically claim and record a click; never break the redirect when
    analytics storage fails.

    Returns ``False`` when a concurrent redirect already consumed the last
    allowed click (the guarded UPDATE declines this one), ``True`` when the
    click was recorded, and ``None`` when recording failed (still redirect).
    """
    try:
        return crud.record_click(
            db,
            url,
            referrer=request.headers.get("referer"),
            user_agent=request.headers.get("user-agent"),
            ip_address=anonymize_ip(request.client.host if request.client else None),
        )
    except Exception:
        logging.exception("Failed to record click")
        # Still redirect even if analytics recording fails
        return None


def _claim_click_or_410(db: Session, url: models.URL, request: Request) -> None:
    """Record a click, refusing the redirect when the atomic claim is declined."""
    if _record_click(db, url, request) is False:
        # A concurrent redirect may have consumed the final allowed click after
        # the ORM row was read; the guarded UPDATE declines this request.
        raise HTTPException(status_code=410, detail="This short URL has reached its click limit.")


def _check_redirectable(url: models.URL) -> None:
    """Raise 410 if the link is dead (click limit reached or expired)."""
    # Enforce the click limit BEFORE recording — never count a click that pushes
    # a link past its cap, and never redirect a link that's already at/over it.
    if url.max_clicks is not None and url.click_count >= url.max_clicks:
        raise HTTPException(status_code=410, detail="This short URL has reached its click limit.")
    if crud.is_url_expired(url):
        raise HTTPException(status_code=410, detail="This short URL has expired.")


# ─── Routes ──────────────────────────────────────────────


@app.api_route("/assets/{file_path:path}", methods=["GET", "HEAD"])
async def serve_assets(file_path: str):
    """Serve static assets (path-traversal safe)."""
    asset_path = os.path.realpath(os.path.join(ASSETS_DIR, file_path))
    assets_root = os.path.realpath(ASSETS_DIR)
    if not asset_path.startswith(assets_root + os.sep) and asset_path != assets_root:
        raise HTTPException(status_code=403, detail="Forbidden")
    if os.path.isfile(asset_path):
        return FileResponse(
            asset_path,
            headers={"Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable"},
        )
    raise HTTPException(status_code=404, detail="Asset not found")


@app.api_route("/favicon.svg", methods=["GET", "HEAD"])
async def serve_favicon():
    """Serve the favicon from the frontend dist directory."""
    favicon_path = os.path.join(STATIC_DIR, "favicon.svg")
    if os.path.isfile(favicon_path):
        return FileResponse(
            favicon_path,
            media_type="image/svg+xml",
            headers={"Cache-Control": "public, max-age=86400, s-maxage=86400"},
        )
    raise HTTPException(status_code=404, detail="Favicon not found")


@app.api_route("/", methods=["GET", "HEAD"], response_class=HTMLResponse)
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
    return FileResponse(
        index_path,
        headers={"Cache-Control": "no-cache"},
    )


@app.post("/api/shorten", response_model=schemas.URLResponse)
@limiter.limit(RL_SHORTEN)
async def shorten_url(
    request: Request,
    url_data: schemas.URLCreate,
    auth: OptionalAuthUser,
    db: Session = Depends(get_db),
):
    """Create a shortened URL.

    Public — no auth required — but when the caller sends a valid Clerk token
    the link is owned by that user (only they and admin-allowlisted users can
    manage it). Anonymous links stay ownerless and are manageable by the admin
    allowlist (TINYLNK_ADMIN_USER_IDS) only.
    """
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

    try:
        db_url = crud.create_short_url(db, url_data, owner_id=auth["sub"] if auth else None)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

    return _url_response(db_url, str(request.base_url).rstrip("/"))


@app.put("/api/urls/{short_code}", response_model=schemas.URLResponse)
@limiter.limit(RL_UPDATE)
async def update_url_endpoint(
    short_code: str,
    request: Request,
    update_data: schemas.URLUpdate,
    auth: AuthUser,
    db: Session = Depends(get_db),
):
    """Update a shortened URL's properties (requires auth + ownership)."""

    url = crud.get_url_by_code(db, short_code)
    # 404 (not 403) for anything the caller may not manage — do not confirm
    # that another user's short code exists.
    if not url or not crud.resolve_owner(url, auth["sub"], ADMIN_USER_IDS):
        raise HTTPException(status_code=404, detail="Short URL not found.")

    # Validate new URL if provided
    if update_data.original_url:
        url_str = str(update_data.original_url).strip()
        if not url_str.startswith(("http://", "https://")):
            url_str = "https://" + url_str
            update_data.original_url = url_str
        if not is_safe_url(url_str):
            raise HTTPException(
                status_code=400,
                detail="This URL target is not allowed.",
            )

    # Validate new alias if provided
    if update_data.custom_alias:
        if update_data.custom_alias.lower() in RESERVED_ALIASES:
            raise HTTPException(
                status_code=400, detail="This alias is reserved."
            )
        if not is_valid_alias(update_data.custom_alias):
            raise HTTPException(
                status_code=400,
                detail="Invalid alias. Use 3-50 alphanumeric characters, hyphens, or underscores.",
            )

    try:
        updated = crud.update_url(db, url, update_data)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e

    return _url_response(updated, str(request.base_url).rstrip("/"))


@app.get("/api/stats/{short_code}", response_model=schemas.URLStats)
@limiter.limit(RL_STATS)
async def get_stats(
    short_code: str,
    request: Request,
    auth: AuthUser,
    start_date: str | None = Query(None, description="ISO date string for range start"),
    end_date: str | None = Query(None, description="ISO date string for range end"),
    db: Session = Depends(get_db),
):
    """Get click analytics for a short URL (requires auth + ownership)."""

    parsed_start = _parse_date(start_date)
    parsed_end = _parse_date(end_date)

    url = crud.get_url_by_code(db, short_code)
    if not url or not crud.resolve_owner(url, auth["sub"], ADMIN_USER_IDS):
        raise HTTPException(status_code=404, detail="Short URL not found.")

    stats = crud.get_url_stats(db, short_code, parsed_start, parsed_end)
    if not stats:
        raise HTTPException(status_code=404, detail="Short URL not found.")
    return stats


@app.get("/api/stats/{short_code}/export")
@limiter.limit(RL_EXPORT)
async def export_stats(
    short_code: str,
    request: Request,
    auth: AuthUser,
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Export click analytics as CSV (requires auth + ownership)."""

    parsed_start = _parse_date(start_date)
    parsed_end = _parse_date(end_date)

    url = crud.get_url_by_code(db, short_code)
    if not url or not crud.resolve_owner(url, auth["sub"], ADMIN_USER_IDS):
        raise HTTPException(status_code=404, detail="Short URL not found.")

    csv_data = crud.export_stats_csv(db, short_code, parsed_start, parsed_end)
    if csv_data is None:
        raise HTTPException(status_code=404, detail="Short URL not found.")

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="tinylnk_{short_code}_analytics.csv"'
        },
    )


@app.get("/api/recent", response_model=list[schemas.URLResponse])
@limiter.limit(RL_RECENT)
async def get_recent(
    request: Request,
    auth: AuthUser,
    search: str | None = Query(None, description="Search by URL, alias, or short code"),
    tag: str | None = Query(None, description="Filter by tag"),
    limit: int = Query(100, ge=1, le=100, description="Max links to return (1-100)"),
    offset: int = Query(0, ge=0, description="Skip this many links (pagination)"),
    db: Session = Depends(get_db),
):
    """Get this caller's recently created URLs, with search/tag/pagination.

    Results are scoped to links the caller owns; TINYLNK_ADMIN_USER_IDS members
    additionally see ownerless (legacy/anonymous) links.
    """
    creator_ip = request.client.host if request.client else None
    urls = crud.get_recent_urls(
        db,
        search=search,
        tag=tag,
        limit=limit,
        offset=offset,
        owner_id=auth["sub"],
        admin_ids=ADMIN_USER_IDS,
        creator_ip=creator_ip,
    )
    base_url = str(request.base_url).rstrip("/")
    return [_url_response(u, base_url) for u in urls]


@app.get("/api/tags", response_model=list[str])
@limiter.limit(RL_TAGS)
async def get_tags(
    request: Request,
    auth: AuthUser,
    db: Session = Depends(get_db),
):
    """Get unique tags across the links this caller can manage."""
    creator_ip = request.client.host if request.client else None
    return crud.get_distinct_tags(
        db, owner_id=auth["sub"], admin_ids=ADMIN_USER_IDS, creator_ip=creator_ip
    )


@app.delete("/api/urls/{short_code}", status_code=204)
@limiter.limit(RL_DELETE)
async def delete_url_endpoint(
    short_code: str,
    request: Request,
    auth: AuthUser,
    db: Session = Depends(get_db),
):
    """Delete a shortened URL and its analytics (requires auth + ownership)."""

    if short_code.lower() in RESERVED_ALIASES:
        raise HTTPException(status_code=400, detail="Cannot delete reserved alias.")

    url = crud.get_url_by_code(db, short_code)
    if not url or not crud.resolve_owner(url, auth["sub"], ADMIN_USER_IDS):
        raise HTTPException(status_code=404, detail="Short URL not found.")

    db.delete(url)
    db.commit()
    return None


@app.get("/__continue/{short_code}")
@limiter.limit(RL_REDIRECT)
async def continue_redirect(
    short_code: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Second hop of the interstitial flow: record the click, then redirect.

    Only used when TINYLNK_REDIRECT_WARNING=true — the warning page's Continue
    button and meta-refresh land here, so a click is counted only when the
    visitor actually proceeds, not when they merely saw the warning.
    """
    url = crud.get_url_by_code(db, short_code)
    if not url:
        raise HTTPException(status_code=404, detail="Short URL not found.")
    _check_redirectable(url)
    _claim_click_or_410(db, url, request)
    return RedirectResponse(url=url.original_url, status_code=302)


@app.get("/{short_code}")
@limiter.limit(RL_REDIRECT)
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

    _check_redirectable(url)

    # With the interstitial enabled, the click is recorded by /__continue
    # (the visitor's actual departure), not by viewing the warning page.
    if REDIRECT_WARNING:
        return HTMLResponse(content=_interstitial_page(url.original_url, short_code))

    _claim_click_or_410(db, url, request)
    return RedirectResponse(url=url.original_url, status_code=302)


@app.get("/api/qr/{short_code}")
@limiter.limit(RL_QR)
async def get_qr_code(
    short_code: str,
    request: Request,
    fg: str = Query("black", description="Foreground color (hex without #, or color name)"),
    bg: str = Query("white", description="Background color (hex without #, or color name)"),
    db: Session = Depends(get_db),
):
    """Generate a QR code for a short URL with customizable colors."""
    url = crud.get_url_by_code(db, short_code)
    if not url:
        raise HTTPException(status_code=404, detail="Short URL not found.")

    base_url = str(request.base_url).rstrip("/")
    code = url.custom_alias or url.short_code
    short_url = f"{base_url}/{code}"

    # Convert hex values (e.g. "1d4ed8" → "#1d4ed8")
    fg_color = f"#{fg}" if len(fg) == 6 and all(c in "0123456789abcdefABCDEF" for c in fg) else fg
    bg_color = f"#{bg}" if len(bg) == 6 and all(c in "0123456789abcdefABCDEF" for c in bg) else bg

    # Reject unknown color names/values with 400 instead of a 500 from PIL
    for name, value in (("fg", fg_color), ("bg", bg_color)):
        try:
            ImageColor.getrgb(value)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid {name} color: use a hex value or a known color name.",
            ) from None

    return Response(content=_generate_qr(short_url, fg_color, bg_color), media_type="image/png")



@app.api_route("/api/health", methods=["GET", "HEAD"])
async def health_check(db: Session = Depends(get_db)):
    """Health check with DB connectivity verification."""
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    body = {
        "status": "ok" if db_ok else "error",
        "database": "connected" if db_ok else "disconnected",
    }
    if not db_ok:
        return JSONResponse(status_code=503, content=body)
    return body
