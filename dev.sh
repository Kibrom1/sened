#!/usr/bin/env bash
# dev.sh — start the full sened development environment in one command
# Usage: ./dev.sh

set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
VENV="$BACKEND/.venv"
SETTINGS="config.settings.local"

# ── colours ──────────────────────────────────────────────────────────────────
BOLD="\033[1m"
RESET="\033[0m"
GREEN="\033[0;32m"
BLUE="\033[0;34m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
CYAN="\033[0;36m"

info()    { echo -e "${BOLD}${BLUE}[sened]${RESET} $*"; }
success() { echo -e "${BOLD}${GREEN}[sened]${RESET} $*"; }
warn()    { echo -e "${BOLD}${YELLOW}[sened]${RESET} $*"; }
error()   { echo -e "${BOLD}${RED}[sened]${RESET} $*"; exit 1; }
step()    { echo -e "\n${BOLD}${CYAN}▶ $*${RESET}"; }

# ── trap: clean up child processes on exit ────────────────────────────────────
PIDS=()
cleanup() {
  echo ""
  info "Shutting down..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  success "All servers stopped. Goodbye."
}
trap cleanup EXIT INT TERM

# ── prerequisite checks ───────────────────────────────────────────────────────
step "Checking prerequisites"

command -v python3 >/dev/null 2>&1 || error "python3 not found. Install Python 3.12+ from https://python.org"
command -v node    >/dev/null 2>&1 || error "node not found. Install Node.js 20+ from https://nodejs.org"
command -v npm     >/dev/null 2>&1 || error "npm not found. Install Node.js 20+ from https://nodejs.org"

PY_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
NODE_VERSION=$(node --version | sed 's/v//')
info "Python $PY_VERSION  •  Node $NODE_VERSION"

# ── backend: virtual environment ─────────────────────────────────────────────
step "Backend — virtual environment"

if [ ! -d "$VENV" ]; then
  info "Creating virtual environment..."
  python3 -m venv "$VENV"
  success "Virtual environment created at backend/.venv"
else
  info "Virtual environment already exists"
fi

# shellcheck disable=SC1091
source "$VENV/bin/activate"

# ── backend: dependencies ─────────────────────────────────────────────────────
step "Backend — installing dependencies"

REQUIREMENTS=(
  django
  djangorestframework
  django-cors-headers
  dj-database-url
  mozilla-django-oidc
  "celery[redis]"
  django-celery-beat
  python-decouple
  "sentry-sdk[django,celery]"
  django-ratelimit
  boto3
  stripe
  resend
  anthropic
  pypdfium2
  pillow
  gunicorn
  PyJWT
  requests
  pytest
  pytest-django
)

pip install --quiet --upgrade pip
pip install --quiet "${REQUIREMENTS[@]}"
success "Dependencies installed"

# ── backend: local settings ───────────────────────────────────────────────────
# Create local.py if missing (uses SQLite, no Docker needed)
if [ ! -f "$BACKEND/config/settings/local.py" ]; then
  info "Creating config/settings/local.py (SQLite, no Docker needed)..."
  cat > "$BACKEND/config/settings/local.py" << 'EOF'
from .base import *

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
AUTH0_DOMAIN = ''
AUTH0_AUDIENCE = ''
EOF
fi

# ── backend: migrations ───────────────────────────────────────────────────────
step "Backend — running migrations"

cd "$BACKEND"
python manage.py migrate --settings="$SETTINGS" --verbosity=0
success "Migrations applied"

# ── backend: seed test users ──────────────────────────────────────────────────
step "Backend — seeding test users"

python manage.py create_test_users --settings="$SETTINGS"

# ── backend: seed demo data ───────────────────────────────────────────────────
step "Backend — seeding demo data"

python manage.py create_seed_data --settings="$SETTINGS"

# ── frontend: dependencies ────────────────────────────────────────────────────
step "Frontend — installing dependencies"

cd "$FRONTEND"
npm install --legacy-peer-deps --silent
success "npm packages installed"

# ── start servers ─────────────────────────────────────────────────────────────
step "Starting servers"

# Backend log prefix helper: adds coloured [backend] tag to each line
prefix_backend() { while IFS= read -r line; do echo -e "${BLUE}[backend]${RESET}  $line"; done; }
prefix_frontend() { while IFS= read -r line; do echo -e "${GREEN}[frontend]${RESET} $line"; done; }

# Django
cd "$BACKEND"
DJANGO_SETTINGS_MODULE="$SETTINGS" python manage.py runserver 8000 2>&1 | prefix_backend &
PIDS+=($!)

# Vite
cd "$FRONTEND"
npm run dev 2>&1 | prefix_frontend &
PIDS+=($!)

# ── wait for both to be ready ─────────────────────────────────────────────────
info "Waiting for servers to start..."
sleep 4

BACKEND_OK=false
FRONTEND_OK=false

for i in {1..15}; do
  if curl -s http://localhost:8000/api/health/ | grep -q '"status": "ok"' 2>/dev/null; then
    BACKEND_OK=true; break
  fi
  sleep 1
done

for i in {1..15}; do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/ 2>/dev/null | grep -q "200"; then
    FRONTEND_OK=true; break
  fi
  sleep 1
done

echo ""
echo -e "  ${BOLD}─────────────────────────────────────────${RESET}"
if $BACKEND_OK;  then success "Backend  → http://localhost:8000"; else warn "Backend  → not responding (check logs above)"; fi
if $FRONTEND_OK; then success "Frontend → http://localhost:5173"; else warn "Frontend → not responding (check logs above)"; fi
echo -e "  ${BOLD}─────────────────────────────────────────${RESET}"
echo ""
info "Press Ctrl+C to stop all servers"
echo ""

# ── open browser ──────────────────────────────────────────────────────────────
if $FRONTEND_OK; then
  if command -v open >/dev/null 2>&1; then        # macOS
    open http://localhost:5173
  elif command -v xdg-open >/dev/null 2>&1; then  # Linux
    xdg-open http://localhost:5173
  fi
fi

# ── keep running until Ctrl+C ────────────────────────────────────────────────
wait
