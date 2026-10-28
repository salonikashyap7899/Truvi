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

# Refuse to overwrite local or untracked work. This deploy script must never
# discard edits from the VPS; commit/back up changes deliberately before retrying.
echo "==> Checking repository state (safe deploy mode)"
CURRENT_BRANCH="$(git branch --show-current)"
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "ERROR: Expected the VPS checkout to be on branch 'main', found '$CURRENT_BRANCH'. No files changed."
  exit 1
fi

DIRTY_STATE="$(git status --porcelain --untracked-files=all)"
if [ -n "$DIRTY_STATE" ]; then
  echo "ERROR: Local or untracked changes were found. Refusing to overwrite them."
  printf '%s\n' "$DIRTY_STATE"
  echo "Back up or commit the changes intentionally, then retry the deploy."
  exit 1
fi

echo "==> Fetching latest main without discarding local files"
git fetch origin main

# Keep deployment non-destructive even when the incoming commit removes or
# renames tracked files. Review such changes explicitly instead of auto-applying
# them as part of a routine production deploy.
INCOMING_REMOVALS="$(git diff --name-status --find-renames=0 HEAD..origin/main | awk '$1 == "D" || $1 ~ /^R/ { print $0 }')"
if [ -n "$INCOMING_REMOVALS" ]; then
  echo "ERROR: The incoming update removes or renames tracked files. No update applied."
  printf '%s\n' "$INCOMING_REMOVALS"
  echo "Review those file changes explicitly before deploying."
  exit 1
fi

git merge --ff-only origin/main

echo "==> Building server"
cd server
npm ci
npm run build

echo "==> Building client"
cd ../client
npm ci
npm run build

echo "==> Verifying logo made it into the build"
ls -la dist/brand/wordmark.png || echo "!! wordmark.png missing from dist — tell Claude"

cd ..
echo "==> Restarting Truvi app"
if ! command -v pm2 >/dev/null 2>&1; then
  echo "ERROR: PM2 is not installed or not on PATH. App was built but not restarted."
  exit 1
fi
if ! pm2 describe truviventures >/dev/null 2>&1; then
  echo "ERROR: PM2 process 'truviventures' was not found. Refusing to restart unrelated apps."
  pm2 list
  exit 1
fi
pm2 restart truviventures --update-env
# Persist this app's process list so it auto-starts after a reboot/crash.
pm2 save

# ---------------------------------------------------------------------------
# Health check: wait for the app to answer /health so we know the restart
# actually came back up (instead of leaving a silent 502).
# ---------------------------------------------------------------------------
PORT="$(grep -E '^PORT=' server/.env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')"
# Match server/src/config/env.ts, whose default PORT is 3001.
# A fallback of 5000 falsely marked the deployment unhealthy when PORT was not set.
PORT="${PORT:-3001}"
# Database schema reconciliation can take longer than a minute on a cold
# connection. Allow up to 180s for the API to finish booting, while bounding
# each curl attempt so one stalled request does not consume the whole window.
HEALTH_TIMEOUT_SECONDS="${DEPLOY_HEALTH_TIMEOUT_SECONDS:-180}"
if ! [[ "$HEALTH_TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] || [ "$HEALTH_TIMEOUT_SECONDS" -lt 1 ]; then
  echo "ERROR: DEPLOY_HEALTH_TIMEOUT_SECONDS must be a positive integer."
  exit 1
fi
echo "==> Waiting for the app on :$PORT to come back up (up to ${HEALTH_TIMEOUT_SECONDS}s; DB checks run on boot)…"
UP=""
HEALTH_START_SECONDS="$SECONDS"
while [ "$((SECONDS - HEALTH_START_SECONDS))" -lt "$HEALTH_TIMEOUT_SECONDS" ]; do
  if curl --max-time 2 -fsS "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then UP="yes"; break; fi
  sleep 1
done

if [ "$UP" = "yes" ]; then
  echo ""
  echo "================ DEPLOY DONE ================"
  echo "App is UP and answering on :$PORT ✓"
else
  echo ""
  echo "ERROR: App did NOT answer /health after ${HEALTH_TIMEOUT_SECONDS} seconds."
  echo "Recent app logs (may contain older entries):"
  pm2 logs truviventures --lines 40 --nostream --time || true
  echo "Deployment is not healthy; do not treat this as a successful release."
  exit 1
fi
echo "Now hard-refresh the browser: Ctrl+Shift+R"
echo "If the database schema changed in this release, also run:"
echo "  cd server && npx drizzle-kit push"
