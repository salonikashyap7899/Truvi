# Deploying Truvi on a Hostinger VPS

This runs the **whole app on one VPS**: a single Node process serves the API,
the built React frontend, and uploaded files, with **Nginx** in front for TLS
and **PM2** keeping it alive. The database is your **Supabase** Postgres
(remote — nothing to install on the VPS for it).

```
Browser ──HTTPS──▶ Nginx (:443) ──▶ Node/Express (:5000) ──▶ Supabase (Postgres)
                                     │
                                     ├─ serves client/dist  (React app)
                                     └─ serves /uploads      (files)
```

Because frontend and API share one origin, there's **no CORS/cookie cross-site
setup** to worry about — the app uses `SameSite=Lax` cookies here.

---

## 0. Before you start

- A Hostinger VPS running **Ubuntu 22.04/24.04**, and its **IP address**.
- A **domain** (or subdomain) with an **A record pointing to the VPS IP**
  (set this in your DNS; propagation can take a few minutes).
- Your **Supabase** project ready: open Supabase → **SQL Editor**, paste
  [`server/supabase/setup.sql`](server/supabase/setup.sql), and **Run**. This
  creates every table and your admin login (`admin@truvi.app` / `Password123!`).
  Then copy the **connection string** (Project Settings → Database → use the
  **Transaction pooler**, port `6543`).

---

## 1. One-time server setup

SSH in as root (Hostinger gives you the credentials):

```bash
ssh root@YOUR_VPS_IP
```

Install Node 20, git, Nginx, PM2, and certbot:

```bash
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs git nginx
npm install -g pm2
apt install -y certbot python3-certbot-nginx
```

Open the firewall for web + SSH:

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
```

---

## 2. Get the code

```bash
mkdir -p /var/www && cd /var/www
git clone https://github.com/salonikashyap7899/Truvi.git truvi
cd /var/www/truvi
git checkout claude/session-request-qucs7v   # or main, once merged
```

Create the uploads directory **outside** the repo so redeploys never wipe it:

```bash
mkdir -p /var/www/truvi-uploads
```

---

## 3. Configure environment

```bash
cp server/.env.production.example server/.env
nano server/.env
```

Fill in at minimum:

- `DATABASE_URL` — your Supabase pooler connection string.
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — generate each with
  `openssl rand -base64 32`.
- `CLIENT_URL` and `PUBLIC_URL` — `https://your-domain.com`.
- Keep `COOKIE_SAMESITE=lax`, `COOKIE_SECURE=true`, `UPLOAD_DIR=/var/www/truvi-uploads`.

> Testing over plain `http://` before TLS? Temporarily set `COOKIE_SECURE=false`
> so login works, then switch it back to `true` after certbot (step 6).

---

## 4. Build and start

```bash
cd /var/www/truvi
npm ci --prefix client --include=dev && npm --prefix client run build
npm ci --prefix server --include=dev && npm --prefix server run build

pm2 start ecosystem.config.cjs
pm2 save
pm2 startup    # run the command it prints, so PM2 revives on reboot
```

Confirm the app is up locally:

```bash
curl -s http://127.0.0.1:5000/health     # → {"status":"ok"}
pm2 logs truvi --lines 20                 # should show "Supabase (Postgres) connected"
```

---

## 5. Nginx

```bash
cp deploy/nginx.conf /etc/nginx/sites-available/truvi
# edit server_name to your domain:
sed -i 's/your-domain.com/REAL_DOMAIN.com/g' /etc/nginx/sites-available/truvi
ln -sf /etc/nginx/sites-available/truvi /etc/nginx/sites-enabled/truvi
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

You should now reach the site at `http://your-domain.com`.

---

## 6. HTTPS (TLS certificate)

```bash
certbot --nginx -d your-domain.com -d www.your-domain.com
```

Follow the prompts; certbot edits the Nginx config to add HTTPS and sets up
auto-renewal. Make sure `COOKIE_SECURE=true` in `server/.env`, then:

```bash
pm2 reload ecosystem.config.cjs --update-env
```

---

## 7. Verify

Open `https://your-domain.com`, then log in with:

- **email:** `admin@truvi.app`  **password:** `Password123!`  (change it after)

Quick API check:

```bash
curl -s https://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@truvi.app","password":"Password123!"}'
```

You should get back an `accessToken`.

---

## 8. Redeploying after code changes

```bash
bash /var/www/truvi/deploy/deploy.sh
```

It pulls the latest code, rebuilds the client + server, and reloads PM2 with
zero-config. (It installs `devDependencies` explicitly so the build tools are
available even in a production shell.)

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `pm2 logs truvi` shows *Missing required environment variable* | Fill that key in `server/.env`, then `pm2 reload ecosystem.config.cjs --update-env`. |
| Login works but you get logged out on refresh | You're on `http://` with `COOKIE_SECURE=true`. Finish TLS (step 6) or set `COOKIE_SECURE=false` temporarily. |
| 502 Bad Gateway from Nginx | Node isn't running — `pm2 status`, `pm2 logs truvi`. |
| Uploaded images 404 | Ensure `UPLOAD_DIR` in `.env` matches an existing writable dir and reload PM2. |
| Build fails with `vite: not found` | Run the build with `--include=dev` (deploy.sh already does). |
| Ask Truvi AI says "not configured" | Set `ANTHROPIC_API_KEY` in `server/.env` and reload. |

**Useful commands**

```bash
pm2 status                 # process state
pm2 logs truvi             # live logs
pm2 reload truvi           # restart after env change (with --update-env)
sudo nginx -t              # validate nginx config
sudo systemctl reload nginx
```

---

## Notes

- **Frontend API URL:** the React build needs no `VITE_API_URL` on a
  single-origin VPS — it defaults to the current origin, so `/api/*` calls hit
  this same server automatically.
- **Uploads persistence:** files live in `UPLOAD_DIR` (default
  `/var/www/truvi-uploads`), outside the git checkout, so they survive
  `git pull` and rebuilds. Back this folder up (or move to S3 later — swap
  `server/src/services/uploadService.ts#fileUrl`).
- **Database:** all data is in Supabase, so the VPS stays stateless apart from
  uploads — you can rebuild the box and just re-clone + re-deploy.
