"""Tests for authentication on protected management endpoints.

Public endpoints (create short URL, redirect, QR, health) should work without
any credentials.  Protected endpoints (recent, stats, update, delete, tags,
export) require a Clerk JWT.  In test mode (``TINYLNK_ENV=test``) the legacy
``X-Admin-Key`` header is also accepted as a convenience fallback.
"""

from fastapi.testclient import TestClient


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
    (test-mode fallback — ``TINYLNK_ENV=test``)."""

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
                f"{method.upper()} {path} with key='wrong-key' expected 401, got {response.status_code}"
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
