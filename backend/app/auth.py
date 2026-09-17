"""Authentication — Clerk JWT verification for management endpoints."""

import base64
import logging
import os
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
    """Derive Clerk issuer URL from CLERK_PUBLISHABLE_KEY, VITE_CLERK_PUBLISHABLE_KEY, or env."""
    explicit = (os.environ.get("CLERK_ISSUER") or "").strip().strip('"').strip("'")
    if explicit:
        explicit = explicit.removesuffix("/.well-known/jwks.json").rstrip("/")
        if explicit.startswith(("http://", "https://")):
            return explicit

    pk = (
        os.environ.get("CLERK_PUBLISHABLE_KEY")
        or os.environ.get("VITE_CLERK_PUBLISHABLE_KEY")
        or ""
    ).strip().strip('"').strip("'")
    if pk.startswith("pk_"):
        b64 = pk.split("_", 2)[-1]
        padded = b64 + "=" * (4 - len(b64) % 4)
        try:
            domain = base64.b64decode(padded).decode("utf-8").rstrip("$")
            return f"https://{domain}"
        except Exception:
            pass

    raise RuntimeError(
        "Clerk issuer unknown. Set CLERK_ISSUER, "
        "CLERK_PUBLISHABLE_KEY, or VITE_CLERK_PUBLISHABLE_KEY."
    )


def _get_jwks_client() -> PyJWKClient:
    global _CLERK_JWKS_CLIENT
    if _CLERK_JWKS_CLIENT is None:
        issuer = _derive_issuer()
        jwks_url = f"{issuer}/.well-known/jwks.json"
        _CLERK_JWKS_CLIENT = PyJWKClient(jwks_url, headers={"User-Agent": "tinylnk/1.0"})
    return _CLERK_JWKS_CLIENT


def verify_clerk_token(token: str) -> str | None:
    """Verify a Clerk session JWT and return the user_id (sub claim).

    Returns None if the token is invalid, expired, or its ``iss`` claim
    does not match the configured Clerk issuer.
    """
    try:
        # Derived inside the try: with no Clerk env vars configured this
        # raises RuntimeError, swallowed below -> graceful None.
        expected_issuer = _derive_issuer()
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
# Auth dependency — Clerk Bearer token only
# ---------------------------------------------------------------------------


def require_auth(request: Request) -> dict:
    """Verify the request carries a valid Clerk Bearer token.

    Returns ``{"sub": "<clerk_user_id>"}`` on success.
    Raises 401 otherwise — including when no auth header is sent, when the
    token is invalid/expired, and when Clerk itself is not configured.
    """
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.removeprefix("Bearer ")
        user_id = verify_clerk_token(token)
        if user_id:
            return {"sub": user_id}

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Unauthorized",
        headers={"WWW-Authenticate": "Bearer"},
    )


AuthUser = Annotated[dict, Depends(require_auth)]
