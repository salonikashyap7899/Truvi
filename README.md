# Truvi (MERN) — Real Estate Operating System

MongoDB + Express + React + Node rebuild of the Truvi MVP, with real-time
updates, file uploads, email notifications, and Razorpay payment scaffolding
on top of the original 6-module spec.

## Tech stack

**Backend:** Node.js · Express 5 · TypeScript · MongoDB (Mongoose) · JWT auth
(access + refresh) · Socket.io · Multer · Nodemailer · Razorpay · Zod · Vitest

**Frontend:** React 19 · Vite · TypeScript · Tailwind CSS v4 · React Router ·
Zustand · Axios · Socket.io-client · React Hook Form · Zod · Recharts


- **Real-time everywhere** — Socket.io pushes unit lock/unlock, lead stage
  changes, new commissions, and notifications to every connected client
  instantly. No polling, no manual refresh. This is the single biggest
  functional upgrade: "Developers and CPs must see literally the same live
  data" (spec 6.3) is now push-based, not just server-rendered-on-load.
- **Real file uploads** — Multer-backed local storage (swappable for S3 later)
  for project brochures, price lists, and site-visit photos. The Next.js MVP
  only accepted URL strings.
- **Real payment scaffolding** — Razorpay order creation + signature
  verification is fully wired for the Lead Marketplace and CP Premium
  membership. Works in simulated mode out of the box; add your Razorpay
  test-mode keys to `.env` to light up real test-mode checkout.
- **Real email notifications** — Nodemailer sends approval and commission
  emails, with a console/dev transport fallback so nothing breaks without
  SMTP configured.
- **A backend that fully type-checks in this environment** — unlike the
  Prisma version (which needs `prisma generate` to hit the network), pure
  npm/Mongoose meant I could run `tsc --noEmit`, a full `tsc` build, and the
  full Vitest suite here with zero gaps. Higher confidence, ported over.

## Setup

### 1. MongoDB — must run as a replica set

### prerequsites

**Local, single-node replica set (dev):**
```bash
mongod --replSet rs0 --dbpath /path/to/your/data
# in another terminal:
mongosh --eval "rs.initiate()"
```

**Or use MongoDB Atlas** (free tier is a replica set by default) — just set
`MONGO_URI` to your Atlas connection string.

### 2. Backend

```bash
cd server
npm install
cp .env.example .env
# edit .env: set MONGO_URI, generate JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
#   (openssl rand -base64 32)

npm test          # commission engine — 11 tests, must pass
npm run seed       # seeds realistic data across every role/stage
npm run dev        # starts on :5000 with Socket.io
```

### 3. Frontend

```bash
cd client
npm install
cp .env.example .env   # VITE_API_URL defaults to http://localhost:5000
npm run dev             # starts on :5173
```

Visit `http://localhost:5173`.

## Seeded login credentials

All seeded users share the password: **`Password123!`**

| Role | Email | Notes |
|---|---|---|
| Admin | `admin@truvi.app` | Full platform access |
| Developer | `dev1@truvi.app` | Approved, has live projects |
| Developer | `dev4@truvi.app` | Pending — test the admin approval flow |
| Channel Partner | `cp1@truvi.app` | Approved, Silver tier |
| Channel Partner | `cp7@truvi.app` | Approved, Diamond tier |

- Real-time inventory synchronization
- Live notifications
- Socket.io powered updates

## Optional: enabling real integrations

Optional

- SMTP credentials
- Razorpay credentials

## Deploying to Render

This project deploys as **two separate services**: this Render Web Service
runs the API only (Root Directory: `server`); the React app is built and
hosted separately (Vercel, Netlify, a Render Static Site, etc.). Because of
that split, the two origins need to be told about each other explicitly —
this isn't optional wiring, CORS and the auth cookie both depend on it.

**Prerequisites:**
- Push this repo to GitHub/GitLab (Render deploys from a connected git repo).
  This project isn't a git repo yet — run `git init`, commit, and push before
  connecting it in Render.
- A MongoDB Atlas connection string (Atlas is a replica set by default, which
  commission generation's transaction requires — see `server/.env.example`).

**Option A — Blueprint (recommended):** In the Render dashboard, "New +" →
"Blueprint", point it at this repo. It reads [render.yaml](render.yaml) and
creates the API service with Root Directory `server`, the right build/start
commands, health check, and a persistent Disk for `server/uploads` (see
"Known limitation" below) pre-wired. You'll be prompted for `MONGO_URI` and
`CLIENT_URL` (required — see below) plus any optional secrets (`SMTP_*`,
`RAZORPAY_*`); `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` are auto-generated.

**Option B — Manual Web Service:**
| Setting | Value |
|---|---|
| Root Directory | `server` |
| Build Command | `npm install && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/health` |

Then add the env vars from `server/.env.example` in the Render dashboard
(`MONGO_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `NODE_ENV=production`
at minimum).

**Required — wiring the two origins together:**
- `CLIENT_URL` on this Render service **must** be set to your deployed
  frontend's exact origin (e.g. `https://truvi.vercel.app`). It's used for
  the CORS allow-list and the Socket.io handshake; leaving it unset falls
  back to this API's own URL, which won't match your frontend's origin and
  CORS will silently reject requests from it.
- `VITE_API_URL` — set at build time wherever the frontend is hosted —
  **must** point at this API's Render URL, since there's no same-origin
  fallback to rely on once client and server are on different domains.
- The refresh-token cookie is `SameSite=None; Secure` in production to
  survive this cross-site setup, which requires HTTPS on both ends (Render
  and Vercel/Netlify give you this by default).

**Known limitation:** Render's filesystem is otherwise ephemeral, so
anything written to `server/uploads` (brochures, price lists, site-visit
photos) would normally be lost on every redeploy/restart. `render.yaml`
attaches a persistent Disk (`UPLOAD_DIR=/var/data/uploads`, paid plans only)
to avoid that; on the free plan, drop the `disk:` block and `UPLOAD_DIR` and
either accept the ephemeral storage or migrate `uploadService.ts` to S3.

## Project structure

```
server/
  src/
    models/        → Mongoose schemas (User, Project, Unit, Lead, SiteVisit, Commission, ...)
    routes/         → Express routers, one per resource, all Zod-validated + role-guarded
    services/       → Pure commission calculator (tested), email, uploads, payments, inventory
    middleware/      → JWT auth + role guards, centralized error handling
    sockets/          → Socket.io setup + typed emit helpers
    seed/              → Seed script
client/
  src/
    pages/           → One file per route, organized by role (admin/developer/cp)
    components/       → Shared UI primitives + NotificationBell (real-time)
    lib/               → Axios client (with token-refresh interceptor), Socket.io client, utils
    store/               → Zustand auth store
    hooks/                → useAuth
```

## What's implemented (MVP scope, matching the Next.js version)

- Auth with role-based signup, admin approval gating, JWT access+refresh tokens
- Inventory Engine — atomic unit locking (MongoDB compare-and-swap via `findOneAndUpdate`, 30-min auto-expiry), reservation, price history
- Lead Management CRM — auto-assignment, duplicate detection, stage-flow enforcement, WhatsApp deep link
- Site Visit Management — booking, geo-verified attendance, **photo upload** (new), post-visit reports
- Commission Engine — full percent split, TDS, milestone releases, platform fee never deducted from CP commission (11 tests, all passing)
- Both dashboards — Developer and CP, now with real-time inventory/lead updates
- Revenue Model layer — Featured Listings, Lead-as-a-Service (real Razorpay order flow), CP Premium (real Razorpay order flow), Admin revenue dashboard
- Public marketing pages (Direction B) + logged-in dashboards (Direction A)

## Known gaps (see DECISIONS.md for full reasoning)

- True premium-priority queueing in the lead marketplace (currently FIFO) —
  needs a reservation/holding mechanism to do properly across concurrent buyers.
- Developer dashboard's CP performance leaderboard (present in the Next.js
  version) wasn't ported this session — the CP-facing leaderboard was
  prioritized instead. Straightforward follow-up using the new `/api/leaderboard` route.
- Password reset flow not built.
- Leaflet map preview for geo-verified site visits not rendered (data is captured correctly).
- Platform fee setting is in-memory, not a persisted Settings document — resets on server restart.
