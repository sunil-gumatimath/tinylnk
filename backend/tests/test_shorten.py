"""Tests for the ``POST /api/shorten`` endpoint — URL creation, validation,
alias handling, SSRF prevention, and schema checks."""

from fastapi.testclient import TestClient


class TestCreateShortUrl:
    """Happy-path: successfully creating shortened URLs."""

    def test_create_with_valid_url(self, client: TestClient):
        """A well-formed URL returns a 200 with all expected fields."""
        response = client.post(
            "/api/shorten",
            json={"url": "https://example.com/hello"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["original_url"] == "https://example.com/hello"
        assert len(data["short_code"]) > 0
        assert data["short_url"].startswith("http://testserver/")
        assert data["click_count"] == 0
        assert data["expires_at"] is None
        assert data["max_clicks"] is None
        assert data["tag"] is None

    def test_auto_prepend_https(self, client: TestClient):
        """A URL without a scheme should have https:// automatically
        prepended."""
        response = client.post(
            "/api/shorten",
            json={"url": "example.com/no-scheme"},
        )
        assert response.status_code == 200
        assert response.json()["original_url"] == "https://example.com/no-scheme"

    def test_http_scheme_is_allowed(self, client: TestClient):
        """http:// URLs are also accepted (not just https://)."""
        response = client.post(
            "/api/shorten",
            json={"url": "http://example.com/insecure"},
        )
        assert response.status_code == 200
        assert response.json()["original_url"] == "http://example.com/insecure"

    def test_url_response_schema(self, client: TestClient):
        """The response body contains every field described in URLResponse."""
        response = client.post(
            "/api/shorten",
            json={"url": "https://schema.example/path"},
        )
        assert response.status_code == 200
        data = response.json()
        expected_keys = {
            "id", "original_url", "short_code", "short_url",
            "created_at", "expires_at", "max_clicks", "tag", "click_count",
        }
        assert set(data.keys()) == expected_keys


class TestCustomAlias:
    """Custom alias creation and validation."""

    def test_create_with_custom_alias(self, client: TestClient):
        """A valid custom alias is accepted and returned as the short_code."""
        response = client.post(
            "/api/shorten",
            json={"url": "https://example.com/alias", "custom_alias": "my-test-alias"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["short_code"] == "my-test-alias"
        assert data["short_url"].endswith("/my-test-alias")

    def test_alias_too_short(self, client: TestClient):
        """An alias shorter than 3 characters is rejected."""
        response = client.post(
            "/api/shorten",
            json={"url": "https://example.com/x", "custom_alias": "ab"},
        )
        assert response.status_code == 400
        assert "alias" in response.json()["detail"].lower()

    def test_alias_too_long(self, client: TestClient):
        """An alias longer than 50 characters is rejected."""
        response = client.post(
            "/api/shorten",
            json={"url": "https://example.com/x", "custom_alias": "a" * 51},
        )
        assert response.status_code == 400
        assert "alias" in response.json()["detail"].lower()

    def test_alias_invalid_chars(self, client: TestClient):
        """An alias with characters other than alphanumeric, hyphens, or
        underscores is rejected."""
        response = client.post(
            "/api/shorten",
            json={"url": "https://example.com/x", "custom_alias": "hello world!"},
        )
        assert response.status_code == 400
        assert "alias" in response.json()["detail"].lower()

    def test_alias_with_underscore_is_valid(self, client: TestClient):
        """Underscores are explicitly allowed in aliases."""
        response = client.post(
            "/api/shorten",
            json={"url": "https://example.com/x", "custom_alias": "my_test_alias"},
        )
        assert response.status_code == 200
        assert response.json()["short_code"] == "my_test_alias"

    def test_alias_uniqueness_conflict(self, client: TestClient):
        """Using an already-taken alias returns 409."""
        client.post(
            "/api/shorten",
            json={"url": "https://example.com/first", "custom_alias": "dup-alias"},
        )
        response = client.post(
            "/api/shorten",
            json={"url": "https://example.com/second", "custom_alias": "dup-alias"},
        )
        assert response.status_code == 409
        assert "taken" in response.json()["detail"].lower()

    def test_reserved_alias_rejection(self, client: TestClient):
        """Reserved words (api, stats, docs, etc.) cannot be used as aliases."""
        for alias in ["api", "stats", "docs", "assets", "recent", "shorten"]:
            response = client.post(
                "/api/shorten",
                json={"url": f"https://example.com/{alias}", "custom_alias": alias},
            )
            assert response.status_code == 400, f"Alias '{alias}' should be reserved"
            assert "reserved" in response.json()["detail"].lower()

    def test_reserved_alias_case_insensitive(self, client: TestClient):
        """Reserved-words check is case-insensitive."""
        response = client.post(
            "/api/shorten",
            json={"url": "https://example.com/x", "custom_alias": "API"},
        )
        assert response.status_code == 400
        assert "reserved" in response.json()["detail"].lower()


class TestSsrPrevention:
    """SSRF (Server-Side Request Forgery) prevention checks."""

    def test_block_localhost_hostname(self, client: TestClient):
        """Shortening localhost URLs is blocked."""
        response = client.post(
            "/api/shorten",
            json={"url": "http://localhost/some-path"},
        )
        assert response.status_code == 400
        assert "not allowed" in response.json()["detail"].lower()

    def test_block_private_ip_10_dot(self, client: TestClient):
        """10.x.x.x addresses are blocked."""
        response = client.post(
            "/api/shorten",
            json={"url": "http://10.0.0.1/admin"},
        )
        assert response.status_code == 400

    def test_block_private_ip_172_16(self, client: TestClient):
        """172.16.x.x addresses are blocked."""
        response = client.post(
            "/api/shorten",
            json={"url": "http://172.16.0.1/admin"},
        )
        assert response.status_code == 400

    def test_block_private_ip_192_168(self, client: TestClient):
        """192.168.x.x addresses are blocked."""
        response = client.post(
            "/api/shorten",
            json={"url": "http://192.168.1.1/admin"},
        )
        assert response.status_code == 400

    def test_block_loopback_127(self, client: TestClient):
        """127.0.0.1 and other loopback addresses are blocked."""
        response = client.post(
            "/api/shorten",
            json={"url": "http://127.0.0.1/service"},
        )
        assert response.status_code == 400

    def test_block_link_local_169_254(self, client: TestClient):
        """169.254.x.x (link-local / cloud metadata) addresses are blocked."""
        response = client.post(
            "/api/shorten",
            json={"url": "http://169.254.169.254/latest/meta-data/"},
        )
        assert response.status_code == 400

    def test_block_bare_hostname_without_dot(self, client: TestClient):
        """A bare hostname with no dot is rejected (potential internal
        service)."""
        response = client.post(
            "/api/shorten",
            json={"url": "http://internal-service/config"},
        )
        assert response.status_code == 400

    def test_block_metadata_google(self, client: TestClient):
        """metadata.google.internal is a well-known cloud metadata endpoint
        and must be blocked."""
        response = client.post(
            "/api/shorten",
            json={"url": "http://metadata.google.internal/computeMetadata/v1/"},
        )
        assert response.status_code == 400

    def test_block_zero_dot(self, client: TestClient):
        """0.0.0.0 is a reserved / catch-all address and is blocked."""
        response = client.post(
            "/api/shorten",
            json={"url": "http://0.0.0.0/config"},
        )
        assert response.status_code == 400

    def test_block_ipv6_link_local(self, client: TestClient):
        """IPv6 link-local (fe80::) addresses are blocked."""
        response = client.post(
            "/api/shorten",
            json={"url": "http://[fe80::1]/config"},
        )
        assert response.status_code == 400

    def test_block_ipv6_unique_local(self, client: TestClient):
        """IPv6 unique-local (fc00::/7) addresses are blocked."""
        response = client.post(
            "/api/shorten",
            json={"url": "http://[fc00::1]/config"},
        )
        assert response.status_code == 400

    def test_block_ipv6_loopback(self, client: TestClient):
        """IPv6 loopback (::1) is blocked."""
        response = client.post(
            "/api/shorten",
            json={"url": "http://[::1]/config"},
        )
        assert response.status_code == 400


class TestSelfReferencing:
    """Preventing users from shortening URLs that point back to the same
    tinylnk instance."""

    def test_self_referencing_domain_blocked(self):
        """When the base_url matches the target domain, the request should
        be rejected with a clear message."""
        # Use a custom TestClient base_url so the domain has a dot (e.g.
        # "example.com") to pass the early SSRF checks.
        from app.main import app
        client = TestClient(app, base_url="https://example.com")
        # Override the database dependency for this client too
        from app.database import get_db
        # We need a real session — import from conftest is tricky so we
        # create a minimal inline one.
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from app.database import Base

        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(bind=engine)
        test_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)()
        app.dependency_overrides[get_db] = lambda: test_session

        try:
            response = client.post(
                "/api/shorten",
                json={"url": "https://example.com/some-page"},
            )
            assert response.status_code == 400
            detail = response.json()["detail"].lower()
            assert "cannot shorten" in detail or "pointing to this domain" in detail
        finally:
            app.dependency_overrides.clear()
            test_session.close()


class TestOptionalParameters:
    """expires_in_hours, max_clicks, and tag parameters."""

    def test_expires_in_hours(self, client: TestClient):
        """Setting expires_in_hours should result in a non-null expires_at."""
        response = client.post(
            "/api/shorten",
            json={"url": "https://example.com/expiring", "expires_in_hours": 1},
        )
        assert response.status_code == 200
        assert response.json()["expires_at"] is not None

    def test_max_clicks(self, client: TestClient):
        """Setting max_clicks should be reflected in the response."""
        response = client.post(
            "/api/shorten",
            json={"url": "https://example.com/limited", "max_clicks": 5},
        )
        assert response.status_code == 200
        assert response.json()["max_clicks"] == 5

    def test_tag(self, client: TestClient):
        """Setting a tag should be returned in the response."""
        response = client.post(
            "/api/shorten",
            json={"url": "https://example.com/tagged", "tag": "promo"},
        )
        assert response.status_code == 200
        assert response.json()["tag"] == "promo"

    def test_all_optional_params_together(self, client: TestClient):
        """All three optional fields can be used together."""
        response = client.post(
            "/api/shorten",
            json={
                "url": "https://example.com/all-options",
                "custom_alias": "all-options",
                "expires_in_hours": 24,
                "max_clicks": 100,
                "tag": "campaign",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["short_code"] == "all-options"
        assert data["expires_at"] is not None
        assert data["max_clicks"] == 100
        assert data["tag"] == "campaign"


class TestEdgeCases:
    """Edge cases and error conditions."""

    def test_empty_url_rejected(self, client: TestClient):
        """An empty URL string should be rejected."""
        response = client.post(
            "/api/shorten",
            json={"url": ""},
        )
        assert response.status_code in (400, 422)

    def test_missing_url_field(self, client: TestClient):
        """Omitting the required 'url' field should return 422."""
        response = client.post(
            "/api/shorten",
            json={},
        )
        assert response.status_code == 422

    def test_very_long_url(self, client: TestClient):
        """Very long URLs should still be accepted (there is no explicit URL
        length limit in the schema)."""
        long_url = "https://example.com/" + "a" * 5000
        response = client.post(
            "/api/shorten",
            json={"url": long_url},
        )
        assert response.status_code == 200
        assert response.json()["original_url"] == long_url
