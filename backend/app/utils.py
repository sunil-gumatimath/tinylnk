"""Utility functions for URL shortening."""

import ipaddress
import string
from urllib.parse import urlparse

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


def anonymize_ip(ip: str | None) -> str | None:
    """Anonymize an IP by zeroing the last octet (v4) or last 80 bits (v6)."""
    if not ip:
        return None
    try:
        addr = ipaddress.ip_address(ip)
        if isinstance(addr, ipaddress.IPv4Address):
            parts = ip.split(".")
            parts[-1] = "0"
            return ".".join(parts)
        else:
            network = ipaddress.IPv6Network(f"{ip}/48", strict=False)
            return str(network.network_address)
    except ValueError:
        return None


# Private / reserved IP ranges that must not be redirect targets
_BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),   # link-local / cloud metadata
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),          # IPv6 unique-local
    ipaddress.ip_network("fe80::/10"),         # IPv6 link-local
]


def is_safe_url(url: str) -> bool:
    """Return True only if *url* uses http(s) and does not target a private IP."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False
        hostname = parsed.hostname
        if not hostname:
            return False
        if "." not in hostname and hostname != "localhost":
            return False
        # If hostname is a raw IP, check against blocked ranges
        try:
            addr = ipaddress.ip_address(hostname)
            return not any(addr in net for net in _BLOCKED_NETWORKS)
        except ValueError:
            pass  # not a raw IP — it's a domain name
        # Block well-known internal hostnames
        blocked_hosts = {"localhost", "metadata.google.internal"}
        if hostname.lower() in blocked_hosts:
            return False
        return True
    except Exception:
        return False
