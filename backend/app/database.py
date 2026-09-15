import os
from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, declarative_base, sessionmaker

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
default_db_path = os.path.join(PROJECT_ROOT, "urlshortener.db")

raw_db_path = os.getenv("SQLITE_DB_PATH", default_db_path)
# Resolve relative paths against the project root so the value works regardless
# of the directory the server is started from.
db_path = raw_db_path if os.path.isabs(raw_db_path) else os.path.join(PROJECT_ROOT, raw_db_path)

# Ensure the parent directory exists (matters for Docker volume mounts).
os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)

DATABASE_URL = f"sqlite:///{db_path}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 10},  # SQLite specific
    echo=False,
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, _connection_record) -> None:
    """Single-writer tuning: WAL allows readers during writes, busy_timeout
    makes writers wait instead of failing with 'database is locked'."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL;")
    cursor.execute("PRAGMA busy_timeout = 5000;")
    cursor.execute("PRAGMA synchronous = NORMAL;")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """Dependency that provides a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

