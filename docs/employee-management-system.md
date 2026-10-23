# Truvi Employee Management System

## Scope and architecture

This extends the existing Truvi application rather than creating a separate app. It reuses the Express API, PostgreSQL/Drizzle database, users authentication model, employee HR records, central CRM leads table, lead activities/follow-ups, site visits, in-app notifications, and audit log service.

Employee login accounts use the existing users model with role EMPLOYEE. An employees.account_user_id foreign key links the HR profile to the authenticated account. Existing manually entered employee profiles are preserved and can be linked to a new login, avoiding duplicate HR profiles.

## Implemented surfaces

- Admin: /admin/employees — employee directory, account creation/linking and activation invitations, recruitment data, per-employee permissions, live overview, multi-employee task assignment, task history/comments/private attachments, central lead visibility, site visits, attendance correction, leave approvals, salary records/status, performance reports, and employee audit history.
- Employee: /employee/dashboard — personal overview, own/assigned tasks, private task attachments, lead submission and history, call outcome and follow-up logging, proposed site visits, check-in/out and attendance history, leave requests/cancellation, own profile, own permitted salary records, and notifications.
- Activation: /employee/activate?token=... — single-use invitation and password setup.
- Central CRM: the existing Admin Leads view now offers an Employee source filter for leads submitted by staff.
- Founder Dashboard: the existing Team module now shows linked employee account and employee activity summaries and links into the Admin EMS workspace.

## API routes

The new router is mounted at /api/employees. It includes employee overview/directory/create/update/account-link/invite/activation routes; task CRUD/status/comments/history routes; central CRM lead submission/list/update/call/follow-up/activity routes; site visit list/create/update routes; attendance list/check-in/check-out/correction routes; salary list/create/update/status routes; and Admin performance/audit endpoints.

These endpoints use the existing session and role middleware. An ordinary employee can access only their linked employee profile and authorized records. Lead reads and updates check both ownership and the matching own/assigned permission. Salary data is omitted from the employee profile API if salary.read.own is not granted. Admin-only operations validate IDs and payloads on the server.

## Schema changes

The startup schema reconciler uses additive/idempotent SQL. It adds fields to employees, leads, lead_activities, and site_visits, and creates employee_invites, employee_tasks, employee_task_history, employee_task_comments, employee_attendance, and employee_salary_records tables with indexes and uniqueness constraints. Existing HR and CRM rows are not replaced.

The activation token is randomly generated and only its SHA-256 hash is stored. It expires after 48 hours and can be used once. Passwords are bcrypt-hashed. If email cannot be sent, the API reports that delivery failed and allows an Admin to retry the invitation. A linked-account email change is blocked until it can be handled through an email-verification workflow.

## Important operational constraints

- Do not deploy to production until branch checks pass and the branch is reviewed.
- Back up the PostgreSQL database and test startup migrations against a staging copy first.
- SMTP is required for invitation delivery. Existing environment variable names are SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and optional SMTP_FROM. The client activation URL uses CLIENT_URL; otherwise it defaults to https://truviventures.com.
- The employee login role is intentionally not available through public signup. Admins provision employee accounts.
- Salary status changes do not initiate bank or UPI payouts. A record can be marked Paid only after approval and requires payment date and reference.
- Call activity is manually logged by an employee. Truvi does not covertly place or record calls.
- Unmarked attendance is not automatically treated as absence.
- Existing Founder Team employee records without login accounts remain visible as legacy profiles until linked.
- Performance is reported from actual stored events. It omits a conversion rate where the current schema/workflow does not provide a reliable conversion event.

## Validation

The GitHub Actions workflow runs server typecheck, client production build, server tests, dependency audits, and CodeQL. Leave-date validation/overlap and employee lead-access unit tests are included. Production database migration, SMTP delivery, and browser-level user journeys still require a staging environment and configured credentials.

## Safe deployment / rollback checklist

1. Review the feature branch and required GitHub Actions checks.
2. Back up production PostgreSQL and verify a staging restore is usable.
3. Configure SMTP on staging and verify the activation mail is delivered.
4. Deploy to staging, then test Admin provisioning, employee activation/login, task/lead ownership, call/follow-up logging, site visits, check-in/out, salary permission boundaries, and regression flows.
5. For production deployment, use the hosting platform's normal release process after approval; monitor server health and logs.
6. If a release needs to be rolled back, redeploy the previously known-good application build. The schema additions are additive; do not drop the new tables as an automatic rollback because they may contain employee activity history. If data rollback is required, use the verified database backup and an explicitly approved recovery plan.
