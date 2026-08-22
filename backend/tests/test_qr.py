"""Tests for the QR code generation endpoint ``GET /api/qr/{short_code}``."""

from fastapi.testclient import TestClient

# PNG magic bytes (\x89 P N G \r \n \x1a \n)
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


class TestQrGeneration:
    """Happy-path QR generation."""

    def test_qr_returns_png(self, client: TestClient, sample_url: str):
        """The QR code response body is valid PNG data."""
        response = client.get(f"/api/qr/{sample_url}")
        assert response.status_code == 200
        # Verify PNG magic bytes
        assert response.content[:8] == PNG_MAGIC

    def test_qr_content_type(self, client: TestClient, sample_url: str):
        """The response has the correct PNG content type."""
        response = client.get(f"/api/qr/{sample_url}")
        assert response.status_code == 200
        assert response.headers["content-type"] == "image/png"

    def test_qr_for_nonexistent_code_404(self, client: TestClient):
        """A non-existent short code returns 404."""
        response = client.get("/api/qr/nonexistent123")
        assert response.status_code == 404

    def test_qr_for_empty_code_404(self, client: TestClient):
        """An empty or invalid code route returns the catch-all /assets or 404
        (depending on routing) — but the QR endpoint itself returns 404 for
        missing codes."""
        response = client.get("/api/qr/")
        # The route expects a short_code param, so /api/qr/ alone should
        # either 404 or 405
        assert response.status_code in (404, 405)


class TestQrColors:
    """Custom foreground and background colors for QR codes."""

    def test_qr_with_named_colors(self, client: TestClient, sample_url: str):
        """Using named color strings (e.g. fg=red, bg=blue) works."""
        response = client.get(
            f"/api/qr/{sample_url}",
            params={"fg": "red", "bg": "blue"},
        )
        assert response.status_code == 200
        assert response.content[:8] == PNG_MAGIC

    def test_qr_with_hex_colors(self, client: TestClient, sample_url: str):
        """Using hex color values without the # works (e.g. 1d4ed8)."""
        response = client.get(
            f"/api/qr/{sample_url}",
            params={"fg": "1d4ed8", "bg": "ffffff"},
        )
        assert response.status_code == 200
        assert response.content[:8] == PNG_MAGIC

    def test_qr_with_default_colors(self, client: TestClient, sample_url: str):
        """Omitting fg/bg uses the defaults (black on white)."""
        response = client.get(f"/api/qr/{sample_url}")
        assert response.status_code == 200
        assert response.content[:8] == PNG_MAGIC


class TestQrCache:
    """QR caching behaviour (avoids repeated CPU-heavy generation)."""

    def test_qr_cache_serves_same_bytes(self, client: TestClient,
                                          sample_url: str):
        """Two identical requests return identical byte content (from the
        cache)."""
        r1 = client.get(f"/api/qr/{sample_url}")
        r2 = client.get(f"/api/qr/{sample_url}")
        assert r1.content == r2.content

    def test_qr_different_colors_different_cache(self, client: TestClient,
                                                   sample_url: str):
        """Different color parameters produce different cache entries
        (different PNG bytes)."""
        r1 = client.get(
            f"/api/qr/{sample_url}",
            params={"fg": "red"},
        )
        r2 = client.get(
            f"/api/qr/{sample_url}",
            params={"fg": "blue"},
        )
        # Different colors should produce different PNG data
        assert r1.content != r2.content

    def test_qr_alias_vs_short_code(self, client: TestClient,
                                     sample_url_with_alias: dict):
        """QR for a URL with a custom alias works correctly."""
        code = sample_url_with_alias["short_code"]
        response = client.get(f"/api/qr/{code}")
        assert response.status_code == 200
        assert response.content[:8] == PNG_MAGIC


class TestQrColorValidation:
    """Invalid ?fg/?bg values must return 400, not a 500 from PIL."""

    def test_qr_invalid_fg_color_returns_400(self, client: TestClient,
                                             sample_url: str):
        response = client.get(f"/api/qr/{sample_url}?fg=not-a-color")
        assert response.status_code == 400
        assert "fg" in response.json()["detail"]

    def test_qr_invalid_bg_color_returns_400(self, client: TestClient,
                                             sample_url: str):
        response = client.get(f"/api/qr/{sample_url}?bg=%23zzzzzz")
        assert response.status_code == 400
        assert "bg" in response.json()["detail"]

    def test_qr_valid_colors_still_work(self, client: TestClient,
                                        sample_url: str):
        response = client.get(f"/api/qr/{sample_url}?fg=1d4ed8&bg=white")
        assert response.status_code == 200
