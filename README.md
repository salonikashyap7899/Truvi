# Truvi (MERN) — Real Estate Operating System

MongoDB + Express + React + Node rebuild of the Truvi MVP, with real-time
updates, file uploads, email notifications, and Razorpay payment scaffolding
on top of the original 6-module spec.

## Tech stack

**Backend:** Node.js · Express 5 · TypeScript · MongoDB (Mongoose) · JWT auth
(access + refresh) · Socket.io · Multer · Nodemailer · Razorpay · Zod · Vitest

**Frontend:** React 19 · Vite · TypeScript · Tailwind CSS v4 · React Router ·
Zustand · Axios · Socket.io-client · React Hook Form · Zod · Recharts

## What's new vs. the Next.js/Prisma version

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

Commission generation uses a multi-document Mongoose transaction (Commission +
CPProfile + Notification writes must all succeed together). This requires
MongoDB to be a replica set.

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

## Try the real-time features

Open two browser windows — one logged in as a Developer (`dev1@truvi.app`)
on a project detail page, one as a CP (`cp1@truvi.app`) on the dashboard.
Lock a unit as the CP; watch it update instantly on the Developer's screen
with no refresh.

## Optional: enabling real integrations

- **Email**: set `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` in
  `server/.env`. Without these, emails are logged to the console instead of sent.
- **Payments**: set `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` (test mode) in
  `server/.env`. Without these, the Lead Marketplace and Premium membership
  purchase flows run in simulated mode (same behavior as the Next.js MVP).

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
