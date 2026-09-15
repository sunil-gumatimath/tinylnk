"""Tests for click-analytics endpoints — ``GET /api/stats/{code}`` and the
CSV export at ``/api/stats/{code}/export``."""

import csv
import io
from datetime import datetime, timezone

from fastapi.testclient import TestClient


class TestStatsResponse:
    """Structure and accuracy of the JSON stats response."""

    def test_total_clicks_after_multiple_redirects(self, client: TestClient,
                                                    auth_headers: dict,
                                                    sample_url: str):
        """After N redirects, total_clicks equals N."""
        for _ in range(7):
            client.get(f"/{sample_url}", follow_redirects=False)

        stats = client.get(
            f"/api/stats/{sample_url}",
            headers=auth_headers,
        )
        assert stats.status_code == 200
        assert stats.json()["total_clicks"] == 7

    def test_clicks_by_date_is_populated(self, client: TestClient,
                                          auth_headers: dict,
                                          sample_url: str):
        """After a redirect, clicks_by_date contains an entry for today."""
        client.get(f"/{sample_url}", follow_redirects=False)

        stats = client.get(
            f"/api/stats/{sample_url}",
            headers=auth_headers,
        )
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        dates = {item["name"] for item in stats.json()["clicks_by_date"]}
        assert today in dates
        # The value for today should be 1
        today_item = next(
            item for item in stats.json()["clicks_by_date"]
            if item["name"] == today
        )
        assert today_item["value"] == 1

    def test_stats_response_keys(self, client: TestClient, auth_headers: dict,
                                  sample_url: str):
        """The stats response contains every expected field."""
        client.get(f"/{sample_url}", follow_redirects=False)
        stats = client.get(
            f"/api/stats/{sample_url}",
            headers=auth_headers,
        )
        expected_keys = {
            "original_url", "short_code", "created_at", "expires_at",
            "max_clicks", "tag", "custom_alias", "total_clicks",
            "clicks_by_date", "browser_stats", "os_stats", "referrer_stats",
            "recent_clicks",
        }
        assert set(stats.json().keys()) == expected_keys

    def test_stats_metadata(self, client: TestClient, auth_headers: dict,
                             sample_url: str):
        """The stats response includes original_url and short_code."""
        stats = client.get(
            f"/api/stats/{sample_url}",
            headers=auth_headers,
        )
        data = stats.json()
        assert data["original_url"] == "https://example.com/test-page"
        assert data["short_code"] == sample_url

    def test_recent_clicks_in_stats(self, client: TestClient, auth_headers: dict,
                                     sample_url: str):
        """After a redirect, the most recent click appears in recent_clicks."""
        client.get(f"/{sample_url}", follow_redirects=False)

        stats = client.get(
            f"/api/stats/{sample_url}",
            headers=auth_headers,
        )
        assert len(stats.json()["recent_clicks"]) == 1
        click = stats.json()["recent_clicks"][0]
        assert "clicked_at" in click

    def test_recent_clicks_expose_parsed_browser_and_os(
        self, client: TestClient, auth_headers: dict, sample_url: str
    ):
        """The activity feed gets parsed browser/OS instead of a raw UA string.

        The charts already aggregate the parsed families, so exposing them per
        click keeps the two views consistent (and stops the UI from rendering
        a 120-character UA).
        """
        chrome_windows = (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        client.get(
            f"/{sample_url}",
            headers={"User-Agent": chrome_windows},
            follow_redirects=False,
        )

        click = client.get(
            f"/api/stats/{sample_url}",
            headers=auth_headers,
        ).json()["recent_clicks"][0]

        assert click["browser"] == "Chrome"
        assert click["os"] == "Windows"
        # The raw string is still available for a debug tooltip.
        assert click["user_agent"] == chrome_windows

    def test_recent_clicks_have_utc_offsets(self, client: TestClient,
                                             auth_headers: dict,
                                             sample_url: str):
        """clicked_at is serialized with an explicit UTC offset."""
        client.get(f"/{sample_url}", follow_redirects=False)
        click = client.get(
            f"/api/stats/{sample_url}",
            headers=auth_headers,
        ).json()["recent_clicks"][0]
        assert click["clicked_at"].endswith("Z")

    def test_stats_created_at_has_utc_offset(self, client: TestClient,
                                              auth_headers: dict,
                                              sample_url: str):
        stats = client.get(
            f"/api/stats/{sample_url}",
            headers=auth_headers,
        ).json()
        assert stats["created_at"].endswith("Z")


class TestBrowserAndOsStats:
    """Parsing of user-agent strings in analytics."""

    CHROME_UA = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
    FIREFOX_UA = (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) "
        "Gecko/20100101 Firefox/121.0"
    )

    def test_browser_stats_from_user_agent(self, client: TestClient,
                                            auth_headers: dict,
                                            sample_url: str):
        """Browser family is extracted from the User-Agent header."""
        client.get(
            f"/{sample_url}",
            headers={"User-Agent": self.CHROME_UA},
            follow_redirects=False,
        )

        stats = client.get(
            f"/api/stats/{sample_url}",
            headers=auth_headers,
        )
        browsers = {b["name"]: b["value"] for b in stats.json()["browser_stats"]}
        assert "Chrome" in browsers
        assert browsers["Chrome"] == 1

    def test_os_stats_from_user_agent(self, client: TestClient, auth_headers: dict,
                                       sample_url: str):
        """OS family is extracted from the User-Agent header."""
        client.get(
            f"/{sample_url}",
            headers={"User-Agent": self.CHROME_UA},
            follow_redirects=False,
        )

        stats = client.get(
            f"/api/stats/{sample_url}",
            headers=auth_headers,
        )
        oss = {o["name"]: o["value"] for o in stats.json()["os_stats"]}
        assert "Windows" in oss

    def test_multiple_browsers_aggregated(self, client: TestClient,
                                           auth_headers: dict,
                                           sample_url: str):
        """Multiple clicks from different browsers are aggregated."""
        for ua in [self.CHROME_UA, self.CHROME_UA, self.FIREFOX_UA]:
            client.get(
                f"/{sample_url}",
                headers={"User-Agent": ua},
                follow_redirects=False,
            )

        stats = client.get(
            f"/api/stats/{sample_url}",
            headers=auth_headers,
        )
        browsers = {b["name"]: b["value"] for b in stats.json()["browser_stats"]}
        assert browsers.get("Chrome") == 2
        assert browsers.get("Firefox") == 1

    def test_unknown_user_agent(self, client: TestClient, auth_headers: dict,
                                 sample_url: str):
        """A click with no User-Agent records as 'Unknown' browser/OS."""
        client.get(
            f"/{sample_url}",
            headers={"User-Agent": ""},
            follow_redirects=False,
        )

        stats = client.get(
            f"/api/stats/{sample_url}",
            headers=auth_headers,
        )
        browsers = {b["name"]: b["value"] for b in stats.json()["browser_stats"]}
        assert "Unknown" in browsers
        oss = {o["name"]: o["value"] for o in stats.json()["os_stats"]}
        assert "Unknown" in oss


class TestCsvExport:
    """CSV export endpoint behaviour."""

    def test_csv_returns_data_with_correct_headers(self, client: TestClient,
                                                    auth_headers: dict,
                                                    sample_url: str):
        """The CSV response contains the expected column headers."""
        client.get(f"/{sample_url}", follow_redirects=False)

        response = client.get(
            f"/api/stats/{sample_url}/export",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "text/csv; charset=utf-8"

        reader = csv.reader(io.StringIO(response.text))
        headers = next(reader)
        assert headers == ["clicked_at", "referrer", "browser", "os", "ip_address"]

    def test_csv_contains_click_rows(self, client: TestClient, auth_headers: dict,
                                      sample_url: str):
        """The CSV includes one row per click event."""
        client.get(f"/{sample_url}", follow_redirects=False)
        client.get(f"/{sample_url}", follow_redirects=False)

        response = client.get(
            f"/api/stats/{sample_url}/export",
            headers=auth_headers,
        )
        reader = csv.reader(io.StringIO(response.text))
        next(reader)  # skip header
        rows = list(reader)
        assert len(rows) == 2

    def test_csv_content_disposition(self, client: TestClient, auth_headers: dict,
                                      sample_url: str):
        """The CSV response includes a Content-Disposition header with the
        correct filename pattern."""
        response = client.get(
            f"/api/stats/{sample_url}/export",
            headers=auth_headers,
        )
        cd = response.headers.get("content-disposition", "")
        assert f"tinylnk_{sample_url}_analytics.csv" in cd

    def test_csv_export_nonexistent_url(self, client: TestClient,
                                         auth_headers: dict):
        """Exporting stats for a non-existent short URL returns 404."""
        response = client.get(
            "/api/stats/nonexistentZZZ/export",
            headers=auth_headers,
        )
        assert response.status_code == 404

    def test_csv_with_date_range(self, client: TestClient, auth_headers: dict,
                                  sample_url: str):
        """CSV export respects start_date and end_date parameters."""
        client.get(f"/{sample_url}", follow_redirects=False)

        yesterday = datetime.now(timezone.utc) - __import__("datetime").timedelta(days=1)
        tomorrow = datetime.now(timezone.utc) + __import__("datetime").timedelta(days=1)

        # Filter to a range that should include the click
        response = client.get(
            f"/api/stats/{sample_url}/export",
            headers=auth_headers,
            params={
                "start_date": yesterday.strftime("%Y-%m-%d"),
                "end_date": tomorrow.strftime("%Y-%m-%d"),
            },
        )
        assert response.status_code == 200
        reader = csv.reader(io.StringIO(response.text))
        next(reader)
        rows = list(reader)
        assert len(rows) == 1  # The single click is within range


class TestStatsDateRange:
    """Date-range filtering on the JSON stats endpoint."""

    def test_stats_with_date_range(self, client: TestClient, auth_headers: dict,
                                    sample_url: str):
        """Filtering stats by a date range that includes the clicks works."""
        client.get(f"/{sample_url}", follow_redirects=False)

        yesterday = datetime.now(timezone.utc) - __import__("datetime").timedelta(days=1)
        tomorrow = datetime.now(timezone.utc) + __import__("datetime").timedelta(days=1)

        stats = client.get(
            f"/api/stats/{sample_url}",
            headers=auth_headers,
            params={
                "start_date": yesterday.strftime("%Y-%m-%d"),
                "end_date": tomorrow.strftime("%Y-%m-%d"),
            },
        )
        assert stats.status_code == 200
        assert stats.json()["total_clicks"] == 1

    def test_stats_date_range_excludes_outside(self, client: TestClient,
                                                 auth_headers: dict,
                                                 sample_url: str):
        """Filtering stats by a date range that excludes the click returns 0
        clicks."""
        client.get(f"/{sample_url}", follow_redirects=False)

        # Use a date range entirely in the past (before any click)
        old_start = "2020-01-01"
        old_end = "2020-01-02"

        stats = client.get(
            f"/api/stats/{sample_url}",
            headers=auth_headers,
            params={"start_date": old_start, "end_date": old_end},
        )
        assert stats.status_code == 200
        assert stats.json()["total_clicks"] == 0
        assert len(stats.json()["clicks_by_date"]) == 0

    def test_stats_nonexistent_url_404(self, client: TestClient, auth_headers: dict):
        """Stats for a non-existent short code returns 404 (not 403)."""
        response = client.get(
            "/api/stats/nonexistentZZZ",
            headers=auth_headers,
        )
        assert response.status_code == 404
