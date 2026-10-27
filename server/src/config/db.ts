import type { Db } from "../db";
import { connectDb, closeDb, getDb } from "../db";
import { VERIFICATION_BOOT_SQL, ensureVerificationDefaults } from "../db/verificationBootSql";
import { ensureDefaultFounder, FounderProvisioningConfigError } from "../db/bootstrapFounder";

let isConnected = false;
let connectionError: Error | null = null;

/**
 * Idempotent, additive schema reconciliation run on every boot so a deploy
 * doesn't require a manual `drizzle-kit push` for newly-added columns. Only
 * ever ADDs columns with `IF NOT EXISTS` (never drops/alters), so it's safe to
 * run repeatedly and can't lose data. Keep each statement in sync with the
 * Drizzle schema (same column name/type/default) so a later `drizzle-kit push`
 * sees them as already-present.
 */
async function ensureSchema(db: Db): Promise<void> {
  const statements = [
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean NOT NULL DEFAULT true`,
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone_verified" boolean NOT NULL DEFAULT true`,
    // Admin can deactivate ("remove") an account without destroying its history.
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "disabled" boolean NOT NULL DEFAULT false`,
    // Refresh-token invalidation after password reset; must exist before any users query.
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "auth_version" integer NOT NULL DEFAULT 0`,
    // Persistent OTP lockout counters survive PM2 restarts and are shared across API workers.
    // Additive/idempotent: this stores only attempt metadata, not OTP values or user records.
    `CREATE TABLE IF NOT EXISTS "otp_attempts" (
       "identity_key" text PRIMARY KEY,
       "failure_count" integer NOT NULL DEFAULT 0,
       "window_started_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "otp_attempts_updated_idx" ON "otp_attempts" ("updated_at")`,
    // Personal profile: avatar image URL + short bio, editable from dashboard settings.
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" text`,
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bio" text`,
    // Mandatory WhatsApp-updates-channel join for Channel Partners (gates the CP
    // workspace alongside KYC).
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "whatsapp_channel_joined" boolean NOT NULL DEFAULT false`,
    // Developer-managed project details + legal-doc verification gate.
    `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "possession_date" timestamptz`,
    // Sales availability is independent of project approval and preserves the listing.
    `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "availability_status" text NOT NULL DEFAULT 'AVAILABLE'`,
    // Habitat eligibility is opt-in per project; existing approved listings
    // remain outside the services marketplace until an admin enables them.
    `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "habitat_enabled" boolean NOT NULL DEFAULT false`,
    `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "habitat_enabled_at" timestamptz`,
    `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "habitat_enabled_by_id" uuid REFERENCES "users"("id")`,
    // Which body approved the project (RERA / District Panchayat / DTCP), so a
    // non-RERA-registered but validly-approved layout can still be listed.
    `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "approval_authority" text`,
    // Developer-declared total plots/units, shown when per-unit inventory is sparse.
    `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "total_units" integer`,
    // Admin's manual Truvi Score adjustment (+/− points) and its reason.
    `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "score_adjustment" integer NOT NULL DEFAULT 0`,
    `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "score_adjustment_reason" text`,
    `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "score_adjusted_at" timestamptz`,
    // GIS map coordinates (pin picker on the project form).
    `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "lat" double precision`,
    `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "lng" double precision`,
    `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "sales_contact" jsonb`,
    `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "payment_plans" jsonb`,
    // Admin-curated, Truvi-verified ownership history + appreciation forecast.
    `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "owner_history" jsonb`,
    `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "appreciation_forecast" jsonb`,
    // Developer-reported construction progress + milestones.
    `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "construction_status" text`,
    `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "construction_progress" integer`,
    `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "milestones" jsonb`,
    // Admin marks this once the Truvi team has physically visited the site;
    // feeds a +20 verification check into the Trust Score (seeded just below).
    `ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "team_site_visited" boolean NOT NULL DEFAULT false`,
    // Seed the physical-site-visit Trust Score check once (weight 20). Idempotent
    // via NOT EXISTS so it is never duplicated; admins can edit its weight later.
    `INSERT INTO verification_checks (name, category, weight, enabled, sql_query, description)
     SELECT 'Physical Site Visit (Truvi Team)', 'physical', 20, true,
            'SELECT coalesce((SELECT team_site_visited FROM projects WHERE id=$1), false) AS passed',
            'The Truvi team has physically visited and inspected the site.'
     WHERE NOT EXISTS (SELECT 1 FROM verification_checks WHERE name = 'Physical Site Visit (Truvi Team)')`,
    `ALTER TABLE "project_assets" ADD COLUMN IF NOT EXISTS "verified" boolean NOT NULL DEFAULT true`,
    // AI visual-quality score (0–100) for gallery images → automatic best-cover.
    `ALTER TABLE "project_assets" ADD COLUMN IF NOT EXISTS "ai_score" double precision`,
    // Optional plot size / dimensions per unit (e.g. "30x40 ft", "200 sq.yd").
    `ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "plot_size" text`,
    `ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "map_x" double precision`,
    `ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "map_y" double precision`,
    // CP CRM (paid tier): lead tags + activity/follow-up/task tables.
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "tags" jsonb`,
    // Founder analytics: lost-deal reason + first-response time on leads.
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "lost_reason" text`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "first_contacted_at" timestamptz`,
    // Active-user tracking (MAU/DAU) and customer-experience (NPS/complaints).
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_active_at" timestamptz`,
    // Lifecycle emails: welcome (sent once on first full verification) and the
    // throttled "finish your setup" reminder (verification / KYC / plan).
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "welcome_email_sent_at" timestamptz`,
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_reminder_at" timestamptz`,
    `CREATE TABLE IF NOT EXISTS "customer_feedback" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "kind" text NOT NULL DEFAULT 'NPS',
       "customer_name" text,
       "score" integer,
       "note" text,
       "status" text NOT NULL DEFAULT 'OPEN',
       "resolved_at" timestamptz,
       "created_by_id" uuid,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE TABLE IF NOT EXISTS "lead_activities" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "lead_id" uuid NOT NULL REFERENCES "leads"("id"),
       "cp_id" uuid NOT NULL REFERENCES "users"("id"),
       "type" text NOT NULL,
       "content" text NOT NULL,
       "metadata" jsonb,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "lead_activities_lead_idx" ON "lead_activities" ("lead_id", "created_at")`,
    `CREATE INDEX IF NOT EXISTS "lead_activities_cp_idx" ON "lead_activities" ("cp_id", "created_at")`,
    `CREATE TABLE IF NOT EXISTS "lead_follow_ups" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "lead_id" uuid NOT NULL REFERENCES "leads"("id"),
       "cp_id" uuid NOT NULL REFERENCES "users"("id"),
       "due_at" timestamptz NOT NULL,
       "channel" text NOT NULL DEFAULT 'CALL',
       "note" text,
       "status" text NOT NULL DEFAULT 'PENDING',
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "lead_follow_ups_cp_status_idx" ON "lead_follow_ups" ("cp_id", "status", "due_at")`,
    `CREATE INDEX IF NOT EXISTS "lead_follow_ups_lead_idx" ON "lead_follow_ups" ("lead_id")`,
    `CREATE TABLE IF NOT EXISTS "crm_tasks" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "cp_id" uuid NOT NULL REFERENCES "users"("id"),
       "lead_id" uuid REFERENCES "leads"("id"),
       "title" text NOT NULL,
       "due_at" timestamptz,
       "priority" text NOT NULL DEFAULT 'MEDIUM',
       "status" text NOT NULL DEFAULT 'OPEN',
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "crm_tasks_cp_status_idx" ON "crm_tasks" ("cp_id", "status")`,
    // Admin-managed Learning Academy content (videos + PDFs) shown to CPs.
    `CREATE TABLE IF NOT EXISTS "academy_content" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "course_id" text NOT NULL,
       "title" text NOT NULL,
       "type" text NOT NULL,
       "url" text NOT NULL,
       "description" text,
       "duration" text,
       "sort_order" integer NOT NULL DEFAULT 0,
       "created_by_id" uuid REFERENCES "users"("id"),
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "academy_content_course_idx" ON "academy_content" ("course_id", "sort_order")`,
    // English transcript for Hindi voice-note lessons.
    `ALTER TABLE "academy_content" ADD COLUMN IF NOT EXISTS "transcript_en" text`,
    // Per-listing discussion (channel partners / team). Name stays private — the
    // UI shows an avatar + short user id only.
    `CREATE TABLE IF NOT EXISTS "project_comments" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "project_id" uuid NOT NULL REFERENCES "projects"("id"),
       "user_id" uuid NOT NULL REFERENCES "users"("id"),
       "parent_id" uuid REFERENCES "project_comments"("id"),
       "body" text NOT NULL,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "project_comments_project_idx" ON "project_comments" ("project_id", "created_at")`,
    // Brochure view/download analytics (the brochure file itself is a
    // project_assets row of category "BROCHURE").
    `CREATE TABLE IF NOT EXISTS "brochure_events" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "project_id" uuid NOT NULL REFERENCES "projects"("id"),
       "asset_id" uuid,
       "user_id" uuid REFERENCES "users"("id"),
       "role" text,
       "event_type" text NOT NULL,
       "platform" text,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "brochure_events_project_idx" ON "brochure_events" ("project_id", "event_type", "created_at")`,
    // Masked-call log (CP → Developer via a Truvi virtual number). Real numbers
    // are never stored — only the provider's call id + the virtual number.
    `CREATE TABLE IF NOT EXISTS "calls" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "project_id" uuid NOT NULL REFERENCES "projects"("id"),
       "cp_id" uuid NOT NULL REFERENCES "users"("id"),
       "developer_id" uuid NOT NULL REFERENCES "users"("id"),
       "provider" text NOT NULL DEFAULT 'exotel',
       "provider_call_id" text,
       "virtual_number" text,
       "status" text NOT NULL DEFAULT 'INITIATED',
       "started_at" timestamptz,
       "ended_at" timestamptz,
       "duration_sec" integer,
       "recording_url" text,
       "recording_id" text,
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "calls_project_idx" ON "calls" ("project_id", "created_at")`,
    `CREATE INDEX IF NOT EXISTS "calls_developer_idx" ON "calls" ("developer_id", "created_at")`,
    `CREATE INDEX IF NOT EXISTS "calls_cp_idx" ON "calls" ("cp_id", "created_at")`,
    `CREATE INDEX IF NOT EXISTS "calls_provider_call_idx" ON "calls" ("provider_call_id")`,
    // Discount vouchers (coupon codes) + the columns that record a voucher on a
    // payment. Validated & applied server-side so a discount can't be forged.
    `CREATE TABLE IF NOT EXISTS "vouchers" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "code" text NOT NULL,
       "description" text,
       "discount_type" text NOT NULL DEFAULT 'PERCENT',
       "discount_value" integer NOT NULL DEFAULT 0,
       "max_discount_paise" integer,
       "plan_ids" jsonb,
       "category" text,
       "max_redemptions" integer,
       "redeemed_count" integer NOT NULL DEFAULT 0,
       "min_amount_paise" integer NOT NULL DEFAULT 0,
       "active" boolean NOT NULL DEFAULT true,
       "expires_at" timestamptz,
       "created_by_id" uuid REFERENCES "users"("id"),
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "vouchers_code_idx" ON "vouchers" ("code")`,
    `ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "voucher_code" text`,
    `ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "discount_paise" integer NOT NULL DEFAULT 0`,
    // Project landing-page leads are phone-first: add a phone column and drop the
    // NOT NULL on email so a lead can arrive with only name + phone.
    `ALTER TABLE "enquiries" ADD COLUMN IF NOT EXISTS "phone" text`,
    `ALTER TABLE "enquiries" ALTER COLUMN "email" DROP NOT NULL`,
    // Config tables ensureVerificationDefaults depends on — created here too so
    // a deploy without `drizzle-kit push` never spams boot warnings.
    `CREATE TABLE IF NOT EXISTS "score_thresholds" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "verified_min" integer NOT NULL DEFAULT 85,
       "pending_min" integer NOT NULL DEFAULT 50,
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE TABLE IF NOT EXISTS "ai_prompts" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "name" text NOT NULL,
       "system_prompt" text NOT NULL,
       "active" boolean NOT NULL DEFAULT false,
       "version" integer NOT NULL DEFAULT 1,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    // Founder-only operating modules (Team, Marketing, Land Bank, Investor).
    `CREATE TABLE IF NOT EXISTS "employees" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "name" text NOT NULL,
       "title" text,
       "department" text NOT NULL DEFAULT 'General',
       "status" text NOT NULL DEFAULT 'ACTIVE',
       "present_today" boolean NOT NULL DEFAULT true,
       "performance_score" integer NOT NULL DEFAULT 0,
       "tasks_pending" integer NOT NULL DEFAULT 0,
       "monthly_ctc" double precision NOT NULL DEFAULT 0,
       "joined_at" timestamptz NOT NULL DEFAULT now(),
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE TABLE IF NOT EXISTS "marketing_campaigns" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "name" text NOT NULL,
       "channel" text NOT NULL DEFAULT 'Other',
       "status" text NOT NULL DEFAULT 'ACTIVE',
       "spend" double precision NOT NULL DEFAULT 0,
       "leads" integer NOT NULL DEFAULT 0,
       "conversions" integer NOT NULL DEFAULT 0,
       "revenue" double precision NOT NULL DEFAULT 0,
       "started_at" timestamptz,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE TABLE IF NOT EXISTS "land_parcels" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "name" text NOT NULL,
       "location" text NOT NULL,
       "area" double precision NOT NULL DEFAULT 0,
       "area_unit" text NOT NULL DEFAULT 'ACRE',
       "status" text NOT NULL DEFAULT 'OPPORTUNITY',
       "estimated_value" double precision NOT NULL DEFAULT 0,
       "due_diligence_done" boolean NOT NULL DEFAULT false,
       "priority" text NOT NULL DEFAULT 'MEDIUM',
       "notes" text,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE TABLE IF NOT EXISTS "cap_table_entries" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "holder_name" text NOT NULL,
       "holder_type" text NOT NULL DEFAULT 'INVESTOR',
       "equity_percent" double precision NOT NULL DEFAULT 0,
       "invested_amount" double precision NOT NULL DEFAULT 0,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE TABLE IF NOT EXISTS "fundraise_rounds" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "name" text NOT NULL,
       "target_amount" double precision NOT NULL DEFAULT 0,
       "committed_amount" double precision NOT NULL DEFAULT 0,
       "valuation" double precision NOT NULL DEFAULT 0,
       "status" text NOT NULL DEFAULT 'OPEN',
       "close_date" timestamptz,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE TABLE IF NOT EXISTS "investor_updates" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "title" text NOT NULL,
       "body" text,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    // Command Center financials: salary-payment tracking on employees + the
    // founder-entered investment / revenue / recurring-payment ledgers.
    `ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "salary_paid_for_month" text`,
    `ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "salary_due_day" integer NOT NULL DEFAULT 1`,
    `ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "salary_start_date" timestamptz`,
    `ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "notes" text`,
    `CREATE TABLE IF NOT EXISTS "employee_payments" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "employee_id" uuid NOT NULL REFERENCES "employees"("id"),
       "month_key" text NOT NULL,
       "amount" double precision NOT NULL DEFAULT 0,
       "note" text,
       "paid_at" timestamptz NOT NULL DEFAULT now(),
       "created_by_id" uuid REFERENCES "users"("id"),
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "employee_payments_employee_idx" ON "employee_payments" ("employee_id", "month_key")`,
    // Employee Management System: link existing HR records to authenticated users.
    // All changes are additive/idempotent; existing manually entered employees remain intact.
    `ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "account_user_id" uuid REFERENCES "users"("id")`,
    `ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "employee_code" text`,
    `ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "official_email" text`,
    `ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "phone" text`,
    `ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "employment_type" text NOT NULL DEFAULT 'FULL_TIME'`,
    `ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "reporting_manager_id" uuid REFERENCES "users"("id")`,
    `ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "recruitment_source" text`,
    `ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "recruitment_campaign" text`,
    `ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "application_date" timestamptz`,
    `ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "interview_date" timestamptz`,
    `ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "permissions" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "employees_account_user_unique" ON "employees" ("account_user_id") WHERE "account_user_id" IS NOT NULL`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "employees_employee_code_unique" ON "employees" ("employee_code") WHERE "employee_code" IS NOT NULL`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "lead_temperature" text`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "preferred_location" text`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "preferred_property_type" text`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "preferred_contact_method" text`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "site_visit_status" text`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "last_contact_at" timestamptz`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "follow_up_notes" text`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "additional_requirements" text`,
    `ALTER TABLE "site_visits" ADD COLUMN IF NOT EXISTS "responsible_user_id" uuid REFERENCES "users"("id")`,
    `ALTER TABLE "lead_activities" ALTER COLUMN "cp_id" DROP NOT NULL`,
    `ALTER TABLE "lead_activities" ADD COLUMN IF NOT EXISTS "actor_user_id" uuid REFERENCES "users"("id")`,
    `CREATE TABLE IF NOT EXISTS "employee_invites" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "employee_id" uuid NOT NULL REFERENCES "employees"("id"),
       "token_hash" text NOT NULL UNIQUE,
       "created_by_id" uuid NOT NULL REFERENCES "users"("id"),
       "expires_at" timestamptz NOT NULL,
       "used_at" timestamptz,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "employee_invites_employee_idx" ON "employee_invites" ("employee_id", "created_at")`,
    `CREATE TABLE IF NOT EXISTS "employee_tasks" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "employee_id" uuid NOT NULL REFERENCES "employees"("id"),
       "task_type" text NOT NULL DEFAULT 'ASSIGNED',
       "title" text NOT NULL,
       "description" text,
       "category" text NOT NULL DEFAULT 'GENERAL',
       "assigned_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
       "priority" text NOT NULL DEFAULT 'MEDIUM',
       "status" text NOT NULL DEFAULT 'ASSIGNED',
       "start_at" timestamptz,
       "deadline_at" timestamptz,
       "estimated_minutes" integer,
       "project_id" uuid REFERENCES "projects"("id"),
       "lead_id" uuid REFERENCES "leads"("id"),
       "completion_notes" text,
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now(),
       "completed_at" timestamptz
     )`,
    `CREATE INDEX IF NOT EXISTS "employee_tasks_employee_status_idx" ON "employee_tasks" ("employee_id", "status")`,
    `CREATE INDEX IF NOT EXISTS "employee_tasks_deadline_idx" ON "employee_tasks" ("deadline_at", "status")`,
    `CREATE INDEX IF NOT EXISTS "employee_tasks_project_idx" ON "employee_tasks" ("project_id")`,
    `CREATE INDEX IF NOT EXISTS "employee_tasks_lead_idx" ON "employee_tasks" ("lead_id")`,
    `CREATE TABLE IF NOT EXISTS "employee_task_assignments" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "task_id" uuid NOT NULL REFERENCES "employee_tasks"("id") ON DELETE CASCADE,
       "employee_id" uuid NOT NULL REFERENCES "employees"("id"),
       "assigned_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
       "status" text NOT NULL DEFAULT 'ASSIGNED',
       "assigned_at" timestamptz NOT NULL DEFAULT now(),
       "completed_at" timestamptz,
       "updated_at" timestamptz NOT NULL DEFAULT now(),
       CONSTRAINT "employee_task_assignment_unique" UNIQUE ("task_id", "employee_id")
     )`,
    `CREATE INDEX IF NOT EXISTS "employee_task_assignments_employee_status_idx" ON "employee_task_assignments" ("employee_id", "status")`,
    `CREATE INDEX IF NOT EXISTS "employee_task_assignments_task_idx" ON "employee_task_assignments" ("task_id")`,
    `INSERT INTO "employee_task_assignments" ("task_id", "employee_id", "assigned_by_user_id", "status", "assigned_at", "updated_at")
       SELECT t."id", t."employee_id", t."assigned_by_user_id", t."status", t."created_at", t."updated_at"
       FROM "employee_tasks" t
       WHERE t."task_type" = 'ASSIGNED'
       ON CONFLICT ("task_id", "employee_id") DO NOTHING`,
    `CREATE TABLE IF NOT EXISTS "employee_task_attachments" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "task_id" uuid NOT NULL REFERENCES "employee_tasks"("id") ON DELETE CASCADE,
       "uploaded_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
       "stored_file_name" text NOT NULL UNIQUE,
       "original_file_name" text NOT NULL,
       "mime_type" text NOT NULL,
       "size_bytes" integer NOT NULL,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "employee_task_attachments_task_idx" ON "employee_task_attachments" ("task_id", "created_at")`,
    `CREATE TABLE IF NOT EXISTS "employee_leave_requests" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "employee_id" uuid NOT NULL REFERENCES "employees"("id"),
       "requested_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
       "leave_type" text NOT NULL DEFAULT 'CASUAL',
       "start_date" text NOT NULL,
       "end_date" text NOT NULL,
       "total_days" integer NOT NULL,
       "reason" text NOT NULL,
       "status" text NOT NULL DEFAULT 'PENDING',
       "reviewed_by_user_id" uuid REFERENCES "users"("id"),
       "reviewed_at" timestamptz,
       "review_notes" text,
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "employee_leave_requests_employee_status_idx" ON "employee_leave_requests" ("employee_id", "status")`,
    `CREATE INDEX IF NOT EXISTS "employee_leave_requests_dates_idx" ON "employee_leave_requests" ("start_date", "end_date")`,
    `CREATE TABLE IF NOT EXISTS "employee_task_history" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "task_id" uuid NOT NULL REFERENCES "employee_tasks"("id"),
       "actor_user_id" uuid NOT NULL REFERENCES "users"("id"),
       "action" text NOT NULL,
       "before_value" jsonb,
       "after_value" jsonb,
       "reason" text,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "employee_task_history_task_idx" ON "employee_task_history" ("task_id", "created_at")`,
    `CREATE TABLE IF NOT EXISTS "employee_task_comments" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "task_id" uuid NOT NULL REFERENCES "employee_tasks"("id"),
       "author_user_id" uuid NOT NULL REFERENCES "users"("id"),
       "body" text NOT NULL,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "employee_task_comments_task_idx" ON "employee_task_comments" ("task_id", "created_at")`,
    `CREATE TABLE IF NOT EXISTS "employee_attendance" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "employee_id" uuid NOT NULL REFERENCES "employees"("id"),
       "attendance_date" text NOT NULL,
       "status" text NOT NULL DEFAULT 'PRESENT',
       "check_in_at" timestamptz,
       "check_out_at" timestamptz,
       "working_minutes" integer,
       "late" boolean,
       "notes" text,
       "correction_reason" text,
       "corrected_by_user_id" uuid REFERENCES "users"("id"),
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now(),
       CONSTRAINT "employee_attendance_employee_date_unique" UNIQUE ("employee_id", "attendance_date")
     )`,
    `CREATE INDEX IF NOT EXISTS "employee_attendance_date_status_idx" ON "employee_attendance" ("attendance_date", "status")`,
    `CREATE TABLE IF NOT EXISTS "employee_salary_records" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "employee_id" uuid NOT NULL REFERENCES "employees"("id"),
       "month_key" text NOT NULL,
       "gross_salary" double precision NOT NULL DEFAULT 0,
       "allowances" double precision NOT NULL DEFAULT 0,
       "deductions" double precision NOT NULL DEFAULT 0,
       "net_payable" double precision NOT NULL DEFAULT 0,
       "status" text NOT NULL DEFAULT 'DRAFT',
       "payment_date" timestamptz,
       "payment_reference" text,
       "notes" text,
       "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
       "approved_by_user_id" uuid REFERENCES "users"("id"),
       "paid_by_user_id" uuid REFERENCES "users"("id"),
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now(),
       CONSTRAINT "employee_salary_employee_month_unique" UNIQUE ("employee_id", "month_key")
     )`,
    `CREATE INDEX IF NOT EXISTS "employee_salary_status_month_idx" ON "employee_salary_records" ("status", "month_key")`,
    `CREATE TABLE IF NOT EXISTS "command_investments" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "title" text NOT NULL,
       "category" text NOT NULL DEFAULT 'General',
       "amount" double precision NOT NULL DEFAULT 0,
       "date" timestamptz NOT NULL DEFAULT now(),
       "notes" text,
       "created_by_id" uuid REFERENCES "users"("id"),
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "command_investments_date_idx" ON "command_investments" ("date")`,
    `CREATE TABLE IF NOT EXISTS "command_revenues" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "title" text NOT NULL,
       "category" text NOT NULL DEFAULT 'General',
       "amount" double precision NOT NULL DEFAULT 0,
       "date" timestamptz NOT NULL DEFAULT now(),
       "notes" text,
       "created_by_id" uuid REFERENCES "users"("id"),
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "command_revenues_date_idx" ON "command_revenues" ("date")`,
    `CREATE TABLE IF NOT EXISTS "recurring_expenses" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "label" text NOT NULL,
       "category" text NOT NULL DEFAULT 'Other',
       "amount" double precision NOT NULL DEFAULT 0,
       "due_day" integer NOT NULL DEFAULT 1,
       "paid_for_month" text,
       "paid_date" timestamptz,
       "notes" text,
       "active" boolean NOT NULL DEFAULT true,
       "created_by_id" uuid REFERENCES "users"("id"),
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    // Monthly Costing payment tracking (added after the table's first release).
    `ALTER TABLE "recurring_expenses" ADD COLUMN IF NOT EXISTS "due_day" integer NOT NULL DEFAULT 1`,
    `ALTER TABLE "recurring_expenses" ADD COLUMN IF NOT EXISTS "paid_for_month" text`,
    `ALTER TABLE "recurring_expenses" ADD COLUMN IF NOT EXISTS "paid_date" timestamptz`,
    // Pending signups — accounts are held here until email + phone OTPs are
    // verified, then promoted into `users`. Created idempotently on boot.
    `CREATE TABLE IF NOT EXISTS "pending_signups" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "name" text NOT NULL,
       "email" text NOT NULL,
       "password" text NOT NULL,
       "phone" text,
       "role" text NOT NULL,
       "company_name" text,
       "rera_number" text,
       "referred_by" uuid,
       "email_otp" text,
       "email_otp_expiry" timestamptz,
       "phone_otp" text,
       "phone_otp_expiry" timestamptz,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "pending_signups_email_unique" ON "pending_signups" ("email")`,
    // KYC document storage is required by /api/auth/submit-kyc. Keep this in
    // the idempotent startup schema bootstrap so a fresh/restored database can
    // accept secure uploads without relying on an undocumented manual SQL step.
    `CREATE TABLE IF NOT EXISTS "kyc_documents" (
       "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
       "aadhaar_data" bytea,
       "aadhaar_mime" text,
       "pan_data" bytea,
       "pan_mime" text,
       "selfie_data" bytea,
       "selfie_mime" text,
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    // Add missing columns safely for installations created by an earlier pilot.
    `ALTER TABLE "kyc_documents" ADD COLUMN IF NOT EXISTS "aadhaar_data" bytea`,
    `ALTER TABLE "kyc_documents" ADD COLUMN IF NOT EXISTS "aadhaar_mime" text`,
    `ALTER TABLE "kyc_documents" ADD COLUMN IF NOT EXISTS "pan_data" bytea`,
    `ALTER TABLE "kyc_documents" ADD COLUMN IF NOT EXISTS "pan_mime" text`,
    `ALTER TABLE "kyc_documents" ADD COLUMN IF NOT EXISTS "selfie_data" bytea`,
    `ALTER TABLE "kyc_documents" ADD COLUMN IF NOT EXISTS "selfie_mime" text`,
    `ALTER TABLE "kyc_documents" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz NOT NULL DEFAULT now()`,
    // CP commission wallet — developer-onboarding 2% accruals + admin payouts.
    `CREATE TABLE IF NOT EXISTS "developer_commission_accruals" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "cp_id" uuid NOT NULL REFERENCES "users"("id"),
       "developer_id" uuid NOT NULL REFERENCES "users"("id"),
       "month_key" text NOT NULL,
       "amount" double precision NOT NULL DEFAULT 0,
       "subscription_amount" double precision NOT NULL DEFAULT 0,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "dev_commission_dev_month_unique" ON "developer_commission_accruals" ("developer_id", "month_key")`,
    `CREATE INDEX IF NOT EXISTS "dev_commission_cp_idx" ON "developer_commission_accruals" ("cp_id")`,
    `CREATE TABLE IF NOT EXISTS "cp_commission_payments" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "cp_id" uuid NOT NULL REFERENCES "users"("id"),
       "amount" double precision NOT NULL DEFAULT 0,
       "mode" text NOT NULL DEFAULT 'BANK_TRANSFER',
       "transaction_id" text,
       "payment_date" timestamptz NOT NULL DEFAULT now(),
       "notes" text,
       "created_by_id" uuid REFERENCES "users"("id"),
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "cp_commission_payments_cp_idx" ON "cp_commission_payments" ("cp_id", "created_at")`,
    // Admin-managed (manual) Channel Partner commissions — add / approve / pay.
    `CREATE TABLE IF NOT EXISTS "cp_manual_commissions" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "cp_id" uuid NOT NULL REFERENCES "users"("id"),
       "lead_id" uuid REFERENCES "leads"("id"),
       "label" text,
       "booking_value" double precision,
       "percent" double precision,
       "amount" double precision NOT NULL DEFAULT 0,
       "status" text NOT NULL DEFAULT 'PENDING',
       "paid_amount" double precision,
       "payment_date" timestamptz,
       "transaction_ref" text,
       "payment_mode" text,
       "notes" text,
       "created_by_id" uuid REFERENCES "users"("id"),
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "cp_manual_commissions_cp_idx" ON "cp_manual_commissions" ("cp_id", "created_at")`,
    // Channel Partner payout / bank details for commission payouts.
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "payout_details" jsonb`,
    // Truvi Invest — admin-set investment terms per project + investments.
    `CREATE TABLE IF NOT EXISTS "project_investment_terms" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "project_id" uuid NOT NULL REFERENCES "projects"("id"),
       "is_open" boolean NOT NULL DEFAULT false,
       "min_amount" double precision NOT NULL DEFAULT 100000,
       "max_amount" double precision,
       "target_annual_return_percent" double precision NOT NULL DEFAULT 0,
       "tenure_months" integer NOT NULL DEFAULT 12,
       "monthly_payout_percent" double precision,
       "notes" text,
       "updated_by_id" uuid REFERENCES "users"("id"),
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "project_investment_terms_project_unique" ON "project_investment_terms" ("project_id")`,
    `CREATE TABLE IF NOT EXISTS "project_investments" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "investor_id" uuid NOT NULL REFERENCES "users"("id"),
       "project_id" uuid NOT NULL REFERENCES "projects"("id"),
       "amount_paise" integer NOT NULL,
       "target_annual_return_percent" double precision NOT NULL DEFAULT 0,
       "tenure_months" integer NOT NULL DEFAULT 12,
       "monthly_payout_percent" double precision,
       "status" text NOT NULL DEFAULT 'CREATED',
       "razorpay_order_id" text,
       "razorpay_payment_id" text,
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "project_investments_investor_idx" ON "project_investments" ("investor_id")`,
    `CREATE INDEX IF NOT EXISTS "project_investments_project_idx" ON "project_investments" ("project_id")`,
    // Ambassador Knowledge Hub — admin-managed training content.
    `CREATE TABLE IF NOT EXISTS "ambassador_knowledge_topics" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "title" text NOT NULL,
       "description" text,
       "sort_order" integer NOT NULL DEFAULT 0,
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "ambassador_knowledge_topics_sort_idx" ON "ambassador_knowledge_topics" ("sort_order")`,
    `CREATE TABLE IF NOT EXISTS "ambassador_knowledge_materials" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "topic_id" uuid NOT NULL REFERENCES "ambassador_knowledge_topics"("id"),
       "kind" text NOT NULL DEFAULT 'VIDEO',
       "title" text NOT NULL,
       "url" text NOT NULL,
       "file_name" text,
       "sort_order" integer NOT NULL DEFAULT 0,
       "created_by_id" uuid REFERENCES "users"("id"),
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "ambassador_knowledge_materials_topic_idx" ON "ambassador_knowledge_materials" ("topic_id", "sort_order")`,
    `CREATE TABLE IF NOT EXISTS "ambassador_knowledge_config" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "help_contact" text,
       "help_text" text,
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    // ── Notification engine columns + push tables (auto-applied on boot so a
    // plain restart is enough — no separate `npm run db:notify` needed). The
    // `pushed_at` column in particular is what lets a new user's welcome /
    // role-onboarding notifications be delivered to their phone tray once
    // their device registers; without it, tray push for new users fails. ──
    `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "type" text NOT NULL DEFAULT 'general'`,
    `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "title" text`,
    `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "actor_user_id" uuid REFERENCES users(id)`,
    `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "data" jsonb`,
    `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "priority" text NOT NULL DEFAULT 'normal'`,
    `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "read_at" timestamptz`,
    `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "expires_at" timestamptz`,
    `ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "pushed_at" timestamptz`,
    `CREATE INDEX IF NOT EXISTS "notifications_user_created_idx" ON "notifications" ("user_id", "created_at")`,
    `CREATE INDEX IF NOT EXISTS "notifications_type_idx" ON "notifications" ("type")`,
    `CREATE TABLE IF NOT EXISTS "notification_preferences" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "user_id" uuid NOT NULL REFERENCES users(id),
       "category" text NOT NULL,
       "enabled" boolean NOT NULL DEFAULT true,
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "notification_prefs_user_category_idx" ON "notification_preferences" ("user_id", "category")`,
    `CREATE TABLE IF NOT EXISTS "user_notification_channel_preferences" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "user_id" uuid NOT NULL REFERENCES users(id),
       "channel" text NOT NULL,
       "category" text NOT NULL DEFAULT 'properties',
       "enabled" boolean NOT NULL DEFAULT true,
       "updated_at" timestamptz NOT NULL DEFAULT now(),
       UNIQUE ("user_id", "channel", "category")
     )`,
    `CREATE INDEX IF NOT EXISTS "user_notification_channel_prefs_user_idx" ON "user_notification_channel_preferences" ("user_id", "category")`,
    `CREATE TABLE IF NOT EXISTS "user_push_tokens" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "user_id" uuid NOT NULL REFERENCES users(id),
       "token" text NOT NULL,
       "platform" text NOT NULL DEFAULT 'android',
       "device_id" text,
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "user_push_tokens_token_idx" ON "user_push_tokens" ("token")`,
    `CREATE INDEX IF NOT EXISTS "user_push_tokens_user_idx" ON "user_push_tokens" ("user_id")`,

    // Structured buyer requirements and match/delivery bookkeeping. Additive and safe to rerun.
    `CREATE TABLE IF NOT EXISTS "property_requirements" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "submitted_by_id" uuid NOT NULL REFERENCES "users"("id"),
       "submitted_by_role" text NOT NULL,
       "title" text NOT NULL,
       "property_type" text NOT NULL DEFAULT 'ANY',
       "city" text NOT NULL,
       "location" text NOT NULL,
       "min_budget" double precision,
       "max_budget" double precision NOT NULL,
       "min_area_sqft" double precision,
       "max_area_sqft" double precision,
       "purpose" text,
       "timeline" text NOT NULL,
       "details" text,
       "status" text NOT NULL DEFAULT 'ACTIVE',
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `ALTER TABLE "property_requirements" ADD COLUMN IF NOT EXISTS "submission_key" text`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "property_requirements_submitter_submission_key_unique" ON "property_requirements" ("submitted_by_id", "submission_key")`,
    `ALTER TABLE "property_requirements" ADD COLUMN IF NOT EXISTS "requirement_kind" text NOT NULL DEFAULT 'BUYER'`,
    `ALTER TABLE "property_requirements" ADD COLUMN IF NOT EXISTS "visibility" text NOT NULL DEFAULT 'TRUVI'`,
    `ALTER TABLE "property_requirements" ADD COLUMN IF NOT EXISTS "preferred_contact_method" text NOT NULL DEFAULT 'IN_APP'`,
    `ALTER TABLE "property_requirements" ADD COLUMN IF NOT EXISTS "public_summary" text`,
    `ALTER TABLE "property_requirements" ADD COLUMN IF NOT EXISTS "client_name" text`,
    `ALTER TABLE "property_requirements" ADD COLUMN IF NOT EXISTS "client_phone" text`,
    `ALTER TABLE "property_requirements" ADD COLUMN IF NOT EXISTS "client_email" text`,
    `ALTER TABLE "property_requirements" ADD COLUMN IF NOT EXISTS "contact_consent" boolean NOT NULL DEFAULT false`,
    `ALTER TABLE "property_requirements" ADD COLUMN IF NOT EXISTS "contact_consent_at" timestamptz`,
    `ALTER TABLE "property_requirements" ADD COLUMN IF NOT EXISTS "moderated_by_id" uuid REFERENCES users(id)`,
    `ALTER TABLE "property_requirements" ADD COLUMN IF NOT EXISTS "moderated_at" timestamptz`,
    `ALTER TABLE "property_requirements" ADD COLUMN IF NOT EXISTS "moderation_note" text`,
    `ALTER TABLE "property_requirements" ADD COLUMN IF NOT EXISTS "duplicate_of_id" uuid`,
    `CREATE INDEX IF NOT EXISTS "property_requirements_visibility_status_created_idx" ON "property_requirements" ("visibility", "status", "created_at")`,
    `CREATE INDEX IF NOT EXISTS "property_requirements_kind_created_idx" ON "property_requirements" ("requirement_kind", "created_at")`,
    `CREATE INDEX IF NOT EXISTS "property_requirements_status_created_idx" ON "property_requirements" ("status", "created_at")`,
    `CREATE INDEX IF NOT EXISTS "property_requirements_owner_status_idx" ON "property_requirements" ("submitted_by_id", "status")`,
    `CREATE INDEX IF NOT EXISTS "property_requirements_city_idx" ON "property_requirements" ("city")`,
    `CREATE TABLE IF NOT EXISTS "property_requirement_matches" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "requirement_id" uuid NOT NULL REFERENCES "property_requirements"("id") ON DELETE CASCADE,
       "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
       "in_app_notified_at" timestamptz,
       "email_sent_at" timestamptz,
       "created_at" timestamptz NOT NULL DEFAULT now(),
       UNIQUE ("requirement_id", "project_id")
     )`,
    `CREATE INDEX IF NOT EXISTS "property_requirement_matches_requirement_idx" ON "property_requirement_matches" ("requirement_id", "created_at")`,
    `ALTER TABLE "property_requirement_matches" ADD COLUMN IF NOT EXISTS "match_status" text NOT NULL DEFAULT 'MATCHED'`,
    `ALTER TABLE "property_requirement_matches" ADD COLUMN IF NOT EXISTS "match_reasons" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE "property_requirement_matches" ADD COLUMN IF NOT EXISTS "notification_status" text NOT NULL DEFAULT 'PENDING'`,
    `ALTER TABLE "property_requirement_matches" ADD COLUMN IF NOT EXISTS "email_status" text NOT NULL DEFAULT 'QUEUED'`,
    `ALTER TABLE "property_requirement_matches" ADD COLUMN IF NOT EXISTS "email_attempts" integer NOT NULL DEFAULT 0`,
    `ALTER TABLE "property_requirement_matches" ADD COLUMN IF NOT EXISTS "email_last_error" text`,
    `ALTER TABLE "property_requirement_matches" ADD COLUMN IF NOT EXISTS "email_next_attempt_at" timestamptz`,
    `ALTER TABLE "property_requirement_matches" ADD COLUMN IF NOT EXISTS "email_claimed_at" timestamptz`,
    `ALTER TABLE "property_requirement_matches" ADD COLUMN IF NOT EXISTS "email_provider_message_id" text`,
    `ALTER TABLE "property_requirement_matches" ADD COLUMN IF NOT EXISTS "email_delivered_at" timestamptz`,
    `CREATE INDEX IF NOT EXISTS "property_requirement_matches_email_retry_idx" ON "property_requirement_matches" ("email_status", "email_next_attempt_at")`,
    `CREATE INDEX IF NOT EXISTS "property_requirement_matches_project_idx" ON "property_requirement_matches" ("project_id", "created_at")`,
    `CREATE TABLE IF NOT EXISTS "email_delivery_events" (
       "provider_event_id" text PRIMARY KEY,
       "provider" text NOT NULL DEFAULT 'RESEND',
       "provider_message_id" text NOT NULL,
       "match_id" uuid REFERENCES "property_requirement_matches"("id") ON DELETE SET NULL,
       "event_type" text NOT NULL,
       "provider_created_at" timestamptz,
       "received_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "email_delivery_events_message_idx" ON "email_delivery_events" ("provider_message_id", "received_at")`,
    `CREATE INDEX IF NOT EXISTS "email_delivery_events_match_idx" ON "email_delivery_events" ("match_id", "received_at")`,
    // Keep only one active match job per target. Existing duplicates are retained
    // as FAILED history before the partial indexes are created; no data is deleted.
    `WITH ranked AS (
       SELECT "id", row_number() OVER (
         PARTITION BY "job_type", COALESCE("requirement_id"::text, "project_id"::text)
         ORDER BY "created_at" DESC, "id" DESC
       ) AS rn
       FROM "property_requirement_match_jobs"
       WHERE "status" IN ('QUEUED', 'RETRY_PENDING')
     )
     UPDATE "property_requirement_match_jobs" AS job
     SET "status" = 'FAILED', "last_error" = 'DUPLICATE_QUEUED_JOB_CLEANED_UP', "updated_at" = now()
     FROM ranked WHERE ranked."id" = job."id" AND ranked.rn > 1`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "property_requirement_match_jobs_active_requirement_unique"
       ON "property_requirement_match_jobs" ("requirement_id")
       WHERE "job_type" = 'REQUIREMENT' AND "status" IN ('QUEUED', 'RETRY_PENDING')`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "property_requirement_match_jobs_active_project_unique"
       ON "property_requirement_match_jobs" ("project_id")
       WHERE "job_type" = 'PROJECT' AND "status" IN ('QUEUED', 'RETRY_PENDING')`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "property_requirement_match_id" uuid REFERENCES "property_requirement_matches"("id")`,
    `CREATE INDEX IF NOT EXISTS "leads_requirement_match_idx" ON "leads" ("property_requirement_match_id")`,
    `CREATE TABLE IF NOT EXISTS "property_requirement_events" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "requirement_id" uuid NOT NULL REFERENCES "property_requirements"("id") ON DELETE CASCADE,
       "actor_user_id" uuid REFERENCES "users"("id"),
       "action" text NOT NULL,
       "metadata" jsonb,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "property_requirement_events_req_created_idx" ON "property_requirement_events" ("requirement_id", "created_at")`,
    `CREATE INDEX IF NOT EXISTS "property_requirement_events_actor_idx" ON "property_requirement_events" ("actor_user_id", "created_at")`,
    `CREATE TABLE IF NOT EXISTS "property_requirement_match_jobs" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "job_type" text NOT NULL,
       "requirement_id" uuid REFERENCES "property_requirements"("id") ON DELETE CASCADE,
       "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE,
       "status" text NOT NULL DEFAULT 'QUEUED',
       "attempts" integer NOT NULL DEFAULT 0,
       "next_attempt_at" timestamptz NOT NULL DEFAULT now(),
       "last_error" text,
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now(),
       "completed_at" timestamptz
     )`,
    `CREATE INDEX IF NOT EXISTS "property_requirement_match_jobs_status_due_idx" ON "property_requirement_match_jobs" ("status", "next_attempt_at")`,
    `CREATE INDEX IF NOT EXISTS "property_requirement_match_jobs_requirement_idx" ON "property_requirement_match_jobs" ("requirement_id", "created_at")`,
    `CREATE INDEX IF NOT EXISTS "property_requirement_match_jobs_project_idx" ON "property_requirement_match_jobs" ("project_id", "created_at")`,
    `CREATE TABLE IF NOT EXISTS "property_requirement_responses" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "requirement_id" uuid NOT NULL REFERENCES "property_requirements"("id") ON DELETE CASCADE,
       "responder_id" uuid NOT NULL REFERENCES "users"("id"),
       "message" text NOT NULL,
       "status" text NOT NULL DEFAULT 'SENT',
       "read_at" timestamptz,
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now(),
       UNIQUE ("requirement_id", "responder_id")
     )`,
    `CREATE INDEX IF NOT EXISTS "property_requirement_responses_requirement_idx" ON "property_requirement_responses" ("requirement_id", "created_at")`,
    `CREATE INDEX IF NOT EXISTS "property_requirement_responses_responder_idx" ON "property_requirement_responses" ("responder_id", "created_at")`,

    // ── Marketing module tables (auto-applied on boot; same rationale as above
    // — a plain restart is enough, no separate `npm run db:marketing`). ──
    `CREATE TABLE IF NOT EXISTS "marketing_access" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "user_id" uuid NOT NULL REFERENCES users(id),
       "status" text NOT NULL DEFAULT 'ACTIVE',
       "package_name" text NOT NULL DEFAULT 'Marketing Access',
       "budget_paise" integer NOT NULL DEFAULT 0,
       "valid_from" timestamptz NOT NULL DEFAULT now(),
       "valid_until" timestamptz,
       "granted_by_id" uuid REFERENCES users(id),
       "notes" text,
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "marketing_access_user_idx" ON "marketing_access" ("user_id")`,
    `CREATE TABLE IF NOT EXISTS "marketing_payments" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "user_id" uuid NOT NULL REFERENCES users(id),
       "partner_name" text NOT NULL,
       "partner_email" text,
       "partner_phone" text,
       "package_name" text NOT NULL DEFAULT 'Marketing Access',
       "amount_paise" integer NOT NULL DEFAULT 0,
       "gst_percent" double precision NOT NULL DEFAULT 18,
       "gst_paise" integer NOT NULL DEFAULT 0,
       "total_paise" integer NOT NULL DEFAULT 0,
       "method" text NOT NULL DEFAULT 'OTHER',
       "reference" text,
       "status" text NOT NULL DEFAULT 'VERIFIED',
       "paid_at" timestamptz NOT NULL DEFAULT now(),
       "verified_by_id" uuid REFERENCES users(id),
       "notes" text,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "marketing_payments_user_idx" ON "marketing_payments" ("user_id", "created_at")`,
    `CREATE TABLE IF NOT EXISTS "marketing_expenses" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "user_id" uuid NOT NULL REFERENCES users(id),
       "activity" text NOT NULL,
       "amount_paise" integer NOT NULL DEFAULT 0,
       "status" text NOT NULL DEFAULT 'ACTIVE',
       "spent_at" timestamptz NOT NULL DEFAULT now(),
       "notes" text,
       "created_by_id" uuid REFERENCES users(id),
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "marketing_expenses_user_idx" ON "marketing_expenses" ("user_id", "spent_at")`,
    `CREATE TABLE IF NOT EXISTS "marketing_leads" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "user_id" uuid NOT NULL REFERENCES users(id),
       "name" text NOT NULL,
       "phone" text,
       "email" text,
       "source" text NOT NULL DEFAULT 'Marketing',
       "status" text NOT NULL DEFAULT 'NEW',
       "value_paise" integer NOT NULL DEFAULT 0,
       "notes" text,
       "created_by_id" uuid REFERENCES users(id),
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "marketing_leads_user_idx" ON "marketing_leads" ("user_id", "created_at")`,
    `CREATE INDEX IF NOT EXISTS "marketing_leads_status_idx" ON "marketing_leads" ("status")`,
    `CREATE TABLE IF NOT EXISTS "marketing_partner_campaigns" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "user_id" uuid NOT NULL REFERENCES users(id),
       "name" text NOT NULL,
       "channel" text NOT NULL DEFAULT 'Other',
       "status" text NOT NULL DEFAULT 'ACTIVE',
       "spend_paise" integer NOT NULL DEFAULT 0,
       "leads_count" integer NOT NULL DEFAULT 0,
       "started_at" timestamptz,
       "created_by_id" uuid REFERENCES users(id),
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "marketing_partner_campaigns_user_idx" ON "marketing_partner_campaigns" ("user_id")`,

    // ── Inventory leads, offers, Google Meet scheduling, CP joining ──────────
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "lead_no" bigserial`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "leads_lead_no_unique" ON "leads" ("lead_no")`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "unit_id" uuid REFERENCES units(id)`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "creator_role" text`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "requirement" text`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "visit_date" text`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "visit_time" text`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "referral_code" text`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "referral_chain" jsonb`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "offer_id" uuid`,
    `CREATE INDEX IF NOT EXISTS "leads_creator_role_idx" ON "leads" ("creator_role", "created_at")`,
    `CREATE INDEX IF NOT EXISTS "leads_unit_idx" ON "leads" ("unit_id")`,
    `CREATE INDEX IF NOT EXISTS "leads_visit_date_idx" ON "leads" ("visit_date")`,
    `ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "lead_alert_enabled" boolean NOT NULL DEFAULT true`,
    `ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "lead_alert_phone" text`,
    `ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "lead_alert_email" text`,
    `ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "onboarding_session" jsonb`,
    `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding_completed_at" timestamptz`,
    // CP joining flag. Added once; Channel Partners who had ALREADY finished
    // KYC + the WhatsApp channel when this shipped are marked joined, so the
    // new step never interrupts an existing, working partner. Later admin
    // resets are not undone because the backfill only runs when the column
    // is first created.
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'cp_joined_at') THEN
         ALTER TABLE "users" ADD COLUMN "cp_joined_at" timestamptz;
         UPDATE "users" SET "cp_joined_at" = now()
          WHERE "role" = 'CP' AND "onboarding_verified" = true AND "whatsapp_channel_joined" = true;
       END IF;
     END $$`,
    `CREATE TABLE IF NOT EXISTS "offers" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "name" text NOT NULL,
       "project_id" uuid NOT NULL REFERENCES projects(id),
       "unit_id" uuid REFERENCES units(id),
       "description" text,
       "badge_text" text,
       "terms" text,
       "reward_type" text NOT NULL DEFAULT 'INCENTIVE',
       "calc_basis" text NOT NULL DEFAULT 'PER_AREA_BLOCK',
       "basis_quantity" double precision,
       "amount" double precision NOT NULL,
       "prorate" boolean NOT NULL DEFAULT false,
       "eligible_roles" jsonb NOT NULL DEFAULT '["CP","AMBASSADOR"]'::jsonb,
       "start_date" text,
       "end_date" text,
       "is_active" boolean NOT NULL DEFAULT true,
       "deleted_at" timestamptz,
       "created_by_id" uuid REFERENCES users(id),
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "offers_project_idx" ON "offers" ("project_id")`,
    `CREATE TABLE IF NOT EXISTS "support_meetings" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "user_id" uuid NOT NULL REFERENCES users(id),
       "topic" text NOT NULL DEFAULT 'HELP',
       "date" text NOT NULL,
       "time" text NOT NULL,
       "note" text,
       "meet_link" text,
       "status" text NOT NULL DEFAULT 'REQUESTED',
       "admin_note" text,
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "support_meetings_user_idx" ON "support_meetings" ("user_id")`,
    `CREATE INDEX IF NOT EXISTS "support_meetings_date_idx" ON "support_meetings" ("date")`,

    // Truvi Habitat is an additive home-services domain. Its booking and
    // attribution records are intentionally separate from property leads,
    // site visits, and CP commissions.
    `CREATE TABLE IF NOT EXISTS "habitat_service_categories" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "name" text NOT NULL,
       "slug" text NOT NULL UNIQUE,
       "description" text,
       "icon" text,
       "active" boolean NOT NULL DEFAULT true,
       "sort_order" integer NOT NULL DEFAULT 0,
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "habitat_categories_active_idx" ON "habitat_service_categories" ("active", "sort_order")`,
    `CREATE TABLE IF NOT EXISTS "habitat_providers" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "owner_user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id"),
       "business_name" text NOT NULL,
       "description" text NOT NULL,
       "category_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
       "service_areas" jsonb NOT NULL DEFAULT '[]'::jsonb,
       "experience_years" integer NOT NULL DEFAULT 0,
       "status" text NOT NULL DEFAULT 'PENDING',
       "review_note" text,
       "reviewed_by_id" uuid REFERENCES "users"("id"),
       "reviewed_at" timestamptz,
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "habitat_providers_status_idx" ON "habitat_providers" ("status")`,
    `CREATE TABLE IF NOT EXISTS "habitat_services" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "category_id" uuid NOT NULL REFERENCES "habitat_service_categories"("id"),
       "title" text NOT NULL,
       "description" text NOT NULL,
       "pricing_model" text NOT NULL,
       "price_paise" integer,
       "duration_minutes" integer,
       "includes" jsonb NOT NULL DEFAULT '[]'::jsonb,
       "excludes" jsonb NOT NULL DEFAULT '[]'::jsonb,
       "cancellation_policy" text NOT NULL,
       "active" boolean NOT NULL DEFAULT true,
       "created_by_id" uuid REFERENCES "users"("id"),
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "habitat_services_category_active_idx" ON "habitat_services" ("category_id", "active")`,
    `CREATE INDEX IF NOT EXISTS "habitat_services_active_idx" ON "habitat_services" ("active")`,
    `CREATE TABLE IF NOT EXISTS "habitat_invitations" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "code" text NOT NULL UNIQUE,
       "project_id" uuid NOT NULL REFERENCES "projects"("id"),
       "campaign" text,
       "created_by_id" uuid NOT NULL REFERENCES "users"("id"),
       "expires_at" timestamptz,
       "revoked_at" timestamptz,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "habitat_invitations_project_idx" ON "habitat_invitations" ("project_id", "created_at")`,
    `CREATE TABLE IF NOT EXISTS "habitat_memberships" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "buyer_id" uuid NOT NULL REFERENCES "users"("id"),
       "project_id" uuid NOT NULL REFERENCES "projects"("id"),
       "invitation_id" uuid NOT NULL REFERENCES "habitat_invitations"("id"),
       "consented_at" timestamptz NOT NULL,
       "created_at" timestamptz NOT NULL DEFAULT now(),
       UNIQUE ("buyer_id", "project_id")
     )`,
    `CREATE INDEX IF NOT EXISTS "habitat_memberships_project_idx" ON "habitat_memberships" ("project_id", "created_at")`,
    `CREATE TABLE IF NOT EXISTS "habitat_bookings" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "reference" text NOT NULL UNIQUE,
       "buyer_id" uuid NOT NULL REFERENCES "users"("id"),
       "project_id" uuid NOT NULL REFERENCES "projects"("id"),
       "invitation_id" uuid NOT NULL REFERENCES "habitat_invitations"("id"),
       "service_id" uuid NOT NULL REFERENCES "habitat_services"("id"),
       "provider_id" uuid REFERENCES "habitat_providers"("id"),
       "status" text NOT NULL DEFAULT 'REQUESTED',
       "service_title_snapshot" text NOT NULL,
       "pricing_model_snapshot" text NOT NULL,
       "estimated_amount_paise" integer,
       "service_address" jsonb NOT NULL,
       "preferred_at" timestamptz NOT NULL,
       "request_details" text,
       "terms_accepted_at" timestamptz NOT NULL,
       "idempotency_key" text NOT NULL,
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now(),
       UNIQUE ("buyer_id", "idempotency_key")
     )`,
    `CREATE INDEX IF NOT EXISTS "habitat_bookings_buyer_created_idx" ON "habitat_bookings" ("buyer_id", "created_at")`,
    `CREATE INDEX IF NOT EXISTS "habitat_bookings_provider_status_idx" ON "habitat_bookings" ("provider_id", "status", "preferred_at")`,
    `CREATE INDEX IF NOT EXISTS "habitat_bookings_status_idx" ON "habitat_bookings" ("status", "created_at")`,
    `CREATE TABLE IF NOT EXISTS "habitat_booking_status_history" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "booking_id" uuid NOT NULL REFERENCES "habitat_bookings"("id"),
       "actor_user_id" uuid NOT NULL REFERENCES "users"("id"),
       "from_status" text,
       "to_status" text NOT NULL,
       "reason" text,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "habitat_booking_history_booking_idx" ON "habitat_booking_status_history" ("booking_id", "created_at")`,
    `ALTER TABLE "habitat_booking_status_history" ALTER COLUMN "actor_user_id" DROP NOT NULL`,
    `CREATE TABLE IF NOT EXISTS "habitat_reviews" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "booking_id" uuid NOT NULL UNIQUE REFERENCES "habitat_bookings"("id"),
       "buyer_id" uuid NOT NULL REFERENCES "users"("id"),
       "provider_id" uuid NOT NULL REFERENCES "habitat_providers"("id"),
       "service_id" uuid NOT NULL REFERENCES "habitat_services"("id"),
       "rating" integer NOT NULL CHECK ("rating" BETWEEN 1 AND 5),
       "comment" text,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "habitat_reviews_service_idx" ON "habitat_reviews" ("service_id", "created_at")`,
    `ALTER TABLE "habitat_providers" ADD COLUMN IF NOT EXISTS "razorpay_account_id" text`,
    `ALTER TABLE "habitat_providers" ADD COLUMN IF NOT EXISTS "razorpay_account_status" text NOT NULL DEFAULT 'NOT_STARTED'`,
    `ALTER TABLE "habitat_providers" ADD COLUMN IF NOT EXISTS "razorpay_account_created_at" timestamptz`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "habitat_providers_razorpay_account_unique" ON "habitat_providers" ("razorpay_account_id")`,
    `ALTER TABLE "habitat_bookings" ADD COLUMN IF NOT EXISTS "final_amount_paise" integer`,
    `ALTER TABLE "habitat_bookings" ADD COLUMN IF NOT EXISTS "commission_rate_bps" integer`,
    `ALTER TABLE "habitat_bookings" ADD COLUMN IF NOT EXISTS "commission_amount_paise" integer`,
    `ALTER TABLE "habitat_bookings" ADD COLUMN IF NOT EXISTS "commission_tax_rate_bps" integer`,
    `ALTER TABLE "habitat_bookings" ADD COLUMN IF NOT EXISTS "commission_tax_paise" integer`,
    `ALTER TABLE "habitat_bookings" ADD COLUMN IF NOT EXISTS "provider_payout_paise" integer`,
    `ALTER TABLE "habitat_bookings" ADD COLUMN IF NOT EXISTS "cancellation_fee_bps_snapshot" integer`,
    `ALTER TABLE "habitat_bookings" ADD COLUMN IF NOT EXISTS "completion_submitted_at" timestamptz`,
    `ALTER TABLE "habitat_bookings" ADD COLUMN IF NOT EXISTS "auto_complete_at" timestamptz`,
    `ALTER TABLE "habitat_bookings" ADD COLUMN IF NOT EXISTS "completed_at" timestamptz`,
    `ALTER TABLE "habitat_bookings" ADD COLUMN IF NOT EXISTS "payout_eligible_at" timestamptz`,
    `ALTER TABLE "habitat_bookings" ADD COLUMN IF NOT EXISTS "payout_status" text NOT NULL DEFAULT 'NOT_READY'`,
    `CREATE TABLE IF NOT EXISTS "habitat_quotes" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "booking_id" uuid NOT NULL REFERENCES "habitat_bookings"("id"),
       "provider_id" uuid NOT NULL REFERENCES "habitat_providers"("id"),
       "amount_paise" integer NOT NULL CHECK ("amount_paise" > 0),
       "work_description" text NOT NULL,
       "status" text NOT NULL DEFAULT 'PROPOSED',
       "expires_at" timestamptz NOT NULL,
       "accepted_at" timestamptz,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "habitat_quotes_booking_idx" ON "habitat_quotes" ("booking_id", "created_at")`,
    `CREATE INDEX IF NOT EXISTS "habitat_quotes_provider_idx" ON "habitat_quotes" ("provider_id", "status")`,
    `CREATE TABLE IF NOT EXISTS "habitat_commission_rules" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "category_id" uuid NOT NULL REFERENCES "habitat_service_categories"("id"),
       "project_id" uuid REFERENCES "projects"("id"),
       "provider_id" uuid REFERENCES "habitat_providers"("id"),
       "rate_bps" integer NOT NULL CHECK ("rate_bps" BETWEEN 0 AND 10000),
       "effective_from" timestamptz NOT NULL,
       "effective_until" timestamptz,
       "created_by_id" uuid NOT NULL REFERENCES "users"("id"),
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "habitat_commission_rules_lookup_idx" ON "habitat_commission_rules" ("category_id", "project_id", "provider_id", "effective_from")`,
    `CREATE TABLE IF NOT EXISTS "habitat_settings" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "singleton_key" text NOT NULL UNIQUE DEFAULT 'default',
       "cancellation_fee_bps" integer NOT NULL DEFAULT 2500 CHECK ("cancellation_fee_bps" BETWEEN 0 AND 10000),
       "commission_tax_rate_bps" integer NOT NULL DEFAULT 1800 CHECK ("commission_tax_rate_bps" BETWEEN 0 AND 10000),
       "auto_complete_hours" integer NOT NULL DEFAULT 72 CHECK ("auto_complete_hours" BETWEEN 1 AND 720),
       "updated_by_id" uuid REFERENCES "users"("id"),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `INSERT INTO "habitat_settings" ("singleton_key") VALUES ('default') ON CONFLICT ("singleton_key") DO NOTHING`,
    `CREATE TABLE IF NOT EXISTS "habitat_payments" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "booking_id" uuid NOT NULL REFERENCES "habitat_bookings"("id"),
       "buyer_id" uuid NOT NULL REFERENCES "users"("id"),
       "quote_id" uuid REFERENCES "habitat_quotes"("id"),
       "amount_paise" integer NOT NULL CHECK ("amount_paise" > 0),
       "commission_amount_paise" integer NOT NULL CHECK ("commission_amount_paise" >= 0),
       "commission_tax_paise" integer NOT NULL CHECK ("commission_tax_paise" >= 0),
       "provider_amount_paise" integer NOT NULL CHECK ("provider_amount_paise" >= 0),
       "currency" text NOT NULL DEFAULT 'INR',
       "status" text NOT NULL DEFAULT 'CREATED',
       "razorpay_order_id" text UNIQUE,
       "razorpay_payment_id" text UNIQUE,
       "razorpay_signature" text,
       "failure_reason" text,
       "idempotency_key" text NOT NULL,
       "paid_at" timestamptz,
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now(),
       UNIQUE ("buyer_id", "idempotency_key")
     )`,
    `CREATE INDEX IF NOT EXISTS "habitat_payments_booking_idx" ON "habitat_payments" ("booking_id", "created_at")`,
    `CREATE TABLE IF NOT EXISTS "habitat_refunds" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "payment_id" uuid NOT NULL REFERENCES "habitat_payments"("id"),
       "amount_paise" integer NOT NULL CHECK ("amount_paise" > 0),
       "compensation_paise" integer NOT NULL DEFAULT 0 CHECK ("compensation_paise" >= 0),
       "reason" text NOT NULL,
       "status" text NOT NULL DEFAULT 'PENDING',
       "razorpay_refund_id" text UNIQUE,
       "idempotency_key" text NOT NULL UNIQUE,
       "initiated_by_id" uuid NOT NULL REFERENCES "users"("id"),
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `ALTER TABLE "habitat_refunds" ADD COLUMN IF NOT EXISTS "compensation_paise" integer NOT NULL DEFAULT 0`,
    `CREATE INDEX IF NOT EXISTS "habitat_refunds_payment_idx" ON "habitat_refunds" ("payment_id", "created_at")`,
    `CREATE TABLE IF NOT EXISTS "habitat_disputes" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "booking_id" uuid NOT NULL UNIQUE REFERENCES "habitat_bookings"("id"),
       "buyer_id" uuid NOT NULL REFERENCES "users"("id"),
       "reason" text NOT NULL,
       "evidence" jsonb NOT NULL DEFAULT '[]'::jsonb,
       "status" text NOT NULL DEFAULT 'OPEN',
       "resolution_note" text,
       "refund_amount_paise" integer,
       "reviewed_by_id" uuid REFERENCES "users"("id"),
       "resolved_at" timestamptz,
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "habitat_disputes_status_idx" ON "habitat_disputes" ("status", "created_at")`,
    `CREATE TABLE IF NOT EXISTS "habitat_transfers" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "booking_id" uuid NOT NULL UNIQUE REFERENCES "habitat_bookings"("id"),
       "payment_id" uuid NOT NULL REFERENCES "habitat_payments"("id"),
       "provider_id" uuid NOT NULL REFERENCES "habitat_providers"("id"),
       "amount_paise" integer NOT NULL CHECK ("amount_paise" > 0),
       "razorpay_transfer_id" text UNIQUE,
       "status" text NOT NULL DEFAULT 'PENDING',
       "idempotency_key" text NOT NULL UNIQUE,
       "processed_at" timestamptz,
       "failure_reason" text,
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "habitat_transfers_status_idx" ON "habitat_transfers" ("status", "created_at")`,
    `CREATE TABLE IF NOT EXISTS "habitat_ledger_entries" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "journal_id" uuid NOT NULL,
       "booking_id" uuid NOT NULL REFERENCES "habitat_bookings"("id"),
       "payment_id" uuid REFERENCES "habitat_payments"("id"),
       "account_code" text NOT NULL,
       "direction" text NOT NULL CHECK ("direction" IN ('DEBIT', 'CREDIT')),
       "amount_paise" integer NOT NULL CHECK ("amount_paise" > 0),
       "idempotency_key" text NOT NULL UNIQUE,
       "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "habitat_ledger_journal_idx" ON "habitat_ledger_entries" ("journal_id")`,
    `CREATE INDEX IF NOT EXISTS "habitat_ledger_booking_idx" ON "habitat_ledger_entries" ("booking_id", "created_at")`,
    `CREATE TABLE IF NOT EXISTS "habitat_developer_access" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "project_id" uuid NOT NULL UNIQUE REFERENCES "projects"("id"),
       "developer_id" uuid NOT NULL REFERENCES "users"("id"),
       "active" boolean NOT NULL DEFAULT true,
       "granted_by_id" uuid NOT NULL REFERENCES "users"("id"),
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "habitat_developer_access_user_idx" ON "habitat_developer_access" ("developer_id", "active")`,
    `CREATE TABLE IF NOT EXISTS "habitat_project_categories" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "project_id" uuid NOT NULL REFERENCES "projects"("id"),
       "category_id" uuid NOT NULL REFERENCES "habitat_service_categories"("id"),
       "enabled" boolean NOT NULL DEFAULT true,
       "updated_by_id" uuid NOT NULL REFERENCES "users"("id"),
       "updated_at" timestamptz NOT NULL DEFAULT now(),
       UNIQUE ("project_id", "category_id")
     )`,
    `CREATE INDEX IF NOT EXISTS "habitat_project_categories_project_idx" ON "habitat_project_categories" ("project_id", "enabled")`,
    `INSERT INTO "habitat_service_categories" ("name", "slug", "sort_order")
     VALUES
       ('Plumbing', 'plumbing', 1),
       ('Electrical Work', 'electrical-work', 2),
       ('Deep Cleaning', 'deep-cleaning', 3),
       ('Regular Home Cleaning', 'home-cleaning', 4),
       ('Painting', 'painting', 5),
       ('Carpentry', 'carpentry', 6),
       ('AC Installation & Servicing', 'ac-service', 7),
       ('Pest Control', 'pest-control', 8),
       ('Appliance Repair', 'appliance-repair', 9),
       ('Interior Design', 'interior-design', 10),
       ('Furniture Assembly', 'furniture-assembly', 11),
       ('Packers & Movers', 'packers-movers', 12),
       ('Laundry', 'laundry', 13),
       ('Water Purifier Servicing', 'water-purifier-service', 14),
       ('General Home Maintenance', 'home-maintenance', 15)
     ON CONFLICT ("slug") DO NOTHING`,

    // Structured P0 qualification, follow-up and ownership-review fields.
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "budget_range" text`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "purchase_purpose" text`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "preferred_plot_size" text`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "purchase_timeline" text`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "source_channel" text`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "next_follow_up_at" timestamptz`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "contact_attempted_at" timestamptz`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "qualified_at" timestamptz`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "ownership_review_status" text NOT NULL DEFAULT 'NOT_REQUIRED'`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "ownership_review_notes" text`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "ownership_reviewed_by_id" uuid REFERENCES "users"("id")`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "ownership_reviewed_at" timestamptz`,
    `CREATE INDEX IF NOT EXISTS "leads_source_channel_idx" ON "leads" ("source_channel", "created_at")`,
    `CREATE INDEX IF NOT EXISTS "leads_next_follow_up_idx" ON "leads" ("next_follow_up_at")`,
    `CREATE INDEX IF NOT EXISTS "leads_ownership_review_idx" ON "leads" ("ownership_review_status", "created_at")`,

    // Lead contact-consent audit fields; existing records default to no third-party consent.
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "contact_consent" boolean NOT NULL DEFAULT false`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "contact_consent_at" timestamptz`,
    `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "consent_text_version" text`,

    // Ambassador Operating System — additive/idempotent pilot tables.
    `CREATE TABLE IF NOT EXISTS "ambassador_os_profiles" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "user_id" uuid NOT NULL REFERENCES "users"("id"),
       "ambassador_no" bigserial NOT NULL,
       "city_code" text NOT NULL DEFAULT 'LKO',
       "college" text,
       "course" text,
       "academic_year" text,
       "city" text NOT NULL DEFAULT 'Lucknow',
       "preferred_role" text NOT NULL DEFAULT 'SALES',
       "weekly_availability_hours" integer NOT NULL DEFAULT 5,
       "terms_accepted_at" timestamptz,
       "terms_version" text,
       "certificate_no" text,
       "certified_at" timestamptz,
       "certified_by_id" uuid REFERENCES "users"("id"),
       "status" text NOT NULL DEFAULT 'REGISTERED',
       "current_level" text NOT NULL DEFAULT 'L0',
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "ambassador_os_profiles_user_unique" ON "ambassador_os_profiles" ("user_id")`,
    `ALTER TABLE "ambassador_os_profiles" ADD COLUMN IF NOT EXISTS "terms_version" text`,
    `ALTER TABLE "ambassador_os_profiles" ADD COLUMN IF NOT EXISTS "certificate_no" text`,
    `ALTER TABLE "ambassador_os_profiles" ADD COLUMN IF NOT EXISTS "certified_at" timestamptz`,
    `ALTER TABLE "ambassador_os_profiles" ADD COLUMN IF NOT EXISTS "certified_by_id" uuid REFERENCES "users"("id")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "ambassador_os_profiles_number_unique" ON "ambassador_os_profiles" ("ambassador_no")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "ambassador_os_profiles_certificate_unique" ON "ambassador_os_profiles" ("certificate_no")`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_profiles_status_idx" ON "ambassador_os_profiles" ("status")`,
    `CREATE TABLE IF NOT EXISTS "ambassador_os_training_progress" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "user_id" uuid NOT NULL REFERENCES "users"("id"),
       "day" integer NOT NULL,
       "quiz_score" integer NOT NULL DEFAULT 0,
       "answers" jsonb NOT NULL DEFAULT '[]'::jsonb,
       "assignment_text" text,
       "practical_status" text NOT NULL DEFAULT 'PENDING',
       "ethics_status" text NOT NULL DEFAULT 'PENDING',
       "trainer_feedback" text,
       "status" text NOT NULL DEFAULT 'NOT_STARTED',
       "reviewed_by_id" uuid REFERENCES "users"("id"),
       "reviewed_at" timestamptz,
       "completed_at" timestamptz,
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "ambassador_os_training_user_day_unique" ON "ambassador_os_training_progress" ("user_id", "day")`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_training_status_idx" ON "ambassador_os_training_progress" ("status", "day")`,
    `ALTER TABLE "ambassador_os_training_progress" ADD COLUMN IF NOT EXISTS "real_estate_knowledge_score" integer`,
    `ALTER TABLE "ambassador_os_training_progress" ADD COLUMN IF NOT EXISTS "project_knowledge_score" integer`,
    `ALTER TABLE "ambassador_os_training_progress" ADD COLUMN IF NOT EXISTS "customer_communication_score" integer`,
    `ALTER TABLE "ambassador_os_training_progress" ADD COLUMN IF NOT EXISTS "marketing_knowledge_score" integer`,
    `ALTER TABLE "ambassador_os_training_progress" ADD COLUMN IF NOT EXISTS "ethics_compliance_score" integer`,
    `ALTER TABLE "ambassador_os_training_progress" ADD COLUMN IF NOT EXISTS "attendance_status" text NOT NULL DEFAULT 'NOT_RECORDED'`,
    `ALTER TABLE "ambassador_os_training_progress" ADD COLUMN IF NOT EXISTS "lesson_version" integer NOT NULL DEFAULT 1`,
    `CREATE TABLE IF NOT EXISTS "ambassador_os_training_modules" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "day" integer NOT NULL,
       "title" text NOT NULL,
       "summary" text NOT NULL,
       "lesson" text NOT NULL,
       "key_points" jsonb NOT NULL DEFAULT '[]'::jsonb,
       "assignment" text NOT NULL,
       "questions" jsonb NOT NULL DEFAULT '[]'::jsonb,
       "video_url" text,
       "version" integer NOT NULL DEFAULT 1,
       "is_published" boolean NOT NULL DEFAULT false,
       "published_by_id" uuid REFERENCES "users"("id"),
       "published_at" timestamptz,
       "created_by_id" uuid NOT NULL REFERENCES "users"("id"),
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_training_modules_day_pub_idx" ON "ambassador_os_training_modules" ("day", "is_published", "version")`,
    `ALTER TABLE "ambassador_os_training_modules" ADD COLUMN IF NOT EXISTS "questions" jsonb NOT NULL DEFAULT '[]'::jsonb`,

    `CREATE TABLE IF NOT EXISTS "ambassador_os_campaigns" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "project_id" uuid REFERENCES "projects"("id"),
       "name" text NOT NULL,
       "project_name" text NOT NULL,
       "location" text NOT NULL,
       "target_inventory" integer NOT NULL,
       "sales_target" integer NOT NULL DEFAULT 114,
       "unit_area_sq_ft" integer NOT NULL,
       "target_days" integer NOT NULL,
       "starts_at" timestamptz,
       "status" text NOT NULL DEFAULT 'PLANNED',
       "official_data_verified" boolean NOT NULL DEFAULT false,
       "official_data_notes" text,
       "created_by_id" uuid NOT NULL REFERENCES "users"("id"),
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `ALTER TABLE "ambassador_os_campaigns" ADD COLUMN IF NOT EXISTS "project_id" uuid REFERENCES "projects"("id")`,
    `ALTER TABLE "ambassador_os_campaigns" ADD COLUMN IF NOT EXISTS "sales_target" integer NOT NULL DEFAULT 114`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_campaign_status_idx" ON "ambassador_os_campaigns" ("status")`,
    `CREATE TABLE IF NOT EXISTS "ambassador_os_career_assessments" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "ambassador_id" uuid NOT NULL REFERENCES "users"("id"),
       "target_level" text NOT NULL,
       "assessment_type" text NOT NULL,
       "score" integer NOT NULL,
       "passed" boolean NOT NULL DEFAULT false,
       "evidence_reference" text NOT NULL,
       "notes" text NOT NULL,
       "reviewer_id" uuid NOT NULL REFERENCES "users"("id"),
       "reviewed_at" timestamptz NOT NULL DEFAULT now(),
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_career_assessments_ambassador_level_idx" ON "ambassador_os_career_assessments" ("ambassador_id", "target_level", "reviewed_at")`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_career_assessments_result_idx" ON "ambassador_os_career_assessments" ("target_level", "passed", "reviewed_at")`,
    `CREATE TABLE IF NOT EXISTS "ambassador_os_career_opportunities" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "title" text NOT NULL,
       "opportunity_type" text NOT NULL,
       "description" text NOT NULL,
       "location" text,
       "target_level" text NOT NULL,
       "required_skills" jsonb NOT NULL DEFAULT '[]'::jsonb,
       "eligibility" jsonb NOT NULL DEFAULT '{}'::jsonb,
       "vacancies" integer NOT NULL DEFAULT 1,
       "application_deadline" timestamptz,
       "status" text NOT NULL DEFAULT 'DRAFT',
       "created_by_id" uuid NOT NULL REFERENCES "users"("id"),
       "published_at" timestamptz,
       "closed_at" timestamptz,
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_opportunities_status_deadline_idx" ON "ambassador_os_career_opportunities" ("status", "application_deadline")`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_opportunities_level_idx" ON "ambassador_os_career_opportunities" ("target_level", "status")`,
    `CREATE TABLE IF NOT EXISTS "ambassador_os_career_applications" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "opportunity_id" uuid NOT NULL REFERENCES "ambassador_os_career_opportunities"("id"),
       "ambassador_id" uuid NOT NULL REFERENCES "users"("id"),
       "statement" text NOT NULL,
       "evidence_reference" text,
       "status" text NOT NULL DEFAULT 'SUBMITTED',
       "reviewer_id" uuid REFERENCES "users"("id"),
       "review_notes" text,
       "reviewed_at" timestamptz,
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "ambassador_os_career_application_unique" ON "ambassador_os_career_applications" ("opportunity_id", "ambassador_id")`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_career_applications_status_idx" ON "ambassador_os_career_applications" ("status", "created_at")`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_career_applications_ambassador_idx" ON "ambassador_os_career_applications" ("ambassador_id", "created_at")`,
    `CREATE TABLE IF NOT EXISTS "ambassador_os_channel_costs" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "campaign_id" uuid NOT NULL REFERENCES "ambassador_os_campaigns"("id"),
       "source_channel" text NOT NULL,
       "amount" double precision NOT NULL,
       "period_start" timestamptz NOT NULL,
       "period_end" timestamptz NOT NULL,
       "evidence_reference" text,
       "notes" text,
       "created_by_id" uuid NOT NULL REFERENCES "users"("id"),
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_channel_cost_campaign_idx" ON "ambassador_os_channel_costs" ("campaign_id", "source_channel", "period_start")`,
    `CREATE TABLE IF NOT EXISTS "ambassador_os_scorecard_policies" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "version" integer NOT NULL DEFAULT 1,
       "genuine_lead_quality_weight" integer NOT NULL DEFAULT 25,
       "customer_communication_weight" integer NOT NULL DEFAULT 20,
       "site_visit_contribution_weight" integer NOT NULL DEFAULT 15,
       "verified_sales_contribution_weight" integer NOT NULL DEFAULT 15,
       "crm_discipline_weight" integer NOT NULL DEFAULT 10,
       "training_skill_development_weight" integer NOT NULL DEFAULT 10,
       "ethics_compliance_weight" integer NOT NULL DEFAULT 5,
       "active" boolean NOT NULL DEFAULT true,
       "approval_reference" text,
       "created_by_id" uuid NOT NULL REFERENCES "users"("id"),
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "ambassador_os_scorecard_policy_version_unique" ON "ambassador_os_scorecard_policies" ("version")`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_scorecard_policy_active_idx" ON "ambassador_os_scorecard_policies" ("active")`,
    `CREATE TABLE IF NOT EXISTS "ambassador_os_performance_reviews" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "ambassador_id" uuid NOT NULL REFERENCES "users"("id"),
       "period_start" timestamptz NOT NULL,
       "period_end" timestamptz NOT NULL,
       "scorecard_policy_version" integer NOT NULL,
       "genuine_lead_quality_score" integer NOT NULL,
       "customer_communication_score" integer NOT NULL,
       "site_visit_contribution_score" integer NOT NULL,
       "verified_sales_contribution_score" integer NOT NULL,
       "crm_discipline_score" integer NOT NULL,
       "training_skill_development_score" integer NOT NULL,
       "ethics_compliance_score" integer NOT NULL,
       "weighted_score" double precision NOT NULL,
       "serious_misconduct" boolean NOT NULL DEFAULT false,
       "compliance_notes" text,
       "review_notes" text,
       "reviewed_by_id" uuid NOT NULL REFERENCES "users"("id"),
       "reviewed_at" timestamptz NOT NULL DEFAULT now(),
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_performance_ambassador_period_idx" ON "ambassador_os_performance_reviews" ("ambassador_id", "period_end")`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_performance_misconduct_idx" ON "ambassador_os_performance_reviews" ("serious_misconduct", "period_end")`,


    // Real-estate bookings are distinct from enquiry/lead records and incentives.
    `CREATE TABLE IF NOT EXISTS "ambassador_os_property_bookings" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "booking_no" bigserial NOT NULL,
       "booking_reference" text NOT NULL UNIQUE,
       "lead_id" uuid NOT NULL REFERENCES "leads"("id"),
       "campaign_id" uuid REFERENCES "ambassador_os_campaigns"("id"),
       "project_id" uuid NOT NULL REFERENCES "projects"("id"),
       "unit_id" uuid REFERENCES "units"("id"),
       "status" text NOT NULL DEFAULT 'SUBMITTED',
       "booking_value" double precision NOT NULL,
       "amount_received" double precision NOT NULL DEFAULT 0,
       "payment_milestone" text NOT NULL DEFAULT 'BOOKING_CONFIRMED',
       "payment_milestone_notes" text,
       "agreement_reference" text,
       "source_snapshot" text,
       "verified_by_id" uuid REFERENCES "users"("id"),
       "verified_at" timestamptz,
       "rejected_by_id" uuid REFERENCES "users"("id"),
       "rejected_at" timestamptz,
       "rejection_reason" text,
       "cancelled_at" timestamptz,
       "cancellation_reason" text,
       "refund_status" text NOT NULL DEFAULT 'NOT_REQUIRED',
       "refund_amount" double precision NOT NULL DEFAULT 0,
       "refund_reference" text,
       "expected_incentive_payout_at" timestamptz,
       "notes" text,
       "created_by_id" uuid NOT NULL REFERENCES "users"("id"),
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "ambassador_os_property_booking_no_unique" ON "ambassador_os_property_bookings" ("booking_no")`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_property_booking_status_idx" ON "ambassador_os_property_bookings" ("status", "created_at")`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_property_booking_project_idx" ON "ambassador_os_property_bookings" ("project_id", "status")`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_property_booking_lead_idx" ON "ambassador_os_property_bookings" ("lead_id", "created_at")`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_property_booking_campaign_idx" ON "ambassador_os_property_bookings" ("campaign_id", "status")`,
    `CREATE TABLE IF NOT EXISTS "ambassador_os_property_booking_history" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "booking_id" uuid NOT NULL REFERENCES "ambassador_os_property_bookings"("id"),
       "from_status" text,
       "to_status" text NOT NULL,
       "reason" text,
       "metadata" jsonb,
       "actor_user_id" uuid NOT NULL REFERENCES "users"("id"),
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_booking_history_idx" ON "ambassador_os_property_booking_history" ("booking_id", "created_at")`,
    `ALTER TABLE "ambassador_os_property_bookings" ADD COLUMN IF NOT EXISTS "payment_milestone" text NOT NULL DEFAULT 'BOOKING_CONFIRMED'`,
    `ALTER TABLE "ambassador_os_property_bookings" ADD COLUMN IF NOT EXISTS "refund_status" text NOT NULL DEFAULT 'NOT_REQUIRED'`,
    `ALTER TABLE "ambassador_os_property_bookings" ADD COLUMN IF NOT EXISTS "refund_amount" double precision NOT NULL DEFAULT 0`,
    `ALTER TABLE "ambassador_os_property_bookings" ADD COLUMN IF NOT EXISTS "refund_reference" text`,
    `ALTER TABLE "ambassador_os_property_bookings" ADD COLUMN IF NOT EXISTS "expected_incentive_payout_at" timestamptz`,

    `CREATE TABLE IF NOT EXISTS "ambassador_os_tasks" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "title" text NOT NULL,
       "category" text NOT NULL,
       "description" text NOT NULL,
       "assigned_to_id" uuid NOT NULL REFERENCES "users"("id"),
       "campaign_id" uuid,
       "due_at" timestamptz,
       "status" text NOT NULL DEFAULT 'ASSIGNED',
       "evidence_text" text,
       "evidence_url" text,
       "checklist_items" jsonb NOT NULL DEFAULT '[]'::jsonb,
       "checklist_responses" jsonb NOT NULL DEFAULT '[]'::jsonb,
       "review_reason" text,
       "reviewed_by_id" uuid REFERENCES "users"("id"),
       "reviewed_at" timestamptz,
       "created_by_id" uuid NOT NULL REFERENCES "users"("id"),
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "completed_at" timestamptz
     )`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_tasks_assignee_status_idx" ON "ambassador_os_tasks" ("assigned_to_id", "status")`,
    `ALTER TABLE "ambassador_os_tasks" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'ASSIGNED'`,
    `ALTER TABLE "ambassador_os_tasks" ADD COLUMN IF NOT EXISTS "checklist_items" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE "ambassador_os_tasks" ADD COLUMN IF NOT EXISTS "checklist_responses" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    `UPDATE "ambassador_os_tasks"
       SET "checklist_items" = '[
         {"key":"official_project_source","label":"Official project/source document is available and current"},
         {"key":"approved_project_record","label":"Project approval/verification matches the current Truvi project record"},
         {"key":"current_price_list","label":"Current official price-list source and date have been checked"},
         {"key":"available_inventory","label":"Unit/plot availability was checked against the current inventory record"},
         {"key":"unit_details","label":"Plot/unit identifier, area and location match the source record"},
         {"key":"claims_supported","label":"Amenities and marketing claims have supporting approved evidence"},
         {"key":"required_disclaimer","label":"Required campaign disclaimer and marketing-guideline rules are followed"},
         {"key":"evidence_attached","label":"Evidence/reference is attached and any discrepancy is recorded"}
       ]'::jsonb
       WHERE "category" = 'VERIFICATION'
         AND COALESCE(jsonb_array_length("checklist_items"), 0) = 0`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_tasks_due_idx" ON "ambassador_os_tasks" ("due_at")`,
    `CREATE TABLE IF NOT EXISTS "ambassador_os_follow_ups" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "lead_id" uuid NOT NULL REFERENCES "leads"("id"),
       "ambassador_id" uuid NOT NULL REFERENCES "users"("id"),
       "due_at" timestamptz NOT NULL,
       "channel" text NOT NULL DEFAULT 'CALL',
       "note" text NOT NULL,
       "status" text NOT NULL DEFAULT 'PENDING',
       "outcome" text,
       "completed_at" timestamptz,
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_followups_owner_due_idx" ON "ambassador_os_follow_ups" ("ambassador_id", "status", "due_at")`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_followups_lead_idx" ON "ambassador_os_follow_ups" ("lead_id", "due_at")`,

    `CREATE TABLE IF NOT EXISTS "ambassador_os_incentive_policies" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "name" text NOT NULL,
       "campaign_id" uuid REFERENCES "ambassador_os_campaigns"("id"),
       "calculation_type" text NOT NULL,
       "amount" double precision NOT NULL,
       "block_size_sq_ft" integer NOT NULL DEFAULT 1000,
       "version" integer NOT NULL DEFAULT 1,
       "active" boolean NOT NULL DEFAULT false,
       "approval_reference" text,
       "effective_from" timestamptz,
       "created_by_id" uuid NOT NULL REFERENCES "users"("id"),
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `ALTER TABLE "ambassador_os_incentive_policies" ADD COLUMN IF NOT EXISTS "eligible_sources" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE "ambassador_os_incentive_policies" ADD COLUMN IF NOT EXISTS "required_booking_status" text NOT NULL DEFAULT 'SALE_VERIFIED'`,
    `ALTER TABLE "ambassador_os_incentive_policies" ADD COLUMN IF NOT EXISTS "payment_milestone" text NOT NULL DEFAULT 'BOOKING_CONFIRMED'`,
    `ALTER TABLE "ambassador_os_incentive_policies" ADD COLUMN IF NOT EXISTS "cancellation_treatment" text NOT NULL DEFAULT 'CANCEL_INCENTIVE'`,
    `ALTER TABLE "ambassador_os_incentive_policies" ADD COLUMN IF NOT EXISTS "payout_delay_days" integer NOT NULL DEFAULT 30`,
    `ALTER TABLE "ambassador_os_incentive_policies" ADD COLUMN IF NOT EXISTS "approval_authority" text`,
    `ALTER TABLE "ambassador_os_incentive_policies" ADD COLUMN IF NOT EXISTS "commission_agreement_reference" text`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "ambassador_os_policy_name_version_unique" ON "ambassador_os_incentive_policies" ("name", "version")`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_policy_active_idx" ON "ambassador_os_incentive_policies" ("active")`,
    `CREATE TABLE IF NOT EXISTS "ambassador_os_incentives" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "user_id" uuid NOT NULL REFERENCES "users"("id"),
       "campaign_id" uuid REFERENCES "ambassador_os_campaigns"("id"),
       "policy_id" uuid NOT NULL REFERENCES "ambassador_os_incentive_policies"("id"),
       "policy_name_snapshot" text NOT NULL,
       "policy_version" integer NOT NULL,
       "booking_reference" text NOT NULL,
       "verified_area_sq_ft" integer NOT NULL,
       "property_value" double precision,
       "amount" double precision NOT NULL,
       "status" text NOT NULL DEFAULT 'PENDING',
       "payment_reference" text,
       "created_by_id" uuid NOT NULL REFERENCES "users"("id"),
       "approved_by_id" uuid REFERENCES "users"("id"),
       "approved_at" timestamptz,
       "paid_at" timestamptz,
       "created_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `ALTER TABLE "ambassador_os_incentives" ADD COLUMN IF NOT EXISTS "property_booking_id" uuid REFERENCES "ambassador_os_property_bookings"("id")`,
    `ALTER TABLE "ambassador_os_incentives" ADD COLUMN IF NOT EXISTS "expected_payout_at" timestamptz`,
    `ALTER TABLE "ambassador_os_incentives" ADD COLUMN IF NOT EXISTS "recovery_status" text NOT NULL DEFAULT 'NOT_REQUIRED'`,
    `ALTER TABLE "ambassador_os_incentives" ADD COLUMN IF NOT EXISTS "recovery_amount" double precision NOT NULL DEFAULT 0`,
    `ALTER TABLE "ambassador_os_incentives" ADD COLUMN IF NOT EXISTS "recovery_reference" text`,
    `ALTER TABLE "ambassador_os_incentives" ADD COLUMN IF NOT EXISTS "recovery_reviewed_by_id" uuid REFERENCES "users"("id")`,
    `ALTER TABLE "ambassador_os_incentives" ADD COLUMN IF NOT EXISTS "recovery_reviewed_at" timestamptz`,

    `CREATE UNIQUE INDEX IF NOT EXISTS "ambassador_os_incentives_property_booking_unique" ON "ambassador_os_incentives" ("property_booking_id")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "ambassador_os_incentives_booking_unique" ON "ambassador_os_incentives" ("booking_reference")`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_incentives_user_status_idx" ON "ambassador_os_incentives" ("user_id", "status")`,

    // Self-service privacy request history and legally-approved retention controls.
    `CREATE TABLE IF NOT EXISTS "ambassador_os_privacy_requests" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "requester_user_id" uuid NOT NULL REFERENCES "users"("id"),
       "request_type" text NOT NULL,
       "reason" text NOT NULL,
       "status" text NOT NULL DEFAULT 'SUBMITTED',
       "review_notes" text,
       "reviewer_user_id" uuid REFERENCES "users"("id"),
       "completion_reference" text,
       "requested_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now(),
       "completed_at" timestamptz
     )`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_privacy_request_user_idx" ON "ambassador_os_privacy_requests" ("requester_user_id", "requested_at")`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_privacy_request_status_idx" ON "ambassador_os_privacy_requests" ("status", "requested_at")`,
    `CREATE TABLE IF NOT EXISTS "ambassador_os_retention_policies" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "data_category" text NOT NULL,
       "retention_days" integer NOT NULL,
       "active" boolean NOT NULL DEFAULT false,
       "legal_approval_reference" text,
       "policy_version" integer NOT NULL DEFAULT 1,
       "created_by_id" uuid NOT NULL REFERENCES "users"("id"),
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now(),
       UNIQUE ("data_category", "policy_version")
     )`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_retention_active_idx" ON "ambassador_os_retention_policies" ("active", "data_category")`,
    // Staff roles are scoped to this operating system and never elevate global permissions.
    `CREATE TABLE IF NOT EXISTS "ambassador_os_staff_assignments" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "user_id" uuid NOT NULL REFERENCES "users"("id"),
       "os_role" text NOT NULL,
       "active" boolean NOT NULL DEFAULT true,
       "granted_by_id" uuid NOT NULL REFERENCES "users"("id"),
       "granted_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now(),
       UNIQUE ("user_id", "os_role")
     )`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_staff_active_role_idx" ON "ambassador_os_staff_assignments" ("active", "os_role")`,
    // Versioned campaign-specific marketing rules and acknowledgement evidence.
    `CREATE TABLE IF NOT EXISTS "ambassador_os_campaign_guidelines" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "campaign_id" uuid NOT NULL REFERENCES "ambassador_os_campaigns"("id"),
       "version" integer NOT NULL,
       "content" text NOT NULL,
       "approval_reference" text NOT NULL,
       "created_by_id" uuid NOT NULL REFERENCES "users"("id"),
       "published_at" timestamptz NOT NULL DEFAULT now(),
       "created_at" timestamptz NOT NULL DEFAULT now(),
       UNIQUE ("campaign_id", "version")
     )`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_campaign_guidelines_current_idx" ON "ambassador_os_campaign_guidelines" ("campaign_id", "published_at")`,
    `CREATE TABLE IF NOT EXISTS "ambassador_os_campaign_acknowledgements" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "campaign_id" uuid NOT NULL REFERENCES "ambassador_os_campaigns"("id"),
       "ambassador_id" uuid NOT NULL REFERENCES "users"("id"),
       "guideline_version" integer NOT NULL,
       "acknowledged_at" timestamptz NOT NULL DEFAULT now(),
       UNIQUE ("campaign_id", "ambassador_id", "guideline_version")
     )`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_campaign_ack_user_idx" ON "ambassador_os_campaign_acknowledgements" ("ambassador_id", "campaign_id", "guideline_version")`,
    `CREATE TABLE IF NOT EXISTS "ambassador_os_marketing_materials" (
       "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       "campaign_id" uuid NOT NULL REFERENCES "ambassador_os_campaigns"("id"),
       "title" text NOT NULL,
       "channel" text NOT NULL,
       "content" text NOT NULL,
       "asset_url" text,
       "version" integer NOT NULL DEFAULT 1,
       "status" text NOT NULL DEFAULT 'SUBMITTED',
       "valid_from" timestamptz,
       "valid_to" timestamptz,
       "reviewer_id" uuid REFERENCES "users"("id"),
       "reviewed_at" timestamptz,
       "review_reason" text,
       "created_by_id" uuid NOT NULL REFERENCES "users"("id"),
       "created_at" timestamptz NOT NULL DEFAULT now(),
       "updated_at" timestamptz NOT NULL DEFAULT now()
     )`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_marketing_material_status_idx" ON "ambassador_os_marketing_materials" ("status", "campaign_id")`,
    `CREATE INDEX IF NOT EXISTS "ambassador_os_marketing_material_dates_idx" ON "ambassador_os_marketing_materials" ("valid_from", "valid_to")`,
    // Verification-engine extensions + vector/pgcrypto objects (Phase 1).
    ...VERIFICATION_BOOT_SQL,
  ];
  for (const stmt of statements) {
    try {
      await db.execute(stmt);
    } catch (err) {
      console.warn(`ensureSchema failed for "${stmt.split("\n")[0]}…":`, err instanceof Error ? err.message : err);
    }
  }

  // Seed single-row config defaults (thresholds + active AI prompt). Depends on
  // the Drizzle tables existing (`drizzle-kit push`); best-effort until then.
  try {
    await ensureVerificationDefaults(db);
  } catch (err) {
    console.warn("ensureVerificationDefaults skipped:", err instanceof Error ? err.message : err);
  }
}

export async function connectDB(url: string): Promise<boolean> {
  if (isConnected) return true;

  if (!url || url.trim() === "") {
    connectionError = new Error("No DATABASE_URL configured. Set it in server/.env to enable the database-backed API routes.");
    console.warn(connectionError.message);
    return false;
  }

  try {
    const db = connectDb(url);
    await db.execute("select 1");
    await ensureSchema(db);
    // Provision the default Founder (CEO OS) account if it doesn't exist yet, so
    // a fresh deploy is reachable without running the destructive seed.
    await ensureDefaultFounder(db);
    isConnected = true;
    connectionError = null;
    console.log("Supabase (Postgres) connected");
    return true;
  } catch (error) {
    connectionError = error instanceof Error ? error : new Error(String(error));
    isConnected = false;
    await closeDb();
    if (error instanceof FounderProvisioningConfigError) throw error;
    console.warn(`Database connection unavailable; continuing without it: ${connectionError.message}`);
    return false;
  }
}

export async function disconnectDB(): Promise<void> {
  if (!isConnected) return;
  await closeDb();
  isConnected = false;
  connectionError = null;
}

export function getDatabaseStatus(): { connected: boolean; error: string | null } {
  return {
    connected: isConnected,
    error: connectionError?.message ?? null,
  };
}

export { getDb };
