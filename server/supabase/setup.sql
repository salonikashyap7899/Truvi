-- ============================================================================
-- Truvi — Supabase (Postgres) setup
-- Run this WHOLE file in the Supabase dashboard → SQL Editor → New query → Run.
-- It (1) clears any previous/partial Truvi tables, (2) creates the correct
-- schema, and (3) creates your admin login. Safe to re-run from scratch.
--
--   Admin login after running this:
--     email:    admin@truvi.app
--     password: Password123!
--   (Change the password later from the app, or re-run STEP 3 with a new hash.)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- STEP 1 — clean slate (drops existing Truvi tables and their data)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "commissions" CASCADE;
DROP TABLE IF EXISTS "site_visits" CASCADE;
DROP TABLE IF EXISTS "lead_purchases" CASCADE;
DROP TABLE IF EXISTS "notifications" CASCADE;
DROP TABLE IF EXISTS "posts" CASCADE;
DROP TABLE IF EXISTS "investments" CASCADE;
DROP TABLE IF EXISTS "loan_checks" CASCADE;
DROP TABLE IF EXISTS "buyer_documents" CASCADE;
DROP TABLE IF EXISTS "shared_documents" CASCADE;
DROP TABLE IF EXISTS "project_assets" CASCADE;
DROP TABLE IF EXISTS "course_progress" CASCADE;
DROP TABLE IF EXISTS "enquiries" CASCADE;
DROP TABLE IF EXISTS "leads" CASCADE;
DROP TABLE IF EXISTS "units" CASCADE;
DROP TABLE IF EXISTS "projects" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;

-- ---------------------------------------------------------------------------
-- STEP 2 — create all tables, indexes, and foreign keys
-- ---------------------------------------------------------------------------
CREATE TABLE "buyer_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyer_id" uuid NOT NULL,
	"doc_type" text NOT NULL,
	"file_name" text NOT NULL,
	"file_url" text NOT NULL,
	"status" text DEFAULT 'UPLOADED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"cp_id" uuid NOT NULL,
	"booking_value" double precision NOT NULL,
	"commission_percent" double precision NOT NULL,
	"cp_commission_amount" double precision NOT NULL,
	"platform_fee_amount" double precision NOT NULL,
	"tds_amount" double precision NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"milestones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"invoice_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "course_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" text NOT NULL,
	"completed_modules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "enquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"purpose_type" text NOT NULL,
	"message" text,
	"upload_url" text,
	"upload_file_name" text,
	"project_id" uuid,
	"project_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "investments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"property_name" text NOT NULL,
	"purchase_price" double precision NOT NULL,
	"purchase_date" timestamp with time zone NOT NULL,
	"current_value" double precision NOT NULL,
	"rental_income" double precision DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "lead_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cp_id" uuid NOT NULL,
	"lead_type" text NOT NULL,
	"amount_paid" double precision NOT NULL,
	"razorpay_order_id" text,
	"razorpay_payment_id" text,
	"payment_status" text DEFAULT 'SIMULATED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"submitted_by_id" uuid NOT NULL,
	"assigned_to_id" uuid,
	"client_name" text NOT NULL,
	"client_phone" text NOT NULL,
	"client_email" text,
	"stage" text DEFAULT 'GENERATED' NOT NULL,
	"source" text NOT NULL,
	"notes" text,
	"is_duplicate" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "loan_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"income" double precision NOT NULL,
	"obligations" double precision NOT NULL,
	"tenure" double precision NOT NULL,
	"interest_rate" double precision NOT NULL,
	"eligible_amount" double precision NOT NULL,
	"estimated_emi" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"message" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"author_name" text NOT NULL,
	"author_role" text NOT NULL,
	"content" text NOT NULL,
	"category" text DEFAULT 'DISCUSSION' NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"liked_by" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "project_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"file_url" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" double precision NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"developer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"city" text NOT NULL,
	"location" text NOT NULL,
	"brochure_url" text,
	"price_list_url" text,
	"rera_number" text,
	"approval_status" text DEFAULT 'PENDING' NOT NULL,
	"listing_tier" text DEFAULT 'STANDARD' NOT NULL,
	"featured_until" timestamp with time zone,
	"is_prime_listing" boolean DEFAULT false NOT NULL,
	"commission_percent" double precision DEFAULT 3 NOT NULL,
	"trust_score" double precision,
	"legal_risk_level" text,
	"flood_risk_level" text,
	"crime_index_level" text,
	"rera_status" text,
	"rera_validity_date" timestamp with time zone,
	"is_verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"verification_details" jsonb DEFAULT '{"reraVerified":false,"titleClearance":false,"encumbranceFree":false,"constructionApproval":false,"portfolioVerified":false}'::jsonb,
	"project_type" text,
	"presentation_info" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "shared_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"uploaded_by_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_url" text NOT NULL,
	"file_type" text DEFAULT 'OTHER' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "site_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"project_id" uuid NOT NULL,
	"cp_id" uuid,
	"buyer_id" uuid,
	"scheduled_at" timestamp with time zone NOT NULL,
	"time_slot" text,
	"contact_number" text,
	"status" text DEFAULT 'SCHEDULED' NOT NULL,
	"geo_verified_lat" double precision,
	"geo_verified_lng" double precision,
	"attendance_confirmed" boolean DEFAULT false NOT NULL,
	"report_notes" text,
	"next_steps" text
);

CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"unit_number" text NOT NULL,
	"type" text NOT NULL,
	"area_sqft" double precision NOT NULL,
	"price" double precision NOT NULL,
	"status" text DEFAULT 'AVAILABLE' NOT NULL,
	"locked_by_cp_id" uuid,
	"lock_expires_at" timestamp with time zone,
	"price_history" jsonb DEFAULT '[]'::jsonb NOT NULL
);

CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"role" text NOT NULL,
	"approval_status" text DEFAULT 'PENDING' NOT NULL,
	"phone" text,
	"onboarding_verified" boolean DEFAULT false NOT NULL,
	"onboarding_checks" jsonb DEFAULT '{"aadhaarVerified":false,"phoneVerified":false,"emailVerified":false}'::jsonb,
	"verification" jsonb,
	"cp_tier" text DEFAULT 'SILVER',
	"cp_profile" jsonb DEFAULT '{"isPremium":false,"premiumExpiresAt":null,"conversionRatio":0,"totalBookings":0}'::jsonb,
	"developer_profile" jsonb,
	"buyer_profile" jsonb DEFAULT '{"savedProjectIds":[],"compareProjectIds":[]}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "buyer_documents" ADD CONSTRAINT "buyer_documents_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_cp_id_users_id_fk" FOREIGN KEY ("cp_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "course_progress" ADD CONSTRAINT "course_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "investments" ADD CONSTRAINT "investments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "lead_purchases" ADD CONSTRAINT "lead_purchases_cp_id_users_id_fk" FOREIGN KEY ("cp_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "leads" ADD CONSTRAINT "leads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "leads" ADD CONSTRAINT "leads_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "loan_checks" ADD CONSTRAINT "loan_checks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "project_assets" ADD CONSTRAINT "project_assets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "project_assets" ADD CONSTRAINT "project_assets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "projects" ADD CONSTRAINT "projects_developer_id_users_id_fk" FOREIGN KEY ("developer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "shared_documents" ADD CONSTRAINT "shared_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "shared_documents" ADD CONSTRAINT "shared_documents_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_cp_id_users_id_fk" FOREIGN KEY ("cp_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "site_visits" ADD CONSTRAINT "site_visits_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "units" ADD CONSTRAINT "units_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "units" ADD CONSTRAINT "units_locked_by_cp_id_users_id_fk" FOREIGN KEY ("locked_by_cp_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
CREATE INDEX "buyer_documents_buyer_doctype_idx" ON "buyer_documents" USING btree ("buyer_id","doc_type");
CREATE UNIQUE INDEX "commissions_lead_unique" ON "commissions" USING btree ("lead_id");
CREATE INDEX "commissions_cp_idx" ON "commissions" USING btree ("cp_id");
CREATE UNIQUE INDEX "course_progress_user_course_unique" ON "course_progress" USING btree ("user_id","course_id");
CREATE INDEX "enquiries_created_idx" ON "enquiries" USING btree ("created_at");
CREATE INDEX "enquiries_purpose_idx" ON "enquiries" USING btree ("purpose_type");
CREATE INDEX "investments_user_idx" ON "investments" USING btree ("user_id");
CREATE INDEX "leads_assigned_stage_idx" ON "leads" USING btree ("assigned_to_id","stage");
CREATE INDEX "leads_dup_check_idx" ON "leads" USING btree ("project_id","client_phone","created_at");
CREATE INDEX "loan_checks_user_idx" ON "loan_checks" USING btree ("user_id");
CREATE INDEX "notifications_user_read_created_idx" ON "notifications" USING btree ("user_id","is_read","created_at");
CREATE INDEX "posts_created_idx" ON "posts" USING btree ("created_at");
CREATE INDEX "project_assets_project_category_created_idx" ON "project_assets" USING btree ("project_id","category","created_at");
CREATE INDEX "projects_approval_tier_idx" ON "projects" USING btree ("approval_status","listing_tier");
CREATE INDEX "projects_developer_idx" ON "projects" USING btree ("developer_id");
CREATE INDEX "projects_city_idx" ON "projects" USING btree ("city");
CREATE INDEX "shared_documents_project_created_idx" ON "shared_documents" USING btree ("project_id","created_at");
CREATE INDEX "site_visits_cp_status_idx" ON "site_visits" USING btree ("cp_id","status");
CREATE INDEX "site_visits_buyer_status_idx" ON "site_visits" USING btree ("buyer_id","status");
CREATE INDEX "site_visits_project_idx" ON "site_visits" USING btree ("project_id");
CREATE INDEX "units_project_status_idx" ON "units" USING btree ("project_id","status");
CREATE INDEX "units_status_lock_idx" ON "units" USING btree ("status","lock_expires_at");
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");
CREATE INDEX "users_role_approval_idx" ON "users" USING btree ("role","approval_status");

-- ---------------------------------------------------------------------------
-- STEP 3 — seed the admin account (bcrypt hash of "Password123!")
-- ---------------------------------------------------------------------------
INSERT INTO "users" ("name", "email", "password", "role", "approval_status", "onboarding_verified")
VALUES ('Truvi Admin', 'admin@truvi.app', '$2b$12$.IfErNaXzSvErg2llW4WjOrSZV9M31/tvjeHcQW85e.iY.j20G916', 'ADMIN', 'APPROVED', true)
ON CONFLICT ("email") DO UPDATE
  SET "password" = EXCLUDED."password",
      "role" = 'ADMIN',
      "approval_status" = 'APPROVED',
      "onboarding_verified" = true;

-- Done. You can now log in at your frontend with admin@truvi.app / Password123!
