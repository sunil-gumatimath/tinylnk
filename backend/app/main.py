"""FastAPI URL Shortener — Main Application."""

import os
import io
import qrcode

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from . import crud, models, schemas
from .database import Base, engine, get_db
from .utils import is_valid_alias

# Create tables
Base.metadata.create_all(bind=engine)

# Rate limiter
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="tinylnk",
    description="A fast and modern URL shortener API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    "recent",
    "shorten",
    "stats",
}


# ─── Routes ──────────────────────────────────────────────


@app.get("/assets/{file_path:path}")
async def serve_assets(file_path: str):
    """Serve static assets dynamically."""
    asset_path = os.path.join(ASSETS_DIR, file_path)
    if os.path.isfile(asset_path):
        return FileResponse(asset_path)
    raise HTTPException(status_code=404, detail="Asset not found")


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
    # Validate custom alias if provided
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

    # Basic URL validation
    url_str = str(url_data.url).strip()
    if not url_str.startswith(("http://", "https://")):
        url_str = "https://" + url_str
        url_data.url = url_str

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
async def get_stats(short_code: str, db: Session = Depends(get_db)):
    """Get click analytics for a short URL."""
    stats = crud.get_url_stats(db, short_code)
    if not stats:
        raise HTTPException(status_code=404, detail="Short URL not found.")
    return stats


@app.get("/api/recent", response_model=list[schemas.URLResponse])
async def get_recent(request: Request, db: Session = Depends(get_db)):
    """Get recently created URLs."""
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
async def delete_url_endpoint(short_code: str, db: Session = Depends(get_db)):
    """Delete a shortened URL and its analytics."""
    if short_code in RESERVED_ALIASES:
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
    # Skip API and static routes
    if short_code in RESERVED_ALIASES:
        raise HTTPException(status_code=404, detail="Not found.")

    url = crud.get_url_by_code(db, short_code)
    if not url:
        raise HTTPException(status_code=404, detail="Short URL not found.")

    # Check expiration
    if crud.is_url_expired(url):
        raise HTTPException(status_code=410, detail="This short URL has expired.")

    # Record click
    crud.record_click(
        db,
        url,
        referrer=request.headers.get("referer"),
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )

    return RedirectResponse(url=url.original_url, status_code=302)

@app.get("/api/qr/{short_code}")
async def get_qr_code(short_code: str, request: Request, db: Session = Depends(get_db)):
    """Generate a QR code for a short URL."""
    url = crud.get_url_by_code(db, short_code)
    if not url:
        raise HTTPException(status_code=404, detail="Short URL not found.")

    base_url = str(request.base_url).rstrip("/")
    code = url.custom_alias or url.short_code
    short_url = f"{base_url}/{code}"

    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(short_url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='PNG')

    return Response(content=img_byte_arr.getvalue(), media_type="image/png")

