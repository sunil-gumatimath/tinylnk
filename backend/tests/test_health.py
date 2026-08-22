"""Tests for the health check endpoint ``GET /api/health``."""

from fastapi.testclient import TestClient


class TestHealthCheck:
    """The health endpoint provides a simple liveness probe."""

    def test_health_returns_ok(self, client: TestClient):
        """The health endpoint returns ``{"status": "ok"}``."""
        response = client.get("/api/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok", "database": "connected"}

    def test_health_does_not_require_auth(self, client: TestClient):
        """The health endpoint is accessible without any admin key."""
        response = client.get("/api/health")
        assert response.status_code == 200

        # Also verify that sending a key still works
        response = client.get(
            "/api/health",
            headers={"X-Admin-Key": "some-random-key"},
        )
        assert response.status_code == 200

    def test_health_is_not_rate_limited(self, client: TestClient):
        """The health endpoint is not decorated with ``@limiter.limit`` so
        there is no per-route rate limiting applied."""
        # Make several rapid requests — even in quick succession they should
        # all succeed (no 429).
        for _ in range(10):
            response = client.get("/api/health")
            assert response.status_code == 200

    def test_health_has_security_headers(self, client: TestClient):
        """Even the health endpoint includes security headers from the
        middleware."""
        response = client.get("/api/health")
        assert "x-content-type-options" in response.headers
        assert "x-frame-options" in response.headers

    def test_health_content_type(self, client: TestClient):
        """The health response is JSON."""
        response = client.get("/api/health")
        assert response.headers.get("content-type") == "application/json"

    def test_health_returns_503_when_db_down(self, client: TestClient):
        """A dead database must fail the probe: HTTP 503, not 200."""
        from app.database import get_db
        from app.main import app

        class BrokenDB:
            def execute(self, *_args, **_kwargs):
                raise RuntimeError("simulated DB outage")

        app.dependency_overrides[get_db] = lambda: BrokenDB()
        try:
            response = client.get("/api/health")
        finally:
            app.dependency_overrides.pop(get_db, None)

        assert response.status_code == 503
        assert response.json() == {"status": "error", "database": "disconnected"}
