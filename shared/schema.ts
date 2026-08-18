import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

export const companies = sqliteTable("companies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  website: text("website"),
  category: text("category"),
  companyType: text("company_type"),
  competitionStatus: text("competition_status"),
  competitionYear: integer("competition_year"),
  competitionEvent: text("competition_event"),
  yearFounded: integer("year_founded"),
  employeeCount: integer("employee_count"),
  estimatedRevenue: real("estimated_revenue"),
  maStatus: text("ma_status"),
  capitalRaised: text("capital_raised"),
  estimatedValuation: real("estimated_valuation"),
  gen2Relationship: text("gen2_relationship"),
  currentStatus: text("current_status"),
  notes: text("notes"),
  howItWorks: text("how_it_works"),
  businessNeed: text("business_need"),
  businessPotential: text("business_potential"),
  caseStudy: text("case_study"),
  workflowPrimary: text("workflow_primary"),
  workflowSecondary: text("workflow_secondary"),
  dataModalities: text("data_modalities"),
  aiPrimary: text("ai_primary"),
  aiSecondary: text("ai_secondary"),
  businessModel: text("business_model"),
  revenueStage: text("revenue_stage"),
  jtbdPrimary: text("jtbd_primary"),
  jtbdSecondary: text("jtbd_secondary"),
  buyerPrimary: text("buyer_primary"),
  marketsServed: text("markets_served"),
  keyCustomers: text("key_customers"),
  technologyStack: text("technology_stack"),
  // Phase 1 CRM
  leadSource: text("lead_source"),
  pipelineStatus: text("pipeline_status").default("sourced"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const contacts = sqliteTable("contacts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().references(() => companies.id),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  title: text("title"),
  linkedinUrl: text("linkedin_url"),
  phone: text("phone"),
  isPrimary: integer("is_primary").default(0),
});

export const intelligenceEvents = sqliteTable("intelligence_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().references(() => companies.id),
  eventType: text("event_type").notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
  sourceUrl: text("source_url"),
  sourceDate: text("source_date"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

export const companyTags = sqliteTable("company_tags", {
  companyId: integer("company_id").references(() => companies.id),
  tagId: integer("tag_id").references(() => tags.id),
});

// Insert schemas
export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
});

export const insertIntelligenceEventSchema = createInsertSchema(intelligenceEvents).omit({
  id: true,
  createdAt: true,
});

export const insertTagSchema = createInsertSchema(tags).omit({
  id: true,
});

// Types
export type Company = typeof companies.$inferSelect;
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type IntelligenceEvent = typeof intelligenceEvents.$inferSelect;
export type InsertIntelligenceEvent = z.infer<typeof insertIntelligenceEventSchema>;
export type Tag = typeof tags.$inferSelect;
export type InsertTag = z.infer<typeof insertTagSchema>;

// Evaluation Lenses Schema (Phase 1+)
export const evaluationScores = sqliteTable("evaluation_scores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().references(() => companies.id),
  lensType: text("lens_type").notNull(), // 'iic', 'thesis', 'momentum', etc.
  dimension: text("dimension").notNull(),
  score: real("score").notNull(),
  evaluatorId: text("evaluator_id"),
  notes: text("notes"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const lensConfigurations = sqliteTable("lens_configurations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  lensType: text("lens_type").notNull(),
  customWeights: text("custom_weights"), // JSON string of weights
  isDefault: integer("is_default").default(0),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// Per-judge per-company session metadata for the Founder lens.
// Architecture and stage are tags only (not used in composite score).
export const founderSessions = sqliteTable("founder_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().references(() => companies.id),
  evaluatorId: text("evaluator_id").notNull(),
  architecture: text("architecture"), // 'traditional' | 'hybrid' | 'zhc'
  stage: text("stage"),                // 'pre-seed' | 'seed' | 'series-a'
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// Insert schemas
export const insertEvaluationScoreSchema = createInsertSchema(evaluationScores).omit({
  id: true,
  createdAt: true,
});

export const insertLensConfigurationSchema = createInsertSchema(lensConfigurations).omit({
  id: true,
  updatedAt: true,
});

export const insertFounderSessionSchema = createInsertSchema(founderSessions).omit({
  id: true,
  updatedAt: true,
});

// Types
export type EvaluationScore = typeof evaluationScores.$inferSelect;
export type InsertEvaluationScore = z.infer<typeof insertEvaluationScoreSchema>;
export type LensConfiguration = typeof lensConfigurations.$inferSelect;
export type InsertLensConfiguration = z.infer<typeof insertLensConfigurationSchema>;
export type FounderSession = typeof founderSessions.$inferSelect;
export type InsertFounderSession = z.infer<typeof insertFounderSessionSchema>;

// ===== Phase 1 CRM =====
export const companyInteractions = sqliteTable("company_interactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().references(() => companies.id),
  date: text("date").notNull(),
  type: text("type").notNull(),
  notes: text("notes"),
  transcriptUrl: text("transcript_url"),
  createdBy: text("created_by"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const companyFiles = sqliteTable("company_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().references(() => companies.id),
  fileName: text("file_name").notNull(),
  driveFileId: text("drive_file_id").notNull(),
  driveUrl: text("drive_url").notNull(),
  mimeType: text("mime_type"),
  uploadedBy: text("uploaded_by"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const insertCompanyInteractionSchema = createInsertSchema(companyInteractions).omit({
  id: true,
  createdAt: true,
});

export const insertCompanyFileSchema = createInsertSchema(companyFiles).omit({
  id: true,
  createdAt: true,
});

export type CompanyInteraction = typeof companyInteractions.$inferSelect;
export type InsertCompanyInteraction = z.infer<typeof insertCompanyInteractionSchema>;
export type CompanyFile = typeof companyFiles.$inferSelect;
export type InsertCompanyFile = z.infer<typeof insertCompanyFileSchema>;

// ===== Phase 2: Diligence =====
// Append-only versioning: each save inserts a new row with version = max(version) + 1
// for that companyId. Company-wide log (not per-evaluator) — filledBy carries who saved.
export const diligenceResponses = sqliteTable("diligence_responses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().references(() => companies.id),
  version: integer("version").notNull().default(1),
  responses: text("responses").notNull(),  // JSON string keyed by question id (q1..q19)
  filledBy: text("filled_by"),             // evaluatorId (localStorage UUID)
  isExternal: integer("is_external").default(0),
  notes: text("notes"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const insertDiligenceResponseSchema = createInsertSchema(diligenceResponses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DiligenceResponse = typeof diligenceResponses.$inferSelect;
export type InsertDiligenceResponse = z.infer<typeof insertDiligenceResponseSchema>;

// ============================================================
// Phase 2: Decision Layer (Gates, Dimension Floors, Findings Ledger)
// ============================================================

// Per-company gate status. One row per (companyId, gateId).
// Gates: G0 = integrity/data completeness, G1 = investment fit, G2 = final IC gate.
export const gates = sqliteTable("gates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().references(() => companies.id),
  gateId: text("gate_id").notNull(),          // 'G0' | 'G1' | 'G2'
  status: text("status").notNull().default("open"), // 'open' | 'cleared' | 'failed' | 'expired'
  triggerEvent: text("trigger_event"),
  lastEvaluatedAt: text("last_evaluated_at").default(sql`CURRENT_TIMESTAMP`),
  evaluator: text("evaluator"),
  reEvaluationTriggers: text("re_evaluation_triggers"), // JSON array as text
  notes: text("notes"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// Explicit per-dimension score caps with reason + evidence.
// A floor overrides any evaluator score above the cap for scoring/roll-up purposes.
export const dimensionFloors = sqliteTable("dimension_floors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().references(() => companies.id),
  lensType: text("lens_type").notNull(),      // 'iic' | 'thesis' | 'founder' | 'dit' | ...
  dimension: text("dimension").notNull(),     // dimension key inside that lens
  cappedAt: real("capped_at").notNull(),      // score value the dimension is capped at
  reason: text("reason").notNull(),
  evidenceRef: text("evidence_ref"),          // URL, finding id, doc ref
  createdBy: text("created_by"),              // evaluatorId
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// Findings Ledger (Disposition Ledger).
// Every adverse/pending fact about a company that must be dispositioned
// before a verdict can be written. Status transitions are the whole point.
export const findings = sqliteTable("findings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().references(() => companies.id),
  findingText: text("finding_text").notNull(),
  sourceDoc: text("source_doc"),              // URL, doc name, or internal ref
  dateRaised: text("date_raised").default(sql`CURRENT_TIMESTAMP`),
  status: text("status").notNull().default("unverified-owner-assigned"),
  // status values:
  //   'unverified-owner-assigned' (default when raised)
  //   'verified-incorporated'      (accepted; changes underwriting)
  //   'verified-immaterial'        (accepted; does not change outcome)
  //   'rebutted'                   (proven false by evidence)
  //   'rejected'                   (not pursued; must give reason)
  severity: text("severity").notNull().default("medium"), // 'low' | 'medium' | 'high' | 'critical'
  owner: text("owner"),                       // person accountable (name or evaluatorId)
  deadline: text("deadline"),                 // ISO date
  resolutionNote: text("resolution_note"),
  raisedBy: text("raised_by"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export const insertGateSchema = createInsertSchema(gates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDimensionFloorSchema = createInsertSchema(dimensionFloors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFindingSchema = createInsertSchema(findings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Gate = typeof gates.$inferSelect;
export type InsertGate = z.infer<typeof insertGateSchema>;
export type DimensionFloor = typeof dimensionFloors.$inferSelect;
export type InsertDimensionFloor = z.infer<typeof insertDimensionFloorSchema>;
export type Finding = typeof findings.$inferSelect;
export type InsertFinding = z.infer<typeof insertFindingSchema>;

// Constants shared by client + server for validation and UI.
export const FINDING_STATUSES = [
  "unverified-owner-assigned",
  "verified-incorporated",
  "verified-immaterial",
  "rebutted",
  "rejected",
] as const;
export type FindingStatus = typeof FINDING_STATUSES[number];

export const FINDING_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type FindingSeverity = typeof FINDING_SEVERITIES[number];

export const GATE_IDS = ["G0", "G1", "G2"] as const;
export type GateId = typeof GATE_IDS[number];

export const GATE_STATUSES = ["open", "cleared", "failed", "expired"] as const;
export type GateStatus = typeof GATE_STATUSES[number];

// A finding is "open" (i.e. still blocking a verdict) unless its status is one of these.
export const FINDING_TERMINAL_STATUSES: FindingStatus[] = [
  "verified-incorporated",
  "verified-immaterial",
  "rebutted",
  "rejected",
];

