# tinylnk - URL Shortener

A fast, modern, and lightweight URL shortener API built with FastAPI. It allows you to shorten long URLs, create custom aliases, track click analytics, and set expiration dates for your links.

## Features

- **URL Shortening:** Convert long URLs into compact, shareable links.
- **Custom Aliases:** Choose your own recognizable short link names (e.g., `tinylnk/my-custom-name`).
- **Click Analytics:** Accurately track link visits, including referrer, user agent, and IP address.
- **Link Expiration:** Set a date and time for when your short links should automatically expire.
- **Rate Limiting:** Built-in protection against abuse using `slowapi`.
- **Frontend Included:** A simple and clean web interface served directly from the application.

## Tech Stack

- **Framework:** FastAPI
- **Database:** SQLite (Default) with SQLAlchemy ORM
- **Server:** Uvicorn
- **Rate Limiting:** SlowAPI
- **Frontend:** Vanilla HTML, CSS, JavaScript

## Prerequisites

- Python 3.8+

## Project Structure

```text
.
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── crud.py         # Database operations
│   │   ├── database.py     # Database setup
│   │   ├── main.py         # FastAPI application and routes
│   │   ├── models.py       # SQLAlchemy database models
│   │   ├── schemas.py      # Pydantic validation schemas
│   │   └── utils.py        # Helper utilities
│   └── requirements.txt    # Python dependencies
├── frontend/
│   ├── index.html          # Main HTML page
│   ├── script.js           # Frontend logic
│   └── style.css           # Styling
├── README.md
└── urlshortener.db         # SQLite database
```

## Installation

1. Clone or download this repository.
2. Navigate to the project directory:
   ```bash
   cd URL-shorter
   ```
3. Install the dependencies:
   ```bash
   pip install -r backend/requirements.txt
   ```

## Running the Application

Start the development server with Uvicorn from the project root:

```bash
uvicorn backend.app.main:app --reload
```

The application will be accessible at:
- **Frontend / UI:** `http://127.0.0.1:8000/`
- **Interactive API Docs (Swagger UI):** `http://127.0.0.1:8000/docs`
- **Alternative API Docs (ReDoc):** `http://127.0.0.1:8000/redoc`

## API Endpoints

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| `POST` | `/api/shorten` | Create a short URL. Accepts original URL, custom alias, and expiration. |
| `GET` | `/api/recent` | Fetch a list of recently created shortened URLs. |
| `GET` | `/api/stats/{short_code}` | Retrieve click analytics for a specific short URL. |
| `GET` | `/{short_code}` | Redirects to the original URL and records the click event. |
