"""Pytest configuration and shared fixtures for the tinylnk test suite."""

import os
import sys
import time

# Ensure the backend directory is on sys.path so "from app import ..." works.
_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

# Also expose this directory so test modules can do "from conftest import ..."
# no matter how pytest is invoked (repo root: "pytest backend/tests" — the CI
# command — or from inside this directory).
_tests_dir = os.path.dirname(os.path.abspath(__file__))
if _tests_dir not in sys.path:
    sys.path.insert(0, _tests_dir)

# ---------------------------------------------------------------------------
# Set test environment variables BEFORE importing the application.
# ---------------------------------------------------------------------------
# Write the real SQLite file to a temp location (the ``get_db`` override in
# the ``client`` fixture ensures no test ever touches this file).
os.environ["SQLITE_DB_PATH"] = os.path.abspath(
    os.path.join(os.environ.get("TEMP", "/tmp"), "tinylnk_test.db")
)

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app import auth, models  # noqa: F401 — models registers on Base.metadata
from app.database import Base, get_db
from app.main import app, limiter

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

    TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
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


# ---------------------------------------------------------------------------
# Clerk JWT test doubles — hermetic (no network, keys generated locally).
# Shared with test_auth.py, which imports them from this module.
# ---------------------------------------------------------------------------
CLERK_TEST_ISSUER = "https://clerk.tinylnk.test"


class _StubSigningKey:
    """Duck-typed stand-in for ``jwt.PyJWK`` (only ``.key`` is accessed)."""

    def __init__(self, key):
        self.key = key


class _StubJWKClient:
    """Offline ``PyJWKClient`` double that serves a fixed signing key."""

    def __init__(self, key):
        self._key = key

    def get_signing_key_from_jwt(self, token):
        return _StubSigningKey(self._key)


def _rsa_keypair():
    """Generate a throwaway RSA key pair for offline JWT signing."""
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )
    return private_key, private_key.public_key()


def _rs256_token(
    private_key, *, iss=CLERK_TEST_ISSUER, include_iss=True, exp_offset=300, sub="user_test_123"
):
    """Build a properly signed RS256 token resembling a Clerk session JWT."""
    now = int(time.time())
    claims: dict = {"sub": sub, "iat": now, "exp": now + exp_offset}
    if include_iss:
        claims["iss"] = iss
    return jwt.encode(claims, private_key, algorithm="RS256")


@pytest.fixture
def auth_headers(monkeypatch):
    """Valid Clerk ``Authorization: Bearer`` headers for protected endpoints.

    Routes ``verify_clerk_token`` to an offline JWKS stub serving a locally
    generated RSA public key, so no test ever needs a real Clerk instance.
    """
    monkeypatch.setenv("CLERK_ISSUER", CLERK_TEST_ISSUER)
    private_key, public_key = _rsa_keypair()
    monkeypatch.setattr(auth, "_CLERK_JWKS_CLIENT", _StubJWKClient(public_key))
    token = _rs256_token(private_key)
    return {"Authorization": f"Bearer {token}"}


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
def sample_url(client, auth_headers):
    """Create a simple short URL and return its ``short_code``."""
    response = client.post(
        "/api/shorten",
        json={"url": "https://example.com/test-page"},
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    return response.json()["short_code"]


@pytest.fixture
def sample_url_with_alias(client, auth_headers):
    """Create a short URL with a custom alias and return data."""
    response = client.post(
        "/api/shorten",
        json={
            "url": "https://example.com/alias-page",
            "custom_alias": "myalias",
        },
        headers=auth_headers,
    )
    assert response.status_code == 200, response.text
    return response.json()
