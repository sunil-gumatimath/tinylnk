from pydantic import BaseModel, HttpUrl
from datetime import datetime
from typing import Optional


class URLCreate(BaseModel):
    """Schema for creating a new short URL."""
    url: str
    custom_alias: Optional[str] = None
    expires_in_hours: Optional[int] = None  # None = never expires


class URLResponse(BaseModel):
    """Schema for returning a shortened URL."""
    id: int
    original_url: str
    short_code: str
    short_url: str
    created_at: datetime
    expires_at: Optional[datetime] = None
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


class URLStats(BaseModel):
    """Schema for URL analytics/stats."""
    original_url: str
    short_code: str
    created_at: datetime
    expires_at: Optional[datetime] = None
    total_clicks: int
    recent_clicks: list[ClickEventResponse] = []
