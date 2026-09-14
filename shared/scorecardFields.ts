import { z } from "zod";

/**
 * P3.1 Scorecard-minimal Firm fields.
 * Stored on the existing `companies` SoR (no parallel Firm table).
 * API uses camelCase to match the rest of GET/PATCH /api/companies.
 * PATCH also accepts the snake_case aliases from the Scorecard spec.
 */

export const STRATEGIC_POSTURES = [
  "orchestrator",
  "trust_builder",
  "decision_partner",
] as const;
export type StrategicPosture = typeof STRATEGIC_POSTURES[number];

export const STRATEGIC_POSTURE_LABELS: Record<StrategicPosture, string> = {
  orchestrator: "Orchestrator",
  trust_builder: "Trust Builder",
  decision_partner: "Decision Partner",
};

export const VALUATION_CATEGORIES = [
  "AI-First",
  "Legacy_SaaS_AI",
  "HITL",
  "Data_Provider",
  "Pure_Services",
] as const;
export type ValuationCategory = typeof VALUATION_CATEGORIES[number];

export const VALUATION_CATEGORY_LABELS: Record<ValuationCategory, string> = {
  "AI-First": "AI-First",
  Legacy_SaaS_AI: "Legacy SaaS + AI",
  HITL: "HITL",
  Data_Provider: "Data Provider",
  Pure_Services: "Pure Services",
};

export const HUMAN_DATA_SUPPLY_CATEGORIES = [
  "ai_training_annotation",
  "panel_sample",
  "behavioral_passive",
  "restech_marketplace_platform",
  "expert_talent_network",
  "established_research_infra_ambition",
  "first_party_retail_fs_platform",
] as const;
export type HumanDataSupplyCategory = typeof HUMAN_DATA_SUPPLY_CATEGORIES[number];

export const HUMAN_DATA_SUPPLY_LABELS: Record<HumanDataSupplyCategory, string> = {
  ai_training_annotation: "AI training / annotation",
  panel_sample: "Panel / sample",
  behavioral_passive: "Behavioral / passive",
  restech_marketplace_platform: "ResTech marketplace / platform",
  expert_talent_network: "Expert talent network",
  established_research_infra_ambition: "Established research infra (ambition)",
  first_party_retail_fs_platform: "First-party retail / FS platform",
};

export const PLATFORM_STAGES = [
  "project_shop",
  "productized_research",
  "data_insight_platform",
  "di_infrastructure",
] as const;
export type PlatformStage = typeof PLATFORM_STAGES[number];

export const PLATFORM_STAGE_LABELS: Record<PlatformStage, string> = {
  project_shop: "Project shop",
  productized_research: "Productized research",
  data_insight_platform: "Data / insight platform",
  di_infrastructure: "D&I infrastructure",
};

export const VC_CONTROL_LAYERS = ["VC1", "VC2", "VC3", "VC4", "VC5"] as const;
export type VcControlLayer = typeof VC_CONTROL_LAYERS[number];

export const BRAND_TAGS = ["gen2_client", "iiv_pipeline", "greenbook_visible"] as const;
export type BrandTag = typeof BRAND_TAGS[number];

export const BRAND_TAG_LABELS: Record<BrandTag, string> = {
  gen2_client: "Gen2 client",
  iiv_pipeline: "IIV pipeline",
  greenbook_visible: "Greenbook visible",
};

export const SCORECARD_FIELD_KEYS = [
  "mapAX",
  "mapAY",
  "strategicPosture",
  "valuationCategory",
  "humanDataSupplyCategory",
  "platformStage",
  "vcControlLayers",
  "brandTags",
] as const;
export type ScorecardFieldKey = typeof SCORECARD_FIELD_KEYS[number];

const SNAKE_TO_CAMEL: Record<string, ScorecardFieldKey> = {
  map_a_x: "mapAX",
  map_a_y: "mapAY",
  strategic_posture: "strategicPosture",
  valuation_category: "valuationCategory",
  human_data_supply_category: "humanDataSupplyCategory",
  platform_stage: "platformStage",
  vc_control_layers: "vcControlLayers",
  brand_tags: "brandTags",
};

function emptyToNull(v: unknown): unknown {
  if (v === "" || v === undefined) return null;
  return v;
}

function coerceNumber(v: unknown): unknown {
  const n = emptyToNull(v);
  if (n === null) return null;
  if (typeof n === "number") return n;
  if (typeof n === "string") {
    const parsed = Number(n);
    return Number.isFinite(parsed) ? parsed : n;
  }
  return n;
}

function coerceEnumArray<T extends readonly string[]>(v: unknown, allowed: T): unknown {
  const n = emptyToNull(v);
  if (n === null) return null;
  let arr: unknown = n;
  if (typeof n === "string") {
    try {
      arr = JSON.parse(n);
    } catch {
      return n;
    }
  }
  if (Array.isArray(arr)) {
    return Array.from(new Set(arr));
  }
  return arr;
}

const optionalMapCoord = z.preprocess(
  coerceNumber,
  z.number().min(0, "must be >= 0").max(10, "must be <= 10").nullable(),
);

function optionalEnum<T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess(
    emptyToNull,
    z.enum(values).nullable(),
  );
}

function optionalEnumArray<T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess(
    (v) => coerceEnumArray(v, values),
    z.array(z.enum(values)).nullable(),
  );
}

/** All Scorecard fields optional so existing company create/PATCH keep working. */
export const scorecardFieldsSchema = z.object({
  mapAX: optionalMapCoord.optional(),
  mapAY: optionalMapCoord.optional(),
  strategicPosture: optionalEnum(STRATEGIC_POSTURES).optional(),
  valuationCategory: optionalEnum(VALUATION_CATEGORIES).optional(),
  humanDataSupplyCategory: optionalEnum(HUMAN_DATA_SUPPLY_CATEGORIES).optional(),
  platformStage: optionalEnum(PLATFORM_STAGES).optional(),
  vcControlLayers: optionalEnumArray(VC_CONTROL_LAYERS).optional(),
  brandTags: optionalEnumArray(BRAND_TAGS).optional(),
});

export type ScorecardFields = z.infer<typeof scorecardFieldsSchema>;

export function normalizeScorecardAliases(body: Record<string, unknown>): Record<string, unknown> {
  const out = { ...body };
  for (const [snake, camel] of Object.entries(SNAKE_TO_CAMEL)) {
    if (snake in out && !(camel in out)) {
      out[camel] = out[snake];
    }
    if (snake in out) delete out[snake];
  }
  return out;
}

function pickPresentScorecard(body: Record<string, unknown>): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const key of SCORECARD_FIELD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      picked[key] = body[key];
    }
  }
  return picked;
}

/**
 * Normalize snake_case aliases, enum-validate any present Scorecard fields,
 * and merge them back. Other company fields are left untouched so existing
 * PATCH /api/companies/:id payloads keep working.
 */
export function applyScorecardValidation(body: unknown): Record<string, unknown> {
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Expected object");
  }
  const normalized = normalizeScorecardAliases(body as Record<string, unknown>);
  const picked = pickPresentScorecard(normalized);
  const parsed = scorecardFieldsSchema.parse(picked);
  return { ...normalized, ...parsed };
}

export function parseJsonStringArray(value: unknown): string[] | null {
  if (value == null || value === "") return null;
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((v): v is string => typeof v === "string");
    } catch {
      return null;
    }
  }
  return null;
}

export function encodeScorecardArrays<T extends Record<string, unknown>>(data: T): T {
  const out = { ...data };
  if (Array.isArray(out.vcControlLayers)) {
    (out as Record<string, unknown>).vcControlLayers = JSON.stringify(out.vcControlLayers);
  }
  if (Array.isArray(out.brandTags)) {
    (out as Record<string, unknown>).brandTags = JSON.stringify(out.brandTags);
  }
  return out;
}

export function decodeScorecardArrays<T extends Record<string, unknown>>(row: T): T {
  return {
    ...row,
    vcControlLayers: parseJsonStringArray(row.vcControlLayers),
    brandTags: parseJsonStringArray(row.brandTags),
  };
}

/**
 * ACL helper for a future greenbook-visible export.
 * No such export exists in this portal today — callers must filter with this
 * (or equivalent) before emitting Greenbook-facing lists.
 */
export function companyHasBrandTag(
  company: { brandTags?: unknown },
  tag: BrandTag,
): boolean {
  const tags = parseJsonStringArray(company.brandTags) ?? [];
  return tags.includes(tag);
}

export function isGreenbookVisible(company: { brandTags?: unknown }): boolean {
  return companyHasBrandTag(company, "greenbook_visible");
}
