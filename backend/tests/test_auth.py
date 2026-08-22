"""Tests for authentication on protected management endpoints.

Public endpoints (create short URL, redirect, QR, health) should work without
any credentials.  Protected endpoints (recent, stats, update, delete, tags,
export) accept either a Clerk JWT or the ``X-Admin-Key`` header checked
against ``TINYLNK_ADMIN_KEY`` (set by conftest for the test run).
"""

import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app import auth


class TestPublicEndpoints:
    """Endpoints that do NOT require authentication."""

    def test_shorten_does_not_require_auth(self, client: TestClient):
        """POST /api/shorten works without any auth header."""
        response = client.post(
            "/api/shorten", json={"url": "https://example.com/public"},
        )
        assert response.status_code == 200

    def test_redirect_does_not_require_auth(self, client: TestClient,
                                            sample_url: str):
        """GET /{code} works without any auth header."""
        response = client.get(f"/{sample_url}", follow_redirects=False)
        assert response.status_code == 302

    def test_health_does_not_require_auth(self, client: TestClient):
        """GET /api/health works without any auth header."""
        response = client.get("/api/health")
        assert response.status_code == 200

    def test_qr_does_not_require_auth(self, client: TestClient,
                                      sample_url: str):
        """GET /api/qr/{code} works without any auth header."""
        response = client.get(f"/api/qr/{sample_url}")
        assert response.status_code == 200


class TestProtectedEndpointsWithoutKey:
    """Every protected endpoint must return 401 when no auth is sent."""

    def test_recent_without_auth_returns_401(self, client: TestClient):
        response = client.get("/api/recent")
        assert response.status_code == 401

    def test_stats_without_auth_returns_401(self, client: TestClient):
        response = client.get("/api/stats/somecode")
        assert response.status_code == 401

    def test_stats_export_without_auth_returns_401(self, client: TestClient):
        response = client.get("/api/stats/somecode/export")
        assert response.status_code == 401

    def test_tags_without_auth_returns_401(self, client: TestClient):
        response = client.get("/api/tags")
        assert response.status_code == 401

    def test_delete_without_auth_returns_401(self, client: TestClient):
        response = client.delete("/api/urls/somecode")
        assert response.status_code == 401

    def test_update_without_auth_returns_401(self, client: TestClient):
        response = client.put(
            "/api/urls/somecode",
            json={"original_url": "https://example.com/updated"},
        )
        assert response.status_code == 401


class TestProtectedEndpointsWithKey:
    """Protected endpoints work when a valid admin key is provided
    (``X-Admin-Key`` fallback — key set by conftest)."""

    def test_recent_with_valid_key_returns_200(self, client: TestClient,
                                                admin_key: str):
        response = client.get(
            "/api/recent",
            headers={"X-Admin-Key": admin_key},
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_stats_with_valid_key_returns_200(self, client: TestClient,
                                              admin_key: str,
                                              sample_url: str):
        response = client.get(
            f"/api/stats/{sample_url}",
            headers={"X-Admin-Key": admin_key},
        )
        assert response.status_code == 200
        data = response.json()
        assert "original_url" in data
        assert data["short_code"] == sample_url

    def test_tags_with_valid_key_returns_200(self, client: TestClient,
                                              admin_key: str):
        response = client.get(
            "/api/tags",
            headers={"X-Admin-Key": admin_key},
        )
        assert response.status_code == 200

    def test_delete_with_valid_key(self, client: TestClient,
                                    admin_key: str):
        url = client.post(
            "/api/shorten",
            json={"url": "https://example.com/to-delete"},
        )
        code = url.json()["short_code"]
        response = client.delete(
            f"/api/urls/{code}",
            headers={"X-Admin-Key": admin_key},
        )
        assert response.status_code == 204

    def test_update_with_valid_key(self, client: TestClient,
                                    admin_key: str):
        url = client.post(
            "/api/shorten",
            json={"url": "https://example.com/to-update"},
        )
        code = url.json()["short_code"]
        response = client.put(
            f"/api/urls/{code}",
            json={"tag": "updated"},
            headers={"X-Admin-Key": admin_key},
        )
        assert response.status_code == 200
        assert response.json()["tag"] == "updated"

    def test_stats_export(self, client: TestClient, admin_key: str,
                           sample_url: str):
        """Export returns CSV with correct content type."""
        # Record a click first so there's data to export
        client.get(f"/{sample_url}", follow_redirects=False)
        response = client.get(
            f"/api/stats/{sample_url}/export",
            headers={"X-Admin-Key": admin_key},
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "text/csv; charset=utf-8"


class TestInvalidKey:
    """Every protected endpoint must reject an invalid admin key."""

    def test_all_protected_endpoints_reject_invalid_key(self, client: TestClient):
        """All protected endpoints reject a wrong admin key with 401."""
        endpoints = [
            ("/api/recent", "get"),
            ("/api/stats/somecode", "get"),
            ("/api/stats/somecode/export", "get"),
            ("/api/tags", "get"),
            ("/api/urls/somecode", "delete"),
            ("/api/urls/somecode", "put", {"original_url": "https://example.com/"}),
        ]
        for entry in endpoints:
            path, method = entry[0], entry[1]
            body = entry[2] if len(entry) > 2 else None
            kwargs = {"headers": {"X-Admin-Key": "wrong-key"}}
            if body:
                kwargs["json"] = body
            response = getattr(client, method)(path, **kwargs)
            assert response.status_code == 401, (
                f"{method.upper()} {path} with key='wrong-key' expected 401,"
                f" got {response.status_code}"
            )

    def test_update_with_invalid_key(self, client: TestClient):
        response = client.put(
            "/api/urls/somecode",
            json={"original_url": "https://example.com/"},
            headers={"X-Admin-Key": "bad-key"},
        )
        assert response.status_code == 401

    def test_delete_with_invalid_key(self, client: TestClient):
        response = client.delete(
            "/api/urls/somecode",
            headers={"X-Admin-Key": "bad-key"},
        )
        assert response.status_code == 401

    def test_stats_export_with_invalid_key(self, client: TestClient):
        response = client.get(
            "/api/stats/somecode/export",
            headers={"X-Admin-Key": "bad-key"},
        )
        assert response.status_code == 401


class TestErrorMessage:
    """The error response does not distinguish between no key and wrong key."""

    def test_error_message_is_generic(self, client: TestClient):
        response = client.get("/api/recent")
        assert response.status_code == 401
        assert response.json() == {"detail": "Unauthorized"}


# ---------------------------------------------------------------------------
# Clerk JWT verification (hermetic unit tests — no network, no real JWKS).
# ---------------------------------------------------------------------------

_CLERK_TEST_ISSUER = "https://clerk.tinylnk.test"


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
        public_exponent=65537, key_size=2048,
    )
    return private_key, private_key.public_key()


def _rs256_token(private_key, *, iss=_CLERK_TEST_ISSUER, include_iss=True,
                 exp_offset=300):
    """Build a properly signed RS256 token resembling a Clerk session JWT."""
    now = int(time.time())
    claims: dict = {"sub": "user_test_123", "iat": now, "exp": now + exp_offset}
    if include_iss:
        claims["iss"] = iss
    return jwt.encode(claims, private_key, algorithm="RS256")


class TestClerkTokenVerification:
    """Regression tests for Clerk JWT verification.

    Hermetic: the JWKS HTTP lookup is replaced by an offline stub and the
    RSA keys are generated locally, so nothing here touches the network.
    Covers malformed input, algorithm pinning, expiry, and the required
    ``iss``-claim match against the configured Clerk issuer.
    """

    @pytest.fixture(autouse=True)
    def _cold_jwks_cache(self, monkeypatch):
        """Start each test with an empty module-level JWKS client cache."""
        monkeypatch.setattr(auth, "_CLERK_JWKS_CLIENT", None)

    @staticmethod
    def _stub_jwks(monkeypatch, public_key):
        """Route verify_clerk_token to an offline JWKS serving public_key."""
        monkeypatch.setenv("CLERK_ISSUER", _CLERK_TEST_ISSUER)
        monkeypatch.setattr(auth, "_CLERK_JWKS_CLIENT", _StubJWKClient(public_key))

    def test_verify_rejects_garbage_token(self, monkeypatch):
        """Malformed input returns None without raising (no env vars set)."""
        monkeypatch.delenv("CLERK_ISSUER", raising=False)
        monkeypatch.delenv("CLERK_PUBLISHABLE_KEY", raising=False)
        assert auth.verify_clerk_token("not.a.jwt") is None

    def test_verify_rejects_expired_or_bad_signature_token(self, monkeypatch):
        """An HS256-signed token is rejected by RS256-only alg pinning."""
        _, public_key = _rsa_keypair()
        self._stub_jwks(monkeypatch, public_key)
        hs256_token = jwt.encode(
            {"sub": "user_1"}, "hmac-test-secret-0123456789abcdef", algorithm="HS256",
        )
        assert auth.verify_clerk_token(hs256_token) is None

    def test_verify_rejects_expired_rs256_token(self, monkeypatch):
        """An otherwise-valid RS256 token past its exp claim returns None."""
        private_key, public_key = _rsa_keypair()
        self._stub_jwks(monkeypatch, public_key)
        expired = _rs256_token(private_key, exp_offset=-300)
        assert auth.verify_clerk_token(expired) is None

    def test_verify_accepts_valid_rs256_token_with_matching_issuer(
        self, monkeypatch,
    ):
        """Happy path: correct signature, fresh exp, matching iss claim."""
        private_key, public_key = _rsa_keypair()
        self._stub_jwks(monkeypatch, public_key)
        token = _rs256_token(private_key)
        assert auth.verify_clerk_token(token) == "user_test_123"

    def test_verify_rejects_wrong_issuer_claim(self, monkeypatch):
        """A validly-signed token whose iss mismatches must be rejected."""
        private_key, public_key = _rsa_keypair()
        self._stub_jwks(monkeypatch, public_key)
        forged = _rs256_token(private_key, iss="https://attacker.example")
        assert auth.verify_clerk_token(forged) is None

    def test_verify_rejects_missing_issuer_claim(self, monkeypatch):
        """A validly-signed token with NO iss claim must be rejected."""
        private_key, public_key = _rsa_keypair()
        self._stub_jwks(monkeypatch, public_key)
        token = _rs256_token(private_key, include_iss=False)
        assert auth.verify_clerk_token(token) is None

    def test_verify_returns_none_when_jwks_lookup_raises(self, monkeypatch):
        """If PyJWKClient blows up, verify_clerk_token still returns None."""

        class _ExplodingJWKClient:
            def __init__(self, uri):
                self.uri = uri

            def get_signing_key_from_jwt(self, token):
                raise RuntimeError("JWKS endpoint unreachable")

        monkeypatch.setenv("CLERK_ISSUER", _CLERK_TEST_ISSUER)
        monkeypatch.setattr(auth, "PyJWKClient", _ExplodingJWKClient)
        token = jwt.encode(
            {"sub": "user_1"}, "hmac-test-secret-0123456789abcdef", algorithm="HS256",
        )
        assert auth.verify_clerk_token(token) is None
