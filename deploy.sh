#!/usr/bin/env bash
# Truvi one-command deploy. Run on the VPS from the repo root:  bash deploy.sh
set -e
cd "$(dirname "$0")"

echo "==> Pulling latest main (discards local file edits; .env is untouched)"
git fetch origin main
git reset --hard origin/main

echo "==> Building server"
cd server
npm install
npm run build

echo "==> Building client"
cd ../client
npm install
npm run build

echo "==> Verifying logo made it into the build"
ls -la dist/brand/wordmark.png || echo "!! wordmark.png missing from dist — tell Claude"

cd ..
echo "==> Restarting app"
pm2 restart all || echo "!! pm2 not found — restart your node process manually (e.g. systemctl restart <your-service>)"

echo ""
echo "================ DEPLOY DONE ================"
echo "Now hard-refresh the browser: Ctrl+Shift+R"
echo "If the database schema changed in this release, also run:"
echo "  cd server && npx drizzle-kit push"
