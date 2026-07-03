# Truvi — Real Estate Operating System (MERN)

MongoDB + Express + React + Node rebuild of the Truvi MVP, with real-time updates, file uploads, email notifications, and Razorpay payment scaffolding.

## Tech stack

**Backend:** Node.js · Express 5 · TypeScript · MongoDB (Mongoose) · JWT auth (access + refresh) · Socket.io · Multer · Nodemailer · Razorpay · Zod · Vitest  
**Frontend:** React 19 · Vite · TypeScript · Tailwind CSS v4 · React Router · Zustand · Axios · Socket.io-client · React Hook Form · Zod · Recharts

## How to run

### Prerequisites
- MongoDB **replica set** (required for commission transactions). Use MongoDB Atlas free tier, or run locally:
  ```bash
  mongod --replSet rs0 --dbpath /path/to/data
  mongosh --eval "rs.initiate()"
  ```

### Environment variables (server)
Copy `server/.env.example` → `server/.env` and set:
| Variable | Required | Notes |
|---|---|---|
| `MONGO_URI` | ✅ | Atlas connection string or local replica set URI |
| `JWT_ACCESS_SECRET` | ✅ | `openssl rand -base64 32` |
| `JWT_REFRESH_SECRET` | ✅ | `openssl rand -base64 32` |
| `CLIENT_URL` | Production only | CORS allow-list origin |
| `SMTP_*` | Optional | Leave blank for console transport |
| `RAZORPAY_*` | Optional | Leave blank for simulated payments |

### Start dev servers

**Backend** (port 5000):
```bash
cd server && npm install && npm run dev
```

**Frontend** (port 5173):
```bash
cd client && npm install && npm run dev
```

Set `VITE_API_URL` in `client/.env` if backend runs on a non-default port/host.

## Project structure

```
server/src/
  models/        Mongoose schemas (User, Project, Unit, Lead, SiteVisit, Commission …)
  routes/        Express routers, one per resource, Zod-validated + role-guarded
  services/      Commission calculator, email, uploads, payments, inventory
  middleware/    JWT auth + role guards, error handling
  sockets/       Socket.io setup + typed emit helpers
  seed/          Seed script
client/src/
  pages/         One file per route, organized by role (admin/developer/cp/buyer)
  components/    Shared UI primitives + HeartButton + NotificationBell
  lib/           Axios client (token-refresh interceptor), Socket.io client, utils
  store/         Zustand auth store
  hooks/         useAuth
```

## Roles
- **ADMIN** — manages approvals, listings, revenue
- **DEVELOPER** — creates and manages projects/units
- **CP** (Channel Partner) — browses inventory, submits leads, earns commissions
- **BUYER** — browses approved projects, saves/unsaves properties, requests site visits

## User preferences
<!-- Add user-specific preferences here -->
