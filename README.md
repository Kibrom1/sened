# sened

**Automated certificate of insurance (COI) tracking for businesses that manage subcontractors and vendors.**

---

## About the Project

Sened is a platform designed to automate and streamline the process of tracking certificates of insurance (COIs) for businesses working with subcontractors and vendors. It features multi-tenant support, compliance rule management, AI-powered document extraction, renewal scheduling, and Stripe billing integration. The backend is built with Django and Django REST Framework, while the frontend uses React, Vite, and Tailwind CSS.

**Looking for a team member:**
If you're interested in joining the project and contributing to a modern SaaS platform in the insurtech space, please reach out! We're looking for collaborators passionate about building robust, user-friendly software.

---

## Prerequisites

- Python 3.12+
- Node.js 20+
- Docker & Docker Compose

---

## Quick start

### 1. Clone and enter the repo

```bash
git clone <repo-url>
cd sened
```

### 2. Start local infrastructure (Postgres + Redis)

```bash
docker compose up -d
```

Wait a few seconds for Postgres to be ready (`docker compose ps` — both services should show `healthy`).

---

### 3. Backend

```bash
cd backend

# Copy environment file and fill in your keys
cp .env.example .env

# Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.in   # or: pip install -r requirements.txt if compiled

# Run database migrations
python manage.py migrate --settings=config.settings.development

# Start the development server
python manage.py runserver --settings=config.settings.development
```

Backend is now running at **http://localhost:8000**

Health check: http://localhost:8000/api/health/

#### Run background workers (optional for Phase 0, required for Phase 1+)

Open two additional terminals:

```bash
# Terminal 2 — Celery worker (handles async COI extraction)
source .venv/bin/activate
celery -A config worker --loglevel=info

# Terminal 3 — Celery beat (handles daily renewal scheduler)
source .venv/bin/activate
celery -A config beat --loglevel=info --scheduler django_celery_beat.schedulers:DatabaseScheduler
```

---

### 4. Frontend

```bash
cd frontend

# Copy environment file and fill in your Auth0 credentials
cp .env.example .env.local

# Install dependencies
npm install

# Start the dev server
npm run dev
```

Frontend is now running at **http://localhost:5173**

The Vite dev server proxies all `/api/*` requests to the Django backend on `:8000` — no CORS setup needed in development.

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `SECRET_KEY` | Django secret key (generate with `python -c "import secrets; print(secrets.token_urlsafe(50))"`) |
| `DEBUG` | `True` for development |
| `DATABASE_URL` | Postgres connection string (leave blank to use `DB_*` vars below) |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` / `DB_HOST` / `DB_PORT` | Local Postgres credentials (default: `coitracker` / `postgres` / `postgres` / `localhost` / `5432`) |
| `REDIS_URL` | Redis URL (default: `redis://localhost:6379/0`) |
| `AUTH0_DOMAIN` | Your Auth0 tenant domain (e.g. `dev-xxx.us.auth0.com`) |
| `AUTH0_AUDIENCE` | API audience registered in Auth0 |
| `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` | Auth0 application credentials |
| `R2_ENDPOINT_URL` / `R2_ACCESS_KEY` / `R2_SECRET_KEY` / `R2_BUCKET` | Cloudflare R2 credentials |
| `ANTHROPIC_API_KEY` | Anthropic API key (for COI extraction) |
| `RESEND_API_KEY` / `EMAIL_FROM` | Resend email credentials |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_ID` | Stripe credentials |
| `FRONTEND_URL` | Frontend base URL for magic links (default: `http://localhost:5173`) |
| `INTERNAL_JOB_SECRET` | Secret header for cron-job.org triggered endpoints |
| `SENTRY_DSN` | Sentry DSN (leave blank to disable) |

### Frontend (`frontend/.env.local`)

| Variable | Description |
|---|---|
| `VITE_AUTH0_DOMAIN` | Your Auth0 tenant domain |
| `VITE_AUTH0_CLIENT_ID` | Auth0 SPA client ID |
| `VITE_AUTH0_AUDIENCE` | Auth0 API audience |

---

## Running tests

```bash
cd backend
source .venv/bin/activate

# Install test dependencies
pip install pytest pytest-django

# Run all tests
pytest

# Run only the tenant isolation test (must always pass)
pytest apps/common/tests/test_tenant_isolation.py -v
```

---

## Project structure

```
sened/
├── backend/                  # Django 5 + Django REST Framework
│   ├── config/               # Settings, URLs, Celery, WSGI
│   └── apps/
│       ├── common/           # TenantModel, TenantQuerySet, Auth middleware, R2 storage
│       ├── organizations/    # Organization + User models, registration, /api/me
│       ├── vendors/          # Vendor roster, requirement profiles, CSV import
│       ├── documents/        # COI upload, AI extraction pipeline (Phase 1)
│       ├── compliance/       # Compliance check engine (Phase 2)
│       ├── renewals/         # Renewal scheduler + magic-link upload (Phase 3)
│       └── billing/          # Stripe billing (Phase 4)
├── frontend/                 # React 18 + Vite + Tailwind
│   └── src/
│       ├── api/              # Typed API client + request functions
│       ├── components/       # Layout, StatusBadge, LoadingSpinner
│       ├── hooks/            # useAuth, useMe
│       └── pages/            # Dashboard, Vendors, VendorDetail, Upload, Profiles, MagicUpload
└── docker-compose.yml        # Postgres 16 + Redis 7 for local development
```

---

## Build phases

| Phase | Description | Status |
|---|---|---|
| **0 — Foundations** | Auth, multi-tenant shell, all models, health check | ✅ Complete |
| **1 — Extraction core** | COI upload, AI extraction, review/confirm, expiration list | 🔜 Next |
| **2 — Compliance** | Requirement profiles, compliance check, dashboard | 🔜 Planned |
| **3 — Renewal loop** | Celery Beat scheduler, renewal emails, magic-link upload | 🔜 Planned |
| **4 — Commercialize** | Stripe billing, onboarding polish, activity log | 🔜 Planned |

---

## Deployment (production)

The backend deploys to **Fly.io** (free tier), frontend to **Vercel**, database to **Neon** (serverless Postgres).

```bash
# Backend — deploy to Fly.io
cd backend
fly auth login
fly launch          # first time only
fly secrets set ANTHROPIC_API_KEY=... STRIPE_SECRET_KEY=... # set all env vars
fly deploy

# Frontend — deploy to Vercel
cd frontend
npx vercel          # follow prompts; set VITE_* env vars in Vercel dashboard
```

See `IMPLEMENTATION_PLAN.md` for the full infrastructure and deployment reference.
