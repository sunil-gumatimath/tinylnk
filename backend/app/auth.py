"""Authentication — Clerk JWT verification (and test-mode admin key fallback)."""

import base64
import os
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Request, status
from jwt import PyJWKClient

# ---------------------------------------------------------------------------
# Clerk JWKS — lazy-loaded
# ---------------------------------------------------------------------------
_CLERK_JWKS_CLIENT: PyJWKClient | None = None


def _derive_issuer() -> str:
    """Derive Clerk issuer URL from CLERK_PUBLISHABLE_KEY or env."""
    explicit = os.environ.get("CLERK_ISSUER")
    if explicit:
        return explicit

    pk = os.environ.get("CLERK_PUBLISHABLE_KEY", "")
    if pk.startswith("pk_"):
        b64 = pk.split("_", 2)[-1]
        padded = b64 + "=" * (4 - len(b64) % 4)
        try:
            domain = base64.b64decode(padded).decode("utf-8")
            return f"https://{domain}"
        except Exception:
            pass

    raise RuntimeError(
        "Clerk issuer unknown. Set CLERK_ISSUER or CLERK_PUBLISHABLE_KEY."
    )


def _get_jwks_client() -> PyJWKClient:
    global _CLERK_JWKS_CLIENT
    if _CLERK_JWKS_CLIENT is None:
        issuer = _derive_issuer()
        _CLERK_JWKS_CLIENT = PyJWKClient(f"{issuer}/.well-known/jwks.json")
    return _CLERK_JWKS_CLIENT


def verify_clerk_token(token: str) -> str | None:
    """Verify a Clerk session JWT and return the user_id (sub claim).

    Returns None if the token is invalid or expired.
    """
    try:
        jwks_client = _get_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={"verify_exp": True},
        )
        return payload.get("sub")
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Auth dependency — Clerk-only; test-mode admin key fallback for CI
# ---------------------------------------------------------------------------

_TEST_ADMIN_KEY = os.environ.get("TINYLNK_ADMIN_KEY", "")
_IS_TEST = os.environ.get("TINYLNK_ENV", "") == "test"


def require_auth(request: Request) -> dict:
    """Verify the request is authenticated via a Clerk Bearer token.

    In test mode (``TINYLNK_ENV=test``) also accepts the configured
    ``TINYLNK_ADMIN_KEY`` for backward compatibility.

    Returns ``{"sub": "<clerk_user_id>"}`` on success.
    Raises 401 otherwise.
    """
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.removeprefix("Bearer ")
        user_id = verify_clerk_token(token)
        if user_id:
            return {"sub": user_id}

    # Test-mode fallback — accept X-Admin-Key
    if _IS_TEST:
        admin_key = request.headers.get("X-Admin-Key", "")
        if admin_key and admin_key == _TEST_ADMIN_KEY:
            return {"sub": "admin"}

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Unauthorized",
        headers={"WWW-Authenticate": "Bearer"},
    )


AuthUser = Annotated[dict, Depends(require_auth)]
