# Deploying Truvi on a Hostinger VPS (Ubuntu)

Truvi runs as **one Node process** that serves BOTH the API and the React
frontend on a single port, backed by **one database: Supabase (PostgreSQL)**.
There is no MongoDB. On the VPS the whole app lives on one domain — no CORS
or cross-site cookie complexity.

> IMPORTANT — HTTPS is required. In production the login/refresh cookie is
> `Secure` (HTTPS-only). Auth will NOT persist over plain `http://`. This
> guide sets up free SSL with Certbot. Point a domain at your VPS IP first.

Replace these placeholders throughout:
- `YOUR_DOMAIN`        → e.g. `truvi.in` (A-record pointing to your VPS IP)
- `YOUR_DATABASE_URL`  → your Supabase pooler URI (see Step 4)

---

## 1. One-time server setup (run as root, or with sudo)

```bash
# System packages
apt update && apt upgrade -y
apt install -y git nginx curl ufw

# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v      # should print v20.x or higher

# pm2 process manager (keeps the app running + restarts on reboot)
npm install -g pm2

# Firewall: allow SSH + web
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
```

---

## 2. Get the code

```bash
cd /var/www 2>/dev/null || (mkdir -p /var/www && cd /var/www)
cd /var/www
git clone https://github.com/salonikashyap7899/Truvi.git truvi
cd truvi
git checkout claude/mongodb-scalability-realestate-4ytnhj
```

---

## 3. Create the tables in Supabase (once)

You have already run `truvi_supabase_schema.sql` and `truvi_supabase_seed.sql`
in the Supabase SQL Editor. If you set up a NEW Supabase project later, open
Supabase Dashboard → SQL Editor and run those two files again (schema first,
then seed).

---

## 4. Configure the backend env

Get your connection string from Supabase: Dashboard → **Connect** button →
**Transaction pooler** (port 6543) → copy the URI. If your DB password has an
`@` or other symbol, URL-encode it (`@` → `%40`). Example for this project:

```
postgresql://postgres.oyjgybxiwtpakotarvrf:sona%40rajput16@aws-1-ap-south-1.pooler.supabase.com:6543/postgres
```

Create `server/.env`:

```bash
cd /var/www/truvi/server
cat > .env <<'EOF'
NODE_ENV=production
PORT=5001
PUBLIC_URL=https://YOUR_DOMAIN
CLIENT_URL=https://YOUR_DOMAIN

# Supabase (Transaction pooler URI, password URL-encoded)
DATABASE_URL=YOUR_DATABASE_URL

# Generate fresh secrets — see command below
JWT_ACCESS_SECRET=REPLACE_ME
JWT_REFRESH_SECRET=REPLACE_ME

# Ask Truvi AI (optional but recommended)
ANTHROPIC_API_KEY=

# Email OTP / notifications (optional — logs to console if blank)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=Truvi <no-reply@truvi.app>

# SMS OTP (optional — logs to console if blank). Fill Twilio OR MSG91.
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
MSG91_AUTH_KEY=
MSG91_SENDER_ID=

# Razorpay (optional — simulated payments if blank)
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
EOF

# Generate the two JWT secrets and paste them into .env
echo "JWT_ACCESS_SECRET  -> $(openssl rand -base64 32)"
echo "JWT_REFRESH_SECRET -> $(openssl rand -base64 32)"
nano .env    # paste the secrets, set YOUR_DOMAIN and YOUR_DATABASE_URL
```

---

## 5. Configure the frontend build env

The React app must know its API origin at BUILD time. Same-origin here, so
set it to your domain:

```bash
cd /var/www/truvi/client
echo 'VITE_API_URL=https://YOUR_DOMAIN' > .env
```

---

## 6. Build everything

```bash
cd /var/www/truvi
npm run build     # installs deps, builds client -> client/dist, builds server -> server/dist
```

---

## 7. Start the app with pm2

```bash
cd /var/www/truvi/server
pm2 start "npm run start" --name truvi
pm2 save
pm2 startup systemd -u root --hp /root   # run the command it prints, if any
pm2 status
curl -s http://127.0.0.1:5001/health     # -> {"status":"ok"}
```

---

## 8. Nginx reverse proxy (domain → Node on :5001)

```bash
cat > /etc/nginx/sites-available/truvi <<'EOF'
server {
    listen 80;
    server_name YOUR_DOMAIN www.YOUR_DOMAIN;
    client_max_body_size 50M;   # allows brochure / asset uploads

    location / {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;          # Socket.io
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sed -i "s/YOUR_DOMAIN/YOUR_DOMAIN/g" /etc/nginx/sites-available/truvi
ln -sf /etc/nginx/sites-available/truvi /etc/nginx/sites-enabled/truvi
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

(Replace `YOUR_DOMAIN` in the file with `nano /etc/nginx/sites-available/truvi` if the sed line didn't substitute your real domain.)

---

## 9. Enable HTTPS (required for auth)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d YOUR_DOMAIN -d www.YOUR_DOMAIN --non-interactive --agree-tos -m you@example.com --redirect
systemctl reload nginx
```

Certbot auto-renews. Your site is now live at `https://YOUR_DOMAIN`.

---

## 10. Verify

```bash
# Health
curl -s https://YOUR_DOMAIN/health

# Admin login (should return an accessToken + user)
curl -s -X POST https://YOUR_DOMAIN/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@truvi.app","password":"Password123!"}'
```

Open `https://YOUR_DOMAIN` in a browser and log in.

---

## Updating the app later

```bash
cd /var/www/truvi
git pull origin claude/mongodb-scalability-realestate-4ytnhj
npm run build
pm2 restart truvi
```

## Handy pm2 commands

```bash
pm2 logs truvi        # live logs (see OTP codes here until SMS/SMTP configured)
pm2 restart truvi     # restart after env change
pm2 stop truvi        # stop
pm2 status            # overview
```
