from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy import inspect as _sa_inspect
from sqlalchemy import text as _sa_text
from sqlalchemy.exc import IntegrityError, OperationalError, ProgrammingError
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
    # Clerk user id (sub) of the creator — NULL for links created while signed
    # out (those are managed per creator IP instead). This is what scopes the
    # management endpoints so one signed-in user cannot touch another's links.
    owner_id: Mapped[str | None] = mapped_column(String(255), index=True)

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


CURRENT_SCHEMA_VERSION = 2

#: Key for PostgreSQL's advisory lock. A single constant on purpose: every
#: tinylnk migration serializes on it. Vercel cold-starts several serverless
#: instances at once, and they all run this bootstrap — without the lock two
#: of them could issue the same ALTER TABLE concurrently.
_MIGRATION_LOCK_KEY = 0x74696E79  # "tiny" as hex

#: Name of the index on urls.owner_id, shared by the model and the migration.
OWNER_ID_INDEX = "ix_urls_owner_id"


def add_owner_id_statements(dialect: str) -> tuple[str, str]:
    """SQL for the v1 -> v2 column and index, tailored to *dialect*.

    PostgreSQL supports ``IF NOT EXISTS`` on ADD COLUMN (9.6+), which is what
    makes the upgrade safe when several serverless instances cold-start at the
    same instant. SQLite has no such form, so it relies on the column
    pre-check plus duplicate-column recovery in ``_ensure_owner_id``.
    """
    if dialect == "postgresql":
        return (
            "ALTER TABLE urls ADD COLUMN IF NOT EXISTS owner_id VARCHAR(255)",
            f"CREATE INDEX IF NOT EXISTS {OWNER_ID_INDEX} ON urls (owner_id)",
        )
    return (
        "ALTER TABLE urls ADD COLUMN owner_id VARCHAR(255)",
        f"CREATE INDEX IF NOT EXISTS {OWNER_ID_INDEX} ON urls (owner_id)",
    )


def _ensure_owner_id(db: Session) -> None:
    """Idempotently make sure ``urls.owner_id`` exists (the v2 column)."""
    bind = db.get_bind()
    inspector = _sa_inspect(bind)
    if not inspector.has_table("urls"):
        Base.metadata.create_all(bind=bind)
        inspector = _sa_inspect(bind)
    if "owner_id" in {c["name"] for c in inspector.get_columns("urls")}:
        return

    add_column, create_index = add_owner_id_statements(bind.dialect.name)
    try:
        db.execute(_sa_text(add_column))
    except (IntegrityError, OperationalError, ProgrammingError):
        # Another instance won the race between the check and the ALTER. Roll
        # back the failed statement and verify instead of failing startup.
        db.rollback()
        if "owner_id" not in {c["name"] for c in _sa_inspect(bind).get_columns("urls")}:
            raise
        return
    db.execute(_sa_text(create_index))


def ensure_schema_version(db: Session) -> None:
    """Create the version row on fresh databases; migrate/validate existing ones.

    v1 -> v2 adds ``urls.owner_id`` (per-user ownership). Runs on every startup
    and is safe to re-run: the column is only added when actually missing, so a
    database created directly at v2 (``create_all`` already includes the column)
    just has its version row confirmed. Pre-ownership rows keep
    ``owner_id = NULL`` and are managed by the admin allowlist
    (``TINYLNK_ADMIN_USER_IDS``).

    A database stamped *newer* than this build fails loudly rather than
    silently misbehaving — which is also why the production database must be
    migrated by deploying this code (or by running it against the database)
    rather than by an out-of-band script the running app does not understand.
    """
    # Serialize the upgrade on PostgreSQL; the lock is released on commit.
    # SQLite needs no equivalent (single writer, and the whole file is locked
    # for writes while the transaction below is open).
    bind = db.get_bind()
    if bind.dialect.name == "postgresql":
        db.execute(_sa_text(f"SELECT pg_advisory_xact_lock({_MIGRATION_LOCK_KEY})"))

    # Make the bootstrap self-sufficient: pointing at an empty database must
    # create the schema rather than fail on a missing schema_version table.
    inspector = _sa_inspect(bind)
    if not (inspector.has_table("urls") and inspector.has_table("schema_version")):
        Base.metadata.create_all(bind=bind)

    row = db.get(SchemaVersion, 1)
    current = row.version if row is not None else None

    if current is not None and current > CURRENT_SCHEMA_VERSION:
        db.rollback()
        raise RuntimeError(
            f"Unsupported database schema version {current} "
            f"(expected {CURRENT_SCHEMA_VERSION}). This database was created by "
            "a newer build — upgrade tinylnk instead of downgrading the schema."
        )

    if current == CURRENT_SCHEMA_VERSION:
        db.commit()  # nothing to do; release the advisory lock
        return

    # Either a fresh database (no row) or a v1 database: guarantee the v2 column
    # before claiming v2, so the recorded version can never overstate reality.
    _ensure_owner_id(db)

    if row is None:
        db.add(SchemaVersion(id=1, version=CURRENT_SCHEMA_VERSION))
    else:
        row.version = CURRENT_SCHEMA_VERSION
    db.commit()
