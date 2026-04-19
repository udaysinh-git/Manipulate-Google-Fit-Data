#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT/apps/web"

if ! command -v bun >/dev/null 2>&1; then
  echo "Install Bun first: https://bun.sh"
  exit 1
fi

# Prisma CLI reads .env (not .env.local). Sync so migrate/generate see DATABASE_URL.
if [[ -f .env.local ]]; then
  cp -f .env.local .env
fi

echo "Installing dependencies..."
bun install

echo "Generating Prisma client..."
bun run prisma:generate

echo "Applying database migrations..."
bunx prisma migrate deploy

echo "Starting dev server at http://localhost:3000"
exec bun run dev
