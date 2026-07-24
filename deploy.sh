#!/usr/bin/env bash
# Truvi one-command deploy. Run on the VPS from the repo root:  bash deploy.sh
set -e
cd "$(dirname "$0")"

# ---------------------------------------------------------------------------
# Ensure swap exists. A small VPS with 0 swap can OOM-kill the running app when
# the client build spikes memory — which shows up as a 502 Bad Gateway. Create a
# 2G swapfile once if there's none; harmless if swap already exists.
# ---------------------------------------------------------------------------
if [ "$(swapon --show | wc -l)" -eq 0 ] && [ ! -f /swapfile ]; then
  echo "==> No swap found — creating a 2G swapfile (prevents OOM 502s during builds)"
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

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
pm2 restart all --update-env || echo "!! pm2 not found — restart your node process manually (e.g. systemctl restart <your-service>)"
# Persist the process list so the app auto-starts after a reboot/crash.
pm2 save >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
# Health check: wait for the app to answer /health so we know the restart
# actually came back up (instead of leaving a silent 502).
# ---------------------------------------------------------------------------
PORT="$(grep -E '^PORT=' server/.env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')"
PORT="${PORT:-5000}"
echo "==> Waiting for the app on :$PORT to come back up…"
UP=""
for i in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then UP="yes"; break; fi
  sleep 1
done

echo ""
echo "================ DEPLOY DONE ================"
if [ "$UP" = "yes" ]; then
  echo "App is UP and answering on :$PORT ✓"
else
  echo "!! App did NOT answer /health after 20s. Check: pm2 logs truviventures --lines 40 --nostream"
fi
echo "Now hard-refresh the browser: Ctrl+Shift+R"
echo "If the database schema changed in this release, also run:"
echo "  cd server && npx drizzle-kit push"
