# tinylnk

A modern URL shortener built with **FastAPI**, **SQLAlchemy**, **SQLite**, and a lightweight **vanilla frontend**.

It lets you:
- shorten long URLs
- create custom aliases
- set link expiration times
- track click analytics
- use a simple web UI or API

## Features

- Fast URL shortening API
- Custom short aliases
- Expiring links
- Click tracking and recent analytics
- Built-in rate limiting with `slowapi`
- Frontend served directly by the FastAPI app
- SQLite-based local persistence

## Tech Stack

- **Backend:** FastAPI
- **Database:** SQLite
- **ORM:** SQLAlchemy
- **Server:** Uvicorn
- **Rate limiting:** SlowAPI
- **Frontend:** React, TypeScript, Vite, Ant Design (built with Bun)

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
├── frontend/          # React TS application
│   ├── src/           # Components and styles
│   ├── package.json   # Dependencies
│   └── vite.config.ts # Vite configuration
├── .gitignore
└── README.md
```

## Requirements

- **Python 3.10+**
- `pip`
- **Bun** (for frontend dependencies and build)

> Python 3.10+ is recommended because the codebase uses modern type hints such as `list[...]` and `| None`.

## Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/sunil-gumatimath/tinylnk.git
cd tinylnk
pip install -r backend/requirements.txt
```

## Run Locally

Build the frontend once, then start the backend server:

```bash
cd frontend
bun install
bun run build

cd ..
uvicorn backend.app.main:app --reload
```

## Run with Docker

You can easily run the entire application using Docker Compose:

```bash
docker-compose up -d
```

This will build the application and start it on port `8000`. The SQLite database will be persisted in a local `data` directory.

The app will be available at:

- **App UI:** `http://127.0.0.1:8000/`
- **Swagger docs:** `http://127.0.0.1:8000/docs`
- **ReDoc:** `http://127.0.0.1:8000/redoc`

## How It Works

- The frontend is served from the `frontend/` folder.
- FastAPI exposes API routes under `/api/...`.
- Short codes are generated using **Base62 encoding**.
- Data is stored in a local SQLite database file named `urlshortener.db` in the project root.
- Every redirect can record click metadata such as:
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
  "expires_in_hours": 24
}
```

#### Notes

- `custom_alias` is optional
- `expires_in_hours` is optional
- if the URL does not start with `http://` or `https://`, the backend prefixes it with `https://`
- aliases must be **3 to 50 characters** and may contain:
  - letters
  - numbers
  - hyphens (`-`)
  - underscores (`_`)

#### Example response

```json
{
  "id": 1,
  "original_url": "https://example.com/some/very/long/path",
  "short_code": "my-link",
  "short_url": "http://127.0.0.1:8000/my-link",
  "created_at": "2026-03-16T12:00:00Z",
  "expires_at": "2026-03-17T12:00:00Z",
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
  "total_clicks": 3,
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

### `GET /{short_code}`
Redirects to the original URL and records the click.

#### Possible responses

- `307` redirect on success
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

Tables are created on app startup using:
- `urls`
- `click_events`

## Frontend

The frontend is a modern React + TypeScript application built with Vite and Ant Design. It provides:
- URL shortening form
- advanced options for alias and expiration
- recent links table
- stats modal for analytics
- copy-to-clipboard support

The FastAPI backend serves the compiled production build from `frontend/dist`. The root route `/` serves `index.html`, and static assets are mounted under `/assets`. To develop the frontend, run `bun run dev` inside the `frontend` directory.

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
- add deletion and editing for short links

## License

This project is open source and available under the **MIT License**.
