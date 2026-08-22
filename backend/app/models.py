from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from .database import Base


class URL(Base):
    __tablename__ = "urls"

    id = Column(Integer, primary_key=True, index=True)
    original_url = Column(Text, nullable=False)
    short_code = Column(String(20), unique=True, index=True, nullable=False)
    custom_alias = Column(String(50), unique=True, index=True, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    expires_at = Column(DateTime, nullable=True, index=True)
    max_clicks = Column(Integer, nullable=True, index=True)
    tag = Column(String(50), nullable=True, index=True)
    click_count = Column(Integer, default=0)

    clicks = relationship("ClickEvent", back_populates="url", cascade="all, delete-orphan")


class ClickEvent(Base):
    __tablename__ = "click_events"

    id = Column(Integer, primary_key=True, index=True)
    url_id = Column(Integer, ForeignKey("urls.id"), nullable=False, index=True)
    clicked_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    referrer = Column(String(500), nullable=True)
    user_agent = Column(String(500), nullable=True)
    ip_address = Column(String(45), nullable=True)

    url = relationship("URL", back_populates="clicks")
