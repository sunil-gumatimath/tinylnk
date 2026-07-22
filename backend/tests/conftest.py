"""Pytest configuration and shared fixtures for the tinylnk test suite."""

import os
import sys

# Ensure the backend directory is on sys.path so "from app import ..." works.
_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

# ---------------------------------------------------------------------------
# Set test environment variables BEFORE importing the application.
# ---------------------------------------------------------------------------
os.environ["TINYLNK_ADMIN_KEY"] = "test-admin-key-12345"
os.environ["TINYLNK_ENABLE_DOCS"] = "false"
# Write the real SQLite file to a temp location (the ``get_db`` override in
# the ``client`` fixture ensures no test ever touches this file).
os.environ["SQLITE_DB_PATH"] = os.path.abspath(
    os.path.join(os.environ.get("TEMP", "/tmp"), "tinylnk_test.db")
)

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app, limiter
from app import models  # noqa: F401 — registers models on Base.metadata

# ---------------------------------------------------------------------------
# Disable rate limiting for tests.  Setting ``enabled = False`` causes
# SlowAPI's middleware to skip all limit checks, so no test will ever receive
# a 429 response.  We also reset the in-memory storage to clear any leftover
# state from the module-level imports.
# ---------------------------------------------------------------------------
limiter.enabled = False
limiter.reset()


@pytest.fixture(scope="function")
def db_session():
    """Create a brand-new in-memory SQLite database for each test."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)

    TestSessionLocal = sessionmaker(
        autocommit=False, autoflush=False, bind=engine
    )
    session: Session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db_session):
    """FastAPI TestClient with the real database session replaced by an
    in-memory test session."""
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def admin_key():
    """Return the admin API key used throughout the test suite."""
    return "test-admin-key-12345"


@pytest.fixture(autouse=True)
def clear_caches():
    """Clear module-level QR cache between tests."""
    from app.main import _qr_cache as qr_cache
    qr_cache.clear()
    yield


# ---------------------------------------------------------------------------
# Helper fixture: create a sample short URL in the database and return its
# short code so tests can immediately exercise redirect / stats / etc.
# ---------------------------------------------------------------------------
@pytest.fixture
def sample_url(client, admin_key):
    """Create a simple short URL and return its ``short_code``."""
    response = client.post(
        "/api/shorten",
        json={"url": "https://example.com/test-page"},
    )
    assert response.status_code == 200, response.text
    return response.json()["short_code"]


@pytest.fixture
def sample_url_with_alias(client, admin_key):
    """Create a short URL with a custom alias and return data."""
    response = client.post(
        "/api/shorten",
        json={
            "url": "https://example.com/alias-page",
            "custom_alias": "myalias",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()
