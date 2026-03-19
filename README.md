# tinylnk

A modern, self-hostable URL shortener built with **FastAPI**, **SQLAlchemy**, **SQLite**, and a **React + TypeScript** frontend.

With tinylnk, you can:
- shorten long URLs instantly
- create custom aliases
- set expiration times or maximum click limits
- organize links with tags
- view click analytics
- generate QR codes for short links
- manage links from a clean web UI or the API

## Features

- Fast URL shortening API
- Custom aliases
- Optional expiration times
- Optional max-click limits
- Tags for link organization
- Click analytics with browser and OS breakdowns
- Recent links dashboard
- QR code generation for short URLs
- Built-in rate limiting with `slowapi`
- Frontend served directly by the FastAPI app
- SQLite-based local persistence

## Tech Stack

- **Backend:** FastAPI
- **Database:** SQLite
- **ORM:** SQLAlchemy
- **Server:** Uvicorn
- **Rate limiting:** SlowAPI
- **Frontend:** React, TypeScript, Vite, Ant Design, Recharts
- **Frontend package manager / build tooling:** Bun

## Project Structure

```text
.
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── crud.py
│   │   ├── database.py
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   └── utils.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   ├── package.json
│   ├── vite.config.ts
│   └── bun.lock
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## Requirements

- **Python 3.10+**
- `pip`
- **Bun** for frontend dependencies and builds

> Python 3.10+ is recommended because the codebase uses modern type hints such as `list[...]` and `| None`.

## Installation

Clone the repository and install backend dependencies:

```bash
git clone https://github.com/sunil-gumatimath/tinylnk.git
cd tinylnk
pip install -r backend/requirements.txt
```

## Run Locally

Build the frontend, then start the FastAPI server:

```bash
cd frontend
bun install
bun run build

cd ..
uvicorn backend.app.main:app --reload
```

The app will be available at:

- **App UI:** `http://127.0.0.1:8000/`
- **Swagger docs:** `http://127.0.0.1:8000/docs`
- **ReDoc:** `http://127.0.0.1:8000/redoc`

## Frontend Development

If you want to work on the frontend separately:

```bash
cd frontend
bun install
bun run dev
```

Then build it for production before serving it through FastAPI:

```bash
bun run build
```

The FastAPI backend serves the compiled frontend from `frontend/dist`.

## Run with Docker

You can run the full app with Docker Compose:

```bash
docker-compose up -d
```

This builds the image, starts the app on port `8000`, and persists SQLite data in a local `data` directory.

## How It Works

- The React frontend is served by the FastAPI backend.
- FastAPI exposes API routes under `/api/...`.
- Short codes are generated using Base62 encoding unless you provide a custom alias.
- Data is stored in a local SQLite database file named `urlshortener.db`.
- Redirects can record click metadata such as:
  - referrer
  - user agent
  - IP address

## API Endpoints

### `POST /api/shorten`
Create a shortened URL.

#### Request body

```json
{
  "url": "https://example.com/some/very/long/path",
  "custom_alias": "my-link",
  "expires_in_hours": 24,
  "max_clicks": 100,
  "tag": "marketing"
}
```

#### Notes

- `custom_alias` is optional
- `expires_in_hours` is optional
- `max_clicks` is optional
- `tag` is optional
- if the URL does not start with `http://` or `https://`, the backend prefixes it with `https://`
- aliases must be **3 to 50 characters** and may contain:
  - letters
  - numbers
  - hyphens (`-`)
  - underscores (`_`)
- reserved aliases such as `api`, `docs`, and `assets` cannot be used

#### Example response

```json
{
  "id": 1,
  "original_url": "https://example.com/some/very/long/path",
  "short_code": "my-link",
  "short_url": "http://127.0.0.1:8000/my-link",
  "created_at": "2026-03-16T12:00:00Z",
  "expires_at": "2026-03-17T12:00:00Z",
  "max_clicks": 100,
  "tag": "marketing",
  "click_count": 0
}
```

---

### `GET /api/recent`
Returns the most recently created shortened URLs.

#### Example response

```json
[
  {
    "id": 1,
    "original_url": "https://example.com",
    "short_code": "g9",
    "short_url": "http://127.0.0.1:8000/g9",
    "created_at": "2026-03-16T12:00:00Z",
    "expires_at": null,
    "max_clicks": null,
    "tag": null,
    "click_count": 3
  }
]
```

---

### `GET /api/stats/{short_code}`
Returns analytics for a given short code or custom alias.

#### Example response

```json
{
  "original_url": "https://example.com",
  "short_code": "g9",
  "created_at": "2026-03-16T12:00:00Z",
  "expires_at": null,
  "max_clicks": null,
  "tag": "marketing",
  "total_clicks": 3,
  "clicks_by_date": [
    { "name": "2026-03-16", "value": 3 }
  ],
  "browser_stats": [
    { "name": "Chrome", "value": 2 }
  ],
  "os_stats": [
    { "name": "Windows", "value": 2 }
  ],
  "recent_clicks": [
    {
      "clicked_at": "2026-03-16T12:10:00Z",
      "referrer": "https://google.com",
      "user_agent": "Mozilla/5.0"
    }
  ]
}
```

---

### `GET /api/qr/{short_code}`
Returns a PNG QR code image for a short URL.

---

### `DELETE /api/urls/{short_code}`
Deletes a short URL and its analytics.

Returns `204 No Content` on success.

---

### `GET /{short_code}`
Redirects to the original URL and records the click.

#### Possible responses

- `302` redirect on success
- `404` if the short code does not exist
- `410` if the link has expired

## Rate Limiting

The `POST /api/shorten` endpoint is rate limited to:

```text
30 requests per minute
```

If the limit is exceeded, the API returns:

```json
{
  "detail": "Too many requests. Please slow down."
}
```

## Database

The app uses SQLite by default.

The database file is created automatically as:

```text
urlshortener.db
```

Tables are created on app startup, including data for URLs and click events.

## Frontend

The frontend is a React + TypeScript application built with Vite and Ant Design. It includes:

- URL shortening form
- advanced options for alias, expiration, click limits, and tags
- recent links table
- stats modal with analytics charts
- copy-to-clipboard support
- QR code generation
- delete actions for saved links

## Development Notes

- Backend entry point: `backend/app/main.py`
- Database config: `backend/app/database.py`
- URL creation and analytics logic: `backend/app/crud.py`
- Base62 and alias helpers: `backend/app/utils.py`

## Example Development Command

```bash
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

## Future Improvements

Possible next steps for the project:
- add tests
- add environment-based configuration
- support PostgreSQL
- add authentication for link management
- add editing for short links

## License

This project is open source and available under the **MIT License**.
