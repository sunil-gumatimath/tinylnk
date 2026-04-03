from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class URLCreate(BaseModel):
    """Schema for creating a new short URL."""
    url: str
    custom_alias: Optional[str] = None
    expires_in_hours: Optional[int] = None  # None = never expires
    max_clicks: Optional[int] = None  # None = unlimited clicks
    tag: Optional[str] = None


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
    recent_clicks: list[ClickEventResponse] = Field(default_factory=list)

# TODO: Add custom URL validation rules

# TODO: Add custom URL format validation with regex

# TODO: Add pagination schema for list endpoints
