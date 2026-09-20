# tinylnk — Production Deployment

This directory covers persistent, self-hosted deployments using Docker or a
native process. The database is **PostgreSQL** (Neon or any reachable Postgres
instance); SQLite is not a supported runtime database. For the serverless
Vercel + Neon deployment, see
[Deploy to Vercel with Neon](../README.md#deploy-to-vercel-with-neon).

## Architecture

tinylnk is a single-process Python FastAPI app that serves both the API
and the pre-built React frontend. All state lives in PostgreSQL.

```text
                         Internet
                            |
                       [ :443 (HTTPS) ]
                            |
                     [ Reverse Proxy ]
                     (nginx / Caddy / Traefik)
                            | 8000
                     +------------+
                     |    app     |  (Python FastAPI + SPA)
                     +------------+
                            |
                 [ PostgreSQL / Neon ]
                 (DATABASE_URL, sslmode=require)
                            |
                    [ pg_dump / Neon
                      restore points ]
```

## Database

Create a PostgreSQL database (Neon's free tier works) and set `DATABASE_URL` in
`.env`:

```bash
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
```

The schema is created and migrated automatically on first start — the app runs
`create_all` plus the versioned bootstrap on an advisory-locked connection, so
several instances starting at once cannot race each other. To inspect or apply a
migration ahead of a deploy:

```bash
python scripts/migrate_db.py --check   # inspect only
python scripts/migrate_db.py           # migrate + verify
```

## Deployment Options

### Option A: Native / Windows (no Docker)

1. **Build the frontend**

   ```powershell
   cd frontend
   bun install
   bun run build        # → frontend/dist/
   ```

2. **Set environment variables**
   Copy `.env.example` → `.env` and fill in:
   - `DATABASE_URL` — PostgreSQL/Neon connection string (required)
   - `TINYLNK_CORS_ORIGINS` — your frontend domain(s)
   - `LOG_FORMAT=json` — for structured logging

3. **Start the backend**

   ```powershell
   cd backend
   pip install -r requirements.txt
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
   ```

4. **HTTPS (required for production)**
   Put **nginx**, **Caddy**, or another reverse proxy in front:
   - Listens on port 443 with TLS
   - Proxies to `http://localhost:8000`
   - Use Let's Encrypt / Certbot for free certs

5. **Process management**
   - **Windows:** Use NSSM or Task Scheduler to keep uvicorn running
   - **Linux:** systemd service or supervisord

### Option B: Docker

```bash
cp .env.example .env
# Edit .env — set DATABASE_URL and TINYLNK_CORS_ORIGINS
docker compose up -d
```

The container is stateless; it holds no database volume. Put a
TLS-terminating reverse proxy (such as Caddy or nginx) in front of the
container. Configure the proxy with your domain; tinylnk does not read a
`DOMAIN` environment variable.

An example Caddyfile is in `deploy/Caddyfile`.

---

## Environment Variables

- `DATABASE_URL` (**required**) — PostgreSQL/Neon connection URL; keep
  `sslmode=require` and prefer the pooled Neon string.
- `TINYLNK_CORS_ORIGINS` (default:
  `http://localhost:5173,http://localhost:8000`) — allowed origins.
- `TINYLNK_ADMIN_USER_IDS` — Clerk user ids allowed to manage every link,
  including ownerless legacy rows.
- `CLERK_ISSUER` / `VITE_CLERK_PUBLISHABLE_KEY` — Clerk authentication (the
  publishable key is inlined into the frontend at build time).
- `TINYLNK_REDIRECT_WARNING` (default: `false`) — show an external-redirect
  warning.
- `TINYLNK_ENABLE_DOCS` (default: `false`) — expose Swagger at `/docs`.
- `LOG_LEVEL` (default: `INFO`) — `DEBUG`, `INFO`, `WARNING`, or `ERROR`.
- `LOG_FORMAT` (default: `text`) — set to `json` for structured logs.
- `SENTRY_DSN` (default: empty) — optional Sentry error-tracking DSN.

`TINYLNK_ADMIN_KEY` has been removed — authentication is handled exclusively by
Clerk JWT.

---

## Database Backups

> ️ **Critical:** Back up your PostgreSQL database regularly. Without backups,
> data loss is permanent.

Use Neon restore points / branches, or `pg_dump`:

```bash
# Dump
pg_dump "$DATABASE_URL" --format=custom --file=tinylnk-$(date +%F).dump

# Restore into an empty database
pg_restore --clean --if-exists --dbname="$DATABASE_URL" tinylnk-$(date +%F).dump
```

Schedule the dump daily (cron, Task Scheduler, or your platform's scheduler) and
store the files off the database host.

---

## Running Tests

The backend requires `DATABASE_URL`, so the test suite boots with the test-only
`TINYLNK_TESTING=1` flag plus a throwaway `sqlite:///` URL:

```bash
cd backend
pip install -r requirements.txt
pytest tests/ -v
```

To run the suite against PostgreSQL instead, set `TEST_DATABASE_URL` to a
disposable database whose name contains `test` (tests truncate their tables):

```bash
TEST_DATABASE_URL="postgresql://…?sslmode=require" pytest tests/ -v
```

---

## Monitoring

- **Health check:** `GET /api/health` →
  `{"status":"ok","database":"connected"}`
- **Logs:** Set `LOG_FORMAT=json` for JSON-structured logs (ingest with
  Loki, Datadog, CloudWatch, etc.)
- **Error tracking:** Set `SENTRY_DSN` to enable Sentry exception tracking
- **Health check integration:** Monitor `/api/health` from your uptime checker

---

## Security Checklist

- [ ] HTTPS is enabled (reverse proxy with Let's Encrypt)
- [ ] `DATABASE_URL` uses `sslmode=require` and is not committed to git
- [ ] `TINYLNK_CORS_ORIGINS` points only to your actual domain(s)
- [ ] `LOG_FORMAT=json` is set for production
- [ ] Database backups are scheduled
- [ ] The app runs behind a reverse proxy (not exposed to internet directly)
- [ ] Admin API docs (`/docs`) are disabled (`TINYLNK_ENABLE_DOCS=false`)
- [ ] Regular `pytest` runs to verify nothing is broken

---

## File Layout

```text
scripts/
  migrate_db.py     # Apply/inspect schema migrations (PostgreSQL)
  e2e_contract_check.py  # Local HTTP end-to-end contract check

deploy/
  Caddyfile         # Example Caddy reverse proxy config
  README.md         # This file

.github/workflows/
  ci.yml            # CI pipeline (lint → test → build)
  deploy.yml        # CD pipeline (tag-based image push)
```