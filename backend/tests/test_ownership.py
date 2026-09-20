"""Tests for per-user ownership, the admin allowlist, the opt-in SSRF DNS
check, /api/recent pagination, and the redirect-interstitial click flow."""

import socket
import time

import jwt
import pytest
from conftest import CLERK_TEST_ISSUER, _rsa_keypair, _StubSigningKey

from app import auth
from app import main as main_mod
from app.utils import is_safe_url


def _token_for(private_key, sub):
    now = int(time.time())
    return jwt.encode(
        {"sub": sub, "iat": now, "exp": now + 300, "iss": CLERK_TEST_ISSUER},
        private_key,
        algorithm="RS256",
    )


@pytest.fixture
def two_users(monkeypatch):
    """Two independently keyed Clerk users against one offline JWKS stub."""
    monkeypatch.setenv("CLERK_ISSUER", CLERK_TEST_ISSUER)
    priv_a, pub_a = _rsa_keypair()
    priv_b, pub_b = _rsa_keypair()
    keys = {"user_A": pub_a, "user_B": pub_b}

    class _MultiJWK:
        def get_signing_key_from_jwt(self, token):
            sub = jwt.decode(token, options={"verify_signature": False}).get("sub")
            return _StubSigningKey(keys[sub])

    monkeypatch.setattr(auth, "_CLERK_JWKS_CLIENT", _MultiJWK())
    return {
        "user_A": {"Authorization": f"Bearer {_token_for(priv_a, 'user_A')}"},
        "user_B": {"Authorization": f"Bearer {_token_for(priv_b, 'user_B')}"},
    }


class TestOwnershipIsolation:
    """One signed-in user must never see or manage another user's links."""

    def _create(self, client, headers, url="https://example.com/mine"):
        r = client.post("/api/shorten", json={"url": url}, headers=headers)
        assert r.status_code == 200, r.text
        return r.json()["short_code"]

    def test_create_attaches_owner_and_recent_is_scoped(self, client, two_users):
        code_a = self._create(client, two_users["user_A"])
        self._create(client, two_users["user_B"], "https://example.com/b-link")

        recent_a = client.get("/api/recent", headers=two_users["user_A"]).json()
        assert [item["short_code"] for item in recent_a] == [code_a]

    def test_stats_of_other_users_link_404(self, client, two_users):
        code_a = self._create(client, two_users["user_A"])
        r = client.get(f"/api/stats/{code_a}", headers=two_users["user_B"])
        assert r.status_code == 404

    def test_update_of_other_users_link_404(self, client, two_users):
        code_a = self._create(client, two_users["user_A"])
        r = client.put(
            f"/api/urls/{code_a}",
            json={"tag": "hijack"},
            headers=two_users["user_B"],
        )
        assert r.status_code == 404

    def test_delete_of_other_users_link_404(self, client, two_users):
        code_a = self._create(client, two_users["user_A"])
        r = client.delete(f"/api/urls/{code_a}", headers=two_users["user_B"])
        assert r.status_code == 404
        # And the link still works.
        assert client.get(f"/{code_a}", follow_redirects=False).status_code == 302

    def test_export_of_other_users_link_404(self, client, two_users):
        code_a = self._create(client, two_users["user_A"])
        r = client.get(f"/api/stats/{code_a}/export", headers=two_users["user_B"])
        assert r.status_code == 404

    def test_tags_are_scoped(self, client, two_users):
        self._create(client, two_users["user_A"])  # no tag
        client.post(
            "/api/shorten",
            json={"url": "https://example.com/tagged", "tag": "a-only"},
            headers=two_users["user_A"],
        )
        assert "a-only" in client.get("/api/tags", headers=two_users["user_A"]).json()
        assert "a-only" not in client.get("/api/tags", headers=two_users["user_B"]).json()

    def test_anonymous_links_not_visible_to_signed_in_users(self, client, two_users):
        # Created with NO token -> ownerless; neither user may see it.
        r = client.post("/api/shorten", json={"url": "https://example.com/anon"})
        code = r.json()["short_code"]
        for headers in two_users.values():
            assert client.get(f"/api/stats/{code}", headers=headers).status_code == 404
            assert code not in [
                i["short_code"] for i in client.get("/api/recent", headers=headers).json()
            ]
class TestAdminAllowlist:
    """TINYLNK_ADMIN_USER_IDS members manage ownerless legacy links."""

    def test_admin_manages_ownerless_link(self, client, two_users, monkeypatch):
        anon = client.post("/api/shorten", json={"url": "https://example.com/legacy"})
        code = anon.json()["short_code"]

        monkeypatch.setattr(main_mod, "ADMIN_USER_IDS", {"user_A"})
        assert client.get(f"/api/stats/{code}", headers=two_users["user_A"]).status_code == 200
        # Non-admin still locked out.
        assert client.get(f"/api/stats/{code}", headers=two_users["user_B"]).status_code == 404


class TestDnsCheck:
    """Opt-in hostname resolution in is_safe_url (TINYLNK_DNS_CHECK)."""

    def test_domain_resolving_to_private_ip_blocked(self, monkeypatch):
        monkeypatch.setattr("app.utils.DNS_CHECK", True)
        monkeypatch.setattr(
            socket,
            "getaddrinfo",
            lambda host, port: [
                (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("169.254.169.254", 0))
            ],
        )
        assert is_safe_url("http://evil.example.com/") is False

    def test_domain_resolving_publicly_allowed(self, monkeypatch):
        monkeypatch.setattr("app.utils.DNS_CHECK", True)
        monkeypatch.setattr(
            socket,
            "getaddrinfo",
            lambda host, port: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))],
        )
        assert is_safe_url("https://example.com/") is True

    def test_unresolvable_domain_rejected(self, monkeypatch):
        monkeypatch.setattr("app.utils.DNS_CHECK", True)

        def _boom(host, port):
            raise socket.gaierror("no such host")

        monkeypatch.setattr(socket, "getaddrinfo", _boom)
        assert is_safe_url("https://does-not-resolve.invalid/") is False

    def test_dns_check_off_by_default(self, monkeypatch):
        # With the flag off a syntactically fine domain passes without any DNS.
        monkeypatch.setattr("app.utils.DNS_CHECK", False)
        assert is_safe_url("https://does-not-resolve.invalid/") is True


class TestRecentPagination:
    """GET /api/recent supports limit/offset paging."""

    def test_limit_and_offset(self, client, two_users):
        for i in range(5):
            client.post(
                "/api/shorten",
                json={"url": f"https://example.com/page-{i}"},
                headers=two_users["user_A"],
            )
        page1 = client.get("/api/recent?limit=2&offset=0", headers=two_users["user_A"]).json()
        page2 = client.get("/api/recent?limit=2&offset=2", headers=two_users["user_A"]).json()
        page3 = client.get("/api/recent?limit=2&offset=4", headers=two_users["user_A"]).json()
        all_codes = [i["short_code"] for i in page1 + page2 + page3]
        assert len(all_codes) == 5
        assert len(set(all_codes)) == 5  # no overlaps across pages

    def test_limit_capped_and_validated(self, client, two_users):
        assert client.get("/api/recent?limit=101", headers=two_users["user_A"]).status_code == 422
        assert client.get("/api/recent?limit=0", headers=two_users["user_A"]).status_code == 422
        assert client.get("/api/recent?offset=-1", headers=two_users["user_A"]).status_code == 422


class TestInterstitialClickFlow:
    """With REDIRECT_WARNING on, viewing the warning page must NOT count a
    click — only following through to /__continue does."""

    @pytest.fixture(autouse=True)
    def _enable_warning(self, monkeypatch):
        monkeypatch.setattr(main_mod, "REDIRECT_WARNING", True)

    def test_warning_page_does_not_count_click(self, client, two_users):
        r = client.post(
            "/api/shorten",
            json={"url": "https://example.com/warn"},
            headers=two_users["user_A"],
        )
        code = r.json()["short_code"]

        page = client.get(f"/{code}", follow_redirects=False)
        assert page.status_code == 200
        assert "__continue" in page.text

        stats = client.get(f"/api/stats/{code}", headers=two_users["user_A"]).json()
        assert stats["total_clicks"] == 0  # merely viewing the warning is not a click

        cont = client.get(f"/__continue/{code}", follow_redirects=False)
        assert cont.status_code == 302
        assert cont.headers["location"] == "https://example.com/warn"

        stats = client.get(f"/api/stats/{code}", headers=two_users["user_A"]).json()
        assert stats["total_clicks"] == 1  # the follow-through is the click
