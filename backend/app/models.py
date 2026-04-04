from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime, timezone

from .database import Base


class URL(Base):
    __tablename__ = "urls"

    id = Column(Integer, primary_key=True, index=True)
    original_url = Column(Text, nullable=False)
    short_code = Column(String(20), unique=True, index=True, nullable=False)
    custom_alias = Column(String(50), unique=True, index=True, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime, nullable=True)
    max_clicks = Column(Integer, nullable=True)
    tag = Column(String(50), nullable=True, index=True)
    click_count = Column(Integer, default=0)

    clicks = relationship("ClickEvent", back_populates="url", cascade="all, delete-orphan")


class ClickEvent(Base):
    __tablename__ = "click_events"

    id = Column(Integer, primary_key=True, index=True)
    url_id = Column(Integer, ForeignKey("urls.id"), nullable=False)
    clicked_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    referrer = Column(String(500), nullable=True)
    user_agent = Column(String(500), nullable=True)
    ip_address = Column(String(45), nullable=True)

    url = relationship("URL", back_populates="clicks")

# TODO: Add click analytics tracking model

# TODO: Add URL expiration date field

# TODO: Add password protection for private links

# TODO: Add link categories and tags

# TODO: Add password protection field for private links

# TODO: Add user_id foreign key for multi-user support
