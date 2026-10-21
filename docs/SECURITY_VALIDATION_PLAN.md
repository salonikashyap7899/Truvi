# Truvi Security Validation Plan

This plan separates automated checks from tests that require a staging deployment and authorized test accounts. Run active tests only against a system and data you control. Never run destructive tests against production customer data.

## Automated checks

The GitHub Actions workflow `.github/workflows/security-validation.yml` runs on pushes, pull requests, a weekly schedule, and manual dispatch:

- Server TypeScript typecheck.
- Complete server unit test suite.
- Client production build.
- npm dependency audits for server and client; high/critical advisories fail the workflow.
- CodeQL JavaScript/TypeScript static analysis.

A green workflow is evidence only for the checked commit and its CI environment. It does not prove the production deployment, production secrets, cloud access policy, or real database are secure.

## Staging setup

Use a recent staging deployment with a non-production database and synthetic records. Create separate accounts for Admin, Program Manager, Sales Coordinator, Training Coordinator, active Ambassador A, active Ambassador B, and an unverified/inactive Ambassador. Keep credentials in the approved secret store; do not put passwords, tokens, customer PII, or payment secrets in test output.

Record the deployment commit SHA, date, test account role, endpoint, expected status, actual status, and sanitized evidence. Stop and investigate if a test unexpectedly returns sensitive data.

## Authorization and tenant isolation

- Call internal Ambassador OS APIs directly as an unauthenticated user; protected requests must return 401.
- Call staff-only routes as an ordinary Ambassador; they must return 403 or an intentional non-disclosing 404.
- Verify a Program Manager, Sales Coordinator, and Training Coordinator can access only their assigned OS capabilities.
- Verify Training Coordinator cannot view/modify incentive policy or another Ambassador's payout ledger.
- Verify Sales Coordinator cannot settle payouts or change training assessments.
- Verify Ambassador A cannot read or mutate Ambassador B's profile, leads, follow-ups, tasks, applications, or incentive records by substituting IDs.
- Revoke a staff grant and confirm the next request is denied without waiting for a new deployment.
- Verify an inactive/unverified Ambassador cannot bypass activation, training, identity, or terms gates by calling APIs directly.
- Verify errors and list endpoints do not disclose other users' record IDs or PII.

## Session, CORS, and rate limits

- Confirm production uses an explicit HTTPS `CLIENT_URL` allow-list and refuses missing/default JWT secrets.
- From an untrusted origin, credentialed API requests must not receive permissive `Access-Control-Allow-Origin` headers.
- Confirm access tokens are not persisted in localStorage; reload restores a valid session via the HTTP-only refresh cookie.
- Confirm logout clears the in-memory session and invalidates/rejects refresh as designed.
- Exercise login/OTP/password-reset limits in staging with a low, controlled number of requests; expect throttling and no OTP/account enumeration.
- Verify expired, malformed, tampered, and wrong-purpose tokens are rejected.

## Files and privacy

- Upload an allowed document as user A and verify user B cannot fetch it or obtain a signed URL.
- Verify signed private-document URLs expire, reject tampering/path traversal, and return private/no-store headers.
- Verify legacy identity-document URLs under public `/uploads` do not expose buyer documents.
- Verify uploaded HTML/SVG cannot execute active content in the trusted site origin.
- Verify rejected uploads are removed and upload limits/MIME and content checks are enforced.
- Submit a privacy request as user A; confirm only authorized staff can review it and every decision is audit logged. Do not treat request intake as automatic deletion/export completion.

## Property, leads, bookings, and payments

- Developer A cannot read or mutate Developer B's project, unit, or attached files.
- Buyers/CPs can see approved inventory only; unapproved inventory remains hidden.
- Duplicate lead submissions preserve referral attribution and do not silently transfer ownership.
- A lead or provisional booking must not count as a verified sale or payable incentive.
- Booking verification, rejection, cancellation, and refund transitions must append history and reconcile inventory exactly once.
- Payment verification must reject wrong order/user/product/amount/currency, failed or uncaptured payments, malformed signatures, and replayed state transitions.
- Use provider sandbox credentials only. Never attempt real charges or refunds as part of this checklist.

## Ambassador OS workflows

- Training requires all seven days, quiz threshold, attendance, rubric, practical and ethics approvals; a single passed quiz must not certify a profile.
- Lead submission is blocked until the current campaign rules are acknowledged and customer consent is recorded.
- Only approved, current marketing assets are visible to Ambassadors.
- Incentive policy stays inactive without a documented finance approval reference; settlement is Admin-only and audited.
- Retention execution fails closed without an active approved policy and required confirmation/reference.
- Career progression, leaderboard, and opportunity application responses must not reveal private details belonging to other Ambassadors.

## Infrastructure release gates (manual evidence required)

- Review production environment variable names/presence without printing secret values.
- Confirm database access is limited to the application and approved operators; rotate exposed credentials.
- Confirm backups/PITR, monitoring, alerting, RPO/RTO and retention are configured with the hosting provider.
- Perform a restore-to-staging drill and reconcile accounts, leads, bookings, incentive ledger, and audit continuity.
- Confirm production migration status and private-document migration counts; inspect CDN cache policy and purge previously public identity-document URLs after migration.
- Obtain explicit business/finance/privacy approval for incentive amounts, scorecard weights, marketing content and retention schedules.

## Completion criteria

Do not label the application “security certified” based only on CI. Mark a test pass only with evidence from the current commit and intended environment. Any unexpected 200 response, cross-user record disclosure, permissive CORS, payment state change without provider verification, or public identity-document access is a release blocker.
