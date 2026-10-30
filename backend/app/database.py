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

import json
import os
import socket
import urllib.request
from collections.abc import Generator

# If the local network DNS resolver refuses queries for neon.tech, fallback to DoH.
_orig_getaddrinfo = socket.getaddrinfo


def _fallback_getaddrinfo(host, port, *args, **kwargs):
    try:
        return _orig_getaddrinfo(host, port, *args, **kwargs)
    except socket.gaierror:
        if isinstance(host, str) and (host.endswith(".neon.tech") or host == "neon.tech"):
            try:
                req = urllib.request.Request(
                    f"https://1.1.1.1/dns-query?name={host}&type=A",
                    headers={"Accept": "application/dns-json"},
                )
                with urllib.request.urlopen(req, timeout=3) as resp:
                    data = json.loads(resp.read().decode())
                    for ans in data.get("Answer", []):
                        if ans.get("type") == 1 and "data" in ans:
                            # Force family to AF_INET since we queried type A
                            new_args = list(args)
                            if new_args:
                                new_args[0] = socket.AF_INET
                            return _orig_getaddrinfo(ans["data"], port, *new_args, **kwargs)
            except Exception:
                pass
        raise


socket.getaddrinfo = _fallback_getaddrinfo

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
    is_serverless = bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))
    engine_kwargs: dict = {
        "connect_args": {"connect_timeout": 10, "prepare_threshold": None},
        "echo": False,
    }
    if is_serverless:
        engine_kwargs["poolclass"] = NullPool
    else:
        # Persistent / local server: reuse connections to eliminate 3-5s TLS handshakes per query
        engine_kwargs["pool_size"] = 5
        engine_kwargs["max_overflow"] = 5
        engine_kwargs["pool_recycle"] = 300
        engine_kwargs["pool_pre_ping"] = False

    engine = create_engine(DATABASE_URL, **engine_kwargs)
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
