# How to set up Auth0 for local development

By default, the local settings stub out Auth0 (empty domain and audience strings). This means the app loads and renders, but clicking "Sign in" redirects to a broken URL — you won't be able to log in.

To get a working login locally, create a free Auth0 tenant. This takes about 5 minutes.

---

## Step 1 — Create a free Auth0 account

Go to [auth0.com](https://auth0.com) and sign up. The free tier supports up to 7,500 monthly active users and is sufficient for all development and early production use.

---

## Step 2 — Create an application

1. In the Auth0 dashboard, go to **Applications → Applications**
2. Click **Create Application**
3. Name it `sened` (or any name you prefer)
4. Select **Single Page Application**
5. Click **Create**

---

## Step 3 — Configure allowed URLs

In the application settings, scroll to **Application URIs** and fill in:

| Field | Value |
|---|---|
| Allowed Callback URLs | `http://localhost:5173` |
| Allowed Logout URLs | `http://localhost:5173` |
| Allowed Web Origins | `http://localhost:5173` |

Click **Save Changes**.

---

## Step 4 — Create an API (for the audience parameter)

1. Go to **Applications → APIs**
2. Click **Create API**
3. Name: `sened API`
4. Identifier (Audience): `https://api.sened.io` (or any URI — this becomes your `AUTH0_AUDIENCE`)
5. Click **Create**

---

## Step 5 — Set frontend environment variables

Create `frontend/.env.local` (this file is gitignored):

```bash
# frontend/.env.local
VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com
VITE_AUTH0_CLIENT_ID=your-client-id-from-auth0-dashboard
VITE_AUTH0_AUDIENCE=https://api.sened.io
```

Find your values in Auth0:
- **Domain**: Dashboard → Applications → your app → Settings → Domain
- **Client ID**: Same page → Client ID field

---

## Step 6 — Set backend environment variables

Create `backend/.env` (this file is gitignored):

```bash
# backend/.env
SECRET_KEY=run-python-c-import-secrets-print-secrets-token-urlsafe-50-to-generate
DEBUG=True
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_AUDIENCE=https://api.sened.io
```

> **Tip:** Generate a SECRET_KEY with:
> ```bash
> python3 -c "import secrets; print(secrets.token_urlsafe(50))"
> ```

---

## Step 7 — Update local.py to read env vars

If you want the backend to use your real Auth0 credentials while still using SQLite, edit `backend/config/settings/local.py`:

```python
from .base import *
from decouple import config

DEBUG = True
ALLOWED_HOSTS = ['*']

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': '/tmp/sened.sqlite3',
    }
}

CELERY_BROKER_URL = 'memory://'
CELERY_RESULT_BACKEND = 'cache+memory://'
CORS_ALLOW_ALL_ORIGINS = True
SENTRY_DSN = ''

# Read from .env file instead of hardcoding empty strings
AUTH0_DOMAIN = config('AUTH0_DOMAIN', default='')
AUTH0_AUDIENCE = config('AUTH0_AUDIENCE', default='')
```

---

## Step 8 — Restart the dev servers

```bash
# Stop any running dev.sh (Ctrl+C), then:
./dev.sh
```

The login page will now redirect to a real Auth0 hosted login form. After signing in you'll land on the dashboard.

---

## Skipping Auth0 entirely (UI-only development)

If you only want to work on the UI and don't need a real login flow, the dev bypass mode can be enabled by checking the [dev mock auth guide](04_dev_bypass_auth.md).
