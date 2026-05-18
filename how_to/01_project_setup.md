# How to set up the sened project from scratch

sened is a SaaS product that automates collection, AI-extraction, and renewal-tracking of Certificates of Insurance (COIs) for businesses managing subcontractors and vendors.

## Prerequisites

Install these before anything else:

- **Python 3.12+** — [python.org](https://python.org)
- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **Git** — [git-scm.com](https://git-scm.com)

Docker is only needed if you want to run Postgres + Redis locally (not required for initial development — the project uses SQLite by default).

---

## Clone the repository

```bash
git clone <repo-url>
cd sened
```

---

## Project structure

```
sened/
├── backend/                  # Django 5 + Django REST Framework
│   ├── config/               # Settings, URLs, Celery, WSGI
│   │   └── settings/
│   │       ├── base.py       # Shared settings (all environments)
│   │       ├── local.py      # SQLite, no Docker, no Auth0 required
│   │       └── development.py# Postgres + Redis (needs Docker)
│   └── apps/
│       ├── common/           # TenantModel, middleware, R2 storage
│       ├── organizations/    # Org + User models, /api/me, registration
│       ├── vendors/          # Vendor roster, requirement profiles
│       ├── documents/        # COI upload, AI extraction pipeline
│       ├── compliance/       # Compliance check engine
│       ├── renewals/         # Renewal scheduler + magic-link upload
│       └── billing/          # Stripe billing
├── frontend/                 # React 18 + Vite + TypeScript + Tailwind
│   └── src/
│       ├── api/              # Axios client + typed API functions
│       ├── components/       # Layout, StatusBadge, LoadingSpinner
│       ├── hooks/            # useAuth, useMe
│       └── pages/            # Dashboard, Vendors, Upload, Profiles, MagicUpload
├── how_to/                   # This documentation
├── dev.sh                    # Single-command dev environment starter
├── docker-compose.yml        # Postgres 16 + Redis 7 (optional)
├── README.md                 # Quick-start reference
└── IMPLEMENTATION_PLAN.md    # Full engineering reference
```

---

## Tech stack decisions

| Layer | Choice | Why |
|---|---|---|
| Backend | Django 5 + DRF | Python-native Anthropic SDK, fast iteration, low memory on free-tier hosting |
| Frontend | React 18 + Vite + TypeScript | Fast HMR, strong typing, Tailwind for rapid UI |
| Auth | Auth0 (OIDC) | Hosted, handles MFA, social login, free tier covers early users |
| Database | SQLite locally / Neon (Postgres) in prod | Zero setup for dev; serverless Postgres scales to zero |
| Async | Celery + Redis | AI extraction runs in background; Upstash Redis is free-tier |
| Storage | Cloudflare R2 | S3-compatible, no egress fees, free 10GB |
| AI | Anthropic Claude vision API | Best accuracy on ACORD 25 COI forms |
| Email | Resend | 3,000/month free, reliable deliverability |
| Payments | Stripe | Industry standard, handles SCA/PCI |
| Hosting | Fly.io (backend) + Vercel (frontend) | Both have generous free tiers |
| Error tracking | Sentry | Free for small volume |

---

## Multi-tenancy design

Every database table that holds customer data inherits from `TenantModel`:

```python
class TenantModel(models.Model):
    organization = models.ForeignKey('organizations.Organization', ...)
    objects = TenantManager()  # always scoped to one org
    class Meta:
        abstract = True
```

All queries use `.for_org(request.org_id)` — a query can never accidentally return another tenant's data. The tenant isolation test in `apps/common/tests/test_tenant_isolation.py` must always pass.
