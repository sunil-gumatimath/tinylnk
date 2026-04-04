# tinylnk

> A self-hosted, full-stack URL shortener with built-in analytics and link management.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
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
| `DELETE` | `/api/urls/{short_code}` | Delete a short URL |
| `GET` | `/api/qr/{short_code}` | Download QR code as PNG |
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

| Environment Variable | Default | Description |
|---|---|---|
| `SQLITE_DB_PATH` | `urlshortener.db` | Path to the SQLite database file |

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

- **Short Code Generation** -- Uses Base62 encoding of `(database_id + 1000)` for deterministic, collision-free codes. The offset ensures codes are never extremely short.
- **Static Serving** -- In production, FastAPI serves the built React app directly, eliminating the need for a separate web server.
- **Privacy-Friendly** -- All analytics are stored locally with no third-party tracking.
- **Rate Limiting** -- SlowAPI enforces 30 requests per minute on the shorten endpoint to prevent abuse.

## Security

- URL validation ensures only `http://` and `https://` schemes are accepted
- Self-referencing URLs (pointing to the tinylnk instance) are rejected
- Reserved aliases (`api`, `assets`, `docs`, `stats`, etc.) are protected
- Rate limiting prevents endpoint abuse
- Runs as a non-root user in Docker

## Roadmap

- [ ] User authentication with JWT
- [ ] Custom domain support for branded links
- [ ] Advanced analytics dashboard
- [ ] Bulk URL import/export
- [ ] Password-protected links
- [ ] API versioning (v1/v2)
- [ ] Redis caching layer
- [ ] Database migrations with Alembic

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.
