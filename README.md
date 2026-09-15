# tinylnk

> A self-hosted, full-stack URL shortener with built-in analytics, link management, and a polished dashboard.

![Open Source](https://img.shields.io/badge/Open%20Source-Free%20to%20use-brightgreen.svg)
![Python](https://img.shields.io/badge/python-3.10+-green.svg)
![React](https://img.shields.io/badge/react-19-blue.svg)
![Docker](https://img.shields.io/badge/docker-ready-2496ED.svg)

## Overview

tinylnk converts long URLs into short, shareable links with detailed click analytics. Built with FastAPI and React, it runs as a single self-contained service and stores its data in SQLite; no external service is required.

## Features

### Core

- **URL Shortening** — Generate short links from long URLs instantly
- **Custom Aliases** — Define memorable short codes (for example, `https://your-domain/spring-launch`)
- **Link Expiration** — Set time-based expiration so links auto-disable after a specified period
- **Click Limits** — Cap the maximum number of clicks per link
- **Tagging** — Organize links with custom tags for easy categorization
- **Dark/Light Theme** — Toggle between themes with persistent preference
- **Optional Clerk Sign-in** — With a Clerk key configured, the dashboard is gated behind sign-in: anyone can still shorten a link, but editing, deleting, and analytics require an authenticated session

### Analytics

- **Click Analytics** — Track total clicks, daily trends, browser/OS breakdowns, referrer data, and individual click events
- **Date Range Filtering** — Filter analytics by custom date ranges to analyze specific time periods
- **CSV Export** — Download complete click history as a CSV file for offline analysis or reporting

### Link Management

- **Link Editing** — Update a link's destination URL, alias, tag, expiry, or click limit at any time
- **Search & Filtering** — Search links by URL, alias, or short code; filter by tag
- **Recent Links Dashboard** — View and manage recently created links with click statistics

### QR Codes

- **QR Code Generation** — Generate and download QR codes for any short link
- **Custom QR Styling** — Choose from preset foreground and background colors to brand your QR codes

### UX Polish

- **Framer Motion Animations** — Smooth staggered entrance animations, animated card transitions with layout awareness
- **Keyboard Shortcuts** — `Ctrl+K` / `⌘+K` to focus URL input, `Escape` to close modals
- **Web Share API** — Native share sheet on mobile devices, clipboard fallback on desktop
- **Reduced Motion Support** — Respects `prefers-reduced-motion` for accessibility

## Tech Stack

| Layer | Technology |
| --- | --- |
| **Backend** | FastAPI, SQLAlchemy, Uvicorn, SlowAPI |
| **Database** | SQLite |
| **Frontend** | React 19, TypeScript, Vite |
| **UI** | Ant Design 6, Recharts, Lucide Icons, Framer Motion |
| **Deployment** | Docker, Docker Compose |

## Quick Start

### Docker (Recommended)

```bash
git clone https://github.com/sunil-gumatimath/tinylnk.git
cd tinylnk
docker-compose up -d
```

Visit `http://localhost:8000` in your browser.

To enable sign-in, copy `.env.example` to `.env` and set
`VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_ISSUER`, then rebuild with
`docker-compose up -d --build` — the publishable key is baked into the frontend
bundle at build time. See [Configuration](#configuration).

### Manual Setup

**Backend:**

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Frontend:**

```bash
cd frontend
bun install
bun run dev
```

The dev server proxies API requests to the backend automatically.

## API Reference

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/shorten` | — | Create a shortened URL |
| `PUT` | `/api/urls/{short_code}` | `Clerk JWT` | Update a link's properties |
| `DELETE` | `/api/urls/{short_code}` | `Clerk JWT` | Delete a short URL and its analytics |
| `GET` | `/api/stats/{short_code}` | `Clerk JWT` | Get analytics (supports `?start_date=` & `?end_date=`) |
| `GET` | `/api/stats/{short_code}/export` | `Clerk JWT` | Export analytics as CSV |
| `GET` | `/api/recent` | `Clerk JWT` | List recent links (supports `?search=` & `?tag=`) |
| `GET` | `/api/tags` | `Clerk JWT` | List all unique tags |
| `GET` | `/api/qr/{short_code}` | — | Generate QR code (supports `?fg=` & `?bg=` colors) |
| `GET` | `/api/health` | — | Health check |
| `GET` | `/{short_code}` | — | Redirect to the original URL |

#### Authentication

Management endpoints accept a **Clerk JWT**: send `Authorization: Bearer <clerk-jwt>`. Verified against the configured `CLERK_ISSUER` (the JWT `iss` claim must match) and validated for expiry and signature. This is the recommended path for browser, CI, and programmatic clients.

### Create Short URL

```bash
curl -X POST http://localhost:8000/api/shorten \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/very/long/url",
    "custom_alias": "my-link",
    "expires_in_hours": 24,
    "max_clicks": 100,
    "tag": "campaign"
  }'
```

### Update a Link

```bash
curl -X PUT http://localhost:8000/api/urls/my-link \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <clerk-jwt>" \
  -d '{
    "original_url": "https://example.com/new-destination",
    "tag": "updated-campaign"
  }'
```

Every field is optional and omitted fields are left unchanged. To **remove**
something, send an explicit clear sentinel:

| Field | Clear sentinel | Example |
| --- | --- | --- |
| `custom_alias` | `""` (empty string) | `"custom_alias": ""` — fall back to the short code |
| `expires_in_hours` | `0` | `"expires_in_hours": 0` — never expires |
| `max_clicks` | `0` | `"max_clicks": 0` — unlimited clicks |

Responses always include `custom_alias` separately from `short_code`, and all
timestamps are serialized with an explicit UTC offset (e.g.
`2026-01-01T12:00:00Z`), so browsers render them in the viewer's local time
instead of misreading them as local.

### Get Link Statistics

```bash
curl http://localhost:8000/api/stats/my-link \
  -H "Authorization: Bearer <clerk-jwt>"

# With date range
curl "http://localhost:8000/api/stats/my-link?start_date=2026-01-01&end_date=2026-03-31" \
  -H "Authorization: Bearer <clerk-jwt>"
```

### Export Analytics as CSV

```bash
curl http://localhost:8000/api/stats/my-link/export \
  -H "Authorization: Bearer <clerk-jwt>" \
  -o analytics.csv
```

### Search Links

```bash
# Search by URL, alias, or short code
curl "http://localhost:8000/api/recent?search=github" \
  -H "Authorization: Bearer <clerk-jwt>"

# Filter by tag
curl "http://localhost:8000/api/recent?tag=marketing" \
  -H "Authorization: Bearer <clerk-jwt>"
```

### Custom QR Code

```bash
# Navy foreground on white background
curl http://localhost:8000/api/qr/my-link?fg=1d4ed8&bg=white -o qr.png

# Purple on cream
curl http://localhost:8000/api/qr/my-link?fg=7c3aed&bg=fffaf2 -o qr.png
```

## Configuration

Copy `.env.example` to `.env` and customise:

| Environment Variable | Default | Description |
| --- | --- | --- |
| `SQLITE_DB_PATH` | `urlshortener.db` | Path to the SQLite database file |
| `TINYLNK_ADMIN_KEY` | *(empty)* | **Deprecated.** This setting has no effect — authentication is handled exclusively by Clerk JWT. Remove it from your configuration. |
| `TINYLNK_CORS_ORIGINS` | `http://localhost:5173,http://localhost:8000` | Comma-separated list of allowed CORS origins |
| `TINYLNK_REDIRECT_WARNING` | `false` | Show an interstitial warning page before redirecting to external URLs |
| `TINYLNK_ENABLE_DOCS` | `false` | Expose the OpenAPI schema and Swagger UI at `/openapi.json` and `/docs` |
| `LOG_LEVEL` | `INFO` | Logging threshold: `DEBUG`, `INFO`, `WARNING`, `ERROR`, or `CRITICAL` |
| `LOG_FORMAT` | `text` | Set to `json` for structured logs |
| `SENTRY_DSN` | *(empty)* | Optional Sentry error-tracking DSN |
| `VITE_CLERK_PUBLISHABLE_KEY` | *(empty)* | Clerk publishable key for the browser. Vite **inlines** it at build time, so the frontend must be rebuilt after changing it. When unset, the sign-in UI is hidden (shortening still works). |
| `CLERK_ISSUER` | *(empty)* | Expected `iss` claim of incoming Clerk JWTs. The backend fetches signing keys from `<CLERK_ISSUER>/.well-known/jwks.json`. |
| `CLERK_PUBLISHABLE_KEY` | *(empty)* | Optional backend fallback: the issuer is derived from this key when `CLERK_ISSUER` is unset. |

> `CLERK_SECRET_KEY` is **not** used by tinylnk — tokens are verified against
> Clerk's public JWKS, so no secret key is required.

#### Authentication Flow

Authentication on management endpoints uses **Clerk JWT** exclusively. Send `Authorization: Bearer <token>` on all protected endpoints. The backend derives the expected issuer from `CLERK_ISSUER` (falling back to `CLERK_PUBLISHABLE_KEY`) and verifies the signature against Clerk's public JWKS; the token's `iss` claim must match. No secret key is involved.

The browser gets its publishable key from `VITE_CLERK_PUBLISHABLE_KEY`, which Vite inlines at **build time** (`bun run build`, or `docker-compose up -d --build`). Changing it therefore requires a rebuild. With it unset, the app still runs, but the sign-in UI is hidden and the management endpoints are reachable only programmatically with a JWT.

If the token is invalid or absent, the request is rejected with `401 Unauthorized`.

## Project Structure

```
tinylnk/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI application & routes
│   │   ├── auth.py          # Clerk JWT verification against public JWKS
│   │   ├── models.py        # SQLAlchemy models + schema versioning
│   │   ├── schemas.py       # Pydantic request/response schemas
│   │   ├── crud.py          # Database CRUD operations
│   │   ├── database.py      # Engine, WAL pragmas & session
│   │   ├── logging_config.py # Structured logging middleware
│   │   └── utils.py         # URL validation & IP anonymization
│   ├── tests/               # Pytest suite
│   ├── config/              # Backend configuration
│   ├── requirements.txt     # Python dependencies
│   └── __init__.py
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Main application component
│   │   ├── main.tsx         # React entry point
│   │   ├── clerk.ts         # Optional Clerk auth wrapper
│   │   ├── types.ts         # TypeScript interfaces
│   │   ├── theme.ts         # Ant Design theme config
│   │   ├── ThemeProvider.tsx # Theme context provider
│   │   └── components/      # Hero, ShortenerForm, LinkCard, EditModal,
│   │                        # StatsModal, QrModal, ClerkShell, LinkIcon
│   ├── package.json
│   └── vite.config.ts
├── scripts/                 # Backup/restore + end-to-end contract check
├── deploy/                  # Deployment notes and Caddyfile
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## Architecture

- **Short Code Generation** — Uses `secrets.token_urlsafe(6)` for cryptographically random, non-enumerable codes with collision checking.
- **Static Serving** — In production, FastAPI serves the built React app directly, eliminating the need for a separate web server.
- **Database** — Single SQLite file with WAL mode and a 5s busy-timeout, so readers never block on writes. It is still a **single-writer** store: fine for personal and small-team use, not for high-concurrency workloads (which would need Postgres). A `schema_version` row is stamped at startup so stale database files fail loudly.
- **Privacy** — IP addresses are anonymized (the last IPv4 octet is zeroed) before storage. Analytics are stored locally; tinylnk does not include third-party tracking.
- **Rate Limiting** — SlowAPI limits sensitive endpoints: shortening (30/min), updates (30/min), analytics and recent-link queries (60/min), tag listing (60/min), CSV export (30/min), redirects (60/min), deletion (20/min), and QR generation (30/min).

## Backups

`scripts/backup.sh` (and `backup.ps1` on Windows) snapshots the SQLite file on a loop with retention pruning:

```bash
# Nightly backup via cron (host machine, Docker setup)
0 2 * * * SQLITE_DB_PATH=/app/data/urlshortener.db BACKUP_DIR=/app/backups /path/to/tinylnk/scripts/backup.sh

# Or as a Compose sidecar (runs alongside `app`, shares the data volume)
backup:
  image: alpine:3
  volumes:
    - ./data:/app/data
    - ./backups:/app/backups
    - ./scripts/backup.sh:/backup.sh:ro
  environment:
    - SQLITE_DB_PATH=/app/data/urlshortener.db
    - BACKUP_DIR=/app/backups
    - BACKUP_INTERVAL=86400
  command: ["sh", "/backup.sh"]
```

Restore with `scripts/restore.sh <backup-file>` (stops writers first — see the script header).

## Security

- **Authentication** — management endpoints accept a Clerk JWT
  (`Authorization: Bearer <clerk-jwt>`). See the [Authentication Flow](#authentication-flow)
  section for details.
- **CORS lockdown** — only configured origins can make cross-origin
  requests
- **Path traversal protection** — static assets are served from an allowed
  directory only
- **SSRF prevention** — blocks shortening of internal and private-network
  URLs, including `10.x`, `169.254.x`, and `localhost`
- **Security headers** — `X-Content-Type-Options`, `X-Frame-Options`,
  `Strict-Transport-Security`, and `Referrer-Policy`
- **Request size limiting** — rejects payloads over 1 MB
- **IP anonymization** — visitor IPs are truncated before database storage
- **Rate limiting** on sensitive API endpoints
- **Reserved alias protection** — a case-insensitive check prevents system
  route hijacking
- **Optional redirect interstitial** — warn users before they navigate to an
  external site
- **QR code caching** — a bounded 500-entry in-memory cache reduces repeated
  generation work
- Runs as a non-root user in Docker

> **Note:** HTTPS must be provided by a reverse proxy or hosting platform.
> Security headers do not enable TLS on their own.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+K` / `⌘+K` | Focus the URL input |
| `Escape` | Close any open modal |

## License

This project is released into the public domain under the [Unlicense](UNLICENSE).
