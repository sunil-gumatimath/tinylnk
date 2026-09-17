from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, Session, mapped_column, relationship

from .database import Base


class URL(Base):
    __tablename__ = "urls"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    original_url: Mapped[str] = mapped_column(Text, nullable=False)
    short_code: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    custom_alias: Mapped[str | None] = mapped_column(String(50), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), index=True
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    max_clicks: Mapped[int | None] = mapped_column(Integer, index=True)
    tag: Mapped[str | None] = mapped_column(String(50), index=True)
    click_count: Mapped[int] = mapped_column(Integer, default=0)

    clicks: Mapped[list["ClickEvent"]] = relationship(
        "ClickEvent", back_populates="url", cascade="all, delete-orphan"
    )


class ClickEvent(Base):
    __tablename__ = "click_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    url_id: Mapped[int] = mapped_column(ForeignKey("urls.id"), index=True)
    clicked_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), index=True
    )
    referrer: Mapped[str | None] = mapped_column(String(500))
    user_agent: Mapped[str | None] = mapped_column(String(500))
    ip_address: Mapped[str | None] = mapped_column(String(45))

    url: Mapped["URL"] = relationship("URL", back_populates="clicks")


class SchemaVersion(Base):
    """Single-row table recording the schema version of this database.

    tinylnk has no migration framework (Alembic); tables are created via
    ``Base.metadata.create_all``. The version row lets future code detect a
    stale database and fail loudly instead of misbehaving silently.
    """

    __tablename__ = "schema_version"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    upgraded_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )


CURRENT_SCHEMA_VERSION = 1


def ensure_schema_version(db: Session) -> None:
    """Create the version row on fresh databases; validate on existing ones."""
    row = db.get(SchemaVersion, 1)
    if row is None:
        db.add(SchemaVersion(id=1, version=CURRENT_SCHEMA_VERSION))
        db.commit()
    elif row.version != CURRENT_SCHEMA_VERSION:
        raise RuntimeError(
            f"Unsupported database schema version {row.version} "
            f"(expected {CURRENT_SCHEMA_VERSION}). Delete the database "
            "or migrate it before starting."
        )
