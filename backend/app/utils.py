"""Utility functions for URL shortening."""

import string

# Base62 character set: 0-9, a-z, A-Z
CHARSET = string.digits + string.ascii_lowercase + string.ascii_uppercase
BASE = len(CHARSET)  # 62


def encode_base62(num: int) -> str:
    """Encode an integer to a Base62 string."""
    if num == 0:
        return CHARSET[0]

    result = []
    while num > 0:
        num, remainder = divmod(num, BASE)
        result.append(CHARSET[remainder])

    return "".join(reversed(result))


def is_valid_alias(alias: str) -> bool:
    """Check if a custom alias is valid (alphanumeric + hyphens, 3-50 chars)."""
    if not alias or len(alias) < 3 or len(alias) > 50:
        return False
    allowed = set(string.ascii_letters + string.digits + "-_")
    return all(c in allowed for c in alias)

# TODO: Implement rate limiting for API endpoints

# TODO: Add custom domain support for branded short URLs

# TODO: Add email notification system for link clicks

# TODO: Add request payload validation

# TODO: Add URL sanitization to strip tracking parameters
