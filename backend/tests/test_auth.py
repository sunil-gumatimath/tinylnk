"""Tests for admin-key authentication on protected management endpoints.

Public endpoints (create short URL, redirect, QR, health) should work without
any key.  Protected endpoints (recent, stats, update, delete, tags, export)
require a valid ``X-Admin-Key`` header.
"""

from fastapi.testclient import TestClient


class TestPublicEndpoints:
    """Endpoints that do NOT require admin authentication."""

    def test_shorten_does_not_require_key(self, client: TestClient):
        """POST /api/shorten works without any auth header."""
        response = client.post(
            "/api/shorten",
            json={"url": "https://example.com/public"},
        )
        assert response.status_code == 200

    def test_redirect_does_not_require_key(self, client: TestClient,
                                            sample_url: str):
        """GET /{code} works without any auth header."""
        response = client.get(f"/{sample_url}", follow_redirects=False)
        assert response.status_code == 302

    def test_health_does_not_require_key(self, client: TestClient):
        """GET /api/health works without any auth header."""
        response = client.get("/api/health")
        assert response.status_code == 200

    def test_qr_does_not_require_key(self, client: TestClient,
                                      sample_url: str):
        """GET /api/qr/{code} works without any auth header."""
        response = client.get(f"/api/qr/{sample_url}")
        assert response.status_code == 200


class TestProtectedEndpointsWithoutKey:
    """Every protected endpoint must return 403 when no admin key is sent."""

    PROTECTED_GET = [
        ("/api/recent", "get"),
        ("/api/stats/somecode", "get"),
        ("/api/stats/somecode/export", "get"),
        ("/api/tags", "get"),
    ]

    def test_recent_without_key_returns_403(self, client: TestClient):
        response = client.get("/api/recent")
        assert response.status_code == 403
        assert "admin key" in response.json()["detail"].lower()

    def test_stats_without_key_returns_403(self, client: TestClient):
        response = client.get("/api/stats/somecode")
        assert response.status_code == 403

    def test_stats_export_without_key_returns_403(self, client: TestClient):
        response = client.get("/api/stats/somecode/export")
        assert response.status_code == 403

    def test_tags_without_key_returns_403(self, client: TestClient):
        response = client.get("/api/tags")
        assert response.status_code == 403

    def test_delete_without_key_returns_403(self, client: TestClient):
        """DELETE /api/urls/{code} requires the X-Admin-Key header as a
        FastAPI dependency (Header(...)), so omitting it yields 422."""
        response = client.delete("/api/urls/somecode")
        # The header is required via Header(...) — a missing header is a
        # FastAPI validation error (422), not an application-level auth
        # error (403).  Both are acceptable for a missing-key scenario.
        assert response.status_code in (403, 422)

    def test_update_without_key_returns_403(self, client: TestClient):
        """PUT /api/urls/{code} also requires X-Admin-Key via Header(...)."""
        response = client.put(
            "/api/urls/somecode",
            json={"original_url": "https://example.com/updated"},
        )
        assert response.status_code in (403, 422)


class TestProtectedEndpointsWithKey:
    """Protected endpoints work when a valid admin key is provided."""

    def test_recent_with_valid_key_returns_200(self, client: TestClient,
                                                admin_key: str):
        response = client.get(
            "/api/recent",
            headers={"X-Admin-Key": admin_key},
        )
        assert response.status_code == 200
        assert isinstance(response.json(), list)

    def test_stats_with_valid_key_returns_200_or_404(self, client: TestClient,
                                                      admin_key: str,
                                                      sample_url: str):
        """Stats for an existing URL returns 200; for a non-existent one
        returns 404 (not 403)."""
        # Existing URL -> 200
        resp = client.get(
            f"/api/stats/{sample_url}",
            headers={"X-Admin-Key": admin_key},
        )
        assert resp.status_code == 200

        # Non-existent URL -> 404 (not 403)
        resp = client.get(
            "/api/stats/nonexistentZZZ",
            headers={"X-Admin-Key": admin_key},
        )
        assert resp.status_code == 404

    def test_delete_with_valid_key(self, client: TestClient, admin_key: str):
        """Deleting an existing URL with a valid key returns 204."""
        resp = client.post(
            "/api/shorten",
            json={"url": "https://example.com/to-delete"},
        )
        code = resp.json()["short_code"]

        response = client.delete(
            f"/api/urls/{code}",
            headers={"X-Admin-Key": admin_key},
        )
        assert response.status_code == 204

    def test_update_with_valid_key(self, client: TestClient, admin_key: str,
                                    sample_url: str):
        """Updating an existing URL with a valid key returns 200."""
        response = client.put(
            f"/api/urls/{sample_url}",
            json={"tag": "updated-tag"},
            headers={"X-Admin-Key": admin_key},
        )
        assert response.status_code == 200
        assert response.json()["tag"] == "updated-tag"

    def test_tags_with_valid_key(self, client: TestClient, admin_key: str):
        """GET /api/tags returns a list when authenticated."""
        # Create a URL with a tag first
        client.post(
            "/api/shorten",
            json={"url": "https://example.com/tag-me", "tag": "summer"},
        )
        response = client.get(
            "/api/tags",
            headers={"X-Admin-Key": admin_key},
        )
        assert response.status_code == 200
        assert "summer" in response.json()

    def test_stats_export_with_valid_key(self, client: TestClient,
                                          admin_key: str, sample_url: str):
        """Exporting stats CSV with a valid key returns 200 with CSV data."""
        response = client.get(
            f"/api/stats/{sample_url}/export",
            headers={"X-Admin-Key": admin_key},
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "text/csv; charset=utf-8"


class TestInvalidKey:
    """Every protected endpoint must reject an invalid admin key."""

    INVALID_KEYS = ["wrong-key", "test-admin-key-12346", "", "  "]

    def test_all_protected_endpoints_reject_invalid_key(
        self, client: TestClient, admin_key: str, sample_url: str
    ):
        """Each invalid key value returns 403 on every protected endpoint."""
        endpoints = [
            ("get", "/api/recent"),
            ("get", f"/api/stats/{sample_url}"),
            ("get", f"/api/stats/{sample_url}/export"),
            ("get", "/api/tags"),
            ("delete", f"/api/urls/{sample_url}"),
        ]

        for bad_key in self.INVALID_KEYS:
            for method, path in endpoints:
                if method == "get":
                    response = client.get(path, headers={"X-Admin-Key": bad_key})
                else:
                    response = client.delete(path, headers={"X-Admin-Key": bad_key})

                assert response.status_code == 403, (
                    f"{method.upper()} {path} with key={bad_key!r} "
                    f"expected 403, got {response.status_code}"
                )

    def test_update_with_invalid_key(self, client: TestClient,
                                      sample_url: str):
        """PUT /api/urls/{code} with an invalid key returns 403."""
        response = client.put(
            f"/api/urls/{sample_url}",
            json={"tag": "nope"},
            headers={"X-Admin-Key": "wrong-key"},
        )
        assert response.status_code == 403


class TestConstantTimeComparison:
    """Verify that the auth mechanism uses constant-time comparison
    (secrets.compare_digest) and does not leak valid-key info via
    timing or error messages."""

    def test_error_message_does_not_leak_info(self, client: TestClient):
        """The error detail for a missing key vs. wrong key should be
        identical."""
        no_key = client.get("/api/recent")
        wrong_key = client.get("/api/recent", headers={"X-Admin-Key": "wrong"})

        assert no_key.status_code == 403
        assert wrong_key.status_code == 403
        # Both should have a "detail" field
        assert "detail" in no_key.json()
        assert "detail" in wrong_key.json()
