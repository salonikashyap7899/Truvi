# Production recovery, email, monitoring and database security

**Scope:** operational steps for the Truvi API and its Supabase PostgreSQL database.  
**Important:** these procedures do not change production hosting or database permissions by themselves. Run read-only audits first. Apply database changes only in staging, after a verified backup and workflow tests.

## 1. Transactional email

The application supports two outbound transactional email transports:

- **SMTP:** set all of `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`. Set `SMTP_FROM` to the sender authorised by that provider.
- **Resend:** set `RESEND_API_KEY` and `RESEND_FROM`. `RESEND_FROM` must be an address/domain verified in the Resend account. Use a sender such as `Truvi Ventures <notifications@your-verified-domain>`; do not use an unverified Gmail address as a Resend sender.

When complete SMTP configuration exists, SMTP remains primary. When SMTP is absent, Resend is used for transactional mail too (OTP, reset, account, enquiry and related messages). Property-match email can continue to explicitly select Resend and its idempotency key. A provider accepting a message does not prove inbox delivery.

After adding the variables to the VPS secret/environment settings, restart only the Truvi API process in the normal deployment procedure. Send one controlled test to a mailbox you own:

```bash
cd server
EMAIL_TEST_TO="you-control@example.com" npm run email:smoke
```

Confirm the message arrives in Inbox or Spam and inspect the provider delivery event. Do not test against a real customer's address. The smoke test prints no API key or password.

## 2. External error monitoring (Sentry)

1. Create a Sentry **Node.js** project for Truvi.
2. Store its DSN as the server-side secret `SENTRY_DSN` on the VPS. Set `SENTRY_ENVIRONMENT=production`.
3. Never place the Sentry DSN, SMTP password, Resend API key, database URL, JWT secret or provider credentials in `VITE_*` variables or in Git.
4. The Node process initializes Sentry before loading the API. Server 500s, startup/fatal process errors and sanitized browser diagnostics are reported. Browser errors are relayed through `/api/telemetry/frontend-error` so the browser does not need a public Sentry DSN.
5. The telemetry route is rate-limited and rejects unknown fields. It strips common email/phone/ID patterns and removes query strings. Request bodies, cookies, bearer tokens and user identity are not forwarded.

After staging deployment, trigger a harmless test exception on staging and confirm it appears in the Sentry project with the correct environment. Do not trigger test exceptions on the live site. When no DSN is configured, the API logs a warning and sanitized browser errors are written to application logs; external monitoring is not active until the DSN is supplied.

## 3. Supabase database backup inventory

The repository cannot enable a Supabase backup plan or purchase a PITR add-on on your behalf. Backup availability and retention depend on the Supabase plan and project configuration. Database backups do **not** include objects stored through Supabase Storage; back up the Truvi VPS upload directories and other file stores separately.

Create a Supabase Management API token with the least privilege needed to read backups (fine-grained `backups_read` permission), and configure these secrets only for the audit session/approved secret store:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`

Run the read-only inventory check:

```bash
cd server
npm run db:backup-audit
```

It reports whether the Management API lists a completed backup within the last 36 hours and whether PITR is enabled. A pass is only evidence that a recent backup is listed; it is **not** a restore test.

Required release evidence:
- Confirm the plan's backup frequency, retention and PITR setting in the Supabase dashboard.
- Restore a recent backup to a **separate staging project**, never over production for a test.
- Verify login, projects, inventory/units, buyer requirements, leads, site visits, payments/ledger records, consent/audit records and document references on the restored staging copy.
- Separately restore-test uploaded brochures, project images, site-visit photos and private buyer documents from the VPS/file-store backup.
- Record the restore date, backup timestamp, operator and result, and agree business RPO/RTO.

## 4. PostgreSQL privileges and RLS

Truvi's current frontend calls the Express API; the application uses server-side Drizzle/PostgreSQL. A server-side database role that has `BYPASSRLS` (or is a superuser/table owner) does not gain row isolation from RLS for its own SQL. Backend `authenticate` and `requireRole` checks remain essential. RLS is still important to prevent accidental access through Supabase's exposed API roles.

First run the **read-only** audit using the same server database connection:

```bash
cd server
npm run db:security-audit
```

Review:
- whether `anon`, `authenticated` or `PUBLIC` have table, sequence or function privileges in the `public` schema;
- which tables have RLS and policies;
- whether the application database role bypasses RLS;
- whether a browser app, integration, Edge Function or external consumer uses Supabase PostgREST directly.

A gated lockdown utility is available:

```bash
cd server
APPLY_PUBLIC_API_ROLE_LOCKDOWN=true npm run db:lockdown-public-api
```

**Do not run this against production as a first step.** It enables RLS on public tables and revokes table/sequence/function privileges from `PUBLIC`, `anon` and `authenticated`; it deliberately leaves the backend role's privileges unchanged. It does not create per-user policies. It is only appropriate if all user data access is through the authorised Express API and the verified backend connection bypasses RLS. Direct browser/PostgREST clients or integrations may stop working. Test on a staging clone and run the complete journey suite before any production change. Do not grant service-role credentials to a browser.

If direct PostgREST access is needed, design and test table-specific policies based on the actual JWT claims and ownership model; do not apply a blanket `USING (true)` policy.

## 5. HTTP 404 handling

The Express/VPS host now serves the SPA shell for known React routes with HTTP 200 and serves the same branded shell with HTTP 404 for unknown extensionless routes. Missing assets and API endpoints retain real 404 responses. Keep `server/src/lib/spaRoutes.ts` synchronized with routes in `client/src/App.tsx` when adding pages.

The repository also contains `client/vercel.json` with a catch-all SPA rewrite. That hosting configuration is separate from the Express fallback; if Vercel is used to serve production, run a live 404 status check on the Vercel deployment too and configure equivalent edge routing before relying on this fix there.

## 6. Fatal process failures

The API now handles uncaught exceptions and unhandled rejections as fatal: it stops accepting traffic, closes the HTTP server, disconnects the database, attempts to flush Sentry, and exits non-zero. PM2/systemd must be configured to restart the Truvi process on a non-zero exit and to keep restart limits/backoff sensible. Verify with a staging-only controlled crash and confirm the process restarts and `/health` becomes ready again.

Do not suppress unhandled rejections by continuing to serve requests in an unknown process state.

## 7. Required post-change staging checks

- SMTP/Resend controlled email smoke test; then real OTP/reset/employee-invite flows using test accounts.
- Sentry staging event appears with no email, phone, tokens, passwords, query secrets or request body.
- Read-only database security and backup inventory audits.
- Backup restore to a separate staging database and restore of file uploads.
- Signup, login, role access, inventory, requirements, leads, site visits, employee workflows, notifications and payment test-mode flows.
- HTTP status checks: known SPA deep link = 200; random unknown SPA path = 404 HTML; unknown API path = 404 JSON; missing JS/CSS asset = 404.
- Simulated fatal failure on staging: process exits non-zero, process manager restarts it, and health returns healthy after database initialization.

A green build is not evidence that provider credentials, backup plans, restore points, VPS process-manager settings or production data permissions are configured correctly.
