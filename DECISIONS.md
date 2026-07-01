# DECISIONS.md (MERN version)

Judgment calls made porting Truvi from Next.js/Prisma/Postgres to
MongoDB/Express/React/Node, plus new decisions specific to the "better
features" scope (real-time, payments, uploads, email).

## Schema design: relational (Prisma) → document (Mongoose)

- **Units live in their own collection**, not embedded in Project. I
  initially embedded them (natural Mongo instinct), then reconsidered:
  embedded arrays make atomic per-unit locking messy (need positional
  operators, array-length limits become a real 16MB-document concern as
  inventory grows), and a separate collection makes the concurrency-critical
  lock endpoint a clean single-document `findOneAndUpdate`. This mirrors the
  Prisma schema's flat `Unit` table more closely anyway.
- **Commission milestones ARE embedded** in the Commission document — they're
  always read and written together, never queried independently, and there's
  a hard cap of ~3-5 milestones per commission. This is the correct call in
  Mongo where the Prisma version needed a separate `CommissionMilestone` table
  only because relational DBs don't have embedded arrays.
- **CPProfile / DeveloperProfile are embedded fields on User**, not separate
  documents, since Prisma's 1:1 relation was really just "extra fields that
  only apply to one role" — no reason to pay for a second collection + join.

## Concurrency: Prisma `$transaction` → MongoDB atomic ops / sessions

- **Unit locking** (`POST /api/units/:id/lock`) does NOT use a Mongo
  transaction. It uses a single `findOneAndUpdate` with a query filter that
  only matches lockable units (`AVAILABLE`, or `LOCKED`-but-expired).
  MongoDB guarantees this read+write is atomic at the document level — this
  is actually a *stronger* guarantee with *less* overhead than a
  multi-statement transaction for a single-document update, and doesn't
  require a replica set.
- **Commission generation** DOES use a real multi-document Mongoose
  transaction (`mongoose.startSession()` + `withTransaction`), because it
  writes to Commission + User (CPProfile.totalBookings) + Notification
  together and all three must succeed or none should. This requires MongoDB
  running as a replica set — documented prominently in the README, since
  it's the one hard infrastructure requirement that trips people up locally.

## Auth: NextAuth → hand-rolled JWT

- Access tokens (15 min) + httpOnly refresh tokens (30 days) via cookies,
  since there's no MERN-equivalent of NextAuth's session management.
  `role` and `approvalStatus` are baked into the access token payload, so
  they can go stale for up to 15 minutes after an admin approval — acceptable
  staleness for this use case (the refresh cycle picks up the change), and
  far simpler than a token-revocation list.

## Real-time (Socket.io) — new vs. Next.js version

- Chose Socket.io over raw WebSockets for room-based targeting (per-user
  notification rooms, per-role broadcast rooms) without hand-rolling a
  pub/sub layer.
- Emits are fired from route handlers after a successful DB write, not from
  Mongoose middleware/hooks — keeps the "what triggers a broadcast" logic
  colocated with the business logic that caused it, rather than implicit
  in schema-level hooks.
- **Not implemented**: presence indicators ("3 CPs currently viewing this
  project"), typing indicators, or optimistic UI reconciliation beyond simple
  "replace on event" — out of scope for this session.

## Payments (Razorpay) — new vs. Next.js version

- Real integration code exists end-to-end: order creation, checkout.js
  handoff, signature verification. Gracefully degrades to the same
  "simulated confirm dialog" behavior as the Next.js MVP when
  `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` aren't set — so the marketplace and
  premium-membership flows work out of the box without requiring the person
  running this to have Razorpay test credentials on hand.
- **Lead-as-a-Service priority for Premium CPs**: still FIFO over the
  unassigned-lead pool, same simplification as the Next.js version. True
  priority queueing when multiple CPs are competing for the same lead
  concurrently needs a reservation/holding mechanism or a matching worker —
  flagged as a follow-up, not silently dropped.

## File uploads (Multer) — new vs. Next.js version

- Local disk storage via Multer, abstracted behind a `fileUrl()` helper
  (`services/uploadService.ts`) so swapping to S3 later means changing one
  function, not every call site.
- MIME allowlist (PDF, JPEG, PNG, WEBP) and a 10MB size cap enforced
  server-side, not just via the file input's `accept` attribute (which is
  UX-only and trivially bypassed).

## Email (Nodemailer) — new vs. Next.js version

- Falls back to `jsonTransport` (logs instead of sending) when `SMTP_HOST`
  isn't configured, so the approval and commission-generation flows never
  hard-fail on missing email config — same graceful-degrade philosophy as
  payments.
- Email sends are fire-and-forget (`.catch(console.error)`), never awaited
  as a blocking step in the request — an SMTP outage should never prevent an
  admin from approving a user or a commission from being generated.

## Known simplifications carried over from the Next.js version

- Platform fee percent is in-memory, not persisted (`routes/admin.ts`) —
  same pragmatic MVP choice, same follow-up noted (promote to a Settings
  collection).
- Revenue forecasting on the Developer dashboard: not built.
- Password reset flow: not built, explicitly listed as a gap rather than a
  silent omission.

## New gap introduced this session

- The Developer dashboard's CP leaderboard section (present in the Next.js
  MVP) wasn't ported — time was spent instead on the CP-facing leaderboard
  and making sure it hit a real endpoint (`/api/leaderboard`) rather than
  the admin-only users endpoint I initially and incorrectly wired it to
  (caught and fixed during this session — see the leaderboard route's
  comment for why it's deliberately open to any authenticated role).
