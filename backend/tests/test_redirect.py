"""Tests for the ``GET /{short_code}`` redirect endpoint — basic redirect,
click recording, expiration, max-clicks enforcement, and edge cases."""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient


class TestBasicRedirect:
    """Happy-path redirect behaviour."""

    def test_basic_302_redirect(self, client: TestClient, sample_url: str):
        """Requesting a valid short code returns a 302 redirect to the
        original URL."""
        response = client.get(f"/{sample_url}", follow_redirects=False)
        assert response.status_code == 302
        assert response.headers["location"] == "https://example.com/test-page"

    def test_redirect_preserves_query_params(self, client: TestClient):
        """The original URL's query string is preserved on redirect."""
        resp = client.post(
            "/api/shorten",
            json={"url": "https://example.com/page?foo=bar&baz=1"},
        )
        code = resp.json()["short_code"]
        r = client.get(f"/{code}", follow_redirects=False)
        assert r.headers["location"] == "https://example.com/page?foo=bar&baz=1"

    def test_redirect_records_click(self, client: TestClient, sample_url: str,
                                    admin_key: str):
        """After a redirect, the click_count should be 1."""
        client.get(f"/{sample_url}", follow_redirects=False)
        stats = client.get(
            f"/api/stats/{sample_url}",
            headers={"X-Admin-Key": admin_key},
        )
        assert stats.status_code == 200
        assert stats.json()["total_clicks"] == 1

    def test_click_count_increments(self, client: TestClient, sample_url: str,
                                    admin_key: str):
        """Multiple redirects increment the click count."""
        for _ in range(5):
            client.get(f"/{sample_url}", follow_redirects=False)

        stats = client.get(
            f"/api/stats/{sample_url}",
            headers={"X-Admin-Key": admin_key},
        )
        assert stats.status_code == 200
        assert stats.json()["total_clicks"] == 5

    def test_redirect_with_custom_alias(self, client: TestClient,
                                        sample_url_with_alias: dict):
        """A short URL created with a custom alias redirects correctly."""
        code = sample_url_with_alias["short_code"]
        response = client.get(f"/{code}", follow_redirects=False)
        assert response.status_code == 302
        assert response.headers["location"] == "https://example.com/alias-page"


class TestErrorConditions:
    """404, 410, and reserved-alias handling."""

    def test_unknown_short_code_404(self, client: TestClient):
        """A non-existent short code returns 404."""
        response = client.get("/nonexistent123", follow_redirects=False)
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_expired_url_410(self, client: TestClient, db_session, admin_key):
        """A URL whose expires_at is in the past returns 410 Gone."""
        # Create a URL that expires immediately (0 hours from now — at the
        # boundary).  We then patch expires_at to an explicitly past date to
        # guarantee expiry.
        resp = client.post(
            "/api/shorten",
            json={"url": "https://example.com/expired-test", "expires_in_hours": 0},
        )
        code = resp.json()["short_code"]

        # Directly set expires_at to one hour ago in the database.
        from app import models
        url_obj = db_session.query(models.URL).filter(
            models.URL.short_code == code
        ).first()
        url_obj.expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
        db_session.commit()

        response = client.get(f"/{code}", follow_redirects=False)
        assert response.status_code == 410
        assert "expired" in response.json()["detail"].lower()

    def test_max_clicks_exhausted_410(self, client: TestClient, admin_key: str):
        """A URL that has reached its max_clicks limit returns 410."""
        resp = client.post(
            "/api/shorten",
            json={"url": "https://example.com/maxed-out", "max_clicks": 3},
        )
        code = resp.json()["short_code"]

        # Exhaust the click limit
        for _ in range(3):
            client.get(f"/{code}", follow_redirects=False)

        # The 4th request should be rejected
        response = client.get(f"/{code}", follow_redirects=False)
        assert response.status_code == 410
        assert "click limit" in response.json()["detail"].lower()

    def test_max_clicks_zero(self, client: TestClient):
        """max_clicks=0 should never allow any redirect."""
        resp = client.post(
            "/api/shorten",
            json={"url": "https://example.com/zero-limit", "max_clicks": 0},
        )
        code = resp.json()["short_code"]

        response = client.get(f"/{code}", follow_redirects=False)
        assert response.status_code == 410
        assert "click limit" in response.json()["detail"].lower()

    def test_reserved_alias_returns_404(self, client: TestClient):
        """Reserved aliases (api, docs, assets, etc.) cannot be used as short
        codes and return 404 when accessed."""
        for alias in ["api", "docs", "assets", "stats"]:
            response = client.get(f"/{alias}", follow_redirects=False)
            assert response.status_code == 404, f"Reserved alias '{alias}' should 404"

    def test_case_sensitivity(self, client: TestClient):
        """Short codes are case-sensitive (SQLite BINARY comparison)."""
        resp = client.post(
            "/api/shorten",
            json={"url": "https://example.com/case-test"},
        )
        data = resp.json()
        code = data["short_code"]
        # In case the generated code happens to be all-lowercase or all-uppercase,
        # guarantee at least one differing case variant exists by flipping case.
        swapped = code.swapcase()

        # The swapped-case variant should 404
        response = client.get(f"/{swapped}", follow_redirects=False)
        assert response.status_code == 404

    def test_mixed_case_alias(self, client: TestClient):
        """A custom alias with mixed case works (alias is stored as-is)."""
        resp = client.post(
            "/api/shorten",
            json={
                "url": "https://example.com/mixed-case",
                "custom_alias": "MixedCaseAlias",
            },
        )
        assert resp.status_code == 200
        code = resp.json()["short_code"]
        assert code == "MixedCaseAlias"

        # Lowercase variant should 404 if case-sensitive
        response = client.get("/mixedcasealias", follow_redirects=False)
        assert response.status_code == 404
