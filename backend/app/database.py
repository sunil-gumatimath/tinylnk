import os
from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import NullPool

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
default_db_path = os.path.join(PROJECT_ROOT, "urlshortener.db")

DATABASE_URL = os.getenv("DATABASE_URL", "")
if DATABASE_URL:
    # Neon supplies postgresql:// URLs; select the installed psycopg v3 driver.
    if DATABASE_URL.startswith(("postgres://", "postgresql://")):
        DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL.split("://", 1)[1]
    if not DATABASE_URL.startswith("postgresql+psycopg://"):
        raise RuntimeError("DATABASE_URL must be a PostgreSQL connection URL.")
    engine = create_engine(
        DATABASE_URL,
        # Neon handles pooling. Do not retain idle connections across function invocations.
        poolclass=NullPool,
        connect_args={"connect_timeout": 10, "prepare_threshold": None},
        echo=False,
    )
else:
    if os.getenv("VERCEL"):
        raise RuntimeError("Set DATABASE_URL before deploying to Vercel; SQLite is local-only.")
    raw_db_path = os.getenv("SQLITE_DB_PATH", default_db_path)
    db_path = raw_db_path if os.path.isabs(raw_db_path) else os.path.join(PROJECT_ROOT, raw_db_path)
    try:
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
    except OSError as exc:
        raise RuntimeError("Could not create the local SQLite data directory.") from exc
    DATABASE_URL = f"sqlite:///{db_path}"
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False, "timeout": 10},
        echo=False,
    )

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_connection, _connection_record) -> None:
        """SQLite-only single-writer tuning for local development."""
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA busy_timeout = 5000;")
        cursor.execute("PRAGMA synchronous = NORMAL;")
        cursor.close()


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
