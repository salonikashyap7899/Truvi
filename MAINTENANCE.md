# Truvi Production Website Maintenance Guide

**Repository:** `salonikashyap7899/Truvi`  
**Production website:** `https://truviventures.com`  
**VPS app process observed during troubleshooting:** `truviventures` (PM2)  
**Last updated:** 27 October 2026

This guide is the operational checklist for maintaining Truvi safely. It is documentation only: creating this file does **not** enable maintenance mode, change hosting, restart the app, or fix a live outage.

## 1. Production safety rules

- Check the current branch and working tree before deploying. Never overwrite unknown changes.
- Do not run `git reset --hard`, `git clean -fd`, or delete lockfiles as a quick fix.
- Never paste `.env` contents, API keys, passwords, database URLs, tokens, or private customer data into tickets, screenshots, chat, or public logs.
- Back up the database and any user-uploaded files before database/schema changes. Confirm that a backup is usable; a backup that has never been restored is not a verified recovery plan.
- Do not run a database schema push or migration in production merely because a deploy script prints a reminder. Review the exact change and follow the database owner's approved migration procedure.
- A green build or GitHub check does not prove that the production server, database, DNS, proxy, or payment/email integrations work.
- Use a staging environment and test accounts for new workflows whenever possible. Do not test by creating fake sales, payouts, or customer records in production.
- Do not restart every PM2 process on a shared VPS. Restart only the intended Truvi app after confirming its process name.

## 2. Understand the hosting setup before troubleshooting

The repository includes a VPS deployment script (`deploy.sh`) that builds the server and client and restarts the PM2 process named `truviventures`. The repository also contains `render.yaml`, which describes a server-only deployment with the frontend hosted separately. The actual production routing may have changed since those files were written.

Before changing DNS, Cloudflare, Nginx, a hosting panel, or environment variables, confirm which provider currently serves:
1. The public frontend for `truviventures.com`.
2. The API/backend used by the frontend.
3. The database and uploaded assets.
4. The TLS certificate and reverse proxy, if one is used.

Do not assume Nginx is installed or that the public frontend is served by the VPS just because a PM2 process exists.

## 3. Pre-deployment checklist

Before every production deploy:

1. Confirm the intended changes have been reviewed and merged into `main`.
2. Confirm the production database has a recent, successful backup and that required environment variables are available on the host.
3. Open the VPS terminal and run:

   ```bash
   cd ~/Truvi
   git branch --show-current
   git status --short
   git log -1 --oneline
   ```

4. The deployment script expects the branch to be `main` and the working tree to be clean. If another branch is shown, stop and investigate.
5. If `git status --short` shows changes, inspect them first. Do not discard them automatically. If the only changes are the two package-lock files and you intentionally want to preserve them for later review, save just those changes:

   ```bash
   git stash push -m "Preserve local package-lock changes before deploy" -- client/package-lock.json server/package-lock.json
   git status --short
   ```

   Continue only when the remaining changes are understood and the working tree is clean. A stash is a backup of the edits, not proof that they should be reapplied.

## 4. Deploy from the VPS

The repository's `deploy.sh` fetches `origin/main`, checks that updates can be applied as a fast-forward, installs dependencies from the committed lockfiles using `npm ci`, builds the server and client, restarts only `truviventures`, and checks the local `/health` endpoint.

From the repository root:

```bash
cd ~/Truvi
bash deploy.sh
```

Read the whole output. Do not assume deployment succeeded if the command exits with an error or the health check fails.

The script reads `PORT` from `server/.env`; if it is absent, the script checks port `5000`. Use the same port when checking the local health endpoint:

```bash
PORT="$(grep -E '^PORT=' server/.env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')"
PORT="${PORT:-5000}"
curl -i --max-time 10 "http://127.0.0.1:$PORT/health"
```

A successful response should be HTTP 200 (or the documented healthy response for the deployed app). After that, test the public website and a basic API request in a browser. Check sign-in and other critical journeys with a test account.

**Do not run `git pull` and `bash deploy.sh` blindly when the working tree is dirty.** The deploy script performs its own fetch/fast-forward update and deliberately refuses local or untracked changes.

## 5. Routine health checks

Run these read-only checks on the VPS:

```bash
cd ~/Truvi
pm2 status
pm2 describe truviventures
pm2 logs truviventures --lines 100 --nostream
free -h
df -h
swapon --show
```

Look for repeated restarts, high memory/disk use, database connection errors, failed migrations, unhandled exceptions, and missing environment configuration. Do not paste secrets from logs into public channels.

If Nginx is confirmed to be the active reverse proxy, these additional checks may help:

```bash
sudo nginx -t
sudo systemctl status nginx --no-pager -l
sudo tail -n 100 /var/log/nginx/error.log
```

If Nginx is not installed or not used, do not install/reconfigure it as a speculative fix. Check the actual proxy/web-server service configured for this host instead.

## 6. Troubleshooting Cloudflare 502 / origin host errors

A Cloudflare 502/504 means the request failed somewhere between Cloudflare and the origin application/proxy. The browser screenshot alone cannot identify the exact cause.

### A. Test the local application first

```bash
cd ~/Truvi
PORT="$(grep -E '^PORT=' server/.env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')"
PORT="${PORT:-5000}"
curl -i --max-time 10 "http://127.0.0.1:$PORT/health"
pm2 status
pm2 logs truviventures --lines 100 --nostream
```

- **Connection refused:** verify the actual listening port and PM2 process status; inspect startup logs.
- **Timeout or no healthy response:** inspect application, database, memory, and startup errors before restarting.
- **HTTP 200 locally, but public site is still 502:** check the reverse-proxy upstream, host/port configuration, DNS/origin address, TLS mode/certificate, and the correct frontend/backend hosting provider.
- **The frontend loads but API calls fail:** inspect the browser Network panel and verify the configured API base URL, backend health, and CORS/cookie configuration.

### B. Restart only Truvi if logs support it

After checking logs and confirming a restart is appropriate:

```bash
pm2 restart truviventures --update-env
pm2 status
pm2 logs truviventures --lines 60 --nostream
```

Do not use `pm2 restart all` on a VPS that may host other applications. If the process is missing, do not create a new process using guessed paths or environment values; inspect the deployment configuration first.

### C. Record evidence before changing infrastructure

Capture the time of the incident, HTTP status, `/health` result, PM2 status, relevant error lines, and the hosting provider's origin/proxy logs. Redact secrets and personal information. Change one variable at a time and re-test.

## 7. Database changes and backups

Before any schema change:

1. Identify the exact migration or schema diff and review it.
2. Confirm a successful database backup/snapshot and the available restore procedure.
3. Test the migration on staging with a representative copy of the schema/data where permitted.
4. Confirm compatibility with the currently deployed application and the previous release.
5. Apply the approved migration using the project's documented database process.
6. Verify the application health endpoint and critical data workflows afterward.

The current deploy script prints a reminder about `npx drizzle-kit push` if a schema changed. **That reminder is not permission to run it automatically in production.** Review the proposed changes and obtain approval first.

Backup/restore checks must cover every relevant data store: the production database, uploaded documents/images, and any other persistent assets. Confirm the platform's backup schedule, retention, access controls, and restore-to-staging procedure with the hosting/database owner. The repository alone cannot prove that cloud backups or point-in-time recovery are enabled.

## 8. Rollback and recovery

The current deployment script does not provide an automatic application rollback. Do not treat `git reset --hard` as a rollback strategy.

Before a release, record the last known-good commit and the release being deployed:

```bash
cd ~/Truvi
git log -5 --oneline
```

If a release is unhealthy:

1. Stop additional deployments and capture the deploy output, health-check result, and logs.
2. Determine whether the issue is application code, configuration, hosting/proxy, or database schema.
3. Use the team's reviewed release procedure to redeploy the previous known-good application version. Confirm the database schema remains compatible; rolling back code does not automatically roll back the database.
4. Restore database data only under the approved recovery plan, after identifying the impact and required recovery point. A restore can overwrite newer data.
5. Re-test the health endpoint, login, API, and critical user workflows before declaring recovery complete.

If there is no tested rollback procedure for the current hosting setup, document that limitation and prepare one in staging before the next risky release.

## 9. Security and access

- Keep production environment files (for example, `server/.env`) out of Git and restrict file access on the host.
- Use unique, strong credentials and rotate exposed secrets promptly.
- Limit VPS, DNS, Cloudflare, hosting, database, and payment-provider access to the people who need it.
- Keep dependencies updated through reviewed changes and successful CI.
- Check logs for sensitive data before sharing them.
- Do not run account resets, data cleanup scripts, seed scripts, or destructive SQL against production unless the action is explicitly approved and backed up.

## 10. Scheduled maintenance checklist

**Before a planned release**
- [ ] Review changes and CI status.
- [ ] Verify backup status and recovery contacts.
- [ ] Check VPS disk space, memory and application logs.
- [ ] Confirm the deploy can be performed without overwriting local changes.
- [ ] Plan a verification window and a rollback decision point.

**After a release**
- [ ] Confirm deploy command exited successfully.
- [ ] Confirm `/health` responds locally.
- [ ] Confirm the public site and API work over HTTPS.
- [ ] Verify sign-in and the critical business workflows relevant to the release.
- [ ] Review PM2 and proxy logs for new errors.
- [ ] Record the deployed commit and any follow-up work.

**Periodic operations**
- [ ] Verify automated backups and periodically perform a restore-to-staging drill.
- [ ] Review privileged accounts and provider access.
- [ ] Review dependency/security alerts and pending server updates.
- [ ] Check domain renewal, TLS certificate status, DNS ownership, monitoring and alert delivery.
- [ ] Review this guide whenever the hosting architecture or deployment process changes.

## 11. Maintenance mode is separate

This file is a written runbook only. It does not show a maintenance banner, block users, or automatically put the public site into maintenance mode. If a maintenance page or temporary traffic restriction is needed, implement and test that behavior separately in the actual frontend/proxy/hosting configuration, including a clear user message and a reliable way to restore normal traffic.

---

**Operational note:** Update this guide whenever the production hosting, process name, deploy script, database migration process, or backup provider changes. Verify all commands against the current VPS configuration before using them in an incident.
