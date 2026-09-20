# tinylnk

> A self-hosted, full-stack URL shortener with built-in analytics, link management, and a polished dashboard.

![Open Source](https://img.shields.io/badge/Open%20Source-Free%20to%20use-brightgreen.svg)
![Python](https://img.shields.io/badge/python-3.12-green.svg)
![React](https://img.shields.io/badge/react-19-blue.svg)
![Docker](https://img.shields.io/badge/docker-ready-2496ED.svg)

## Overview

tinylnk converts long URLs into short, shareable links with detailed click
analytics. FastAPI serves the API and the compiled React application from one
origin. Every deployment — Vercel, Docker, or local — uses PostgreSQL through a
Neon-compatible `DATABASE_URL`; SQLite backs the unit-test suite only.

## Features

### Core

- **URL Shortening** — Generate short links from long URLs instantly
- **Custom Aliases** — Define memorable short codes (for example, `https://your-domain/spring-launch`)
- **Link Expiration** — Set time-based expiration so links auto-disable after a specified period
- **Click Limits** — Cap the maximum number of clicks per link
- **Tagging** — Organize links with custom tags for easy categorization
- **Dark/Light Theme** — Toggle between themes with persistent preference
- **Optional Clerk Sign-in** — With a Clerk key configured, the dashboard is gated behind sign-in: anyone can still shorten a link, but editing, deleting, and analytics require an authenticated session
- **Per-user link ownership** — Links created while signed in belong to that user; other signed-in users cannot see or touch them (see [Ownership](#ownership))

### Analytics

- **Click Analytics** — Track total clicks, daily trends, browser/OS breakdowns, referrer data, and individual click events
- **Date Range Filtering** — Filter analytics by custom date ranges to analyze specific time periods
- **CSV Export** — Download complete click history as a CSV file for offline analysis or reporting

### Link Management

- **Link Editing** — Update a link's destination URL, alias, tag, expiry, or click limit at any time
- **Search & Filtering** — Search links by URL, alias, or short code; filter by tag
- **Recent Links Dashboard** — View and manage recently created links with click statistics, paged 25 at a time (`Load more`)

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
| **Backend** | Python 3.12, FastAPI, SQLAlchemy, Uvicorn, SlowAPI |
| **Database** | PostgreSQL (Neon or any Postgres) |
| **Frontend** | React 19, TypeScript, Vite |
| **UI** | Ant Design 6, Recharts, Lucide Icons, Framer Motion |
| **Authentication** | Clerk session JWTs verified through public JWKS |
| **Deployment** | Vercel, Docker, Docker Compose |

## Quick Start

### Vercel + Neon PostgreSQL

Deployed via `vercel.json` with `DATABASE_URL` (Neon PostgreSQL) set in the
Vercel project environment.

**Schema migrations on Neon.** The app runs `create_all` + the schema-version
bootstrap on every cold start, so a schema upgrade applies itself when the new
code deploys — the database is migrated by *the new code*, never by old code
that does not understand the newer schema. To apply or inspect a migration
without waiting for a deploy (or to verify afterwards), run the same bootstrap
from your machine against the Neon URL:

```bash
# Report only — connects, inspects, changes nothing
DATABASE_URL="postgresql://...neon.tech/db?sslmode=require" \
  python scripts/migrate_db.py --check

# Apply the migration, then verify
DATABASE_URL="postgresql://...neon.tech/db?sslmode=require" \
  python scripts/migrate_db.py
```

> Do **not** migrate a database out-of-band *before* deploying the new code —
> the currently deployed build refuses databases stamped with a schema version
> it does not know and fails loudly (by design). Deploy first, or migrate and
> deploy together.

Concurrent serverless cold starts are safe: on PostgreSQL the bootstrap
serializes on an advisory lock and uses `ADD COLUMN IF NOT EXISTS` /
`CREATE INDEX IF NOT EXISTS`.

Existing links created before ownership existed have no owner; they are
manageable only by `TINYLNK_ADMIN_USER_IDS` members (set it in the Vercel
environment for your own user id).

### Docker (Recommended)

```bash
git clone https://github.com/sunil-gumatimath/tinylnk.git
cd tinylnk
cp .env.example .env
docker compose up -d --build
```

Visit `http://localhost:8000` in your browser.

The container is stateless: set `DATABASE_URL` in `.env` to a PostgreSQL/Neon
connection string before starting it. To enable sign-in, also set
`VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_ISSUER`, then rebuild with
`docker compose up -d --build`; the browser key is embedded in the frontend
bundle at build time. See [Configuration](#configuration).

### Manual Setup

Requirements: Python 3.12 and [Bun](https://bun.sh/). The repository also
includes a locked [uv](https://docs.astral.sh/uv/) environment; `pip` remains
supported through `backend/requirements.txt`. The backend will not start until
`DATABASE_URL` points at a PostgreSQL/Neon database.

**Backend** (from the repository root):

```bash
cp .env.example .env
python -m venv .venv
# Activate .venv for your shell, then:
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Frontend** (in a second terminal):

```bash
cd frontend
bun install --frozen-lockfile
bun run dev
```

Open `http://localhost:5173`. Vite proxies `/api` requests to the backend at
`http://127.0.0.1:8000`.

## Deploy to Vercel with Neon

Vercel runs the FastAPI application declared by `[tool.vercel]` in
`pyproject.toml`, builds `frontend/dist`, and serves the frontend and API from
the same deployment. Vercel's filesystem is ephemeral and tinylnk is
PostgreSQL-only, so the app refuses to start without `DATABASE_URL`.

1. Create a Neon PostgreSQL database. Copy its pooled connection string; it
   should look like `postgresql://user:password@host/database?sslmode=require`.
2. Import this repository into Vercel.
3. Add `DATABASE_URL` in Vercel Project Settings for Production and every
   Preview environment that should boot successfully.
4. For sign-in, add a matching production Clerk configuration:
   - `VITE_CLERK_PUBLISHABLE_KEY=pk_live_...`
   - `CLERK_ISSUER=https://your-production-clerk-issuer`
5. Deploy. The application creates its current tables and schema-version row
   when the FastAPI function starts.
6. Verify both layers:

   ```bash
   curl -i https://your-domain.example/
   curl -i https://your-domain.example/api/health
   ```

   A healthy database response is:

   ```json
   {"status":"ok","database":"connected"}
   ```

> [!IMPORTANT]
> `VITE_CLERK_PUBLISHABLE_KEY` is a build-time value. Changing it requires a
> redeploy. Use a `pk_live_...` key with the matching production issuer; mixing
> test and production Clerk instances causes sign-in or token validation
> failures.

## API Reference

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/shorten` | — | Create a shortened URL |
| `PUT` | `/api/urls/{short_code}` | `Clerk JWT` | Update a link's properties |
| `DELETE` | `/api/urls/{short_code}` | `Clerk JWT` | Delete a short URL and its analytics |
| `GET` | `/api/stats/{short_code}` | `Clerk JWT` | Get analytics (supports `?start_date=` & `?end_date=`) |
| `GET` | `/api/stats/{short_code}/export` | `Clerk JWT` | Export analytics as CSV |
| `GET` | `/api/recent` | `Clerk JWT` | List recent links (`?search=`, `?tag=`, `?limit=` 1-100, `?offset=`) |
| `GET` | `/api/tags` | `Clerk JWT` | List all unique tags |
| `GET` | `/api/qr/{short_code}` | — | Generate QR code (supports `?fg=` & `?bg=` colors) |
| `GET` | `/api/health` | — | Health check |
| `GET` | `/{short_code}` | — | Redirect to the original URL |
| `GET` | `/__continue/{short_code}` | — | Second hop of the redirect warning page (records the click) |

#### Authentication

Management endpoints accept a **Clerk JWT**: send `Authorization: Bearer <clerk-jwt>`. Verified against the configured `CLERK_ISSUER` (the JWT `iss` claim must match) and validated for expiry and signature. This is the recommended path for browser, CI, and programmatic clients.

#### Ownership

Every link has an owner, and the management endpoints are scoped to it — one
signed-in user can never read, edit, export, or delete another user's links
(requests for a foreign link return `404`, not `403`, so existence is not
disclosed). `POST /api/shorten` accepts an optional token: with one, the link
belongs to that user; without one it stays **ownerless**.

| Link created | Who can manage it |
| --- | --- |
| Signed in | That user, plus `TINYLNK_ADMIN_USER_IDS` members |
| Signed out (ownerless) | `TINYLNK_ADMIN_USER_IDS` members only |

Set `TINYLNK_ADMIN_USER_IDS` to your own Clerk user id (the JWT `sub` claim) —
otherwise ownerless links created while signed out have no dashboard owner.
Rows created before schema v2 have no owner and are managed by that allowlist.

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
| `DATABASE_URL` | *(required)* | PostgreSQL/Neon connection URL (psycopg 3). Required in every environment; keep `sslmode=require` and prefer Neon's pooled connection string. |
| `TINYLNK_ADMIN_KEY` | *(empty)* | **Deprecated.** This setting has no effect — authentication is handled exclusively by Clerk JWT. Remove it from your configuration. |
| `TINYLNK_CORS_ORIGINS` | `http://localhost:5173,http://localhost:8000` | Comma-separated list of allowed CORS origins |
| `TINYLNK_REDIRECT_WARNING` | `false` | Show an interstitial warning page before redirecting to external URLs (click counted only on continue) |
| `TINYLNK_ENABLE_DOCS` | `false` | Expose the OpenAPI schema and Swagger UI at `/openapi.json` and `/docs` |
| `TINYLNK_DNS_CHECK` | `false` | Resolve hostnames on shorten and reject ones pointing at private/link-local ranges |
| `TINYLNK_ADMIN_USER_IDS` | *(empty)* | Comma-separated Clerk user ids that may manage **every** link, including ownerless legacy rows |
| `TINYLNK_RATE_LIMIT_*` | see `.env.example` | Per-endpoint SlowAPI limit strings (`SHORTEN`, `UPDATE`, `STATS`, `EXPORT`, `RECENT`, `TAGS`, `DELETE`, `REDIRECT`, `QR`) |
| `LOG_LEVEL` | `INFO` | Logging threshold: `DEBUG`, `INFO`, `WARNING`, `ERROR`, or `CRITICAL` |
| `LOG_FORMAT` | `text` | Set to `json` for structured logs |
| `SENTRY_DSN` | *(empty)* | Optional Sentry error-tracking DSN |
| `VITE_CLERK_PUBLISHABLE_KEY` | *(empty)* | Clerk publishable key for the browser. Vite **inlines** it at build time, so the frontend must be rebuilt after changing it. When unset, the sign-in UI is hidden (shortening still works). |
| `CLERK_ISSUER` | *(empty)* | Expected `iss` claim of incoming Clerk JWTs. The backend fetches signing keys from `<CLERK_ISSUER>/.well-known/jwks.json`. |
| `CLERK_PUBLISHABLE_KEY` | *(empty)* | Optional backend fallback: the issuer is derived from this key when `CLERK_ISSUER` is unset. |

`TINYLNK_ADMIN_KEY` is no longer supported. `CLERK_SECRET_KEY` is also not used:
tokens are verified against Clerk's public JWKS, so no secret key is required.

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
│   │   ├── database.py      # SQLite/PostgreSQL engine and sessions
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
├── scripts/                 # Schema migration + end-to-end contract check
├── deploy/                  # Deployment notes and Caddyfile
├── Dockerfile
├── docker-compose.yml
├── pyproject.toml            # Python package, Vercel entrypoint, Ruff config
├── vercel.json               # Frontend output and cache headers
└── README.md
```

## Architecture

- **Short Code Generation** — Uses `secrets.token_urlsafe(6)` for cryptographically random, non-enumerable codes with collision checking.
- **Static Serving** — In production, FastAPI serves the built React app directly, eliminating the need for a separate web server.
- **Database Selection** — PostgreSQL over psycopg 3, configured by `DATABASE_URL`. It is required everywhere (Vercel, Docker, local): the app raises a clear error at startup instead of falling back to SQLite. SQLite is used only by the unit tests, behind the test-only `TINYLNK_TESTING=1` flag.
- **Neon Connections** — PostgreSQL connections use `NullPool` and disable psycopg auto-prepared statements, letting Neon's pooler own connection reuse instead of retaining idle connections across serverless invocations.
- **Schema Bootstrap** — SQLAlchemy creates missing tables and stamps/advances the `schema_version` row at startup. Older databases are upgraded in place (v1 → v2 adds per-user ownership, `urls.owner_id`; v2 → v3 rewrites the timestamps to `timestamptz` so stored values are true instants). The whole upgrade — table creation, reflection and DDL — runs on one advisory-locked connection, so concurrent serverless cold starts cannot race each other. Stale databases stamped *newer* than the running build fail loudly instead of misbehaving. See `scripts/migrate_db.py` to apply or verify a migration out-of-band.
- **Click Limits** — The counter and limit check are performed in one guarded database update, so concurrent redirects cannot consume more clicks than configured.
- **Per-user Ownership** — Management endpoints are scoped to the caller's Clerk user id (or `TINYLNK_ADMIN_USER_IDS` for admins); foreign links return `404` so their existence is not leaked. Links created while signed out are ownerless and admin-managed.
- **Privacy** — IP addresses are anonymized (the last IPv4 octet is zeroed) before storage. Analytics stay in your PostgreSQL database; tinylnk does not include third-party tracking.
- **Rate Limiting** — SlowAPI limits each sensitive endpoint, configurable via `TINYLNK_RATE_LIMIT_*` env vars. Defaults: shortening (30/min), updates (30/min), analytics and recent queries (60/min), tag listing (60/min), CSV export (30/min), deletion (20/min), redirects (**600/min**), QR generation (**120/min**) and the interstitial continue hop (600/min). Redirect and QR limits are deliberately high: a single shared link or printed QR code can put many visitors behind one NAT/corporate egress IP.

## Backups

For Neon/PostgreSQL, use Neon restore points or branches, or `pg_dump`:

```bash
pg_dump "$DATABASE_URL" --format=custom --file=tinylnk-$(date +%F).dump
# restore into an empty database
pg_restore --clean --if-exists --dbname="$DATABASE_URL" tinylnk-$(date +%F).dump
```

The legacy `scripts/backup.*` and `scripts/restore.*` helpers are SQLite-only
and no longer apply to the application database.

## Testing and Quality Checks

Install the locked application and development dependencies with `uv sync
--dev`, then run:

```bash
# Backend unit/integration tests
uv run python -m pytest backend/tests -q

# Full local HTTP contract, including a temporary JWKS server
uv run python scripts/e2e_contract_check.py

# Backend lint
uv run ruff check backend

# Frontend tests, lint, type-check, and production build
cd frontend
bun test
bun run lint
bun run build
```

GitHub Actions runs backend/frontend linting, the backend test suite, the
frontend production build, and a Docker health check on pushes and pull
requests to `main`. Tags matching `v*` build and publish a container image to
GitHub Container Registry.

The backend requires `DATABASE_URL`, so the test suite boots with
`TINYLNK_TESTING=1` plus a throwaway `sqlite:///` URL. That flag is the only
way SQLite can be selected, and it is ignored in every non-test process. To run
the suite against PostgreSQL instead — exercising the production dialect and the
real bootstrap/migration path — set `TEST_DATABASE_URL` to a disposable
database whose name contains `test` (a Neon branch named `tinylnk_test`, for
example). Tests truncate their tables, so that guard is what keeps a mis-set
value away from production.

## Production Troubleshooting

| Symptom | Check |
| --- | --- |
| Deployment fails during import/startup | `DATABASE_URL` is required everywhere — confirm it is set and is a PostgreSQL URL ending in `sslmode=require`. |
| `/api/health` returns `503` | Check Neon availability, connection-string credentials, `sslmode`, and whether the Neon project is suspended. |
| Frontend loads but API calls fail | Request `/api/health` directly, inspect Vercel function logs, and confirm the deployment includes both the Python entrypoint and `frontend/dist`. |
| Sign-in succeeds but management calls return `401` | Ensure the frontend key and `CLERK_ISSUER` belong to the same Clerk instance; redeploy after changing `VITE_CLERK_PUBLISHABLE_KEY`. |
| Docker Compose reports a missing env file | Copy `.env.example` to `.env` before starting the service. |
| Existing database is rejected at startup | Its `schema_version` differs from the code. Run `scripts/migrate_db.py` to migrate it explicitly; do not delete production data. |

## Security

- **Authentication** — management endpoints accept a Clerk JWT
  (`Authorization: Bearer <clerk-jwt>`). See the [Authentication Flow](#authentication-flow)
  section for details.
- **CORS lockdown** — only configured origins can make cross-origin
  requests
- **Path traversal protection** — static assets are served from an allowed
  directory only
- **SSRF prevention** — blocks shortening of internal and private-network
  URLs, including `10.x`, `169.254.x`, and `localhost`. Set
  `TINYLNK_DNS_CHECK=true` to also resolve hostnames at shorten time and reject
  any that resolve into a blocked range (catches "public domain that points at
  `169.254.169.254`"). Note the residual limit: tinylnk never fetches a
  destination itself — it only redirects browsers — and DNS answers differ per
  resolver, so a determined rebinding domain can still resolve privately for a
  visitor
- **Security headers** — `X-Content-Type-Options`, `X-Frame-Options`,
  `Strict-Transport-Security`, and `Referrer-Policy`
- **Request size limiting** — rejects payloads over 1 MB
- **IP anonymization** — visitor IPs are truncated before database storage
- **Rate limiting** on sensitive API endpoints
- **Reserved alias protection** — a case-insensitive check prevents system
  route hijacking
- **Per-user ownership** — management endpoints are scoped to the caller's
  Clerk user id (or `TINYLNK_ADMIN_USER_IDS` for admins); foreign links return
  `404` so their existence is not leaked
- **Optional redirect interstitial** — warn users before they navigate to an
  external site; the click is counted only when they continue, not when the
  warning is displayed
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
