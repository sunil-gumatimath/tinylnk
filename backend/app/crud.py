"""Database CRUD operations for the URL shortener."""

import csv
import io
import secrets
from collections import Counter
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session
from user_agents import parse

from . import models, schemas


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

    # Generate a cryptographically random short code (collision-safe)
    for _ in range(10):
        code = secrets.token_urlsafe(6)
        existing = db.query(models.URL).filter(models.URL.short_code == code).first()
        if not existing:
            db_url.short_code = code
            break
    else:
        raise RuntimeError("Failed to generate unique short code after 10 attempts")

    db.commit()
    db.refresh(db_url)
    return db_url


def get_url_by_code(db: Session, short_code: str) -> models.URL | None:
    """Look up a URL by its short code or custom alias."""
    url = db.query(models.URL).filter(models.URL.short_code == short_code).first()
    if not url:
        url = db.query(models.URL).filter(models.URL.custom_alias == short_code).first()
    return url


def update_url(
    db: Session,
    url: models.URL,
    data: schemas.URLUpdate,
) -> models.URL:
    """Update an existing URL's editable fields."""
    if data.original_url is not None:
        url.original_url = str(data.original_url)

    if data.custom_alias is not None:
        # Check uniqueness (skip if same as current)
        if data.custom_alias != url.custom_alias:
            existing = (
                db.query(models.URL)
                .filter(models.URL.custom_alias == data.custom_alias)
                .first()
            )
            if existing and existing.id != url.id:
                raise ValueError("This alias is already taken.")
            url.custom_alias = data.custom_alias or None

    if data.tag is not None:
        url.tag = data.tag or None

    if data.expires_in_hours is not None:
        if data.expires_in_hours <= 0:
            url.expires_at = None  # Clear expiration
        else:
            url.expires_at = datetime.now(timezone.utc) + timedelta(
                hours=data.expires_in_hours
            )

    if data.max_clicks is not None:
        url.max_clicks = data.max_clicks if data.max_clicks > 0 else None

    db.commit()
    db.refresh(url)
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


def get_url_stats(
    db: Session,
    short_code: str,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> dict | None:
    """Get analytics for a specific short URL, optionally filtered by date range."""
    url = get_url_by_code(db, short_code)
    if not url:
        return None

    query = (
        db.query(models.ClickEvent)
        .filter(models.ClickEvent.url_id == url.id)
    )

    # Apply date range filter
    if start_date:
        if start_date.tzinfo is None:
            start_date = start_date.replace(tzinfo=timezone.utc)
        query = query.filter(models.ClickEvent.clicked_at >= start_date)
    if end_date:
        if end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=timezone.utc)
        query = query.filter(models.ClickEvent.clicked_at <= end_date)

    clicks = query.order_by(models.ClickEvent.clicked_at.desc()).all()

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
        "total_clicks": len(clicks),  # Filtered count
        "clicks_by_date": clicks_by_date,
        "browser_stats": browser_stats,
        "os_stats": os_stats,
        "recent_clicks": recent_clicks,
    }


def export_stats_csv(
    db: Session,
    short_code: str,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> str | None:
    """Export click events as a CSV string."""
    url = get_url_by_code(db, short_code)
    if not url:
        return None

    query = (
        db.query(models.ClickEvent)
        .filter(models.ClickEvent.url_id == url.id)
    )

    if start_date:
        if start_date.tzinfo is None:
            start_date = start_date.replace(tzinfo=timezone.utc)
        query = query.filter(models.ClickEvent.clicked_at >= start_date)
    if end_date:
        if end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=timezone.utc)
        query = query.filter(models.ClickEvent.clicked_at <= end_date)

    clicks = query.order_by(models.ClickEvent.clicked_at.desc()).all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["clicked_at", "referrer", "browser", "os", "ip_address"])

    for click in clicks:
        browser = "Unknown"
        os_name = "Unknown"
        if click.user_agent:
            ua = parse(click.user_agent)
            browser = ua.browser.family
            os_name = ua.os.family

        writer.writerow([
            click.clicked_at.isoformat() if click.clicked_at else "",
            click.referrer or "Direct",
            browser,
            os_name,
            click.ip_address or "",
        ])

    return buf.getvalue()


def get_recent_urls(
    db: Session,
    limit: int = 20,
    search: str | None = None,
    tag: str | None = None,
) -> list[models.URL]:
    """Get the most recently created URLs, optionally filtered by search term or tag."""
    query = db.query(models.URL)

    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            models.URL.original_url.ilike(search_pattern)
            | models.URL.short_code.ilike(search_pattern)
            | models.URL.custom_alias.ilike(search_pattern)
        )

    if tag:
        query = query.filter(models.URL.tag == tag)

    return query.order_by(models.URL.created_at.desc()).limit(limit).all()


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
