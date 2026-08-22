from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class URLCreate(BaseModel):
    """Schema for creating a new short URL."""
    url: str
    custom_alias: Optional[str] = None
    # None = never expires. Must be >= 1 hour on create; clearing an existing
    # expiry is an UPDATE operation (see URLUpdate.expires_in_hours).
    expires_in_hours: Optional[int] = Field(default=None, ge=1)
    # None = unlimited clicks. Must be >= 1: 0 or negative would create a
    # born-dead link that is dead on its very first redirect.
    max_clicks: Optional[int] = Field(default=None, ge=1)
    # Stored in a String(50) column, so cap input at the DB limit.
    tag: Optional[str] = Field(default=None, max_length=50)


class URLUpdate(BaseModel):
    """Schema for updating an existing short URL."""
    original_url: Optional[str] = None
    custom_alias: Optional[str] = None
    # Stored in a String(50) column, so cap input at the DB limit.
    tag: Optional[str] = Field(default=None, max_length=50)
    # NOTE: ge=0 here (vs ge=1 on URLCreate) is intentional — on UPDATE,
    # expires_in_hours=0 means "clear the expiry" (crud.update_url maps
    # <= 0 -> NULL). Omitting the field leaves expiry unchanged.
    expires_in_hours: Optional[int] = Field(default=None, ge=0)
    # None = leave the click limit unchanged; otherwise must be >= 1.
    max_clicks: Optional[int] = Field(default=None, ge=1)


class URLResponse(BaseModel):
    """Schema for returning a shortened URL."""
    id: int
    original_url: str
    short_code: str
    short_url: str
    created_at: datetime
    expires_at: Optional[datetime] = None
    max_clicks: Optional[int] = None
    tag: Optional[str] = None
    click_count: int

    class Config:
        from_attributes = True


class ClickEventResponse(BaseModel):
    """Schema for a single click event."""
    clicked_at: datetime
    referrer: Optional[str] = None
    user_agent: Optional[str] = None

    class Config:
        from_attributes = True


class StatsItem(BaseModel):
    name: str
    value: int


class URLStats(BaseModel):
    """Schema for URL analytics/stats."""
    original_url: str
    short_code: str
    created_at: datetime
    expires_at: Optional[datetime] = None
    max_clicks: Optional[int] = None
    tag: Optional[str] = None
    total_clicks: int
    clicks_by_date: list[StatsItem] = Field(default_factory=list)
    browser_stats: list[StatsItem] = Field(default_factory=list)
    os_stats: list[StatsItem] = Field(default_factory=list)
    referrer_stats: list[StatsItem] = Field(default_factory=list)
    recent_clicks: list[ClickEventResponse] = Field(default_factory=list)
