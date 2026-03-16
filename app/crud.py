"""Database CRUD operations for the URL shortener."""

from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone

from . import models, schemas
from .utils import encode_base62


def create_short_url(db: Session, url_data: schemas.URLCreate) -> models.URL:
    """Create a new shortened URL entry."""
    expires_at = None
    if url_data.expires_in_hours:
        expires_at = datetime.now(timezone.utc) + timedelta(hours=url_data.expires_in_hours)

    db_url = models.URL(
        original_url=str(url_data.url),
        short_code="",  # Placeholder, will be set after flush
        custom_alias=url_data.custom_alias,
        expires_at=expires_at,
    )
    db.add(db_url)
    db.flush()  # Get the auto-generated ID

    # Generate short code from the ID using Base62
    db_url.short_code = encode_base62(db_url.id + 1000)  # Offset to avoid very short codes

    db.commit()
    db.refresh(db_url)
    return db_url


def get_url_by_code(db: Session, short_code: str) -> models.URL | None:
    """Look up a URL by its short code or custom alias."""
    url = db.query(models.URL).filter(models.URL.short_code == short_code).first()
    if not url:
        url = db.query(models.URL).filter(models.URL.custom_alias == short_code).first()
    return url


def record_click(
    db: Session,
    url: models.URL,
    referrer: str | None = None,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> None:
    """Record a click event and increment the counter."""
    click = models.ClickEvent(
        url_id=url.id,
        referrer=referrer,
        user_agent=user_agent,
        ip_address=ip_address,
    )
    db.add(click)
    url.click_count += 1
    db.commit()


def get_url_stats(db: Session, short_code: str) -> dict | None:
    """Get analytics for a specific short URL."""
    url = get_url_by_code(db, short_code)
    if not url:
        return None

    recent_clicks = (
        db.query(models.ClickEvent)
        .filter(models.ClickEvent.url_id == url.id)
        .order_by(models.ClickEvent.clicked_at.desc())
        .limit(50)
        .all()
    )

    return {
        "original_url": url.original_url,
        "short_code": url.short_code,
        "created_at": url.created_at,
        "expires_at": url.expires_at,
        "total_clicks": url.click_count,
        "recent_clicks": recent_clicks,
    }


def get_recent_urls(db: Session, limit: int = 20) -> list[models.URL]:
    """Get the most recently created URLs."""
    return (
        db.query(models.URL)
        .order_by(models.URL.created_at.desc())
        .limit(limit)
        .all()
    )


def is_url_expired(url: models.URL) -> bool:
    """Check if a URL has expired."""
    if url.expires_at is None:
        return False
    return datetime.now(timezone.utc) > url.expires_at
