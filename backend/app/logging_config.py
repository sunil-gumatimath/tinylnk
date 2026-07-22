"""Structured logging configuration for tinylnk.

Provides JSON-formatted logs in production, human-readable colored logs in
development, a RequestLogMiddleware that logs every request with timing and
metadata, and optional Sentry integration behind a SENTRY_DSN env var.
"""

import json
import logging
import os
import sys
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


# ─── Helpers ────────────────────────────────────────────────────────────────

_RESERVED_PATH_SEGMENTS = {
    "api", "docs", "redoc", "openapi.json",
    "assets", "favicon.ico", "favicon.svg", "icons.svg",
}


def _extract_short_code(path: str) -> str | None:
    """Extract a short_code from the URL path, if the route carries one.

    Matches patterns used in tinylnk's router:
      /{short_code}
      /api/stats/{short_code}[/export]
      /api/qr/{short_code}
      /api/urls/{short_code}
    """
    parts = path.strip("/").split("/")

    # /{short_code}  — single-segment path that isn't a reserved keyword
    if len(parts) == 1 and parts[0] not in _RESERVED_PATH_SEGMENTS:
        return parts[0]

    # /api/{resource}/{short_code}[/...]
    if len(parts) >= 3 and parts[0] == "api" and parts[1] in ("stats", "qr", "urls"):
        return parts[2]

    return None


# ─── Formatters ─────────────────────────────────────────────────────────────


class JSONFormatter(logging.Formatter):
    """Output structured log records as flat JSON lines.

    Every line is a parseable JSON object with at minimum ``timestamp``,
    ``level``, and ``message`` keys.  Extra log-record attributes such as
    ``request_id``, ``method``, ``path``, ``status_code``, ``duration_ms``,
    ``client_ip``, and ``short_code`` are included when present.
    """

    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "timestamp": self.formatTime(record, self.default_time_format),
            "level": record.levelname,
            "message": record.getMessage(),
        }
        # Inline extra context fields when they exist on the record
        for key in ("request_id", "method", "path", "status_code",
                    "duration_ms", "client_ip", "short_code"):
            value = getattr(record, key, None)
            if value is not None:
                entry[key] = value
        return json.dumps(entry, default=str)


class ColoredFormatter(logging.Formatter):
    """Human-readable log formatter with ANSI level colours.

    Suitable for local development.  Production deployments should use
    ``JSONFormatter`` instead.
    """

    _LEVEL_COLORS = {
        "DEBUG": "\033[36m",       # cyan
        "INFO": "\033[32m",        # green
        "WARNING": "\033[33m",     # yellow
        "ERROR": "\033[31m",       # red
        "CRITICAL": "\033[1;31m",  # bold red
    }
    _RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        color = self._LEVEL_COLORS.get(record.levelname, self._RESET)
        padded_level = f"{color}{record.levelname:<8}{self._RESET}"

        # Extra context fields to show inline
        ctx_parts = []
        for key in ("request_id", "method", "path", "status_code",
                    "duration_ms", "client_ip", "short_code"):
            value = getattr(record, key, None)
            if value is not None:
                ctx_parts.append(f"{key}={value}")
        ctx = f"  [{', '.join(ctx_parts)}]" if ctx_parts else ""

        ts = self.formatTime(record, "%Y-%m-%d %H:%M:%S")
        return f"{ts}  {padded_level}  {record.getMessage()}{ctx}"


# ─── Middleware ──────────────────────────────────────────────────────────────

_log = logging.getLogger(__name__)


class RequestLogMiddleware(BaseHTTPMiddleware):
    """Log every HTTP request with timing, status, and metadata.

    * Generates a unique ``request_id`` (UUID) for each request.
    * Attaches the ``request_id`` to ``request.state.request_id`` so route
      handlers and templates can reference it.
    * Logs at INFO for 2xx/3xx, WARNING for 4xx (including 429 rate-limit
      hits), and ERROR for 5xx.
    * Adds an ``X-Request-ID`` response header for traceability.
    """

    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())
        request.state.request_id = request_id

        client_ip = request.client.host if request.client else "unknown"
        method = request.method
        path = request.url.path
        short_code = _extract_short_code(path)

        start = time.monotonic()

        try:
            response = await call_next(request)
        except Exception:
            duration_ms = (time.monotonic() - start) * 1000
            _log.error(
                "Unhandled exception processing request",
                extra={
                    "request_id": request_id,
                    "method": method,
                    "path": path,
                    "status_code": 500,
                    "duration_ms": f"{duration_ms:.1f}",
                    "client_ip": client_ip,
                    "short_code": short_code,
                },
            )
            raise

        duration_ms = (time.monotonic() - start) * 1000
        status_code = response.status_code

        extra = {
            "request_id": request_id,
            "method": method,
            "path": path,
            "status_code": status_code,
            "duration_ms": f"{duration_ms:.1f}",
            "client_ip": client_ip,
            "short_code": short_code,
        }

        if status_code >= 500:
            _log.error("Request failed", extra=extra)
        elif status_code >= 400:
            message = "Rate limit exceeded" if status_code == 429 else "Request warning"
            _log.warning(message, extra=extra)
        else:
            _log.info("Request completed", extra=extra)

        response.headers["X-Request-ID"] = request_id
        return response


# ─── Sentry (optional) ──────────────────────────────────────────────────────


def _init_sentry() -> None:
    """Initialise Sentry SDK if ``SENTRY_DSN`` is set and the package is installed."""
    sentry_dsn = os.getenv("SENTRY_DSN")
    if not sentry_dsn:
        return

    try:
        import sentry_sdk  # type: ignore[import-unused]
    except ImportError:
        _log.warning(
            "SENTRY_DSN is set but sentry-sdk is not installed. "
            "Install it with: pip install sentry-sdk"
        )
        return
    except Exception as exc:
        _log.warning("Failed to import sentry_sdk: %s", exc)
        return

    try:
        sentry_sdk.init(
            dsn=sentry_dsn,
            traces_sample_rate=0.1,
            send_default_pii=False,
        )
        _log.info("Sentry SDK initialised (traces_sample_rate=0.1)")
    except Exception as exc:
        _log.warning("Failed to initialise Sentry SDK: %s", exc)


# ─── Bootstrap ──────────────────────────────────────────────────────────────


def setup_logging() -> None:
    """Configure the root logger with structured output.

    Call this **once** at application startup, *before* creating the FastAPI
    ``app`` instance.

    Environment variables
    ---------------------
    ``LOG_LEVEL``
        One of ``DEBUG``, ``INFO`` (default), ``WARNING``, ``ERROR``,
        ``CRITICAL``.
    ``LOG_FORMAT``
        ``json`` — flat JSON lines (production).
        ``text`` or unset — human-readable coloured output (development).
    ``SENTRY_DSN``
        Optional Sentry DSN.  When set, tries to initialise the ``sentry_sdk``.
    """
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    log_format = os.getenv("LOG_FORMAT", "text").lower()

    root = logging.getLogger()
    root.setLevel(getattr(logging, log_level, logging.INFO))

    # Wipe any pre-existing handlers (e.g. from uvicorn's default config)
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)

    if log_format == "json":
        handler.setFormatter(JSONFormatter())
    else:
        handler.setFormatter(ColoredFormatter())

    root.addHandler(handler)

    # Suppress noisy third-party loggers in production
    if log_format == "json":
        logging.getLogger("uvicorn.access").handlers.clear()
        logging.getLogger("uvicorn.access").propagate = False

    _init_sentry()
