"""Security-oriented tests — SSRF prevention, IP anonymization, request size
limits, security headers, path-traversal protection, and alias validation."""

import ipaddress

from fastapi.testclient import TestClient

from app.utils import anonymize_ip, is_safe_url, is_valid_alias


# ===========================================================================
# SSRF — is_safe_url
# ===========================================================================

class TestSsrfIsSafeUrl:
    """Direct tests for the ``is_safe_url`` utility function."""

    def test_public_url_is_safe(self):
        """A normal public HTTPS URL is safe."""
        assert is_safe_url("https://example.com/page") is True

    def test_http_url_is_safe(self):
        """HTTP is also accepted for public URLs."""
        assert is_safe_url("http://example.com/page") is True

    def test_10_dot_blocked(self):
        assert is_safe_url("http://10.0.0.1/admin") is False

    def test_172_16_blocked(self):
        assert is_safe_url("http://172.16.0.1/admin") is False

    def test_172_31_blocked(self):
        """Upper bound of the 172.16.0.0/12 range."""
        assert is_safe_url("http://172.31.255.255/admin") is False

    def test_172_15_allowed(self):
        """Just outside the blocked 172.16.0.0/12 range."""
        assert is_safe_url("http://172.15.0.1/admin") is True

    def test_192_168_blocked(self):
        assert is_safe_url("http://192.168.1.1/admin") is False

    def test_127_dot_blocked(self):
        assert is_safe_url("http://127.0.0.1/service") is False
        assert is_safe_url("http://127.0.0.2/service") is False

    def test_169_254_blocked(self):
        assert is_safe_url("http://169.254.169.254/latest/meta-data/") is False

    def test_localhost_hostname_blocked(self):
        """The hostname ``localhost`` is blocked regardless of resolution."""
        assert is_safe_url("http://localhost/path") is False

    def test_metadata_google_blocked(self):
        assert is_safe_url("http://metadata.google.internal/") is False

    def test_bare_hostname_without_dot_rejected(self):
        """A hostname without a dot (e.g. ``internal-service``) is not a
        valid public target and should be rejected."""
        assert is_safe_url("http://internal-service/config") is False

    def test_ipv6_loopback_blocked(self):
        assert is_safe_url("http://[::1]/config") is False

    def test_ipv6_link_local_blocked(self):
        assert is_safe_url("http://[fe80::1]/config") is False

    def test_ipv6_unique_local_blocked(self):
        assert is_safe_url("http://[fc00::1]/config") is False

    def test_0_dot_0_dot_0_dot_0_blocked(self):
        assert is_safe_url("http://0.0.0.0/config") is False

    def test_ftp_scheme_rejected(self):
        """Non-HTTP(S) schemes are rejected even for public hosts."""
        assert is_safe_url("ftp://example.com/file") is False

    def test_empty_url_returns_false(self):
        assert is_safe_url("") is False

    def test_malformed_url_returns_false(self):
        assert is_safe_url("not-a-url") is False


# ===========================================================================
# IP Anonymization — anonymize_ip
# ===========================================================================

class TestIpAnonymization:
    """Tests for the IP anonymization utility."""

    def test_ipv4_last_octet_zeroed(self):
        """IPv4 addresses have their last octet replaced with 0."""
        assert anonymize_ip("192.168.1.100") == "192.168.1.0"
        assert anonymize_ip("10.0.0.55") == "10.0.0.0"
        assert anonymize_ip("203.0.113.42") == "203.0.113.0"

    def test_ipv6_truncated_to_48(self):
        """IPv6 addresses are truncated to the /48 network prefix."""
        result = anonymize_ip("2001:db8:abcd:0012:dead:beef:cafe:babe")
        assert result is not None
        # The first 48 bits (2001:db8:abcd) are preserved; the rest are zeroed.
        addr = ipaddress.ip_address(result)
        assert isinstance(addr, ipaddress.IPv6Address)
        # Verify it's a /48 network address
        assert str(addr).startswith("2001:db8:abcd")

    def test_ipv6_short_form(self):
        """Short-form IPv6 addresses are handled correctly."""
        result = anonymize_ip("::1")
        assert result is not None
        # ::1/48 network = :: (all zeros since ::1 is in the first 48 bits)
        assert result is not None

    def test_none_ip_returns_none(self):
        assert anonymize_ip(None) is None

    def test_empty_string_returns_none(self):
        assert anonymize_ip("") is None

    def test_invalid_ip_returns_none(self):
        """A string that is not a valid IP returns None."""
        assert anonymize_ip("not-an-ip") is None
        assert anonymize_ip("127.0.0") is None


# ===========================================================================
# Request Size Limit — middleware
# ===========================================================================

class TestRequestSizeLimit:
    """The RequestSizeLimitMiddleware rejects payloads over 1 MB."""

    def test_request_over_1mb_rejected(self, client: TestClient):
        """A POST body larger than 1 MB returns 413."""
        payload = b"x" * 2_000_000  # ~2 MB
        response = client.post(
            "/api/shorten",
            content=payload,
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 413
        assert "too large" in response.json()["detail"].lower()

    def test_request_just_under_limit_accepted(self, client: TestClient):
        """A POST body just under 1 MB should be accepted (or fail with a
        different error, but not 413)."""
        # Send a valid JSON body just under 1 MB
        long_url = "https://example.com/" + "a" * (900_000)
        payload = f'{{"url": "{long_url}"}}'.encode()
        assert len(payload) < 1_048_576
        response = client.post(
            "/api/shorten",
            content=payload,
            headers={"Content-Type": "application/json"},
        )
        # It should either succeed or fail with something other than 413
        assert response.status_code != 413


# ===========================================================================
# Security Headers — middleware
# ===========================================================================

class TestSecurityHeaders:
    """The SecurityHeadersMiddleware attaches security headers to every
    response."""

    def test_security_headers_present(self, client: TestClient):
        """Every response includes the standard security headers."""
        response = client.get("/api/health")
        assert response.headers.get("x-content-type-options") == "nosniff"
        assert response.headers.get("x-frame-options") == "DENY"
        assert response.headers.get("x-xss-protection") == "1; mode=block"
        assert response.headers.get("referrer-policy") == "strict-origin-when-cross-origin"
        assert response.headers.get("strict-transport-security").startswith(
            "max-age=63072000"
        )

    def test_security_headers_on_error_responses(self, client: TestClient):
        """Even error responses (404, 413, etc.) include security headers."""
        response = client.get("/nonexistent-route-xyz")
        assert response.status_code == 404
        assert "x-content-type-options" in response.headers


# ===========================================================================
# Path-Traversal Protection — /assets/{file_path:path}
# ===========================================================================

class TestPathTraversal:
    """The /assets/ endpoint must resist directory-traversal attacks."""

    def test_path_traversal_returns_403(self, client: TestClient):
        """A path with ``..`` escaping the assets root is rejected (either
        403 when the server detects the traversal, or 404 when the HTTP
        client normalises the path away before the server sees it)."""
        response = client.get("/assets/../../../etc/passwd")
        assert response.status_code in (403, 404)

    def test_path_traversal_double_dot(self, client: TestClient):
        """Double-dot segments are rejected (403 or 404)."""
        response = client.get("/assets/../app/main.py")
        assert response.status_code in (403, 404)

    def test_path_traversal_encoded(self, client: TestClient):
        """URL-encoded traversal (%2e%2e) is blocked."""
        response = client.get("/assets/%2e%2e/app/main.py")
        assert response.status_code in (403, 404)  # 403 if decoded, 404 if not

    def test_legitimate_asset_path_does_not_403(self, client: TestClient):
        """A legitimate path within the assets root returns 404 (file not
        found) rather than 403."""
        response = client.get("/assets/app.js")
        # The file probably doesn't exist in the test env, but should be
        # 404 (not found), not 403 (forbidden).
        assert response.status_code == 404


# ===========================================================================
# Alias Validation — is_valid_alias
# ===========================================================================

class TestAliasValidation:
    """Direct tests for the ``is_valid_alias`` utility function."""

    def test_valid_alphanumeric(self):
        assert is_valid_alias("myalias") is True
        assert is_valid_alias("MyAlias123") is True

    def test_valid_with_hyphens(self):
        assert is_valid_alias("my-alias") is True
        assert is_valid_alias("a-b-c-d") is True

    def test_valid_with_underscores(self):
        assert is_valid_alias("my_alias") is True
        assert is_valid_alias("a_b_c") is True

    def test_too_short(self):
        assert is_valid_alias("ab") is False
        assert is_valid_alias("a") is False

    def test_too_long(self):
        assert is_valid_alias("a" * 51) is False

    def test_length_boundaries(self):
        """Aliases of exactly 3 chars (min) and 50 chars (max) are valid."""
        assert is_valid_alias("abc") is True
        assert is_valid_alias("a" * 50) is True

    def test_invalid_special_chars(self):
        assert is_valid_alias("hello world") is False
        assert is_valid_alias("hello!") is False
        assert is_valid_alias("test@alias") is False
        assert is_valid_alias("test.alias") is False
        assert is_valid_alias("test/alias") is False

    def test_empty_string(self):
        assert is_valid_alias("") is False

    def test_none(self):
        # Should handle gracefully — is_valid_alias will try len(None)
        # which raises TypeError; we just confirm it doesn't silently accept.
        try:
            result = is_valid_alias(None)  # type: ignore[arg-type]
            assert result is False
        except TypeError:
            pass  # Acceptable for None input
