# Truvi — Real Estate Operating System

A MERN-stack (MongoDB + Express + React + Node) real estate platform for developers (builders) and CPs (channel partners). Covers inventory management, lead CRM, site visits, commission calculation, and payments.

## Stack

- **Backend:** Node.js · Express 5 · TypeScript · MongoDB/Mongoose · JWT auth · Socket.io · Multer · Nodemailer · Razorpay · Zod · Vitest
- **Frontend:** React 19 · Vite · TypeScript · Tailwind CSS v4 · React Router · Zustand · Axios · Socket.io-client · React Hook Form · Zod · Recharts

## How to run

Two workflows must both be running:

| Workflow | Command | Port |
|---|---|---|
| **Backend API** | `cd server && npm install --ignore-scripts && npm run dev` | 3001 |
| **Start application** | `cd client && npm install && npm run dev` | 5000 |

The Vite dev server (port 5000) proxies `/api`, `/uploads`, `/health`, and `/socket.io` to the backend on port 3001. Open the preview on port **5000**.

## Environment variables (server/.env)

| Variable | Required | Notes |
|---|---|---|
| `MONGO_URI` | Yes | Must be a replica set (Atlas free tier works) |
| `JWT_ACCESS_SECRET` | Yes | `openssl rand -base64 32` |
| `JWT_REFRESH_SECRET` | Yes | `openssl rand -base64 32` |
| `PORT` | No | Defaults to 3001 |
| `CLIENT_URL` | No | CORS — auto-allows all Replit preview domains |
| `SMTP_HOST/PORT/USER/PASSWORD` | No | Leave blank to use console transport |
| `RAZORPAY_KEY_ID/KEY_SECRET` | No | Leave blank for simulated payments |

## Project structure

```
server/src/
  models/      — Mongoose schemas
  routes/      — Express routers (Zod-validated, role-guarded)
  services/    — Commission calculator, email, uploads, payments, inventory
  middleware/  — JWT auth, role guards, error handling
  sockets/     — Socket.io setup + typed emit helpers
  seed/        — Seed script

client/src/
  pages/       — One file per route (admin / developer / cp roles)
  components/  — Shared UI + NotificationBell (real-time)
  lib/         — Axios client (token-refresh interceptor), Socket.io client
  store/       — Zustand auth store
  hooks/       — useAuth
```

## User preferences
