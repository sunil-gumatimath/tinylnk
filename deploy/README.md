# tinylnk — Production Deployment

This directory contains configuration files and guides for running tinylnk
in production.

## Architecture

tinylnk is a single-process Python FastAPI app that serves both the API
and the pre-built React frontend. It uses SQLite as its database — a single
file on disk.

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
                    [ SQLite file ]
                  (./data/urlshortener.db)
                          |
                  [ Backup script ]
              (./scripts/backup.ps1 / backup.sh)
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
   - `TINYLNK_ADMIN_KEY` — a strong random secret
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
# Edit .env — set TINYLNK_ADMIN_KEY and TINYLNK_CORS_ORIGINS
docker compose up -d
```

Put a TLS-terminating reverse proxy (such as Caddy or nginx) in front of the
container. Configure the proxy with your domain; tinylnk does not read a
`DOMAIN` environment variable.

An example Caddyfile is in `deploy/Caddyfile`.

---

## Environment Variables

- `SQLITE_DB_PATH` (default: `./data/urlshortener.db`) — SQLite database path.
- `TINYLNK_ADMIN_KEY` (default: auto-generated) — **required** management
  secret.
- `TINYLNK_CORS_ORIGINS` (default:
  `http://localhost:5173,http://localhost:8000`) — allowed origins.
- `TINYLNK_REDIRECT_WARNING` (default: `false`) — show an external-redirect
  warning.
- `TINYLNK_ENABLE_DOCS` (default: `false`) — expose Swagger at `/docs`.
- `LOG_LEVEL` (default: `INFO`) — `DEBUG`, `INFO`, `WARNING`, or `ERROR`.
- `LOG_FORMAT` (default: `text`) — set to `json` for structured logs.
- `SENTRY_DSN` (default: empty) — optional Sentry error-tracking DSN.

---

## Database Backups

> ⚠️ **Critical:** The SQLite database is a single file in `./data/`.
> Back it up regularly. Without backups, data loss is permanent.

### PowerShell (Windows)

```powershell
# One-time backup
.\scripts\backup.ps1 -Once

# Schedule daily via Task Scheduler:
#   Trigger: Daily at 3:00 AM
#   Action: powershell.exe -File "C:\path\to\tinylnk\scripts\backup.ps1" -Once
```

### Bash (Linux / WSL / Git Bash)

```bash
# One-time backup
./scripts/backup.sh --once

# Continuous (24h loop in the background)
nohup ./scripts/backup.sh &
```

### Restore

```powershell
# PowerShell — lists available backups, then restore
.\scripts\restore.ps1
.\scripts\restore.ps1 -BackupFile .\backups\tinylnk-20260721-120000.db
```

```bash
# Bash
./scripts/restore.sh ./backups/tinylnk-20260721-120000.db
```

The restore script always creates a pre-restore snapshot of the current
database before overwriting, so you can roll back if something goes wrong.

---

## Running Tests

```bash
cd backend
pip install -r requirements.txt
pytest tests/ -v
```

---

## Monitoring

- **Health check:** `GET /api/health` → `{"status": "ok"}`
- **Logs:** Set `LOG_FORMAT=json` for JSON-structured logs (ingest with
  Loki, Datadog, CloudWatch, etc.)
- **Error tracking:** Set `SENTRY_DSN` to enable Sentry exception tracking
- **Health check integration:** Monitor `/api/health` from your uptime checker

---

## Security Checklist

- [ ] `TINYLNK_ADMIN_KEY` is set to a strong random value
- [ ] HTTPS is enabled (reverse proxy with Let's Encrypt)
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
  backup.ps1        # Windows PowerShell backup script
  restore.ps1       # Windows PowerShell restore script
  backup.sh         # Bash backup script (Linux/WSL)
  restore.sh        # Bash restore script (Linux/WSL)

deploy/
  Caddyfile         # Example Caddy reverse proxy config
  README.md         # This file

.github/workflows/
  ci.yml            # CI pipeline (lint → test → build)
  deploy.yml        # CD pipeline (tag-based image push)
```
