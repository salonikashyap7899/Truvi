#!/usr/bin/env bash
# Redeploy Truvi on the VPS: pull latest, install, build, reload PM2.
# Usage (from anywhere):  bash /var/www/truvi/deploy/deploy.sh
set -euo pipefail

# Repo root = parent of this script's dir.
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
echo "▶ Deploying Truvi from $ROOT"

echo "▶ Pulling latest code…"
git pull --ff-only

# Build needs devDependencies (vite, tsc) — force them in even if the shell
# has NODE_ENV=production exported.
echo "▶ Building frontend (client)…"
npm ci --prefix client --include=dev
npm --prefix client run build

echo "▶ Building backend (server)…"
npm ci --prefix server --include=dev
npm --prefix server run build

echo "▶ Reloading PM2…"
if pm2 describe truvi > /dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

echo "✅ Deploy complete. Check: pm2 logs truvi"
