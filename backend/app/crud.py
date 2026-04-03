"""Database CRUD operations for the URL shortener."""

from collections import Counter
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session
from user_agents import parse

from . import models, schemas
from .utils import encode_base62


def create_short_url(db: Session, url_data: schemas.URLCreate) -> models.URL:
    """Create a new shortened URL entry."""
    expires_at = None
    if url_data.expires_in_hours:
        expires_at = datetime.now(timezone.utc) + timedelta(
            hours=url_data.expires_in_hours
        )

    db_url = models.URL(
        original_url=str(url_data.url),
        short_code="",  # Placeholder, will be set after flush
        custom_alias=url_data.custom_alias,
        expires_at=expires_at,
        max_clicks=url_data.max_clicks,
        tag=url_data.tag,
    )
    db.add(db_url)
    db.flush()  # Get the auto-generated ID

    # Generate short code from the ID using Base62
    db_url.short_code = encode_base62(
        db_url.id + 1000
    )  # Offset to avoid very short codes

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
    url.click_count = models.URL.click_count + 1
    db.commit()


def get_url_stats(db: Session, short_code: str) -> dict | None:
    """Get analytics for a specific short URL."""
    url = get_url_by_code(db, short_code)
    if not url:
        return None

    clicks = (
        db.query(models.ClickEvent)
        .filter(models.ClickEvent.url_id == url.id)
        .order_by(models.ClickEvent.clicked_at.desc())
        .all()
    )

    recent_clicks = clicks[:50]

    clicks_by_date_dict = Counter()
    browser_dict = Counter()
    os_dict = Counter()

    for click in clicks:
        # We need to make sure timezone matches, assuming UTC stored
        date_str = click.clicked_at.strftime("%Y-%m-%d")
        clicks_by_date_dict[date_str] += 1

        if click.user_agent:
            ua = parse(click.user_agent)
            browser_dict[ua.browser.family] += 1
            os_dict[ua.os.family] += 1
        else:
            browser_dict["Unknown"] += 1
            os_dict["Unknown"] += 1

    # Format for charting
    clicks_by_date = [
        {"name": k, "value": v} for k, v in sorted(clicks_by_date_dict.items())
    ]
    browser_stats = [{"name": k, "value": v} for k, v in browser_dict.items()]
    os_stats = [{"name": k, "value": v} for k, v in os_dict.items()]

    return {
        "original_url": url.original_url,
        "short_code": url.custom_alias or url.short_code,
        "created_at": url.created_at,
        "expires_at": url.expires_at,
        "max_clicks": url.max_clicks,
        "tag": url.tag,
        "total_clicks": url.click_count,
        "clicks_by_date": clicks_by_date,
        "browser_stats": browser_stats,
        "os_stats": os_stats,
        "recent_clicks": recent_clicks,
    }


def get_recent_urls(db: Session, limit: int = 20) -> list[models.URL]:
    """Get the most recently created URLs."""
    return (
        db.query(models.URL).order_by(models.URL.created_at.desc()).limit(limit).all()
    )


def is_url_expired(url: models.URL) -> bool:
    """Check if a URL has expired."""
    if url.max_clicks is not None and url.click_count >= url.max_clicks:
        return True

    if url.expires_at is None:
        return False

    expires_at = url.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    return datetime.now(timezone.utc) > expires_at


def delete_url(db: Session, short_code: str) -> bool:
    """Delete a URL by its short code or custom alias.
    Because of cascade rules, this also deletes associated click events.
    """
    url = get_url_by_code(db, short_code)
    if not url:
        return False

    db.delete(url)
    db.commit()
    return True

# TODO: Add comprehensive error handling

# TODO: Add database query optimization with indexes

# TODO: Add bulk URL shortening endpoint

# TODO: Add search functionality for user links

# TODO: Add comprehensive error handling for database operations

# TODO: Add bulk URL shortening endpoint

# TODO: Add search functionality with full-text search
