# Truvi Marketing Operating System

## Architecture

Marketing OS extends the existing Truvi Express + PostgreSQL/Drizzle + React application. It reuses:

- Existing users authentication and role model.
- Existing employees HR profiles and Admin Employee Management workspace.
- Existing employee invitation/activation flow.
- Existing employee_tasks, multi-assignee rows, task comments/history and private attachment storage.
- Existing CRM leads, lead_activities, site_visits and commissions records.
- Existing in-app notifications, Socket.IO, audit logging, SMTP/Resend mail transport and server reminder scheduler.
- Existing project records and marketing partner campaign records.

There is no second employee directory or separate task engine.

## Workspace routes

| Audience | Route | Access |
|---|---|---|
| Admin / authorised Marketing Manager | /admin/marketing-os | Admin or employee with marketing.os.manage |
| Marketing Employee | /employee/marketing | Authenticated EMPLOYEE with permitted task access |
| Client / Marketing Partner | /marketing/partner | Invite-only MARKETING_PARTNER |
| Partner activation | /marketing/activate?token=... | Public single-use token; no session required |
| Existing HR workspace | /admin/employees | Existing Admin HR permissions |
| Existing employee workspace | /employee/dashboard | Existing Employee permissions |

The existing ADMIN role continues to cover Administrator and Founder/Super Admin access according to the current Truvi founder configuration. Marketing Manager is an explicit permission on an existing employee profile (marketing.os.manage), not a new public-signup role. MARKETING_PARTNER is a server-provisioned, invite-only role.

## Capabilities

### Employee accounts

Create and manage Marketing Employees from /admin/employees, using the existing HR profile and employee account activation flow. Existing profile fields cover name, official email, mobile, designation, department, employment type, manager, status and permissions. For Marketing Manager access add marketing.os.manage; for campaign/team read access add marketing.os.read. Existing employee permissions continue to govern personal/assigned tasks, CRM leads, attendance and payroll.

Activation invitations use the existing single-use 48-hour employee invite token and password setup screen. A direct email send is attempted first; failures are placed in the Marketing OS email outbox for automatic retry. The employee record and invitation row are not rolled back because an email provider is unavailable.

### Campaigns and attribution

Create campaigns tied to existing Truvi projects and employees. Campaigns include channel, objective, status, budget/spend, start/end dates and team assignments. Link one or more existing CRM lead UUIDs to a campaign; campaign lead counts and conversion metrics are derived from those linked CRM rows and their actual stage, not from a user-entered counter. Attribution is restricted to the campaign's selected project where one is set.

### Tasks and review

Marketing tasks use the existing employee_tasks and employee_task_assignments tables. A task can be assigned to multiple active, linked employees and shared with specific active partner accounts. The project/campaign context and deadlines are stored on the task. Employee progress is 0–100%; completing the progress report at 100% can submit it as UNDER_REVIEW. An Admin or Marketing Manager can approve the task or request revisions. Reassignment, comments, progress changes and review decisions write activity history and audit records.

PDF, JPEG, PNG and WEBP attachments use the existing private attachment endpoint (/api/employees/tasks/:id/attachments) with content/extension validation and the private upload directory. Files are never exposed as public static uploads. For production, PRIVATE_UPLOAD_DIR must point to durable private storage on the VPS.

### Client / Marketing Partner portal

Admins create partner accounts with one or more assigned projects. Partner accounts remain disabled until the partner sets a password using a single-use activation link. Project, campaign, shared-task, report-download and task-update permissions are separately configurable on the partner record. The portal only returns explicitly assigned project records and explicitly shared task records; it does not expose internal employee HR data, salary data, internal task comments or other partners' records.

The activation URL is encrypted in the email outbox using a key derived from JWT_ACCESS_SECRET. Only the SHA-256 token hash is stored in the partner invite table. Changing JWT_ACCESS_SECRET invalidates the ability to decrypt any unsent invitation payloads created using the former key; keep the production secret stable. A resend creates a new token, invalidates previous outstanding links, and requires the account to activate again.

### Analytics

The Marketing OS dashboard calculates:
- Employee task assignment, in-progress, under-review, completed and overdue counts.
- Employee work completion percentages.
- CRM leads by actual pipeline stage, logged calls and follow-up activities.
- Recorded site visits by project and responsible employee.
- Conversion rate from CRM stages BOOKING, REGISTRATION and COMPLETED.
- Attributed booking value from existing commission booking_value.
- Campaign spend from saved campaign spend records and campaign lead attribution.
- Employee performance from employee task assignments, CRM ownership/activity and site visits.

Dashboard filters include employee, project, campaign, status and date range. A missing source event is not inferred or filled with dummy data; metrics with no underlying events remain zero.

## Additive database migrations

The existing startup schema reconciler (server/src/config/db.ts) applies idempotent IF NOT EXISTS additions. It:
- Adds marketing_campaign_id, progress_percent, review actor/time/notes to employee_tasks.
- Adds project, objective and end date columns to marketing_partner_campaigns.
- Adds marketing_partner_profiles and marketing_partner_invites.
- Adds marketing_partner_projects, marketing_campaign_employees, marketing_campaign_leads and marketing_task_partners.
- Adds marketing_task_updates and marketing_os_email_outbox.
- Adds indexes for partner lookup, campaign employee/lead attribution, project assignment, task activity and due email work.
- Adds UNDER_REVIEW to the TypeScript status contract while the existing database status columns remain text.

Migrations are additive and do not delete or rewrite historical employee, lead, project, campaign, payment or commission rows. Startup logs must be reviewed after the first staging boot: the current generic schema reconciler logs individual statement failures and continues, so “server started” alone is not proof that every new table/index was created.

## Environment variables

No new Marketing OS-specific environment variable is introduced.

Use the existing deployment settings:
- DATABASE_URL: existing PostgreSQL connection.
- JWT_ACCESS_SECRET: required stable production secret; also used to encrypt invitation URLs in the outbox.
- CLIENT_URL: public web origin used to build activation URLs (production should be https://truviventures.com).
- SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, optional SMTP_FROM: existing SMTP transport.
- Or existing RESEND_API_KEY, RESEND_FROM (or configured SMTP_FROM) for Resend.
- PRIVATE_UPLOAD_DIR: durable, private storage path for employee task PDF/image attachments.

Email status SENT_TO_PROVIDER means the configured SMTP/Resend provider accepted the message; it is not proof that the recipient mailbox delivered it. Admin can inspect /api/marketing-os/outbox and retry failed/pending messages from the Admin API. Retries are bounded; invitation links expire 48 hours after issue and a fresh invitation should be sent after expiry.

## Staging validation

Use a restored staging database and synthetic accounts. Do not use production client or employee PII in tests.

1. Admin provisions an employee through /admin/employees; confirm HR profile and disabled account are created, invitation is sent or queued, and single-use activation/password setup works.
2. Confirm an employee without marketing.os.manage cannot access management endpoints or other employees' tasks; confirm a Marketing Manager permission can access the Marketing OS manager view.
3. Create a campaign linked to an existing project and employees; link actual CRM lead IDs and verify attributed leads, stage conversions and booking value.
4. Create a multi-employee task, share it with one partner, and verify each employee sees only assigned tasks.
5. Submit employee progress, submit a 100% task for review, approve it, then request a revision on a separate task; verify comments, history, audit rows and notifications.
6. Upload PDF/JPEG/PNG/WEBP attachments; confirm private authenticated download; verify invalid content/extension and oversize files are rejected.
7. Create a partner with Project A; verify it cannot see Project B, unshared tasks, employee HR details or salary. Test each partner permission toggle, link expiry, reuse of used links, account deactivation and invitation resend.
8. Confirm Socket.IO notification updates in Admin, Employee and Partner pages without manual refresh.
9. Disable the test mail provider and verify account/task writes still persist and queue retry records; re-enable email and verify provider acceptance. Test retry and terminal outbox states.
10. Verify date, employee, project, campaign and status filters against known CRM/task seed rows and confirm the performance numbers match the database records.
11. Regression-test existing signup/login, employee management, CRM leads, site visits, inventory, project listing, requirements, admin navigation and mobile layouts.

## VPS deployment

Do not deploy this branch directly to production before review and staging checks.

1. Review the PR and require all GitHub Actions checks to pass.
2. Take a PostgreSQL backup and verify a restore into a separate staging database.
3. Configure staging with the existing JWT, CLIENT_URL, SMTP or Resend, and durable PRIVATE_UPLOAD_DIR settings.
4. Deploy this branch to staging using the normal Truvi release process. Watch server logs for each ensureSchema failure and for [marketing-os] outbox worker messages.
5. Run the staging validation above, including tests with separate Admin, Marketing Manager, Employee A, Employee B, Partner A and Partner B accounts.
6. After explicit approval, merge the reviewed PR and pull the merged main branch on the VPS. Build/restart using the existing deployment script/process manager; do not overwrite local VPS configuration files or .env.
7. After restart, confirm the API health route, the new /admin/marketing-os, /employee/marketing, /marketing/partner and /marketing/activate SPA routes, a test invitation, private attachment download and email outbox state.
8. Monitor application/DB/email logs and the existing Truvi production health checks. Keep the previous application release and database backup available for rollback.

Do not automatically drop Marketing OS tables during application rollback. They contain operational activity and invitation/email evidence. Roll back the application build to the previous known-good release; only restore database state under an approved backup recovery procedure.
