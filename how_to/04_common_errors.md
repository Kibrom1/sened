# Common errors and how to fix them

---

## Frontend: `Cannot find module @rollup/rollup-darwin-x64`

**Full error:**
```
Error: Cannot find module @rollup/rollup-darwin-x64. npm has a bug related to
optional dependencies. Please try `npm i` again after removing both
package-lock.json and node_modules directory.
```

**Cause:** The `node_modules` folder was installed on a different OS or CPU architecture (e.g., it was created on Linux ARM64 inside a CI/build environment, but you're running on macOS x64 or ARM). Vite and Rollup use platform-specific native binaries that don't transfer across platforms.

**Fix:**
```bash
cd frontend
rm -rf node_modules package-lock.json
cd ..
./dev.sh
```

This forces a clean `npm install` for your current platform.

---

## Backend: `django.db.utils.OperationalError: disk I/O error` on migrations

**Cause:** The SQLite database path was set to a location on a mounted or network filesystem (e.g., inside the project folder on a Docker volume or remote mount). SQLite requires a local filesystem that supports `fsync` and file locking — mounted filesystems often don't.

**Fix:** Use `/tmp/sened.sqlite3` as the database path. `/tmp` is always a local filesystem.

In `backend/config/settings/local.py`:
```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': '/tmp/sened.sqlite3',   # ← must be /tmp, not inside the project folder
    }
}
```

---

## Frontend: Login redirects to `https://authorize/?client_id=&...`

**Cause:** The Auth0 environment variables are not set. When `VITE_AUTH0_DOMAIN` is empty, the Auth0 React SDK constructs a URL with no domain, which appears as `https://authorize/...`.

**Fix — Option A (full Auth0 setup):** Follow [03_auth0_setup.md](03_auth0_setup.md) to create a free Auth0 tenant and set `frontend/.env.local`.

**Fix — Option B (skip auth for UI dev):** See [04_dev_bypass_auth.md](04_dev_bypass_auth.md).

---

## Backend: `ModuleNotFoundError: No module named 'config'`

**Cause:** Running `python manage.py` from the wrong directory, or without specifying the settings module.

**Fix:** Always run Django commands from inside the `backend/` directory with the settings flag:
```bash
cd backend
python manage.py migrate --settings=config.settings.local
python manage.py runserver --settings=config.settings.local
```

Or set the environment variable once:
```bash
export DJANGO_SETTINGS_MODULE=config.settings.local
python manage.py migrate
```

---

## Backend: `No module named 'decouple'` or other missing package

**Cause:** The virtual environment isn't activated, or `pip install` didn't complete.

**Fix:**
```bash
cd backend
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install python-decouple  # or whichever package is missing
```

If using `dev.sh`, it installs all required packages automatically on every run.

---

## Port already in use (`Address already in use` on 8000 or 5173)

**Cause:** A previous dev server didn't shut down cleanly (e.g., the terminal was closed instead of Ctrl+C).

**Fix:**
```bash
# Kill whatever is on port 8000
lsof -ti:8000 | xargs kill -9 2>/dev/null

# Kill whatever is on port 5173
lsof -ti:5173 | xargs kill -9 2>/dev/null

# Then start fresh
./dev.sh
```

---

## Migrations: `Table already exists` or `relation does not exist`

**Cause:** The SQLite database is in an inconsistent state (e.g., partial migration, manual schema edits).

**Fix (local dev only — wipes all data):**
```bash
rm /tmp/sened.sqlite3
cd backend
source .venv/bin/activate
python manage.py migrate --settings=config.settings.local
```

---

## `dev.sh`: Frontend shows `not responding` in the status summary

This means Vite started but wasn't ready within the 15-second polling window, or crashed immediately. Check the `[frontend]` lines in the terminal output above the status summary for the actual error. Most common causes:

- Wrong-platform `node_modules` (see Rollup error above)
- Missing `vite.config.ts` or TypeScript compile error in source files
- Port 5173 already in use

Run `cd frontend && npm run dev` directly to see the full error output.
