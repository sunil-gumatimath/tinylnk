"""Database CRUD operations for the URL shortener.

PostgreSQL (Neon on Vercel) is the runtime database; SQLite backs the hermetic
unit tests only. The one dialect-sensitive spot is ``get_url_stats``, where SQL
``date()`` returns text on SQLite and ``datetime.date`` on PostgreSQL — both
normalized with ``str()``.
"""

import csv
import secrets
from collections import Counter
from datetime import datetime, timedelta, timezone
from io import StringIO
from typing import Any, cast
from urllib.parse import urlparse

from sqlalchemy import CursorResult, text
from sqlalchemy import func as _sa_func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from user_agents import parse

from . import models, schemas


def get_url_by_code(db: Session, short_code: str) -> models.URL | None:
    """Look up a URL by its short code or custom alias (fresh from DB)."""
    url = db.query(models.URL).filter(models.URL.short_code == short_code).first()
    if not url:
        url = db.query(models.URL).filter(models.URL.custom_alias == short_code).first()
    return url


def create_short_url(
    db: Session,
    url_data: schemas.URLCreate,
    owner_id: str | None = None,
) -> models.URL:
    """Create a new shortened URL entry.

    ``owner_id`` is the Clerk sub of the creator (None when created while
    signed out — anonymous links are managed per creator IP instead).
    """
    expires_at = None
    if url_data.expires_in_hours:
        expires_at = datetime.now(timezone.utc) + timedelta(hours=url_data.expires_in_hours)

    # Validate custom_alias uniqueness upfront
    if url_data.custom_alias:
        existing = (
            db.query(models.URL).filter(models.URL.custom_alias == url_data.custom_alias).first()
        )
        if existing:
            raise ValueError("This alias is already taken.")

    db_url = models.URL(
        original_url=str(url_data.url),
        short_code="",  # Placeholder, will be set after flush
        custom_alias=url_data.custom_alias,
        expires_at=expires_at,
        # ``or None`` mirrors update_url's normalization: even a programmatic
        # caller bypassing schema validation cannot store max_clicks=0 (which
        # would make the link born-dead).
        max_clicks=url_data.max_clicks or None,
        tag=url_data.tag,
        owner_id=owner_id,
    )
    db.add(db_url)
    db.flush()  # Get the auto-generated ID

    # Generate a cryptographically random short code (collision-safe)
    for _ in range(10):
        code = secrets.token_urlsafe(6)
        # Check aliases too, not just short codes: ``get_url_by_code`` resolves
        # short_code before custom_alias, so a generated code equal to another
        # link's alias would permanently shadow that link.
        if not get_url_by_code(db, code):
            db_url.short_code = code
            break
    else:
        raise RuntimeError("Failed to generate unique short code after 10 attempts")

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValueError("A link with this alias already exists.") from exc
    db.refresh(db_url)
    return db_url


def update_url(
    db: Session,
    url: models.URL,
    data: schemas.URLUpdate,
) -> models.URL:
    """Update an existing URL's editable fields."""
    if data.original_url is not None:
        url.original_url = str(data.original_url)

    if data.custom_alias is not None:
        # "" is the explicit "remove the alias" sentinel (see URLUpdate), so a
        # blank value in the edit modal actually clears it instead of writing
        # a phantom alias or silently doing nothing.
        alias = data.custom_alias.strip()
        if not alias:
            url.custom_alias = None
        elif alias != url.custom_alias:
            # Check uniqueness (skip if same as current)
            existing = db.query(models.URL).filter(models.URL.custom_alias == alias).first()
            if existing and existing.id != url.id:
                raise ValueError("This alias is already taken.")
            url.custom_alias = alias

    if data.tag is not None:
        url.tag = data.tag or None

    if data.expires_in_hours is not None:
        if data.expires_in_hours <= 0:
            url.expires_at = None  # 0 = clear expiration (UPDATE-only affordance;
            # the schema enforces ge=0 here vs ge=1 on create)
        else:
            url.expires_at = datetime.now(timezone.utc) + timedelta(hours=data.expires_in_hours)

    if data.max_clicks is not None:
        # 0 (or negative) is the explicit "remove the click limit" sentinel.
        url.max_clicks = data.max_clicks if data.max_clicks > 0 else None

    db.commit()
    db.refresh(url)
    return url


def _ensure_utc(value: datetime | None) -> datetime | None:
    """Attach UTC to naive datetimes so comparisons stay timezone-aware."""
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _filtered_clicks_query(
    db: Session,
    url_id: int,
    start_date: datetime | None,
    end_date: datetime | None,
):
    """Base ClickEvent query for one link, with the date-range filter applied."""
    query = db.query(models.ClickEvent).filter(models.ClickEvent.url_id == url_id)
    start_date = _ensure_utc(start_date)
    end_date = _ensure_utc(end_date)
    if start_date:
        query = query.filter(models.ClickEvent.clicked_at >= start_date)
    if end_date:
        query = query.filter(models.ClickEvent.clicked_at <= end_date)
    return query


def record_click(
    db: Session,
    url: models.URL,
    referrer: str | None = None,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> bool:
    """Atomically claim and record a click without exceeding the link's limit.

    Returns ``False`` when another request has already consumed the last
    available click. The limit must be part of the UPDATE predicate: checking
    the ORM object first is racy when concurrent redirects use separate Neon
    connections.
    """
    result = db.execute(
        text(
            """
            UPDATE urls
            SET click_count = click_count + 1
            WHERE id = :url_id
              AND (max_clicks IS NULL OR click_count < max_clicks)
            """
        ),
        {"url_id": url.id},
    )
    # ``Session.execute`` is typed as ``Result``, but a Core UPDATE returns a
    # ``CursorResult``, which is what carries ``rowcount``.
    if cast(CursorResult[Any], result).rowcount != 1:
        db.rollback()
        return False

    click = models.ClickEvent(
        url_id=url.id,
        referrer=referrer,
        user_agent=user_agent,
        ip_address=ip_address,
    )
    db.add(click)
    db.commit()
    return True


def get_url_stats(
    db: Session,
    short_code: str,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    recent_limit: int = 50,
) -> dict | None:
    """Get analytics for a specific short URL, optionally filtered by date range.

    Aggregates in SQL (COUNT / GROUP BY) so links with large click histories
    never load every event into memory. UA strings are parsed once per
    *distinct* value instead of once per click.
    """
    url = get_url_by_code(db, short_code)
    if not url:
        return None

    base = _filtered_clicks_query(db, url.id, start_date, end_date)

    total_clicks = base.with_entities(_sa_func.count(models.ClickEvent.id)).scalar() or 0

    # Bucket by UTC calendar day. Plain SQL date() truncates in the *session*
    # timezone on PostgreSQL, so a non-UTC session (or a future SET TIME ZONE)
    # would silently shift chart buckets; timezone('UTC', ...) pins it.
    if db.get_bind().dialect.name == "postgresql":
        day_expr = _sa_func.date(_sa_func.timezone("UTC", models.ClickEvent.clicked_at)).label(
            "day"
        )
    else:
        # SQLite has no session timezone — plain date() is UTC for our stored values.
        day_expr = _sa_func.date(models.ClickEvent.clicked_at).label("day")

    date_rows = (
        base.with_entities(
            day_expr,
            _sa_func.count(models.ClickEvent.id).label("n"),
        )
        .group_by("day")
        .order_by("day")
        .all()
    )
    # SQLite returns text; PostgreSQL returns datetime.date for SQL date().
    clicks_by_date = [{"name": str(day), "value": n} for day, n in date_rows if day]

    referrer_rows = (
        base.with_entities(
            models.ClickEvent.referrer,
            _sa_func.count(models.ClickEvent.id).label("n"),
        )
        .group_by(models.ClickEvent.referrer)
        .all()
    )
    referrer_dict: Counter[str] = Counter()
    for raw_referrer, n in referrer_rows:
        if not raw_referrer:
            continue
        domain = urlparse(raw_referrer).hostname or raw_referrer
        referrer_dict[domain] += n

    ua_rows = (
        base.with_entities(
            models.ClickEvent.user_agent,
            _sa_func.count(models.ClickEvent.id).label("n"),
        )
        .group_by(models.ClickEvent.user_agent)
        .all()
    )
    browser_dict: Counter[str] = Counter()
    os_dict: Counter[str] = Counter()
    # Distinct user agents are parsed once and reused for the recent-clicks
    # list, so that feed shows "Chrome · Windows" instead of a raw UA string.
    ua_cache: dict[str | None, tuple[str, str]] = {}
    for ua_string, n in ua_rows:
        if ua_string:
            ua = parse(ua_string)
            browser, os_name = ua.browser.family, ua.os.family
        else:
            browser = os_name = "Unknown"
        ua_cache[ua_string] = (browser, os_name)
        browser_dict[browser] += n
        os_dict[os_name] += n

    recent_clicks = []
    for click in base.order_by(models.ClickEvent.clicked_at.desc()).limit(recent_limit).all():
        browser, os_name = ua_cache.get(click.user_agent, ("Unknown", "Unknown"))
        recent_clicks.append(
            {
                "clicked_at": click.clicked_at,
                "referrer": click.referrer,
                "user_agent": click.user_agent,
                "browser": browser,
                "os": os_name,
            }
        )

    browser_stats = [{"name": k, "value": v} for k, v in browser_dict.items()]
    os_stats = [{"name": k, "value": v} for k, v in os_dict.items()]
    referrer_stats = [{"name": k, "value": v} for k, v in referrer_dict.most_common()]

    return {
        "original_url": url.original_url,
        "short_code": url.custom_alias or url.short_code,
        "created_at": url.created_at,
        "expires_at": url.expires_at,
        "max_clicks": url.max_clicks,
        "tag": url.tag,
        "custom_alias": url.custom_alias,
        "total_clicks": total_clicks,
        "clicks_by_date": clicks_by_date,
        "browser_stats": browser_stats,
        "os_stats": os_stats,
        "referrer_stats": referrer_stats,
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

    query = _filtered_clicks_query(db, url.id, start_date, end_date)

    buf = StringIO()
    writer = csv.writer(buf)
    writer.writerow(["clicked_at", "referrer", "browser", "os", "ip_address"])

    # Stream in batches so huge histories don't materialize as ORM objects.
    for click in query.order_by(models.ClickEvent.clicked_at.desc()).yield_per(1000):
        browser = "Unknown"
        os_name = "Unknown"
        if click.user_agent:
            ua = parse(click.user_agent)
            browser = ua.browser.family
            os_name = ua.os.family

        clicked_at = _ensure_utc(click.clicked_at)
        writer.writerow(
            [
                clicked_at.isoformat() if clicked_at else "",
                click.referrer or "Direct",
                browser,
                os_name,
                click.ip_address or "",
            ]
        )

    return buf.getvalue()


def _scoped_urls_query(
    db: Session,
    owner_id: str | None,
    admin_ids: set[str] | None,
):
    """Base URL query scoped to what ``owner_id`` is allowed to manage.

    * Signed-in users see their own links; users in ``admin_ids`` (the
      TINYLNK_ADMIN_USER_IDS allowlist) see everything, including legacy
      ownerless rows — this is also how pre-ownership data stays manageable.
    * ``owner_id`` None means an unauthenticated caller, which can only ever
      match ownerless rows. Every management endpoint requires auth, so this
      branch is defensive rather than user-reachable.
    """
    query = db.query(models.URL)
    admin_ids = admin_ids or set()
    if owner_id in admin_ids:
        return query  # admins manage everything
    if owner_id:
        return query.filter(models.URL.owner_id == owner_id)
    # Ownerless links only. Only admin-allowlisted users can reach them; see
    # ``resolve_owner``.
    return query.filter(models.URL.owner_id.is_(None))


def get_recent_urls(
    db: Session,
    search: str | None = None,
    tag: str | None = None,
    limit: int = 100,
    offset: int = 0,
    owner_id: str | None = None,
    admin_ids: set[str] | None = None,
) -> list[models.URL]:
    """Get recently created URLs visible to this caller, optionally filtered."""
    query = _scoped_urls_query(db, owner_id, admin_ids)

    if search:
        # Escape LIKE wildcards so user-supplied %, _, and \ are matched
        # literally instead of widening the search.
        escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        query = query.filter(
            models.URL.original_url.ilike(pattern, escape="\\")
            | models.URL.short_code.ilike(pattern, escape="\\")
            | models.URL.custom_alias.ilike(pattern, escape="\\")
        )

    if tag:
        query = query.filter(models.URL.tag == tag)

    return query.order_by(models.URL.created_at.desc()).offset(offset).limit(limit).all()


def get_distinct_tags(
    db: Session,
    owner_id: str | None = None,
    admin_ids: set[str] | None = None,
) -> list[str]:
    """Distinct non-empty tags across the links this caller can manage."""
    query = _scoped_urls_query(db, owner_id, admin_ids)
    rows = query.with_entities(models.URL.tag).filter(models.URL.tag.isnot(None)).distinct().all()
    return [row[0] for row in rows if row[0]]


def resolve_owner(
    url: models.URL,
    owner_id: str | None,
    admin_ids: set[str] | None,
) -> models.URL | None:
    """Return *url* if the caller may manage it, else None (endpoints map
    that to 404 so unauthorized users cannot even tell the link exists).

    Ownerless (legacy/anonymous) links are manageable by admin-allowlisted
    users only.
    """
    admin_ids = admin_ids or set()
    if owner_id in admin_ids:
        return url
    if url.owner_id is not None and url.owner_id == owner_id:
        return url
    return None


def is_url_expired(url: models.URL) -> bool:
    """Check if a URL has expired."""
    if url.expires_at is None:
        return False
    if url.max_clicks is not None and url.click_count >= url.max_clicks:
        return True
    expires_at = url.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) > expires_at


def delete_url(db: Session, short_code: str) -> bool:
    """Delete a URL by its short code or custom alias.

    Returns True if the URL was found and deleted, False otherwise.
    """
    url = get_url_by_code(db, short_code)
    if not url:
        return False

    db.delete(url)
    db.commit()
    return True
