# tinylnk

> A self-hosted, full-stack URL shortener with built-in analytics and link management.

![Open Source](https://img.shields.io/badge/Open%20Source-Free%20to%20use-brightgreen.svg)
![Python](https://img.shields.io/badge/python-3.10+-green.svg)
![React](https://img.shields.io/badge/react-19-blue.svg)
![Docker](https://img.shields.io/badge/docker-ready-2496ED.svg)

## Overview

tinylnk converts long URLs into short, shareable links while providing detailed click analytics. Built with FastAPI and React, it runs as a single self-contained service with no external dependencies beyond SQLite.

## Features

- **URL Shortening** -- Generate short links from long URLs instantly
- **Custom Aliases** -- Define your own memorable short codes (e.g., `tinylnk/spring-launch`)
- **Link Expiration** -- Set time-based expiration so links auto-disable after a specified period
- **Click Limits** -- Cap the maximum number of clicks per link
- **Tagging** -- Organize links with custom tags for easy categorization
- **Click Analytics** -- Track total clicks, daily trends, browser/OS breakdowns, referrer data, and individual click events
- **QR Code Generation** -- Generate and download QR codes for any short link
- **Recent Links Dashboard** -- View and manage all recently created links
- **Dark/Light Theme** -- Toggle between themes with persistent preference

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | FastAPI, SQLAlchemy, Uvicorn, SlowAPI |
| **Database** | SQLite |
| **Frontend** | React 19, TypeScript, Vite |
| **UI** | Ant Design 6, Recharts, Lucide Icons |
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
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Frontend:**

```bash
cd frontend
bun install
bun run dev
```

The dev server proxies API requests to the backend automatically.

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/shorten` | Create a shortened URL |
| `GET` | `/api/stats/{short_code}` | Get full analytics for a link |
| `GET` | `/api/recent` | Get the 20 most recent links |
| `DELETE` | `/api/urls/{short_code}` | Delete a short URL (requires `X-Admin-Key` header) |
| `GET` | `/api/qr/{short_code}` | Download QR code as PNG |
| `GET` | `/api/health` | Health check |
| `GET` | `/{short_code}` | Redirect to the original URL |

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

### Get Link Statistics

```bash
curl http://localhost:8000/api/stats/{short_code}
```

## Configuration

Copy `.env.example` to `.env` and customise:

| Environment Variable | Default | Description |
|---|---|---|
| `SQLITE_DB_PATH` | `urlshortener.db` | Path to the SQLite database file |
| `TINYLNK_ADMIN_KEY` | *(auto-generated)* | **Required for production.** Secret key for delete operations. If unset, an ephemeral key is printed to stdout on startup — it will be lost on restart. |
| `TINYLNK_CORS_ORIGINS` | `http://localhost:5173,http://localhost:8000` | Comma-separated list of allowed CORS origins |
| `TINYLNK_REDIRECT_WARNING` | `false` | Show an interstitial warning page before redirecting to external URLs |
| `TINYLNK_PROTECT_RECENT` | `false` | Require admin key to access `/api/recent` |

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
│   │   └── utils.py         # URL encoding & validation utilities
│   ├── requirements.txt     # Python dependencies
│   └── __init__.py
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # Main application component
│   │   ├── main.tsx         # React entry point
│   │   ├── types.ts         # TypeScript interfaces
│   │   ├── theme.ts         # Ant Design theme config
│   │   ├── ThemeProvider.tsx # Theme context provider
│   │   └── components/      # UI components
│   ├── package.json
│   └── vite.config.ts
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## Architecture

- **Short Code Generation** -- Uses `secrets.token_urlsafe(6)` for cryptographically random, non-enumerable codes with collision checking.
- **Static Serving** -- In production, FastAPI serves the built React app directly, eliminating the need for a separate web server.
- **Privacy-Friendly** -- IP addresses are anonymized (last octet zeroed) before storage. All analytics are stored locally with no third-party tracking.
- **Rate Limiting** -- SlowAPI enforces per-endpoint rate limits (30/min shorten, 60/min stats/recent, 20/min delete).

## Security

- **Admin key authentication** on destructive endpoints (`DELETE /api/urls/{code}`) via `X-Admin-Key` header
- **CORS lockdown** — only configured origins can make cross-origin requests
- **Path traversal protection** on static asset serving
- **SSRF prevention** — blocks shortening of internal/private network URLs (`10.x`, `169.254.x`, `localhost`, etc.)
- **Security headers** — `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Referrer-Policy`
- **Request size limiting** — rejects payloads over 1 MB
- **IP anonymization** — visitor IPs are truncated before database storage (GDPR-friendly)
- **Rate limiting** on all API endpoints
- **Reserved alias protection** — case-insensitive check prevents hijacking system routes
- **Optional redirect interstitial** — warn users before navigating to external sites
- **QR code caching** — bounded in-memory cache prevents CPU exhaustion from repeated generation
- Runs as a non-root user in Docker

> **⚠️ Important:** Always set `TINYLNK_ADMIN_KEY` in production. If unset, a random key is generated on each startup and printed to stdout — container restarts will invalidate it.

## License

This project is open-source and free to use.
