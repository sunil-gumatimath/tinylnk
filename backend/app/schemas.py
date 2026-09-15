from datetime import datetime, timezone
from typing import Annotated, Optional

from pydantic import AfterValidator, BaseModel, ConfigDict, Field


def _ensure_utc(value: datetime) -> datetime:
    """Attach UTC to naive datetimes coming out of the database.

    SQLAlchemy's plain ``DateTime`` column drops ``tzinfo`` on SQLite, so rows
    read back are naive even though they were written as UTC. Without an
    explicit offset the browser parses ``2026-09-15T05:03:26`` as *local* time
    and every date/time the UI renders is shifted by the viewer's UTC offset.
    """
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


#: UTC-aware datetime for every timestamp in an API response payload.
UTCDateTime = Annotated[datetime, AfterValidator(_ensure_utc)]


class URLCreate(BaseModel):
    """Schema for creating a new short URL."""
    url: str
    custom_alias: Optional[str] = None
    # None = never expires. Must be > 0 on create; fractional hours are
    # allowed (the UI offers "30 minutes" = 0.5). Clearing an existing
    # expiry is an UPDATE operation (see URLUpdate.expires_in_hours).
    expires_in_hours: Optional[float] = Field(default=None, gt=0)
    # None = unlimited clicks. Must be >= 1: 0 or negative would create a
    # born-dead link that is dead on its very first redirect.
    max_clicks: Optional[int] = Field(default=None, ge=1)
    # Stored in a String(50) column, so cap input at the DB limit.
    tag: Optional[str] = Field(default=None, max_length=50)


class URLUpdate(BaseModel):
    """Schema for updating an existing short URL.

    Every field is optional and uses an explicit "clear" sentinel, so the UI
    can distinguish "leave this alone" from "remove this":

    * ``custom_alias=""``      -> drop the custom alias
    * ``custom_alias=None``    -> keep the current alias (field omitted)
    * ``expires_in_hours=0``   -> remove the expiry (``<= 0`` also clears)
    * ``max_clicks=0``         -> remove the click limit
    * ``None`` on any field    -> leave that field unchanged
    """

    original_url: Optional[str] = None
    custom_alias: Optional[str] = None
    # Stored in a String(50) column, so cap input at the DB limit.
    tag: Optional[str] = Field(default=None, max_length=50)
    # NOTE: ge=0 here (vs gt=0 on URLCreate) is intentional — on UPDATE,
    # expires_in_hours=0 means "clear the expiry" (crud.update_url maps
    # <= 0 -> NULL). Omitting the field leaves expiry unchanged.
    # Fractional hours (e.g. 0.5) are accepted, mirroring create.
    expires_in_hours: Optional[float] = Field(default=None, ge=0)
    # NOTE: ge=0 here (vs ge=1 on URLCreate) is intentional — on UPDATE,
    # max_clicks=0 means "clear the click limit" (crud.update_url maps
    # <= 0 -> None). Omitting the field leaves the limit unchanged.
    max_clicks: Optional[int] = Field(default=None, ge=0)


class URLResponse(BaseModel):
    """Schema for returning a shortened URL."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    original_url: str
    # For a link created with a custom alias this is the alias, otherwise the
    # generated code — it is the value used to build ``short_url``.
    short_code: str
    short_url: str
    created_at: UTCDateTime
    expires_at: Optional[UTCDateTime] = None
    max_clicks: Optional[int] = None
    tag: Optional[str] = None
    click_count: int
    # The alias on its own (``None`` when the link has none). The UI needs this
    # to prefill — and to clear — the alias field in the edit modal; it cannot
    # be derived from ``short_code`` because that is always populated.
    custom_alias: Optional[str] = None


class ClickEventResponse(BaseModel):
    """Schema for a single click event."""

    model_config = ConfigDict(from_attributes=True)

    clicked_at: UTCDateTime
    referrer: Optional[str] = None
    user_agent: Optional[str] = None
    # Parsed from the user agent by the backend so the UI never has to render
    # (or parse) a raw UA string.
    browser: Optional[str] = None
    os: Optional[str] = None


class StatsItem(BaseModel):
    name: str
    value: int


class URLStats(BaseModel):
    """Schema for URL analytics/stats."""
    original_url: str
    short_code: str
    created_at: UTCDateTime
    expires_at: Optional[UTCDateTime] = None
    max_clicks: Optional[int] = None
    tag: Optional[str] = None
    custom_alias: Optional[str] = None
    total_clicks: int
    clicks_by_date: list[StatsItem] = Field(default_factory=list)
    browser_stats: list[StatsItem] = Field(default_factory=list)
    os_stats: list[StatsItem] = Field(default_factory=list)
    referrer_stats: list[StatsItem] = Field(default_factory=list)
    recent_clicks: list[ClickEventResponse] = Field(default_factory=list)
