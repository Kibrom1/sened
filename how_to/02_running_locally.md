# How to run sened locally

The project includes a single script — `dev.sh` — that handles the full environment setup and starts all servers in one command.

---

## Quick start (recommended)

```bash
cd sened

# Make the script executable (first time only)
chmod +x dev.sh

# Start everything
./dev.sh
```

The script will:

1. Check that `python3`, `node`, and `npm` are installed
2. Create `backend/.venv` (Python virtual environment) if it doesn't exist
3. Install all Python backend dependencies via pip
4. Create `backend/config/settings/local.py` (SQLite, no Docker needed) if missing
5. Run Django database migrations
6. Run `npm install` in the frontend folder
7. Start the Django dev server on port 8000 in the background
8. Start the Vite dev server on port 5173 in the background
9. Poll both health endpoints until ready, then open your browser automatically

Both servers run together. Press **Ctrl+C** to shut them both down cleanly.

---

## What the local settings look like

`backend/config/settings/local.py` is auto-created by `dev.sh` if it doesn't exist. It configures:

```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': '/tmp/sened.sqlite3',   # /tmp avoids filesystem locking issues
    }
}
CELERY_BROKER_URL = 'memory://'         # No Redis needed
CELERY_RESULT_BACKEND = 'cache+memory://'
CORS_ALLOW_ALL_ORIGINS = True
SENTRY_DSN = ''                          # Sentry disabled locally
AUTH0_DOMAIN = ''                        # Auth0 stubs (see 03_auth0_setup.md)
AUTH0_AUDIENCE = ''
```

This lets the project run with **zero external services** — no Docker, no Postgres, no Redis.

---

## Running servers manually (without dev.sh)

If you prefer individual terminals:

**Terminal 1 — Django backend:**
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install django djangorestframework django-cors-headers dj-database-url \
    mozilla-django-oidc "celery[redis]" django-celery-beat python-decouple \
    "sentry-sdk[django,celery]" django-ratelimit boto3 stripe resend \
    anthropic pypdfium2 pillow gunicorn PyJWT requests pytest pytest-django

python manage.py migrate --settings=config.settings.local
python manage.py runserver 8000 --settings=config.settings.local
```

**Terminal 2 — Vite frontend:**
```bash
cd frontend
npm install
npm run dev
```

Backend runs at `http://localhost:8000` — health check: `http://localhost:8000/api/health/`
Frontend runs at `http://localhost:5173`

---

## Running background workers (needed for AI extraction in Phase 1+)

Open two more terminals after the above:

```bash
# Terminal 3 — Celery worker (handles async COI extraction jobs)
cd backend
source .venv/bin/activate
celery -A config worker --loglevel=info

# Terminal 4 — Celery beat (handles scheduled renewal reminders)
cd backend
source .venv/bin/activate
celery -A config beat --loglevel=info \
  --scheduler django_celery_beat.schedulers:DatabaseScheduler
```

> **Note:** Locally, `CELERY_BROKER_URL = 'memory://'` so tasks run in-process. For real async behavior you need Redis (see below or use `docker compose up -d`).

---

## Using Docker for Postgres + Redis (optional)

If you want the full production-like stack locally:

```bash
# Start Postgres 16 + Redis 7
docker compose up -d

# Wait for healthy status
docker compose ps

# Then use the development settings instead of local
cd backend
source .venv/bin/activate
python manage.py migrate --settings=config.settings.development
python manage.py runserver --settings=config.settings.development
```

---

## Running tests

```bash
cd backend
source .venv/bin/activate
pytest

# The tenant isolation test must always pass — run it specifically:
pytest apps/common/tests/test_tenant_isolation.py -v
```
