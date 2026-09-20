"""Database engine/session setup.

PostgreSQL (Neon on Vercel, any Postgres when self-hosting) is the only
supported runtime database. ``DATABASE_URL`` is required and must be a
PostgreSQL connection URL; keep ``sslmode=require`` and prefer Neon's pooled
connection string.

There is exactly one exception, and it is test-only: the pytest suite sets
``TINYLNK_TESTING=1`` together with a throwaway ``sqlite:///`` URL so tests run
hermetically without a live Postgres. That escape hatch is ignored in every
non-test process.
"""

import os
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

TESTING = os.getenv("TINYLNK_TESTING", "").lower() in {"1", "true", "yes"}

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is required: set it to a PostgreSQL (Neon) connection URL. "
        "SQLite is not supported outside the test suite."
    )

# Neon supplies postgresql:// URLs; select the installed psycopg v3 driver.
if DATABASE_URL.startswith(("postgres://", "postgresql://")):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL.split("://", 1)[1]

if DATABASE_URL.startswith("postgresql+psycopg://"):
    engine = create_engine(
        DATABASE_URL,
        # Neon handles pooling. Do not retain idle connections across function invocations.
        poolclass=NullPool,
        # prepare_threshold=None disables psycopg's automatic prepared statements,
        # which Neon's pooled (PgBouncer transaction-mode) endpoint cannot reuse.
        connect_args={"connect_timeout": 10, "prepare_threshold": None},
        echo=False,
    )
elif TESTING and DATABASE_URL.startswith("sqlite://"):
    # Test-only backend (see module docstring). Never reachable in production.
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    raise RuntimeError("DATABASE_URL must be a PostgreSQL connection URL.")


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    """Dependency that provides a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
