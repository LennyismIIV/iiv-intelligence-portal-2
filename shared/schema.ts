import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { scorecardFieldsSchema } from "./scorecardFields";

export {
  STRATEGIC_POSTURES,
  STRATEGIC_POSTURE_LABELS,
  VALUATION_CATEGORIES,
  VALUATION_CATEGORY_LABELS,
  HUMAN_DATA_SUPPLY_CATEGORIES,
  HUMAN_DATA_SUPPLY_LABELS,
  PLATFORM_STAGES,
  PLATFORM_STAGE_LABELS,
  VC_CONTROL_LAYERS,
  BRAND_TAGS,
  BRAND_TAG_LABELS,
  SCORECARD_FIELD_KEYS,
  scorecardFieldsSchema,
  applyScorecardValidation,
  normalizeScorecardAliases,
  encodeScorecardArrays,
  decodeScorecardArrays,
  parseJsonStringArray,
  companyHasBrandTag,
  isGreenbookVisible,
} from "./scorecardFields";
export type {
  StrategicPosture,
  ValuationCategory,
  HumanDataSupplyCategory,
  PlatformStage,
  VcControlLayer,
  BrandTag,
  ScorecardFields,
} from "./scorecardFields";

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
  // Phase 2 — Structured financials (feed the Valuation lens).
  // Numeric so the lens can compute; existing estimatedRevenue/estimatedValuation stay as text/legacy for backward compat.
  arrUsd: real("arr_usd"),                              // Annual Recurring Revenue in USD
  ebitdaUsd: real("ebitda_usd"),                        // LTM EBITDA in USD (can be negative)
  revenueGrowthPct: real("revenue_growth_pct"),         // LTM YoY revenue growth (e.g. 45 = 45%)
  fcfMarginPct: real("fcf_margin_pct"),                 // Free cash flow margin (e.g. 12 = 12%)
  fundingStage: text("funding_stage"),                  // 'seed' | 'series_a' | 'series_b' | 'series_c' | 'growth' | 'pe_owned' | 'public'
  financialsAsOf: text("financials_as_of"),             // ISO date the numbers reflect (judge-entered)
  // P3.1 — Scorecard-minimal Firm fields (same companies SoR; no parallel Firm table).
  mapAX: real("map_a_x"),                               // Map A X coordinate, 0–10 inclusive
  mapAY: real("map_a_y"),                               // Map A Y coordinate, 0–10 inclusive
  strategicPosture: text("strategic_posture"),          // orchestrator | trust_builder | decision_partner
  valuationCategory: text("valuation_category"),        // AI-First | Legacy_SaaS_AI | HITL | Data_Provider | Pure_Services
  humanDataSupplyCategory: text("human_data_supply_category"),
  platformStage: text("platform_stage"),                // project_shop | productized_research | data_insight_platform | di_infrastructure
  vcControlLayers: text("vc_control_layers"),           // JSON array subset of VC1…VC5
  brandTags: text("brand_tags"),                        // JSON array: gen2_client | iiv_pipeline | greenbook_visible
  iivVerdict: text("iiv_verdict").default("PENDING"),   // P3.6 IIV edition: INVEST | WATCH | PASS | PENDING
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// Valid funding stage values (used by both server validation and client dropdowns).
export const FUNDING_STAGES = [
  "seed", "series_a", "series_b", "series_c", "growth", "pe_owned", "public", "bootstrapped"
] as const;
export type FundingStage = typeof FUNDING_STAGES[number];

export const FUNDING_STAGE_LABELS: Record<FundingStage, string> = {
  seed: "Seed",
  series_a: "Series A",
  series_b: "Series B",
  series_c: "Series C",
  growth: "Growth / Late",
  pe_owned: "PE-owned",
  public: "Public",
  bootstrapped: "Bootstrapped",
};

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
  mapAX: true,
  mapAY: true,
  strategicPosture: true,
  valuationCategory: true,
  humanDataSupplyCategory: true,
  platformStage: true,
  vcControlLayers: true,
  brandTags: true,
  iivVerdict: true,
}).extend(scorecardFieldsSchema.shape);

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

// ============================================================
// P3.2 ValuationTape (dated comps tape — not Content Studio–owned)
// ============================================================
export {
  TAPE_STATUSES,
  TAPE_GRACE_DAYS_MAX,
  DEFAULT_DRAFTED_BY,
  VALUATION_TAPE_CREATE_SQL,
  ValuationTapeError,
  computeExpiresAt,
  parseBands,
  encodeBands,
  assertHumanApprover,
  createDraftTapeSchema,
  updateDraftTapeSchema,
  approveTapeSchema,
} from "./valuationTape";
export type { TapeStatus, TapeBand } from "./valuationTape";

export const valuationTapes = sqliteTable("valuation_tapes", {
  tapeId: text("tape_id").primaryKey(),
  asOf: text("as_of").notNull(),
  expiresAt: text("expires_at"),
  status: text("status").notNull().default("draft"),
  approverId: text("approver_id"),
  supersededBy: text("superseded_by"),
  bands: text("bands"),
  sourceNotes: text("source_notes"),
  draftedBy: text("drafted_by"),
  versionedBy: text("versioned_by"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export type ValuationTapeRow = typeof valuationTapes.$inferSelect;

// ============================================================
// P3.3 ValuationAssessment (Firm + required approved tape)
// ============================================================
export {
  HARD_RULE_IDS,
  HARD_RULE_LABELS,
  DOCTRINE_FLAGS,
  DOCTRINE_FLAG_LABELS,
  FINANCIALS_CONFIDENCE,
  VALUATION_ASSESSMENT_CREATE_SQL,
  ValuationAssessmentError,
  parseHardRulesFired,
  encodeHardRulesFired,
  parseDoctrineFlags,
  parseFinancialsRecord,
  evaluateHardRules,
  recommendBandFromInputs,
} from "./valuationAssessment";
export type {
  HardRuleId,
  DoctrineFlag,
  FinancialsConfidence,
  FinancialsRecord,
  HardRulesFired,
} from "./valuationAssessment";

export const valuationAssessments = sqliteTable("valuation_assessments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  firmId: integer("firm_id").notNull().references(() => companies.id),
  evaluatorId: text("evaluator_id").notNull(),
  mapAX: real("map_a_x"),
  mapAY: real("map_a_y"),
  valuationCategory: text("valuation_category"),
  doctrineFlags: text("doctrine_flags"),
  recommendedBand: text("recommended_band"),
  finalBand: text("final_band"),
  overrideReason: text("override_reason"),
  hardRulesFired: text("hard_rules_fired").notNull(),
  tapeId: text("tape_id").notNull(),
  tapeAsOf: text("tape_as_of").notNull(),
  bandRanges: text("band_ranges").notNull(),
  conviction: real("conviction"),
  narrative: text("narrative"),
  scoredAt: text("scored_at").notNull(),
  financialsJson: text("financials_json"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export type ValuationAssessmentRow = typeof valuationAssessments.$inferSelect;

// ============================================================
// P3.4 Scorecard Evidence (grade + confidence on material claims)
// ============================================================
export {
  EVIDENCE_GRADES,
  EVIDENCE_GRADE_LABELS,
  EVIDENCE_CONFIDENCE,
  EVIDENCE_CONFIDENCE_LABELS,
  MATERIAL_CLAIM_KEYS,
  MATERIAL_CLAIM_LABELS,
  FIRM_CLAIM_KEYS,
  ASSESSMENT_CLAIM_KEYS,
  CONTROL_POINT_VALUES,
  CONTROL_POINT_LABELS,
  AI_ON_CONTROL_POINT_RESULTS,
  SCORECARD_EVIDENCE_CREATE_SQL,
  SCORECARD_SHIP_CREATE_SQL,
  ScorecardEvidenceError,
  parseClaimKey,
  parseGrade,
  parseConfidence,
  isGen2VaultPath,
  assertNoGen2VaultOnGreenbookVisible,
  parseEvidenceWrite,
  evaluateScorecardQc,
  evaluatePrd9Blockers,
  parseLeonardHours,
  parseShippedBy,
  hoursLogged,
  qcBlockedError,
  isAssessmentClaim,
} from "./scorecardEvidence";
export type {
  EvidenceGrade,
  EvidenceConfidence,
  MaterialClaimKey,
  ControlPointValue,
  AiOnControlPointResult,
  EvidenceRecord,
  ScorecardQcResult,
  QcClaimStatus,
  Prd9Blocker,
  Prd9BlockerId,
  ScorecardShipRecord,
  ScorecardShipResult,
} from "./scorecardEvidence";

export const scorecardEvidence = sqliteTable("scorecard_evidence", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().references(() => companies.id),
  assessmentId: integer("assessment_id"),
  claimKey: text("claim_key").notNull(),
  grade: text("grade").notNull(),
  confidence: text("confidence").notNull(),
  claimValue: text("claim_value"),
  notes: text("notes"),
  sourceUrl: text("source_url"),
  greenbookVisible: integer("greenbook_visible").notNull().default(0),
  createdBy: text("created_by"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

export type ScorecardEvidenceRow = typeof scorecardEvidence.$inferSelect;

export const scorecardShips = sqliteTable("scorecard_ships", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  companyId: integer("company_id").notNull().references(() => companies.id),
  shippedAt: text("shipped_at").notNull(),
  shippedBy: text("shipped_by"),
  leonardHours: real("leonard_hours").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export type ScorecardShipRow = typeof scorecardShips.$inferSelect;

// ============================================================
// P3.5 Gen2 CEO Scorecard export (DOCX primary + locked-send PDF)
// ============================================================
export {
  SCORECARD_BRAND,
  SCORECARD_EDITION,
  SCORECARD_FORMAT,
  EVIDENCE_FORMAT,
  INSTRUMENT_A_NAME,
  AI_CONTROL_POINT_DOCTRINE,
  DRAFT_WATERMARK,
  LOCKED_SEND_LABEL,
  GAP_PREFIX,
  FORBIDDEN_CEO_EDITION_TERMS,
  SECTION_IDS,
  SECTION_TITLES,
  assembleScorecardDocument,
  flattenDocumentText,
  sectionOrderOf,
  forbiddenCeoEditionHits,
  emptyQc,
  assembleIivVerdictDocument,
  assembleSharedScorecardGraph,
  IIV_SECTION_IDS,
  IIV_SCORECARD_BRAND,
  IIV_SCORECARD_EDITION,
  IIV_SCORECARD_FORMAT,
  IIV_PRODUCT_TITLE,
  FORBIDDEN_IIV_EDITION_TERMS,
  editionProductTitle,
  editionHeaderLabel,
  forbiddenIivEditionHits,
} from "./scorecardExport";
export type {
  ScorecardDocument,
  ScorecardSectionId,
  ScorecardExportInput,
  GapFlag,
  ExportField,
  IivVerdictSection,
} from "./scorecardExport";

// ============================================================
// P3.6 IIV verdict edition (same Scorecard graph as P3.5)
// ============================================================
export {
  IIV_VERDICTS,
  IIV_VERDICT_LABELS,
  DEFAULT_IIV_VERDICT,
  IivVerdictError,
  parseIivVerdict,
  normalizeStoredVerdict,
  collectIivBlockers,
  assertIivVerdictWritable,
  isIivVerdict,
} from "./scorecardVerdict";
export type {
  IivVerdict,
  IivBlocker,
  IivDecisionInput,
  IivBlockerResult,
} from "./scorecardVerdict";

