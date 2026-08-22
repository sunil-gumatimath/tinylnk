"""Authentication — Clerk JWT verification and X-Admin-Key fallback."""

import base64
import logging
import os
import secrets
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Request, status
from jwt import PyJWKClient

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Clerk JWKS — lazy-loaded
# ---------------------------------------------------------------------------
_CLERK_JWKS_CLIENT: PyJWKClient | None = None


def _derive_issuer() -> str:
    """Derive Clerk issuer URL from CLERK_PUBLISHABLE_KEY or env."""
    explicit = os.environ.get("CLERK_ISSUER")
    if explicit:
        return explicit.rstrip("/")

    pk = os.environ.get("CLERK_PUBLISHABLE_KEY", "")
    if pk.startswith("pk_"):
        b64 = pk.split("_", 2)[-1]
        padded = b64 + "=" * (4 - len(b64) % 4)
        try:
            domain = base64.b64decode(padded).decode("utf-8").rstrip("$")
            return f"https://{domain}"
        except Exception:
            pass

    raise RuntimeError(
        "Clerk issuer unknown. Set CLERK_ISSUER or CLERK_PUBLISHABLE_KEY."
    )


def _expected_issuer() -> str:
    """Return the issuer URL a Clerk JWT must carry in its ``iss`` claim.

    Same source of truth as the JWKS URL derivation.
    """
    return _derive_issuer()


def _get_jwks_client() -> PyJWKClient:
    global _CLERK_JWKS_CLIENT
    if _CLERK_JWKS_CLIENT is None:
        issuer = _derive_issuer()
        _CLERK_JWKS_CLIENT = PyJWKClient(f"{issuer}/.well-known/jwks.json")
    return _CLERK_JWKS_CLIENT


def verify_clerk_token(token: str) -> str | None:
    """Verify a Clerk session JWT and return the user_id (sub claim).

    Returns None if the token is invalid, expired, or its ``iss`` claim
    does not match the configured Clerk issuer.
    """
    try:
        # Derived inside the try: with no Clerk env vars configured this
        # raises RuntimeError, swallowed below -> graceful None.
        expected_issuer = _expected_issuer()
        jwks_client = _get_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={"verify_exp": True},
            issuer=expected_issuer,
        )
        return payload.get("sub")
    except Exception as e:
        logger.warning("Clerk token verification failed: %s", e)
        return None


# ---------------------------------------------------------------------------
# Auth dependency — Clerk Bearer token, with X-Admin-Key fallback
# ---------------------------------------------------------------------------

_ADMIN_KEY = os.environ.get("TINYLNK_ADMIN_KEY", "")


def require_auth(request: Request) -> dict:
    """Verify the request is authenticated.

    1. First tries a Clerk Bearer token on the ``Authorization`` header.
    2. Then falls back to the ``X-Admin-Key`` header checked against
       the configured ``TINYLNK_ADMIN_KEY`` (all environments).
    3. If neither succeeds, returns 401.

    Returns ``{"sub": "<clerk_user_id>"}`` on success.
    Raises 401 otherwise.
    """
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.removeprefix("Bearer ")
        user_id = verify_clerk_token(token)
        if user_id:
            return {"sub": user_id}

    # Fallback — accept X-Admin-Key (all environments)
    admin_key = request.headers.get("X-Admin-Key", "")
    if (
        admin_key
        and _ADMIN_KEY
        and secrets.compare_digest(admin_key, _ADMIN_KEY)
    ):
        return {"sub": "admin"}

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Unauthorized",
        headers={"WWW-Authenticate": "Bearer"},
    )


AuthUser = Annotated[dict, Depends(require_auth)]
