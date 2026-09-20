"""Tests for authentication on protected management endpoints.

Public endpoints (create short URL, redirect, QR, health) should work without
any credentials.  Protected endpoints (recent, stats, update, delete, tags,
export) require a valid Clerk JWT on the ``Authorization: Bearer`` header —
the ``auth_headers`` fixture (conftest) mints one against an offline JWKS stub.
"""

import jwt
import pytest
from conftest import (
    CLERK_TEST_ISSUER,
    _rs256_token,
    _rsa_keypair,
    _StubJWKClient,
)
from fastapi.testclient import TestClient

from app import auth


class TestPublicEndpoints:
    """Endpoints that do NOT require authentication."""

    def test_shorten_does_not_require_auth(self, client: TestClient):
        """POST /api/shorten works without any auth header."""
        response = client.post(
            "/api/shorten",
            json={"url": "https://example.com/public"},
        )
        assert response.status_code == 200

    def test_redirect_does_not_require_auth(self, client: TestClient, sample_url: str):
        """GET /{code} works without any auth header."""
        response = client.get(f"/{sample_url}", follow_redirects=False)
        assert response.status_code == 302

    def test_health_does_not_require_auth(self, client: TestClient):
        """GET /api/health works without any auth header."""
        response = client.get("/api/health")
        assert response.status_code == 200

    def test_qr_does_not_require_auth(self, client: TestClient, sample_url: str):
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


class TestProtectedEndpointsWithClerkToken:
    """Protected endpoints work with a valid Clerk Bearer token."""

    def test_recent_with_valid_token_returns_200(self, client: TestClient, auth_headers: dict):
        response = client.get("/api/recent", headers=auth_headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_stats_with_valid_token_returns_200(
        self, client: TestClient, auth_headers: dict, sample_url: str
    ):
        response = client.get(f"/api/stats/{sample_url}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "original_url" in data
        assert data["short_code"] == sample_url

    def test_tags_with_valid_token_returns_200(self, client: TestClient, auth_headers: dict):
        response = client.get("/api/tags", headers=auth_headers)
        assert response.status_code == 200

    def test_delete_with_valid_token(self, client: TestClient, auth_headers: dict):
        url = client.post(
            "/api/shorten",
            json={"url": "https://example.com/to-delete"},
            headers=auth_headers,
        )
        code = url.json()["short_code"]
        response = client.delete(f"/api/urls/{code}", headers=auth_headers)
        assert response.status_code == 204

    def test_update_with_valid_token(self, client: TestClient, auth_headers: dict):
        url = client.post(
            "/api/shorten",
            json={"url": "https://example.com/to-update"},
            headers=auth_headers,
        )
        code = url.json()["short_code"]
        response = client.put(
            f"/api/urls/{code}",
            json={"tag": "updated"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["tag"] == "updated"

    def test_stats_export(self, client: TestClient, auth_headers: dict, sample_url: str):
        """Export returns CSV with correct content type."""
        # Record a click first so there's data to export
        client.get(f"/{sample_url}", follow_redirects=False)
        response = client.get(
            f"/api/stats/{sample_url}/export",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "text/csv; charset=utf-8"


class TestInvalidCredentials:
    """Every protected endpoint must reject anything that is not a valid
    Clerk Bearer token — including the ``X-Admin-Key`` header."""

    def test_all_protected_endpoints_reject_garbage_token(
        self,
        client: TestClient,
    ):
        """All protected endpoints reject a bogus Bearer token with 401."""
        endpoints = [
            ("/api/me", "get"),
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
            kwargs = {"headers": {"Authorization": "Bearer not-a-real-token"}}
            if body:
                kwargs["json"] = body
            response = getattr(client, method)(path, **kwargs)
            assert response.status_code == 401, (
                f"{method.upper()} {path} with a bogus token expected 401,"
                f" got {response.status_code}"
            )

    def test_admin_key_header_is_no_longer_accepted(self, client: TestClient):
        """``X-Admin-Key`` was removed — it must never authenticate."""
        response = client.get(
            "/api/recent",
            headers={"X-Admin-Key": "any-key-at-all"},
        )
        assert response.status_code == 401

    def test_malformed_authorization_header_rejected(self, client: TestClient):
        for header in ("Basic dXNlcjpwYXNz", "Bearer", "Bearer ", "token123"):
            response = client.get(
                "/api/recent",
                headers={"Authorization": header},
            )
            assert response.status_code == 401, f"header={header!r}"

    def test_expired_token_rejected(self, client: TestClient, monkeypatch):
        private_key, public_key = _rsa_keypair()
        monkeypatch.setenv("CLERK_ISSUER", CLERK_TEST_ISSUER)
        monkeypatch.setattr(auth, "_CLERK_JWKS_CLIENT", _StubJWKClient(public_key))
        expired = _rs256_token(private_key, exp_offset=-300)
        response = client.get(
            "/api/recent",
            headers={"Authorization": f"Bearer {expired}"},
        )
        assert response.status_code == 401

    def test_wrong_issuer_token_rejected(self, client: TestClient, monkeypatch):
        private_key, public_key = _rsa_keypair()
        monkeypatch.setenv("CLERK_ISSUER", CLERK_TEST_ISSUER)
        monkeypatch.setattr(auth, "_CLERK_JWKS_CLIENT", _StubJWKClient(public_key))
        forged = _rs256_token(private_key, iss="https://attacker.example")
        response = client.get(
            "/api/recent",
            headers={"Authorization": f"Bearer {forged}"},
        )
        assert response.status_code == 401

    def test_update_with_invalid_token(self, client: TestClient):
        response = client.put(
            "/api/urls/somecode",
            json={"original_url": "https://example.com/"},
            headers={"Authorization": "Bearer bad-token"},
        )
        assert response.status_code == 401

    def test_delete_with_invalid_token(self, client: TestClient):
        response = client.delete(
            "/api/urls/somecode",
            headers={"Authorization": "Bearer bad-token"},
        )
        assert response.status_code == 401

    def test_stats_export_with_invalid_token(self, client: TestClient):
        response = client.get(
            "/api/stats/somecode/export",
            headers={"Authorization": "Bearer bad-token"},
        )
        assert response.status_code == 401


class TestMeEndpoint:
    """GET /api/me reports the caller identity the backend verified."""

    def test_me_with_valid_token_returns_sub(self, client: TestClient, auth_headers: dict):
        response = client.get("/api/me", headers=auth_headers)
        assert response.status_code == 200
        assert response.json() == {"sub": "user_test_123"}

    def test_me_without_auth_returns_401(self, client: TestClient):
        assert client.get("/api/me").status_code == 401

    def test_me_with_garbage_token_returns_401(self, client: TestClient):
        response = client.get("/api/me", headers={"Authorization": "Bearer not-a-real-token"})
        assert response.status_code == 401


class TestUnverifiableTokenOnPublicEndpoints:
    """A Bearer token that cannot be verified on /api/shorten must not fail
    the request (anonymous creation still works), but it must leave a warning
    in the logs — otherwise the resulting ownerless link silently vanishes
    from the caller's dashboard with no trace of why."""

    def test_shorten_with_garbage_token_stays_public_but_warns(self, client: TestClient, caplog):
        with caplog.at_level("WARNING", logger="app.auth"):
            response = client.post(
                "/api/shorten",
                json={"url": "https://example.com/orphan"},
                headers={"Authorization": "Bearer not-a-real-token"},
            )
        assert response.status_code == 200
        assert any("unverifiable" in record.message for record in caplog.records), (
            "expected a warning about the unverifiable Bearer token"
        )

    def test_shorten_without_token_logs_no_warning(self, client: TestClient, caplog):
        with caplog.at_level("WARNING", logger="app.auth"):
            response = client.post("/api/shorten", json={"url": "https://example.com/anon"})
        assert response.status_code == 200
        assert not any("unverifiable" in record.message for record in caplog.records)


class TestOwnershipAttributionLogs:
    """Create/list log lines name the owner so an empty dashboard is
    diagnosable from the backend terminal alone."""

    def test_shorten_with_auth_logs_owner(self, client, auth_headers, caplog):
        with caplog.at_level("INFO", logger="app.main"):
            response = client.post(
                "/api/shorten",
                json={"url": "https://example.com/owned"},
                headers=auth_headers,
            )
        assert response.status_code == 200
        assert any("owned by user_test_123" in r.message for r in caplog.records)

    def test_shorten_anonymous_logs_no_owner(self, client, caplog):
        with caplog.at_level("INFO", logger="app.main"):
            response = client.post("/api/shorten", json={"url": "https://example.com/anon"})
        assert response.status_code == 200
        assert any("no owner" in r.message for r in caplog.records)

    def test_recent_logs_sub_and_count(self, client, auth_headers, caplog):
        client.post(
            "/api/shorten",
            json={"url": "https://example.com/owned"},
            headers=auth_headers,
        )
        with caplog.at_level("INFO", logger="app.main"):
            response = client.get("/api/recent", headers=auth_headers)
        assert response.status_code == 200
        assert any(
            "user_test_123" in r.message and "1 returned" in r.message for r in caplog.records
        )


class TestErrorMessage:
    """The error response does not distinguish between no key and wrong key."""

    def test_error_message_is_generic(self, client: TestClient):
        response = client.get("/api/recent")
        assert response.status_code == 401
        assert response.json() == {"detail": "Unauthorized"}


# ---------------------------------------------------------------------------
# Clerk JWT verification (hermetic unit tests — no network, no real JWKS).
# The offline JWKS/RSA doubles live in conftest.py so every test module
# (not just this one) can mint valid tokens via the ``auth_headers`` fixture.
# ---------------------------------------------------------------------------


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
        monkeypatch.setenv("CLERK_ISSUER", CLERK_TEST_ISSUER)
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
            {"sub": "user_1"},
            "hmac-test-secret-0123456789abcdef",
            algorithm="HS256",
        )
        assert auth.verify_clerk_token(hs256_token) is None

    def test_verify_rejects_expired_rs256_token(self, monkeypatch):
        """An otherwise-valid RS256 token past its exp claim returns None."""
        private_key, public_key = _rsa_keypair()
        self._stub_jwks(monkeypatch, public_key)
        expired = _rs256_token(private_key, exp_offset=-300)
        assert auth.verify_clerk_token(expired) is None

    def test_verify_accepts_valid_rs256_token_with_matching_issuer(
        self,
        monkeypatch,
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

        monkeypatch.setenv("CLERK_ISSUER", CLERK_TEST_ISSUER)
        monkeypatch.setattr(auth, "PyJWKClient", _ExplodingJWKClient)
        token = jwt.encode(
            {"sub": "user_1"},
            "hmac-test-secret-0123456789abcdef",
            algorithm="HS256",
        )
        assert auth.verify_clerk_token(token) is None
