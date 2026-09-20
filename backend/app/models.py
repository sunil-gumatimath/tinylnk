from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, text
from sqlalchemy import inspect as _sa_inspect
from sqlalchemy.exc import IntegrityError, OperationalError, ProgrammingError
from sqlalchemy.orm import Mapped, Session, mapped_column, relationship

from .database import Base


class URL(Base):
    __tablename__ = "urls"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    original_url: Mapped[str] = mapped_column(Text, nullable=False)
    short_code: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    custom_alias: Mapped[str | None] = mapped_column(String(50), unique=True, index=True)
    # ``timezone=True`` (timestamptz on PostgreSQL) is what keeps an instant an
    # instant: Python always hands SQLAlchemy aware UTC datetimes, and a plain
    # ``DateTime`` column would make Postgres fold them into the *session*
    # TimeZone, silently shifting every stored value when that GUC is not UTC.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    max_clicks: Mapped[int | None] = mapped_column(Integer, index=True)
    tag: Mapped[str | None] = mapped_column(String(50), index=True)
    click_count: Mapped[int] = mapped_column(Integer, default=0)
    # Clerk user id (sub) of the creator — NULL for links created while signed
    # out. Ownerless rows are manageable by admin-allowlisted users only (see
    # ``resolve_owner``); this is what scopes the management endpoints so one
    # signed-in user cannot touch another's links.
    owner_id: Mapped[str | None] = mapped_column(String(255), index=True)

    clicks: Mapped[list["ClickEvent"]] = relationship(
        "ClickEvent", back_populates="url", cascade="all, delete-orphan"
    )


class ClickEvent(Base):
    __tablename__ = "click_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    url_id: Mapped[int] = mapped_column(ForeignKey("urls.id"), index=True)
    clicked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
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
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


CURRENT_SCHEMA_VERSION = 3

#: Key for PostgreSQL's advisory lock. A single constant on purpose: every
#: tinylnk migration serializes on it. Vercel cold-starts several serverless
#: instances at once, and they all run this bootstrap — without the lock two
#: of them could issue the same ALTER TABLE concurrently.
_MIGRATION_LOCK_KEY = 0x74696E79  # "tiny" as hex

#: Bootstrap statements that are not per-table DDL, pre-built from string
#: literals and executed by lookup. The bind parameter keeps the lock key out of
#: the SQL text entirely.
_MIGRATION_SQL = {
    "advisory_lock": text("SELECT pg_advisory_xact_lock(:key)"),
}

#: Name of the index on urls.owner_id, shared by the model and the migration.
OWNER_ID_INDEX = "ix_urls_owner_id"

#: DDL for the v1 -> v2 ownership upgrade, pre-built per dialect. Built once
#: from string literals and executed by dictionary lookup — never assembled from
#: a variable at execution time, so no identifier can be interpolated into a
#: statement. PostgreSQL supports ``ADD COLUMN IF NOT EXISTS`` (9.6+), which
#: lets concurrent serverless cold starts race safely; SQLite (test-only
#: backend) has no such form and relies on the pre-check plus duplicate-column
#: recovery in ``_ensure_owner_id``.
_OWNER_ID_ADD_COLUMN = {
    "postgresql": text("ALTER TABLE urls ADD COLUMN IF NOT EXISTS owner_id VARCHAR(255)"),
    "sqlite": text("ALTER TABLE urls ADD COLUMN owner_id VARCHAR(255)"),
}
_OWNER_ID_CREATE_INDEX = {
    # Literal (not interpolated): the value must equal OWNER_ID_INDEX, which
    # ``test_postgres_uses_if_not_exists_forms`` asserts.
    "postgresql": text("CREATE INDEX IF NOT EXISTS ix_urls_owner_id ON urls (owner_id)"),
    "sqlite": text("CREATE INDEX IF NOT EXISTS ix_urls_owner_id ON urls (owner_id)"),
}

#: DDL for the v2 -> v3 timestamp upgrade, keyed by the column it rewrites.
#: Every listed column that actually exists and is still naive gets converted to
#: ``timestamptz``, with existing values reinterpreted as UTC. Pre-built
#: literals, executed by lookup.
_TIMESTAMPTZ_ALTER = {
    ("urls", "created_at"): text(
        "ALTER TABLE urls ALTER COLUMN created_at "
        "TYPE TIMESTAMP WITH TIME ZONE USING created_at AT TIME ZONE 'UTC'"
    ),
    ("urls", "expires_at"): text(
        "ALTER TABLE urls ALTER COLUMN expires_at "
        "TYPE TIMESTAMP WITH TIME ZONE USING expires_at AT TIME ZONE 'UTC'"
    ),
    ("click_events", "clicked_at"): text(
        "ALTER TABLE click_events ALTER COLUMN clicked_at "
        "TYPE TIMESTAMP WITH TIME ZONE USING clicked_at AT TIME ZONE 'UTC'"
    ),
    ("schema_version", "upgraded_at"): text(
        "ALTER TABLE schema_version ALTER COLUMN upgraded_at "
        "TYPE TIMESTAMP WITH TIME ZONE USING upgraded_at AT TIME ZONE 'UTC'"
    ),
}


def add_owner_id_statements(dialect: str) -> tuple[str, str]:
    """SQL for the v1 -> v2 column and index, tailored to *dialect*.

    Returns plain strings for readability and tests; ``_ensure_owner_id``
    executes the pre-built clauses above directly.
    """
    add_column = _OWNER_ID_ADD_COLUMN.get(dialect, _OWNER_ID_ADD_COLUMN["sqlite"])
    create_index = _OWNER_ID_CREATE_INDEX.get(dialect, _OWNER_ID_CREATE_INDEX["sqlite"])
    return str(add_column), str(create_index)


def _ensure_owner_id(db: Session) -> None:
    """Idempotently make sure ``urls.owner_id`` exists (the v2 column)."""
    # Use the Session's own connection so the reflection and every statement
    # stay inside the advisory-lock transaction taken by
    # ``ensure_schema_version``. Inspecting the *engine* would check out a
    # second NullPool connection outside the lock.
    conn = db.connection()
    inspector = _sa_inspect(conn)
    if not inspector.has_table("urls"):
        Base.metadata.create_all(bind=conn)
        inspector = _sa_inspect(conn)
    if "owner_id" in {c["name"] for c in inspector.get_columns("urls")}:
        return

    # Only PostgreSQL and the test-only SQLite backend reach this code.
    dialect = "sqlite" if conn.dialect.name == "sqlite" else "postgresql"
    try:
        db.execute(_OWNER_ID_ADD_COLUMN[dialect])
    except (IntegrityError, OperationalError, ProgrammingError):
        # Another instance won the race between the check and the ALTER. Roll
        # back the failed statement and verify instead of failing startup.
        db.rollback()
        columns = {c["name"] for c in _sa_inspect(db.connection()).get_columns("urls")}
        if "owner_id" not in columns:
            raise
        return
    db.execute(_OWNER_ID_CREATE_INDEX[dialect])


def _ensure_timestamptz(db: Session) -> None:
    """Convert naive timestamp columns to ``timestamptz`` (the v3 shape).

    A plain ``DateTime`` column stores wall-clock text with no offset, so on
    PostgreSQL an aware datetime is folded into the session ``TimeZone`` on
    write. That is invisible while the session is UTC and quietly wrong the
    moment it is not. v3 stores true instants instead.

    PostgreSQL-only: SQLite has no timestamp type and always returns naive
    values, which the API layer normalizes to UTC (and this is the test-only
    backend). Idempotent — columns already ``timestamptz`` are skipped, so a
    database created directly at v3 passes straight through.
    """
    conn = db.connection()
    if conn.dialect.name != "postgresql":
        return

    inspector = _sa_inspect(conn)
    for key in _TIMESTAMPTZ_ALTER:
        table, column = key
        if not inspector.has_table(table):
            continue
        reflected = next((c for c in inspector.get_columns(table) if c["name"] == column), None)
        # Missing column, or already timestamptz: nothing to rewrite.
        if reflected is None or getattr(reflected["type"], "timezone", False):
            continue
        # Existing naive values were written as UTC, so reinterpret them as UTC
        # rather than letting Postgres re-apply the session offset.
        db.execute(_TIMESTAMPTZ_ALTER[key])


def ensure_schema_version(db: Session) -> None:
    """Create the version row on fresh databases; migrate/validate existing ones.

    v1 -> v2 adds ``urls.owner_id`` (per-user ownership); v2 -> v3 rewrites the
    timestamp columns to ``timestamptz`` so stored values are true instants.
    Runs on every startup and is safe to re-run: each upgrade only touches what
    is actually missing/naive, so a database created directly at the current
    version just has its version row confirmed. Pre-ownership rows keep
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
    conn = db.connection()
    if conn.dialect.name == "postgresql":
        # Transaction-scoped: held until the commit/rollback below, so every DDL
        # step (create_all included) is serialized across cold starts.
        db.execute(_MIGRATION_SQL["advisory_lock"], {"key": _MIGRATION_LOCK_KEY})

    # Make the bootstrap self-sufficient: pointing at an empty database must
    # create the schema rather than fail on a missing schema_version table.
    # Reflect/create on the *locked* connection — an engine-bound create_all
    # would use a separate NullPool connection outside this transaction.
    inspector = _sa_inspect(conn)
    if not (inspector.has_table("urls") and inspector.has_table("schema_version")):
        Base.metadata.create_all(bind=conn)

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

    # Either a fresh database (no row) or an older database: apply every upgrade
    # before claiming the current version, so the recorded version can never
    # overstate reality.
    _ensure_owner_id(db)
    _ensure_timestamptz(db)

    if row is None:
        db.add(SchemaVersion(id=1, version=CURRENT_SCHEMA_VERSION))
    else:
        row.version = CURRENT_SCHEMA_VERSION
    db.commit()
