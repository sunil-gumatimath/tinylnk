"""E2E check: boots the real backend and exercises the updated API contract."""

import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

# Repo root and backend dir, derived from this file's location so the script
# works no matter which directory it is invoked from.
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_backend = os.path.join(_ROOT, "backend")
if _backend not in sys.path:
    sys.path.insert(0, _backend)

BASE = "http://127.0.0.1:8010"
JWKS_PORT = 8011
JWKS_URL = f"http://127.0.0.1:{JWKS_PORT}"
DB = os.path.join(tempfile.gettempdir(), "tinylnk-e2e.db")

# Generate RSA key pair for Clerk JWT signing
_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_public_key = _private_key.public_key()

def _private_pem():
    return _private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()

def _public_pem():
    # NB: public_bytes() takes no encryption_algorithm (that is a private-key
    # argument) — passing one raises TypeError.
    return _public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()

def _build_jwks():
    """Build a JWKS JSON from the generated public key.

    ``n``/``e`` must be the base64url-encoded big-endian modulus/exponent of
    the RSA key (RFC 7518) — NOT the DER blob. Encoding the DER yields a JWK
    that PyJWKClient parses happily but whose signature never verifies, so
    every authenticated call below would 401.
    """
    from base64 import urlsafe_b64encode
    numbers = _public_key.public_numbers()

    def _b64(value: int) -> str:
        raw = value.to_bytes((value.bit_length() + 7) // 8, "big")
        return urlsafe_b64encode(raw).rstrip(b"=").decode()

    n = _b64(numbers.n)
    e = _b64(numbers.e)
    import hashlib
    kid = hashlib.sha256(f"e2e-{n}-{e}".encode()).hexdigest()[:16]
    return {
        "keys": [{
            "kty": "RSA",
            "kid": kid,
            "use": "sig",
            "n": n,
            "e": e,
            "alg": "RS256",
        }]
    }

_JWKS = _build_jwks()
_CLERK_ISSUER = JWKS_URL


class _JWKSHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/.well-known/jwks.json":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(_JWKS).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass


def _jwt_token():
    """Create a valid RS256 Clerk JWT signed with the generated key."""
    from time import time
    now = int(time())
    claims = {
        "sub": "e2e_test_user",
        "iat": now,
        "exp": now + 300,
        "iss": _CLERK_ISSUER,
    }
    return jwt.encode(
        claims, _private_pem(), algorithm="RS256",
        headers={"kid": _JWKS["keys"][0]["kid"]},
    )


AUTH_HEADER = {"Authorization": f"Bearer {_jwt_token()}"}

# Start JWKS server
_jwks_server = HTTPServer(("127.0.0.1", JWKS_PORT), _JWKSHandler)
_jwks_thread = Thread(target=_jwks_server.serve_forever, daemon=True)
_jwks_thread.start()

for path in (DB, DB + "-wal", DB + "-shm"):
    if os.path.exists(path):
        os.remove(path)

env = dict(
    os.environ,
    SQLITE_DB_PATH=DB,
    CLERK_ISSUER=_CLERK_ISSUER,
    CLERK_PUBLISHABLE_KEY="pk_test_e2e",
    CLERK_SECRET_KEY="sk_test_e2e",
    TINYLNK_CORS_ORIGINS="http://localhost:8010",
)

proc = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "app.main:app", "--port", "8010",
     "--app-dir", _backend],
    env=env, cwd=_ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)


def call(method, path, headers=None, body=None):
    req = urllib.request.Request(BASE + path, method=method)
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data=data) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as exc:  # non-2xx (incl. redirects)
        return exc.code, exc.read()


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Stop urllib from chasing the redirect — we only need the 302 itself."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def check(label, condition, detail=""):
    status = "OK " if condition else "FAIL"
    print(f"[{status}] {label} {detail}")
    if not condition:
        raise SystemExit(f"e2e failed at: {label} {detail}")


try:
    health = None
    for _ in range(50):
        try:
            with urllib.request.urlopen(BASE + "/api/health") as resp:
                health = json.loads(resp.read())
            break
        except Exception:
            time.sleep(0.3)
    check("health", health == {"status": "ok", "database": "connected"}, str(health))

    status, raw = call("POST", "/api/shorten", body={
        "url": "https://example.com/e2e",
        "custom_alias": "e2e-check",
        "max_clicks": 5,
    })
    created = json.loads(raw)
    check("create", status == 200, f"status={status}")
    check("create returns custom_alias", created["custom_alias"] == "e2e-check",
          f"custom_alias={created['custom_alias']}")
    check("create returns max_clicks", created["max_clicks"] == 5,
          f"max_clicks={created['max_clicks']}")
    check("created_at carries UTC offset", created["created_at"].endswith("Z"),
          f"created_at={created['created_at']}")

    status, raw = call("GET", "/api/recent", headers=AUTH_HEADER)
    recent = json.loads(raw)
    check("recent returns custom_alias", recent[0]["custom_alias"] == "e2e-check",
          f"custom_alias={recent[0]['custom_alias']}")

    status, raw = call("PUT", "/api/urls/e2e-check", headers=AUTH_HEADER,
                       body={"max_clicks": 0, "custom_alias": ""})
    check("clear sentinels accepted", status == 200, f"status={status}")
    updated = json.loads(raw)
    check("alias cleared", updated["custom_alias"] is None,
          f"custom_alias={updated['custom_alias']}")
    check("click limit cleared", updated["max_clicks"] is None,
          f"max_clicks={updated['max_clicks']}")

    code = updated["short_code"]
    check("short_code fell back to generated code",
          code != "e2e-check" and len(code) > 0, f"code={code}")

    chrome = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    no_redirect = urllib.request.build_opener(_NoRedirect)
    req = urllib.request.Request(f"{BASE}/{code}")
    req.add_header("User-Agent", chrome)
    try:
        with no_redirect.open(req) as resp:
            redirect_status = resp.status
    except urllib.error.HTTPError as exc:
        redirect_status = exc.code
    check("redirect works", redirect_status in (301, 302, 307),
          f"status={redirect_status}")

    status, raw = call("GET", f"/api/stats/{code}", headers=AUTH_HEADER)
    stats = json.loads(raw)
    click = stats["recent_clicks"][0]
    check("stats exposes parsed browser", click["browser"] == "Chrome",
          f"browser={click['browser']}")
    check("stats exposes parsed os", click["os"] == "Windows",
          f"os={click['os']}")
    check("clicked_at carries UTC offset", click["clicked_at"].endswith("Z"),
          f"clicked_at={click['clicked_at']}")
    check("stats total_clicks", stats["total_clicks"] == 1,
          f"total_clicks={stats['total_clicks']}")

    status, raw = call(
        "GET",
        "/api/stats/%s/export?start_date=2026-01-01T00:00:00Z"
        "&end_date=2027-01-01T00:00:00Z" % code,
        headers=AUTH_HEADER,
    )
    header_line = raw.decode().splitlines()[0]
    check("csv export honours date range", status == 200 and "clicked_at" in header_line,
          f"status={status} header={header_line}")

    print("\nE2E OK — full contract verified over HTTP")
finally:
    _jwks_server.shutdown()
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
    time.sleep(0.5)  # let Windows release the SQLite file lock
    for path in (DB, DB + "-wal", DB + "-shm"):
        try:
            if os.path.exists(path):
                os.remove(path)
        except PermissionError:
            pass
