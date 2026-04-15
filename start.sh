#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
#  GSRTC E-Pass — One-command startup script
#  Usage: ./start.sh            (normal start)
#         ./start.sh --reseed   (drop & re-seed data)
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ── Load .env ─────────────────────────────────────────────────────────────────
if [ -f .env ]; then
  set -a; source .env; set +a
fi

DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-gsrtc_epass}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"

# ── 1. Ensure PostgreSQL is running ───────────────────────────────────────────
info "Checking PostgreSQL…"
if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -q 2>/dev/null; then
  warn "PostgreSQL not running. Trying to start via Homebrew…"
  if brew services start postgresql@16 2>/dev/null || brew services start postgresql 2>/dev/null; then
    sleep 3
  else
    error "Could not start PostgreSQL automatically. Please start it manually."
    exit 1
  fi
fi

if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -q 2>/dev/null; then
  error "PostgreSQL still not reachable at ${DB_HOST}:${DB_PORT}. Aborting."
  exit 1
fi
info "PostgreSQL is up ✔"

# ── 2. Ensure DB role exists ──────────────────────────────────────────────────
info "Checking DB user '${DB_USER}'…"
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$(whoami)" -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" postgres 2>/dev/null | grep -q 1; then
  warn "Role '${DB_USER}' not found. Creating…"
  createuser -h "$DB_HOST" -p "$DB_PORT" -s "$DB_USER" 2>/dev/null || true
  info "Role '${DB_USER}' created ✔"
else
  info "Role '${DB_USER}' exists ✔"
fi

# ── 3. Ensure database exists ─────────────────────────────────────────────────
info "Checking database '${DB_NAME}'…"
if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -lqt 2>/dev/null | cut -d\| -f1 | grep -qw "$DB_NAME"; then
  warn "Database '${DB_NAME}' not found. Creating…"
  createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" 2>/dev/null || true
  info "Database '${DB_NAME}' created ✔"
else
  info "Database '${DB_NAME}' exists ✔"
fi

# ── 4. npm install (only if node_modules missing or package.json changed) ──────
if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then
  info "Installing npm dependencies…"
  npm install --silent
fi
info "Dependencies ready ✔"

# ── 5. Run migrations ─────────────────────────────────────────────────────────
info "Running database migrations…"
node src/utils/migrate.js && info "Migrations complete ✔"

# ── 6. Optionally re-seed ─────────────────────────────────────────────────────
if [[ "${1:-}" == "--reseed" ]]; then
  warn "Re-seeding database…"
  node src/utils/seed.js && info "Seed complete ✔"
else
  # Seed only if admins table is empty (first run)
  ADMIN_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT COUNT(*) FROM admins;" 2>/dev/null || echo "0")
  if [ "$ADMIN_COUNT" -eq 0 ]; then
    info "First run — seeding initial data…"
    node src/utils/seed.js && info "Seed complete ✔"
  else
    info "Database already has data, skipping seed ✔"
  fi
fi

# ── 7. Start the server ───────────────────────────────────────────────────────
echo ""
info "Starting GSRTC E-Pass backend…"
npm run dev
