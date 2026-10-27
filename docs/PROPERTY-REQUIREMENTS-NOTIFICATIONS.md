# Truvi Requirement Sharing and Property-Match Notifications

## Feature behavior

- Requirements are submitted through the authenticated `/requirements` page and are stored even if no current listing matches.
- The noticeboard returns a purpose-built summary. It does not return client phone numbers, emails, account IDs, or private notes.
- Channel Partner / employee lead submissions require an explicit client-consent attestation before private client contact information can be saved.
- Matching jobs are stored in PostgreSQL and processed by the server's background worker. Match rows have a unique requirement/project key; email attempts are claimed in the database and have bounded retries.
- In-app notifications use Truvi's existing notification engine and read/unread history.
- WhatsApp messages for property-match events are intentionally excluded, even if the environment's general `WHATSAPP_EVENTS` list is overridden. They remain disabled until Truvi adds a dedicated channel preference/consent flow and approved template; this does not disable existing developer WhatsApp events.

## Email provider configuration

The existing SMTP integration remains supported. The optional Resend provider is used only when `RESEND_API_KEY` is set; if it is absent, Truvi falls back to the current SMTP transport.

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

When `RESEND_API_KEY` is configured, Resend is the email provider for the existing email service as well as property recommendations. A Resend API failure does not silently fall back to SMTP (which could create duplicates). Remove `RESEND_API_KEY` to return to the existing SMTP path.

## Notification preferences

Property recommendation in-app and email preferences are managed through the existing authenticated notification preference endpoints and the `/settings/notifications` screen. WhatsApp is presented as unavailable for property recommendations until a provider/event route is implemented and configured.

## Database and worker

The server applies additive, repeatable SQL for the new requirement, match, queue, response, event and delivery-event tables at boot. It does not drop or truncate existing records. The match worker runs inside the existing Node service; job claims and match uniqueness are persisted in PostgreSQL to make repeated processing safe.

Do not run `drizzle-kit push` against production solely for this feature without reviewing the generated diff first. The startup reconciliation is the intended additive bootstrap for these tables.

## Production safety and rollback

- Do not merge the draft PR until the current-head server typecheck/tests, client lint/build, security validation, and read-only production QA have been reviewed.
- Back up the existing PostgreSQL database using the configured managed-database/backup procedure before rollout; don't copy secrets into issue comments or commit them.
- The feature has not been deployed by this branch workflow.
- To disable Resend delivery, remove `RESEND_API_KEY` and restart the API; the existing SMTP path will be used if its credentials are present.
- To revert the whole feature after a release, roll the application back to the previously deployed commit and preserve the newly created tables/rows. Do not manually drop the feature's tables or delete requirement records as part of rollback.
