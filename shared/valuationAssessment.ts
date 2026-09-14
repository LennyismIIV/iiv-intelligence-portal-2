import { z } from "zod";
import { VALUATION_CATEGORIES, type ValuationCategory } from "./scorecardFields";
import { type TapeBand, encodeBands, parseBands } from "./valuationTape";

const FUNDING_STAGES = [
  "seed", "series_a", "series_b", "series_c", "growth", "pe_owned", "public", "bootstrapped",
] as const;

/**
 * P3.3 ValuationAssessment — persisted score linked to a Firm (companies SoR)
 * and a required approved ValuationTape. Band ranges come from the tape snapshot,
 * never from evergreen doctrine defaults. Optional FinancialsRecord is stored
 * only when supplied; missing numbers stay null (confidence unknown).
 */

export const HARD_RULE_IDS = [
  "ai_wrapper_penalty",
  "top_tier_promotion",
  "sub10_growth_floor",
  "services_floor",
  "reclassification_ceiling",
  "hitl_routing",
  "data_provider_routing",
] as const;
export type HardRuleId = (typeof HARD_RULE_IDS)[number];

export const HARD_RULE_LABELS: Record<HardRuleId, string> = {
  ai_wrapper_penalty: "AI wrapper penalty",
  top_tier_promotion: "Top-tier promotion",
  sub10_growth_floor: "Sub-10% growth floor",
  services_floor: "Services floor",
  reclassification_ceiling: "Reclassification ceiling",
  hitl_routing: "HITL routing",
  data_provider_routing: "Data provider routing",
};

export const DOCTRINE_FLAGS = [
  "has_proprietary_data",
  "has_real_ip",
  "ai_is_load_bearing",
  "is_frontier_adjacent",
  "is_public_path",
] as const;
export type DoctrineFlag = (typeof DOCTRINE_FLAGS)[number];

export const DOCTRINE_FLAG_LABELS: Record<DoctrineFlag, string> = {
  has_proprietary_data: "Proprietary data",
  has_real_ip: "Real IP",
  ai_is_load_bearing: "AI is load-bearing",
  is_frontier_adjacent: "Frontier-adjacent",
  is_public_path: "Public-quality path",
};

export const FINANCIALS_CONFIDENCE = ["known", "unknown"] as const;
export type FinancialsConfidence = (typeof FINANCIALS_CONFIDENCE)[number];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class ValuationAssessmentError extends Error {
  statusCode: number;
  extras: Record<string, unknown>;

  constructor(message: string, statusCode = 400, extras: Record<string, unknown> = {}) {
    super(message);
    this.name = "ValuationAssessmentError";
    this.statusCode = statusCode;
    this.extras = extras;
  }
}

export const VALUATION_ASSESSMENT_CREATE_SQL = `
  CREATE TABLE IF NOT EXISTS valuation_assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    firm_id INTEGER NOT NULL REFERENCES companies(id),
    evaluator_id TEXT NOT NULL,
    map_a_x REAL,
    map_a_y REAL,
    valuation_category TEXT,
    doctrine_flags TEXT,
    recommended_band TEXT,
    final_band TEXT,
    override_reason TEXT,
    hard_rules_fired TEXT NOT NULL,
    tape_id TEXT NOT NULL,
    tape_as_of TEXT NOT NULL,
    band_ranges TEXT NOT NULL,
    conviction REAL,
    narrative TEXT,
    scored_at TEXT NOT NULL,
    financials_json TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS valuation_assessments_firm_idx
    ON valuation_assessments(firm_id, scored_at DESC);
  CREATE INDEX IF NOT EXISTS valuation_assessments_tape_idx
    ON valuation_assessments(tape_id);
`;

const LENS_CATEGORY_TO_SCORECARD: Record<string, ValuationCategory> = {
  ai_first: "AI-First",
  legacy_saas: "Legacy_SaaS_AI",
  hitl: "HITL",
  data_provider: "Data_Provider",
  pure_services: "Pure_Services",
};

export function normalizeValuationCategory(value: unknown): ValuationCategory | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    throw new ValuationAssessmentError("valuation_category must be a string", 400);
  }
  const trimmed = value.trim();
  if ((VALUATION_CATEGORIES as readonly string[]).includes(trimmed)) {
    return trimmed as ValuationCategory;
  }
  const mapped = LENS_CATEGORY_TO_SCORECARD[trimmed];
  if (mapped) return mapped;
  throw new ValuationAssessmentError(
    `Invalid valuation_category. Must be one of: ${VALUATION_CATEGORIES.join(", ")}`,
    400,
  );
}

function pick(body: Record<string, unknown>, camel: string, snake: string): unknown {
  if (body[camel] !== undefined) return body[camel];
  return body[snake];
}

function optionalCoord(value: unknown, field: string): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new ValuationAssessmentError(`${field} must be a number`, 400);
  }
  if (n < 0 || n > 10) {
    throw new ValuationAssessmentError(`${field} must be between 0 and 10 inclusive`, 400);
  }
  return n;
}

function optionalConviction(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 10) {
    throw new ValuationAssessmentError("conviction must be between 0 and 10 inclusive", 400);
  }
  return n;
}

export function parseDoctrineFlags(value: unknown): DoctrineFlag[] {
  if (value == null || value === "") return [];
  let raw = value;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      raw = JSON.parse(trimmed);
    } catch {
      throw new ValuationAssessmentError("doctrine_flags must be a JSON array", 400);
    }
  }
  if (!Array.isArray(raw)) {
    throw new ValuationAssessmentError("doctrine_flags must be an array", 400);
  }
  const flags: DoctrineFlag[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !(DOCTRINE_FLAGS as readonly string[]).includes(item)) {
      throw new ValuationAssessmentError(
        `Invalid doctrine flag '${String(item)}'. Must be one of: ${DOCTRINE_FLAGS.join(", ")}`,
        400,
      );
    }
    if (!flags.includes(item as DoctrineFlag)) flags.push(item as DoctrineFlag);
  }
  return flags;
}

export interface HardRulesFired {
  ids: HardRuleId[];
  none: boolean;
}

/**
 * hard_rules_fired must be present: a list of known ids, or explicit none
 * (`"none"`, `["none"]`, `{ none: true }`, or `[]`).
 */
export function parseHardRulesFired(value: unknown): HardRulesFired {
  if (value === undefined) {
    throw new ValuationAssessmentError(
      "hard_rules_fired is required (array of rule ids, or explicit none)",
      400,
    );
  }
  if (value === null) {
    throw new ValuationAssessmentError(
      "hard_rules_fired is required (array of rule ids, or explicit none)",
      400,
    );
  }
  if (value === "none" || value === "None" || value === "NONE") {
    return { ids: [], none: true };
  }
  if (typeof value === "object" && !Array.isArray(value) && value !== null) {
    const rec = value as Record<string, unknown>;
    if (rec.none === true || rec.none === "true" || rec.none === 1) {
      return { ids: [], none: true };
    }
  }
  let raw = value;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      throw new ValuationAssessmentError(
        "hard_rules_fired is required (array of rule ids, or explicit none)",
        400,
      );
    }
    if (trimmed === "none") return { ids: [], none: true };
    try {
      raw = JSON.parse(trimmed);
    } catch {
      throw new ValuationAssessmentError("hard_rules_fired must be an array or explicit none", 400);
    }
  }
  if (!Array.isArray(raw)) {
    throw new ValuationAssessmentError("hard_rules_fired must be an array or explicit none", 400);
  }
  if (raw.length === 0) return { ids: [], none: true };
  if (raw.length === 1 && (raw[0] === "none" || raw[0] === "None")) {
    return { ids: [], none: true };
  }
  const ids: HardRuleId[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !(HARD_RULE_IDS as readonly string[]).includes(item)) {
      throw new ValuationAssessmentError(
        `Invalid hard rule '${String(item)}'. Must be one of: ${HARD_RULE_IDS.join(", ")}`,
        400,
      );
    }
    if (!ids.includes(item as HardRuleId)) ids.push(item as HardRuleId);
  }
  return { ids, none: ids.length === 0 };
}

export function encodeHardRulesFired(rules: HardRulesFired): string {
  if (rules.none || rules.ids.length === 0) return JSON.stringify({ none: true });
  return JSON.stringify(rules.ids);
}

export function decodeHardRulesFired(stored: string | null | undefined): HardRulesFired {
  if (stored == null || stored === "") {
    throw new ValuationAssessmentError("hard_rules_fired is required (array of rule ids, or explicit none)", 400);
  }
  try {
    return parseHardRulesFired(JSON.parse(stored));
  } catch (err) {
    if (err instanceof ValuationAssessmentError) throw err;
    return parseHardRulesFired(stored);
  }
}

export interface FinancialsRecord {
  arrUsd: number | null;
  ebitdaUsd: number | null;
  revenueGrowthPct: number | null;
  fcfMarginPct: number | null;
  fundingStage: string | null;
  financialsAsOf: string | null;
  confidence: FinancialsConfidence;
}

function optionalMoney(value: unknown, field: string): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new ValuationAssessmentError(`${field} must be a number when provided`, 400);
  }
  return n;
}

/**
 * Parse an optional FinancialsRecord. Missing / null means no record (do not invent).
 * Partial numbers are stored as-is; confidence is unknown unless every field is present
 * or the client explicitly marks confidence.
 */
export function parseFinancialsRecord(value: unknown): FinancialsRecord | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      value = JSON.parse(trimmed);
    } catch {
      throw new ValuationAssessmentError("financials must be an object or null", 400);
    }
  }
  if (typeof value !== "object" || Array.isArray(value) || value === null) {
    throw new ValuationAssessmentError("financials must be an object or null", 400);
  }
  const body = value as Record<string, unknown>;
  const arrUsd = optionalMoney(pick(body, "arrUsd", "arr_usd"), "arr_usd");
  const ebitdaUsd = optionalMoney(pick(body, "ebitdaUsd", "ebitda_usd"), "ebitda_usd");
  const revenueGrowthPct = optionalMoney(pick(body, "revenueGrowthPct", "revenue_growth_pct"), "revenue_growth_pct");
  const fcfMarginPct = optionalMoney(pick(body, "fcfMarginPct", "fcf_margin_pct"), "fcf_margin_pct");
  const stageRaw = pick(body, "fundingStage", "funding_stage");
  let fundingStage: string | null = null;
  if (stageRaw != null && stageRaw !== "") {
    if (typeof stageRaw !== "string") {
      throw new ValuationAssessmentError("funding_stage must be a string", 400);
    }
    if (!(FUNDING_STAGES as readonly string[]).includes(stageRaw)) {
      throw new ValuationAssessmentError(
        `Invalid funding_stage. Must be one of: ${FUNDING_STAGES.join(", ")}`,
        400,
      );
    }
    fundingStage = stageRaw;
  }
  const asOfRaw = pick(body, "financialsAsOf", "financials_as_of");
  let financialsAsOf: string | null = null;
  if (asOfRaw != null && asOfRaw !== "") {
    if (typeof asOfRaw !== "string" || !ISO_DATE_RE.test(asOfRaw)) {
      throw new ValuationAssessmentError("financials_as_of must be YYYY-MM-DD", 400);
    }
    financialsAsOf = asOfRaw;
  }
  const confidenceRaw = pick(body, "confidence", "confidence");
  const complete =
    arrUsd != null
    && ebitdaUsd != null
    && revenueGrowthPct != null
    && fcfMarginPct != null
    && fundingStage != null
    && financialsAsOf != null;
  let confidence: FinancialsConfidence = complete ? "known" : "unknown";
  if (confidenceRaw != null && confidenceRaw !== "") {
    if (confidenceRaw !== "known" && confidenceRaw !== "unknown") {
      throw new ValuationAssessmentError("financials.confidence must be 'known' or 'unknown'", 400);
    }
    confidence = confidenceRaw;
    // Never claim known when the client invented nothing and fields are missing.
    if (confidence === "known" && !complete) {
      confidence = "unknown";
    }
  }
  return {
    arrUsd,
    ebitdaUsd,
    revenueGrowthPct,
    fcfMarginPct,
    fundingStage,
    financialsAsOf,
    confidence,
  };
}

export function encodeFinancials(record: FinancialsRecord | null): string | null {
  if (!record) return null;
  return JSON.stringify({
    arr_usd: record.arrUsd,
    ebitda_usd: record.ebitdaUsd,
    revenue_growth_pct: record.revenueGrowthPct,
    fcf_margin_pct: record.fcfMarginPct,
    funding_stage: record.fundingStage,
    financials_as_of: record.financialsAsOf,
    confidence: record.confidence,
  });
}

export function decodeFinancials(stored: string | null | undefined): FinancialsRecord | null {
  if (stored == null || stored === "") return null;
  return parseFinancialsRecord(stored);
}

export function assertOverrideReason(
  recommendedBand: string | null,
  finalBand: string | null,
  overrideReason: string | null,
): string | null {
  const rec = recommendedBand?.trim() || null;
  const fin = finalBand?.trim() || null;
  const reason = overrideReason?.trim() || null;
  if (rec && fin && rec !== fin && !reason) {
    throw new ValuationAssessmentError("override_reason is required when final_band differs from recommended_band", 400);
  }
  return reason;
}

export function snapshotBandRanges(bands: TapeBand[]): string {
  return encodeBands(bands);
}

export function parseStoredBandRanges(stored: string | null | undefined): TapeBand[] {
  if (stored == null || stored === "") return [];
  return parseBands(stored);
}

export function rangesForBand(bands: TapeBand[], bandId: string | null | undefined): TapeBand | null {
  if (!bandId) return null;
  return bands.find((b) => b.bandId === bandId) ?? null;
}

export interface HardRuleInputs {
  valuationCategory?: string | null;
  mapAX?: number | null;
  mapAY?: number | null;
  doctrineFlags?: readonly string[];
  revenueGrowthPct?: number | null;
}

/** Simple evaluator — UI/client may also pass an explicit fired list. */
export function evaluateHardRules(input: HardRuleInputs): HardRuleId[] {
  const fired: HardRuleId[] = [];
  const flags = new Set(input.doctrineFlags ?? []);
  let category: ValuationCategory | null = null;
  try {
    category = normalizeValuationCategory(input.valuationCategory ?? null);
  } catch {
    category = null;
  }
  const x = input.mapAX;
  const y = input.mapAY;
  const positioning = x != null && y != null ? (x + y) / 2 : null;

  if (category === "AI-First") {
    if (flags.has("has_proprietary_data") && flags.has("has_real_ip")) {
      fired.push("top_tier_promotion");
    } else if (x != null && x < 4) {
      fired.push("ai_wrapper_penalty");
    }
  }
  if (category === "Legacy_SaaS_AI" && input.revenueGrowthPct != null && input.revenueGrowthPct < 10) {
    fired.push("sub10_growth_floor");
  }
  if (category === "HITL") fired.push("hitl_routing");
  if (category === "Data_Provider") fired.push("data_provider_routing");
  if (category === "Pure_Services") {
    if (positioning != null && positioning < 4) fired.push("services_floor");
    else if (positioning != null && positioning >= 7 && (x ?? 0) >= 7) {
      fired.push("reclassification_ceiling");
    }
  }
  return fired;
}

export function recommendBandFromInputs(input: HardRuleInputs & { doctrineFlags?: readonly string[] }): string | null {
  const flags = new Set(input.doctrineFlags ?? []);
  let category: ValuationCategory | null = null;
  try {
    category = normalizeValuationCategory(input.valuationCategory ?? null);
  } catch {
    return null;
  }
  if (!category) return null;
  const rules = evaluateHardRules(input);
  if (category === "AI-First") {
    if (rules.includes("top_tier_promotion")) return "ai_first_proprietary_ip";
    if (rules.includes("ai_wrapper_penalty")) return "ai_wrappers";
    return "ai_first_defensible";
  }
  if (category === "Legacy_SaaS_AI") {
    if (rules.includes("sub10_growth_floor")) return "legacy_saas_no_ai";
    return flags.has("ai_is_load_bearing") ? "legacy_saas_ai_overlay" : "legacy_saas_no_ai";
  }
  if (category === "HITL") {
    return flags.has("is_frontier_adjacent") ? "hitl_strategic" : "hitl_legacy_labeling";
  }
  if (category === "Data_Provider") {
    return flags.has("is_public_path") ? "data_provider_public" : "data_provider_take_private";
  }
  if (category === "Pure_Services") {
    if (rules.includes("services_floor")) return "pure_services";
    if (rules.includes("reclassification_ceiling")) return "services_data_asset";
    return "services_specialization";
  }
  return null;
}

const optionalBand = z.string().min(1).nullable().optional();

export const createAssessmentBodySchema = z.object({
  evaluatorId: z.string().optional(),
  evaluator_id: z.string().optional(),
  mapAX: z.unknown().optional(),
  map_a_x: z.unknown().optional(),
  mapAY: z.unknown().optional(),
  map_a_y: z.unknown().optional(),
  valuationCategory: z.unknown().optional(),
  valuation_category: z.unknown().optional(),
  doctrineFlags: z.unknown().optional(),
  doctrine_flags: z.unknown().optional(),
  recommendedBand: optionalBand,
  recommended_band: optionalBand,
  finalBand: optionalBand,
  final_band: optionalBand,
  overrideReason: z.string().nullable().optional(),
  override_reason: z.string().nullable().optional(),
  hardRulesFired: z.unknown().optional(),
  hard_rules_fired: z.unknown().optional(),
  tapeId: z.string().nullable().optional(),
  tape_id: z.string().nullable().optional(),
  conviction: z.unknown().optional(),
  narrative: z.string().nullable().optional(),
  scoredAt: z.string().optional(),
  scored_at: z.string().optional(),
  financials: z.unknown().optional(),
});

export const updateAssessmentBodySchema = createAssessmentBodySchema;

export interface ParsedAssessmentWrite {
  evaluatorId: string;
  mapAX: number | null;
  mapAY: number | null;
  valuationCategory: ValuationCategory | null;
  doctrineFlags: DoctrineFlag[];
  recommendedBand: string | null;
  finalBand: string | null;
  overrideReason: string | null;
  hardRulesFired: HardRulesFired;
  tapeId: string | null;
  conviction: number | null;
  narrative: string | null;
  scoredAt: string | null;
  financials: FinancialsRecord | null;
  provided: {
    evaluatorId: boolean;
    mapAX: boolean;
    mapAY: boolean;
    valuationCategory: boolean;
    doctrineFlags: boolean;
    recommendedBand: boolean;
    finalBand: boolean;
    overrideReason: boolean;
    hardRulesFired: boolean;
    tapeId: boolean;
    conviction: boolean;
    narrative: boolean;
    scoredAt: boolean;
    financials: boolean;
  };
}

export function parseAssessmentWrite(
  body: Record<string, unknown>,
  opts: { requireHardRules: boolean; requireEvaluator: boolean },
): ParsedAssessmentWrite {
  createAssessmentBodySchema.parse(body);
  const evaluatorRaw = pick(body, "evaluatorId", "evaluator_id");
  const hasEvaluator = evaluatorRaw !== undefined;
  if (opts.requireEvaluator && (typeof evaluatorRaw !== "string" || !evaluatorRaw.trim())) {
    throw new ValuationAssessmentError("evaluator_id is required", 400);
  }
  const hardRaw = pick(body, "hardRulesFired", "hard_rules_fired");
  const hasHardRules = hardRaw !== undefined;
  if (opts.requireHardRules || hasHardRules) {
    parseHardRulesFired(hardRaw);
  }
  const hardRulesFired = hasHardRules || opts.requireHardRules
    ? parseHardRulesFired(hardRaw)
    : { ids: [], none: true };

  const hasRecommended = pick(body, "recommendedBand", "recommended_band") !== undefined;
  const hasFinal = pick(body, "finalBand", "final_band") !== undefined;
  const hasOverride = pick(body, "overrideReason", "override_reason") !== undefined;
  const recommendedBand = hasRecommended
    ? ((pick(body, "recommendedBand", "recommended_band") as string | null | undefined)?.trim() || null)
    : null;
  const finalBand = hasFinal
    ? ((pick(body, "finalBand", "final_band") as string | null | undefined)?.trim() || null)
    : null;
  const overrideReasonRaw = hasOverride
    ? ((pick(body, "overrideReason", "override_reason") as string | null | undefined) ?? null)
    : null;
  const overrideReason = (hasRecommended && hasFinal)
    ? assertOverrideReason(recommendedBand, finalBand, overrideReasonRaw)
    : (typeof overrideReasonRaw === "string" ? overrideReasonRaw.trim() || null : overrideReasonRaw);

  const financialsKeyPresent = body.financials !== undefined;
  const financials = financialsKeyPresent ? parseFinancialsRecord(body.financials) : null;

  const scoredRaw = pick(body, "scoredAt", "scored_at");
  const hasScoredAt = scoredRaw !== undefined;
  let scoredAt: string | null = null;
  if (typeof scoredRaw === "string" && scoredRaw.trim()) {
    scoredAt = scoredRaw.trim();
  }

  const tapeRaw = pick(body, "tapeId", "tape_id");
  const hasTapeId = tapeRaw !== undefined;
  let tapeId: string | null = null;
  if (typeof tapeRaw === "string" && tapeRaw.trim()) tapeId = tapeRaw.trim();
  else if (tapeRaw === null) tapeId = null;

  const hasNarrative = body.narrative !== undefined;
  const narrativeRaw = body.narrative;
  const narrative = typeof narrativeRaw === "string" ? narrativeRaw : null;

  const hasMapAX = pick(body, "mapAX", "map_a_x") !== undefined;
  const hasMapAY = pick(body, "mapAY", "map_a_y") !== undefined;
  const hasCategory = pick(body, "valuationCategory", "valuation_category") !== undefined;
  const hasFlags = pick(body, "doctrineFlags", "doctrine_flags") !== undefined;
  const hasConviction = body.conviction !== undefined;

  return {
    evaluatorId: typeof evaluatorRaw === "string" ? evaluatorRaw.trim() : "",
    mapAX: hasMapAX ? optionalCoord(pick(body, "mapAX", "map_a_x"), "map_a_x") : null,
    mapAY: hasMapAY ? optionalCoord(pick(body, "mapAY", "map_a_y"), "map_a_y") : null,
    valuationCategory: hasCategory ? normalizeValuationCategory(pick(body, "valuationCategory", "valuation_category") ?? null) : null,
    doctrineFlags: hasFlags ? parseDoctrineFlags(pick(body, "doctrineFlags", "doctrine_flags")) : [],
    recommendedBand,
    finalBand,
    overrideReason,
    hardRulesFired,
    tapeId,
    conviction: hasConviction ? optionalConviction(body.conviction) : null,
    narrative,
    scoredAt,
    financials,
    provided: {
      evaluatorId: hasEvaluator,
      mapAX: hasMapAX,
      mapAY: hasMapAY,
      valuationCategory: hasCategory,
      doctrineFlags: hasFlags,
      recommendedBand: hasRecommended,
      finalBand: hasFinal,
      overrideReason: hasOverride,
      hardRulesFired: hasHardRules || opts.requireHardRules,
      tapeId: hasTapeId,
      conviction: hasConviction,
      narrative: hasNarrative,
      scoredAt: hasScoredAt,
      financials: financialsKeyPresent,
    },
  };
}
