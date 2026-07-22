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
| `PUT` | `/api/urls/{short_code}` | `X-Admin-Key` | Update a link's properties |
| `DELETE` | `/api/urls/{short_code}` | `X-Admin-Key` | Delete a short URL and its analytics |
| `GET` | `/api/stats/{short_code}` | `X-Admin-Key` | Get analytics (supports `?start_date=` & `?end_date=`) |
| `GET` | `/api/stats/{short_code}/export` | `X-Admin-Key` | Export analytics as CSV |
| `GET` | `/api/recent` | `X-Admin-Key` | List recent links (supports `?search=` & `?tag=`) |
| `GET` | `/api/tags` | `X-Admin-Key` | List all unique tags |
| `GET` | `/api/qr/{short_code}` | — | Generate QR code (supports `?fg=` & `?bg=` colors) |
| `GET` | `/api/health` | — | Health check |
| `GET` | `/{short_code}` | — | Redirect to the original URL |

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
  -H "X-Admin-Key: your-admin-key" \
  -d '{
    "original_url": "https://example.com/new-destination",
    "tag": "updated-campaign"
  }'
```

### Get Link Statistics

```bash
curl http://localhost:8000/api/stats/my-link \
  -H "X-Admin-Key: your-admin-key"

# With date range
curl "http://localhost:8000/api/stats/my-link?start_date=2026-01-01&end_date=2026-03-31" \
  -H "X-Admin-Key: your-admin-key"
```

### Export Analytics as CSV

```bash
curl http://localhost:8000/api/stats/my-link/export \
  -H "X-Admin-Key: your-admin-key" \
  -o analytics.csv
```

### Search Links

```bash
# Search by URL, alias, or short code
curl "http://localhost:8000/api/recent?search=github" \
  -H "X-Admin-Key: your-admin-key"

# Filter by tag
curl "http://localhost:8000/api/recent?tag=marketing" \
  -H "X-Admin-Key: your-admin-key"
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
| `TINYLNK_ADMIN_KEY` | *(auto-generated)* | **Required for production.** Secret key for management operations. If unset, an ephemeral key is printed to stdout on startup — it will be lost on restart. |
| `TINYLNK_CORS_ORIGINS` | `http://localhost:5173,http://localhost:8000` | Comma-separated list of allowed CORS origins |
| `TINYLNK_REDIRECT_WARNING` | `false` | Show an interstitial warning page before redirecting to external URLs |
| `TINYLNK_ENABLE_DOCS` | `false` | Expose the OpenAPI schema and Swagger UI at `/openapi.json` and `/docs` |
| `LOG_LEVEL` | `INFO` | Logging threshold: `DEBUG`, `INFO`, `WARNING`, `ERROR`, or `CRITICAL` |
| `LOG_FORMAT` | `text` | Set to `json` for structured logs |
| `SENTRY_DSN` | *(empty)* | Optional Sentry error-tracking DSN |

## Project Structure

```
tinylnk/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI application & routes
│   │   ├── models.py        # SQLAlchemy database models
│   │   ├── schemas.py       # Pydantic request/response schemas
│   │   ├── crud.py          # Database CRUD operations
│   │   ├── database.py      # Database connection & session
│   │   └── utils.py         # URL validation & IP anonymization
│   ├── requirements.txt     # Python dependencies
│   └── __init__.py
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Main application component
│   │   ├── main.tsx         # React entry point
│   │   ├── types.ts         # TypeScript interfaces
│   │   ├── theme.ts         # Ant Design theme config
│   │   ├── ThemeProvider.tsx # Theme context provider
│   │   └── components/
│   │       ├── Hero.tsx         # Landing hero with animations
│   │       ├── ShortenerForm.tsx # URL creation form
│   │       ├── LinkCard.tsx     # Individual link display
│   │       ├── EditModal.tsx    # Link editing modal
│   │       ├── StatsModal.tsx   # Analytics with charts, export, date filter
│   │       └── QrModal.tsx      # QR code with color customization
│   ├── package.json
│   └── vite.config.ts
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## Architecture

- **Short Code Generation** — Uses `secrets.token_urlsafe(6)` for cryptographically random, non-enumerable codes with collision checking.
- **Static Serving** — In production, FastAPI serves the built React app directly, eliminating the need for a separate web server.
- **Privacy** — IP addresses are anonymized (the last IPv4 octet is zeroed) before storage. Analytics are stored locally; tinylnk does not include third-party tracking.
- **Rate Limiting** — SlowAPI limits sensitive endpoints, including shortening (30/min), updates (30/min), analytics and recent-link queries (60/min), deletion (20/min), and QR generation (30/min).

## Security

- **Admin key authentication** — management endpoints require the
  `X-Admin-Key` header
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
>
> **⚠️ Important:** Always set `TINYLNK_ADMIN_KEY` in production. Otherwise,
> a random key is generated and logged on startup; it changes after a restart.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+K` / `⌘+K` | Focus the URL input and scroll to form |
| `Escape` | Close any open modal |

## License

This project is released into the public domain under the [Unlicense](UNLICENSE).
