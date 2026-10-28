# Truvi Requirement Sharing and Property-Match Notifications

## New requirement intake alerts

When a requirement is saved successfully, Truvi keeps it in PostgreSQL, queues property matching, sends an in-app notification to users with the ADMIN role, and attempts an internal team email. This applies to buyer requirements and to lead requirements submitted by authorized partners, developers, ambassadors, and employees with the existing permission.

- The internal alert is sent from Truvi's configured SMTP_FROM identity using the existing SMTP transport.
- The default requirement-alert recipient is `truviventures@gmail.com`. Set `REQUIREMENT_TEAM_EMAIL` in the backend `server/.env` to override it; a comma- or semicolon-separated recipient list is supported. `TEAM_EMAIL` is also accepted as an alias.
- `SMTP_USER` is the sender's SMTP login, not the destination mailbox. Changing only the team email address does not configure an email transport: the backend must also have valid `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASSWORD`, plus an authorized `SMTP_FROM` sender.
- SMTP settings are loaded when the server process starts. After changing `server/.env`, restart/redeploy the backend and submit a fresh test requirement.
- The submitting account's registered email is used as Reply-To when valid. Truvi remains the sender; the service does not forge the submitter's address in the From header.
- Internal team alert subject includes the requirement title, submitter account email, and Truvi Ventures brand. The branded email header highlights the submitter's registered name/email and links to `truviventures.com`; the admin-only details table still includes the submitter and requirement context.
- Third-party client name, phone, and email are included in the internal team alert only when contact consent is recorded. The public noticeboard remains privacy-safe, and full details remain in the admin-protected requirement view.
- Admin in-app and team-email attempts are recorded in requirement activity history as ADMIN_NOTIFICATION_* and TEAM_EMAIL_* events. An email failure does not invalidate the saved requirement.
- The account that submitted a requirement also receives a separate receipt email at its registered account email when that address is valid and the backend mail transport is configured. Confirmation attempts are recorded as SUBMITTER_CONFIRMATION_EMAIL_* events independently of the team alert.
- Submitter confirmations include only the receipt/reference and a limited summary of that submitter's request. They do not include third-party client contact information, private details/CRM notes, or internal moderation data. The email is a receipt only; it does not promise availability or booking.
- Team intake alerts use existing SMTP. The optional Resend API key remains scoped to property-match emails and the delivery webhook; OTP and other existing transactional email flows are unchanged.

### Admin workflow

1. Open Admin dashboard → Requirement moderation at /admin/requirements. The queue is ordered newest-first and supports search, status and submitter-role filters, and pagination.
2. Review the submitter and any consented client details. Check possible duplicates and inspect activity history.
3. Add a moderation note and choose the appropriate status. Every moderation change is audit-logged.
4. Monitor match and email KPI counts. Provider acceptance is not the same as confirmed mailbox delivery; only valid signed provider events confirm Resend match-email delivery.
5. If a team alert fails, the saved requirement remains in the admin queue and the activity history records the result. Check SMTP configuration and server logs without printing secrets.

## Feature behavior

- Requirements are submitted through the authenticated `/requirements` page and are stored even if no current listing matches.
- The noticeboard returns a purpose-built summary. It does not return client phone numbers, emails, account IDs, or private notes.
- Channel Partner / employee lead submissions require an explicit client-consent attestation before private client contact information can be saved.
- Matching jobs are stored in PostgreSQL and processed by the server's background worker. Match rows have a unique requirement/project key; email attempts are claimed in the database and have bounded retries.
- In-app notifications use Truvi's existing notification engine and read/unread history.
- WhatsApp messages for property-match events are intentionally excluded, even if the environment's general `WHATSAPP_EVENTS` list is overridden. They remain disabled until Truvi adds a dedicated channel preference/consent flow and approved template; this does not disable existing developer WhatsApp events.

## Email provider configuration

The existing SMTP integration remains supported. The optional Resend provider is used only when `RESEND_API_KEY` is set; if it is absent, Truvi falls back to the current SMTP transport.

### Quick configuration checklist for the Truvi team inbox

In the backend `server/.env`, configure the recipient and the actual SMTP sender transport. Keep the SMTP password private and do not commit `.env`:

```dotenv
REQUIREMENT_TEAM_EMAIL=truviventures@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=truviventures@gmail.com
SMTP_PASSWORD=<mailbox-provider SMTP credential>
SMTP_FROM="Truvi Ventures <truviventures@gmail.com>"
```

The example uses Gmail SMTP. Use the mailbox provider's supported SMTP credential (for Google accounts, this may require a Google App Password) and confirm the sender identity is authorized. Do not use the ordinary account password if the provider requires an app-specific credential. If an external transactional email provider is used, use its SMTP host, port, credentials, and verified sender instead.

After updating the environment file, restart the backend process. A successful SMTP send means the provider accepted the message; it is not proof that Gmail placed it in the inbox. Test with a new submission and check Spam, server logs, and the saved requirement's activity history for `TEAM_EMAIL_SENT_TO_PROVIDER`, `TEAM_EMAIL_UNCONFIGURED`, or `TEAM_EMAIL_FAILED`.

### Option A: existing SMTP

Configure the variables already used by Truvi:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM` (sender identity; optional in code, but set it explicitly in production)

Successful SMTP submission is recorded as `SENT_TO_PROVIDER`. Generic SMTP does not confirm that the recipient's mailbox accepted the message, so it must not be counted as `DELIVERED`.

### Option B: Resend with delivery confirmation

1. Create/verify a sending domain in Resend.
2. Set server-side environment variables:
   - `RESEND_API_KEY`
   - `RESEND_WEBHOOK_SECRET` (the signing secret starting with `whsec_`, copied from the Resend webhook configuration)
   - `SMTP_FROM` set to an address on the verified sending domain, such as `Truvi Notifications <notifications@your-verified-domain.example>`
3. Register an HTTPS webhook pointing to:

   `https://truviventures.com/api/webhooks/resend`

4. Subscribe to these event types:
   - `email.sent`
   - `email.delivered`
   - `email.bounced`
   - `email.complained`
   - `email.failed`
   - `email.delivery_delayed`

5. Restart/redeploy the API after setting the variables. Send a test from a staging/test account, verify the Resend webhook logs and confirm the match row changes to `DELIVERED` only after Resend posts a valid signed `email.delivered` event.

The webhook is mounted with a raw-body parser before global JSON parsing, verifies the Svix/Resend signature and a five-minute timestamp window, and deduplicates provider events using the signed `svix-id`. Event records store provider IDs/status only—not the email body or recipient address.

When `RESEND_API_KEY` is configured, Resend is used **only for property-match recommendation emails**. Existing account OTP, password-reset, approval, commission, and other transactional messages continue to use Truvi's existing SMTP transport. If SMTP is not configured, those existing email flows will remain unconfigured even if a Resend key is present.

A property-match send uses Resend when `RESEND_API_KEY` is configured and otherwise uses SMTP. If a Resend request fails after selection, the worker does not fall back to SMTP, avoiding accidental duplicate sends. Remove `RESEND_API_KEY` to keep property-match mail on SMTP.

**Retry/idempotency guarantee:** matching rows, queue jobs and in-app events are deduplicated in PostgreSQL. When Resend is selected, a stable provider idempotency key protects retries of the same message. SMTP transports do not expose the same idempotency contract through this integration; bounded retry and database claims reduce duplicates, but an ambiguous SMTP disconnect after provider acceptance cannot be guaranteed at-most-once. Use Resend when provider-level retry idempotency and delivery-event confirmation are required.

## Notification preferences

Property recommendation in-app and email preferences are managed through the existing authenticated notification preference endpoints and the `/settings/notifications` screen. WhatsApp is presented as unavailable for property recommendations until a provider/event route is implemented and configured.

## Database and worker

The server applies additive, repeatable SQL for the new requirement, match, queue, response, event and delivery-event tables at boot. It does not drop or truncate existing records. The match worker runs inside the existing Node service; job claims and match uniqueness are persisted in PostgreSQL to make repeated processing safe.

Do not run `drizzle-kit push` against production solely for this feature without reviewing the generated diff first. The startup reconciliation is the intended additive bootstrap for these tables.

## VPS rollout after review

Do not deploy this draft branch directly. After the PR is approved/merged, the latest-head checks are green, and a backup is verified:

1. Open the VPS repository and inspect it without modifying files:
   ```bash
   cd /root/Truvi
   git branch --show-current
   git status --short --untracked-files=all
   pm2 list
   ```
2. Stop if the branch is not `main`, the working tree is not clean, or the PM2 processes have not been identified. Do not use `git clean`, overwrite `.env`, or delete backup files to make the deploy proceed.
3. The existing `bash deploy.sh` script validates a clean `main` checkout and incoming removals, then builds/restarts. **It currently runs `pm2 restart all`**, so use it only if every PM2 process on that VPS can safely be restarted as part of this Truvi deployment.
4. If the VPS runs other PM2 applications, follow the same clean-checkout, fetch, incoming-diff review, and fast-forward checks in `deploy.sh`, but build the server/client and restart only the confirmed Truvi process shown by `pm2 list`. Do not copy an unreviewed shell block from chat over the existing deploy script.
5. After restart, check the configured local API health URL (the deploy script uses `http://127.0.0.1:$PORT/health`), then verify the public website, authentication, navbar/profile, Buyer/CP/Developer/Ambassador dashboard links, noticeboard, notification bell, and project detail/enquiry flow.

The application startup reconciler creates the feature's additive tables. Do not run `drizzle-kit push` in production for this feature without a separately reviewed schema diff; preserve the existing tables and data during rollback.

## Production safety and rollback

- Do not merge the draft PR until the current-head server typecheck/tests, client lint/build, security validation, and read-only production QA have been reviewed.
- Back up the existing PostgreSQL database using the configured managed-database/backup procedure before rollout; don't copy secrets into issue comments or commit them.
- The feature has not been deployed by this branch workflow.
- To disable Resend delivery, remove `RESEND_API_KEY` and restart the API; the existing SMTP path will be used if its credentials are present.
- To revert the whole feature after a release, roll the application back to the previously deployed commit and preserve the newly created tables/rows. Do not manually drop the feature's tables or delete requirement records as part of rollback.
