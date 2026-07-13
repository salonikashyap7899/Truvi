/**
 * Dynamic AI verification & Q&A engine — schema (Phase 1: foundation).
 *
 * Everything here hangs off the existing `projects` table (a project IS the
 * "property" in the spec). Nothing about the verification logic is hardcoded:
 * checks, weights, thresholds, fraud rules and AI prompts all live in the
 * config tables below and are editable by admins at runtime — the engines in
 * later phases just read these rows.
 *
 * Extension-dependent objects (pgvector `document_embeddings`, pgcrypto
 * `kyc_data`, IVFFLAT / trigram indexes) are created idempotently at boot in
 * `verificationBootSql.ts` because Drizzle can't model the `vector`/`bytea`
 * types or those index kinds. The relational tables here are created via
 * `drizzle-kit push` (and are self-healed on boot alongside the SQL objects).
 */
import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  doublePrecision,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projects, users } from "./schema";

// ---------------------------------------------------------------------------
// Enum-ish types (enforced at the app layer, stored as text)
// ---------------------------------------------------------------------------

export type CheckLogicType = "exists" | "compare" | "range" | "absence" | "sql";
export type FraudSeverity = "low" | "medium" | "high";
export type VerificationStatus = "VERIFIED" | "PENDING" | "UNAVAILABLE";
export type ChatRole = "user" | "assistant";

// The 7 raw-data categories that power the listing intelligence panel. Kept in
// sync with the labels the existing (soon-to-be-replaced) intelligenceService
// renders.
export const DATA_CATEGORIES = [
  "government_legal",
  "infrastructure",
  "location_intelligence",
  "market_intelligence",
  "environmental_data",
  "satellite_gis",
  "community_intelligence",
] as const;
export type DataCategory = (typeof DATA_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// Category data tables — one row per data point per project.
// Granular fields specific to a category live in `rawData` (JSONB) so admins
// can ingest new shapes without a schema change; `dataKey`/`label` identify
// the point (e.g. dataKey "rera_projects", label "RERA Projects"). Optional
// PostGIS GEOGRAPHY columns are added later, gated on the extension.
// ---------------------------------------------------------------------------

function categoryColumns() {
  return {
    _id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects._id, { onDelete: "cascade" }),
    dataKey: text("data_key").notNull(),
    label: text("label").notNull(),
    sourceType: text("source_type"),
    sourceDate: timestamp("source_date", { withTimezone: true, mode: "date" }),
    rawData: jsonb("raw_data").$type<Record<string, unknown>>().notNull().default({}),
    verified: boolean("verified").notNull().default(false),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  };
}

// `t` is the built-column map drizzle passes to the extraConfig callback; typed
// loosely so the one helper works across all seven identically-shaped tables.
const categoryIndexes = (t: Record<string, any>) => [
  uniqueIndex().on(t.projectId, t.dataKey),
  index().on(t.projectId, t.verified),
];

export const governmentLegal = pgTable("government_legal", categoryColumns(), categoryIndexes);
export const infrastructure = pgTable("infrastructure", categoryColumns(), categoryIndexes);
export const locationIntelligence = pgTable("location_intelligence", categoryColumns(), categoryIndexes);
export const marketIntelligence = pgTable("market_intelligence", categoryColumns(), categoryIndexes);
export const environmentalData = pgTable("environmental_data", categoryColumns(), categoryIndexes);
export const satelliteGis = pgTable("satellite_gis", categoryColumns(), categoryIndexes);
export const communityIntelligence = pgTable("community_intelligence", categoryColumns(), categoryIndexes);

/** Category name → its Drizzle table, so the ingestion/engine code can route dynamically. */
export const CATEGORY_TABLES = {
  government_legal: governmentLegal,
  infrastructure,
  location_intelligence: locationIntelligence,
  market_intelligence: marketIntelligence,
  environmental_data: environmentalData,
  satellite_gis: satelliteGis,
  community_intelligence: communityIntelligence,
} as const;

// ---------------------------------------------------------------------------
// Config tables — admin-managed; drive the whole engine (no redeploy needed).
// ---------------------------------------------------------------------------

export const verificationChecks = pgTable(
  "verification_checks",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    category: text("category").$type<DataCategory>().notNull(),
    weight: integer("weight").notNull().default(1),
    enabled: boolean("enabled").notNull().default(true),
    logicType: text("logic_type").$type<CheckLogicType>().notNull().default("sql"),
    // Parameterized with $1 = projectId; must return { passed boolean, evidence jsonb }.
    sqlQuery: text("sql_query").notNull(),
    thresholdConfig: jsonb("threshold_config").$type<Record<string, unknown>>(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.category, t.enabled)]
);

export const fraudRules = pgTable(
  "fraud_rules",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    // Parameterized with $1 = projectId; any row returned = a flag.
    sqlQuery: text("sql_query").notNull(),
    severity: text("severity").$type<FraudSeverity>().notNull().default("medium"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.enabled)]
);

export const aiPrompts = pgTable(
  "ai_prompts",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    systemPrompt: text("system_prompt").notNull(),
    active: boolean("active").notNull().default(false),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index().on(t.active)]
);

// Single-row table (admin-editable) holding the score cutoffs.
export const scoreThresholds = pgTable("score_thresholds", {
  _id: uuid("id").defaultRandom().primaryKey(),
  verifiedMin: integer("verified_min").notNull().default(85),
  pendingMin: integer("pending_min").notNull().default(50),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ---------------------------------------------------------------------------
// Result tables — written by the verification / fraud engines.
// ---------------------------------------------------------------------------

export const verificationResults = pgTable(
  "verification_results",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects._id, { onDelete: "cascade" }),
    status: text("status").$type<VerificationStatus>().notNull().default("PENDING"),
    confidenceScore: integer("confidence_score").notNull().default(0),
    riskFlags: jsonb("risk_flags").$type<string[]>().notNull().default([]),
    evidenceSources: jsonb("evidence_sources").$type<Record<string, unknown>[]>().notNull().default([]),
    checksRun: jsonb("checks_run").$type<Record<string, unknown>[]>().notNull().default([]),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true, mode: "date" }),
  },
  (t) => [uniqueIndex().on(t.projectId)]
);

export const fraudFlags = pgTable(
  "fraud_flags",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects._id, { onDelete: "cascade" }),
    ruleId: uuid("rule_id").references(() => fraudRules._id),
    severity: text("severity").$type<FraudSeverity>().notNull().default("medium"),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
    flaggedAt: timestamp("flagged_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index().on(t.projectId, t.flaggedAt)]
);

// ---------------------------------------------------------------------------
// RAG chat (embeddings live in the boot-SQL `document_embeddings` table).
// ---------------------------------------------------------------------------

export const chatSessions = pgTable(
  "chat_sessions",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users._id),
    projectId: uuid("project_id").references(() => projects._id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId, t.startedAt)]
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessions._id, { onDelete: "cascade" }),
    role: text("role").$type<ChatRole>().notNull(),
    content: text("content").notNull(),
    citedSources: jsonb("cited_sources").$type<Record<string, unknown>[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index().on(t.sessionId, t.createdAt)]
);

// ---------------------------------------------------------------------------
// Security — audit trail. (kyc_data is created in boot SQL to use pgcrypto.)
// ---------------------------------------------------------------------------

export const auditLogs = pgTable(
  "audit_logs",
  {
    _id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users._id),
    action: text("action").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId, t.createdAt), index().on(t.resourceType, t.resourceId)]
);

// ---------------------------------------------------------------------------
// Inferred row types
// ---------------------------------------------------------------------------

export type IVerificationCheck = typeof verificationChecks.$inferSelect;
export type IFraudRule = typeof fraudRules.$inferSelect;
export type IAiPrompt = typeof aiPrompts.$inferSelect;
export type IScoreThresholds = typeof scoreThresholds.$inferSelect;
export type IVerificationResult = typeof verificationResults.$inferSelect;
export type IFraudFlag = typeof fraudFlags.$inferSelect;
export type IChatSession = typeof chatSessions.$inferSelect;
export type IChatMessage = typeof chatMessages.$inferSelect;
export type IAuditLog = typeof auditLogs.$inferSelect;
export type ICategoryRow = typeof governmentLegal.$inferSelect;
