import { z } from "zod";

/**
 * P3.4 Scorecard Evidence — grade + confidence on material Scorecard judgments.
 *
 * Attaches to existing Firm (companies) scorecard claims and, for the valuation
 * band recommendation, to a ValuationAssessment when one exists. Does not fork
 * a parallel Firm/Scorecard store.
 *
 * Lightweight QC / export / ship gate: fail closed if any minimum-set claim
 * lacks grade or confidence. Not a full compliance platform.
 */

export const EVIDENCE_GRADES = [
  "VerifiedFact",
  "CompanyClaim",
  "Inference",
  "UndisclosedSpeculative",
] as const;
export type EvidenceGrade = (typeof EVIDENCE_GRADES)[number];

export const EVIDENCE_GRADE_LABELS: Record<EvidenceGrade, string> = {
  VerifiedFact: "Verified fact",
  CompanyClaim: "Company claim",
  Inference: "Inference",
  UndisclosedSpeculative: "Undisclosed / speculative",
};

export const EVIDENCE_CONFIDENCE = ["high", "moderate", "low", "unknown"] as const;
export type EvidenceConfidence = (typeof EVIDENCE_CONFIDENCE)[number];

export const EVIDENCE_CONFIDENCE_LABELS: Record<EvidenceConfidence, string> = {
  high: "High",
  moderate: "Moderate",
  low: "Low",
  unknown: "Unknown",
};

/** Minimum set of material Scorecard claims that must carry grade + confidence. */
export const MATERIAL_CLAIM_KEYS = [
  "map_a_x",
  "map_a_y",
  "strategic_posture",
  "valuation_band",
  "control_point_ownership",
  "ai_on_control_point",
] as const;
export type MaterialClaimKey = (typeof MATERIAL_CLAIM_KEYS)[number];

export const MATERIAL_CLAIM_LABELS: Record<MaterialClaimKey, string> = {
  map_a_x: "Map A X claim",
  map_a_y: "Map A Y claim",
  strategic_posture: "Strategic posture justification",
  valuation_band: "Valuation band recommendation",
  control_point_ownership: "Primary ControlPoint ownership claim",
  ai_on_control_point: "AI-on-control-point test result",
};

/** Firm-attached claims (P3.1 Scorecard fields). */
export const FIRM_CLAIM_KEYS = [
  "map_a_x",
  "map_a_y",
  "strategic_posture",
  "control_point_ownership",
  "ai_on_control_point",
] as const;

/** Assessment-attached claim (P3.3 recommended band). */
export const ASSESSMENT_CLAIM_KEYS = ["valuation_band"] as const;

export const CONTROL_POINT_VALUES = [
  "proprietary_data",
  "integration_governance",
  "benchmarked_quality",
  "distribution_channel",
] as const;
export type ControlPointValue = (typeof CONTROL_POINT_VALUES)[number];

export const CONTROL_POINT_LABELS: Record<ControlPointValue, string> = {
  proprietary_data: "Proprietary data rights",
  integration_governance: "Embedded integration & governance",
  benchmarked_quality: "Independently benchmarked quality",
  distribution_channel: "Distribution / channel advantage",
};

export const AI_ON_CONTROL_POINT_RESULTS = ["pass", "fail", "inconclusive"] as const;
export type AiOnControlPointResult = (typeof AI_ON_CONTROL_POINT_RESULTS)[number];

export class ScorecardEvidenceError extends Error {
  statusCode: number;
  extras: Record<string, unknown>;

  constructor(message: string, statusCode = 400, extras: Record<string, unknown> = {}) {
    super(message);
    this.name = "ScorecardEvidenceError";
    this.statusCode = statusCode;
    this.extras = extras;
  }
}

export const SCORECARD_EVIDENCE_CREATE_SQL = `
  CREATE TABLE IF NOT EXISTS scorecard_evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id),
    assessment_id INTEGER,
    claim_key TEXT NOT NULL,
    grade TEXT NOT NULL,
    confidence TEXT NOT NULL,
    claim_value TEXT,
    notes TEXT,
    source_url TEXT,
    greenbook_visible INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX IF NOT EXISTS scorecard_evidence_company_claim_idx
    ON scorecard_evidence(company_id, claim_key);
  CREATE INDEX IF NOT EXISTS scorecard_evidence_assessment_idx
    ON scorecard_evidence(assessment_id);
`;

const CLAIM_KEY_ALIASES: Record<string, MaterialClaimKey> = {
  map_a_x: "map_a_x",
  mapAX: "map_a_x",
  map_a_y: "map_a_y",
  mapAY: "map_a_y",
  strategic_posture: "strategic_posture",
  strategicPosture: "strategic_posture",
  valuation_band: "valuation_band",
  valuationBand: "valuation_band",
  recommended_band: "valuation_band",
  recommendedBand: "valuation_band",
  control_point_ownership: "control_point_ownership",
  controlPointOwnership: "control_point_ownership",
  ai_on_control_point: "ai_on_control_point",
  aiOnControlPoint: "ai_on_control_point",
};

function pick(body: Record<string, unknown>, camel: string, snake: string): unknown {
  if (body[camel] !== undefined) return body[camel];
  return body[snake];
}

function emptyToNull(v: unknown): unknown {
  if (v === "" || v === undefined) return null;
  return v;
}

export function parseClaimKey(value: unknown): MaterialClaimKey {
  if (typeof value !== "string" || !value.trim()) {
    throw new ScorecardEvidenceError("claim_key is required", 400);
  }
  const key = CLAIM_KEY_ALIASES[value.trim()] ?? CLAIM_KEY_ALIASES[value];
  if (!key) {
    throw new ScorecardEvidenceError(
      `Invalid claim_key. Must be one of: ${MATERIAL_CLAIM_KEYS.join(", ")}`,
      400,
    );
  }
  return key;
}

export function parseGrade(value: unknown): EvidenceGrade {
  if (typeof value !== "string" || !value.trim()) {
    throw new ScorecardEvidenceError("grade is required", 400);
  }
  const trimmed = value.trim();
  if (!(EVIDENCE_GRADES as readonly string[]).includes(trimmed)) {
    throw new ScorecardEvidenceError(
      `Invalid grade. Must be one of: ${EVIDENCE_GRADES.join(", ")}`,
      400,
    );
  }
  return trimmed as EvidenceGrade;
}

export function parseConfidence(value: unknown): EvidenceConfidence {
  if (typeof value !== "string" || !value.trim()) {
    throw new ScorecardEvidenceError("confidence is required", 400);
  }
  const trimmed = value.trim();
  if (!(EVIDENCE_CONFIDENCE as readonly string[]).includes(trimmed)) {
    throw new ScorecardEvidenceError(
      `Invalid confidence. Must be one of: ${EVIDENCE_CONFIDENCE.join(", ")}`,
      400,
    );
  }
  return trimmed as EvidenceConfidence;
}

/**
 * Gen2 vault paths must never be auto-copied into Evidence marked
 * greenbook_visible. Detect common vault/path schemes; callers reject on write.
 */
const GEN2_VAULT_RE =
  /gen2\s*[:/\\._-]*\s*vault|vault\s*[:/\\._-]*\s*gen2|\bgen2:\/\/|\/gen2\/|\\gen2\\/i;

export function isGen2VaultPath(value: string | null | undefined): boolean {
  if (!value || !value.trim()) return false;
  return GEN2_VAULT_RE.test(value);
}

export function assertNoGen2VaultOnGreenbookVisible(
  sourceUrl: string | null | undefined,
  greenbookVisible: boolean,
): void {
  if (greenbookVisible && isGen2VaultPath(sourceUrl)) {
    throw new ScorecardEvidenceError(
      "Do not copy Gen2 vault paths into Evidence marked greenbook_visible",
      400,
    );
  }
}

export function parseOptionalSourceUrl(
  value: unknown,
  greenbookVisible: boolean,
): string | null {
  const n = emptyToNull(value);
  if (n == null) return null;
  if (typeof n !== "string") {
    throw new ScorecardEvidenceError("source_url must be a string", 400);
  }
  const trimmed = n.trim() || null;
  assertNoGen2VaultOnGreenbookVisible(trimmed, greenbookVisible);
  return trimmed;
}

export function parseGreenbookVisible(value: unknown): boolean {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false" || value == null || value === "") {
    return false;
  }
  throw new ScorecardEvidenceError("greenbook_visible must be a boolean", 400);
}

export function parseOptionalClaimValue(claimKey: MaterialClaimKey, value: unknown): string | null {
  const n = emptyToNull(value);
  if (n == null) return null;
  if (typeof n !== "string") {
    throw new ScorecardEvidenceError("claim_value must be a string", 400);
  }
  const trimmed = n.trim();
  if (!trimmed) return null;
  if (claimKey === "control_point_ownership") {
    if (!(CONTROL_POINT_VALUES as readonly string[]).includes(trimmed)) {
      throw new ScorecardEvidenceError(
        `Invalid control_point_ownership value. Must be one of: ${CONTROL_POINT_VALUES.join(", ")}`,
        400,
      );
    }
  }
  if (claimKey === "ai_on_control_point") {
    if (!(AI_ON_CONTROL_POINT_RESULTS as readonly string[]).includes(trimmed)) {
      throw new ScorecardEvidenceError(
        `Invalid ai_on_control_point result. Must be one of: ${AI_ON_CONTROL_POINT_RESULTS.join(", ")}`,
        400,
      );
    }
  }
  return trimmed;
}

export const upsertEvidenceBodySchema = z.object({
  claimKey: z.unknown().optional(),
  claim_key: z.unknown().optional(),
  grade: z.unknown().optional(),
  confidence: z.unknown().optional(),
  claimValue: z.unknown().optional(),
  claim_value: z.unknown().optional(),
  notes: z.string().nullable().optional(),
  sourceUrl: z.unknown().optional(),
  source_url: z.unknown().optional(),
  greenbookVisible: z.unknown().optional(),
  greenbook_visible: z.unknown().optional(),
  assessmentId: z.unknown().optional(),
  assessment_id: z.unknown().optional(),
  createdBy: z.string().nullable().optional(),
  created_by: z.string().nullable().optional(),
});

export interface ParsedEvidenceWrite {
  claimKey: MaterialClaimKey;
  grade: EvidenceGrade;
  confidence: EvidenceConfidence;
  claimValue: string | null;
  notes: string | null;
  sourceUrl: string | null;
  greenbookVisible: boolean;
  assessmentId: number | null;
  createdBy: string | null;
}

export function parseEvidenceWrite(body: Record<string, unknown>): ParsedEvidenceWrite {
  upsertEvidenceBodySchema.parse(body);
  const claimKey = parseClaimKey(pick(body, "claimKey", "claim_key"));
  const grade = parseGrade(body.grade);
  const confidence = parseConfidence(body.confidence);
  const greenbookVisible = parseGreenbookVisible(pick(body, "greenbookVisible", "greenbook_visible"));
  const sourceUrl = parseOptionalSourceUrl(pick(body, "sourceUrl", "source_url"), greenbookVisible);
  const assessmentRaw = pick(body, "assessmentId", "assessment_id");
  let assessmentId: number | null = null;
  if (assessmentRaw != null && assessmentRaw !== "") {
    const n = typeof assessmentRaw === "number" ? assessmentRaw : Number(assessmentRaw);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ScorecardEvidenceError("assessment_id must be a positive integer", 400);
    }
    assessmentId = n;
  }
  const notesRaw = body.notes;
  const notes = typeof notesRaw === "string" ? notesRaw.trim() || null : null;
  const createdRaw = pick(body, "createdBy", "created_by");
  const createdBy = typeof createdRaw === "string" ? createdRaw.trim() || null : null;

  return {
    claimKey,
    grade,
    confidence,
    claimValue: parseOptionalClaimValue(claimKey, pick(body, "claimValue", "claim_value")),
    notes,
    sourceUrl,
    greenbookVisible,
    assessmentId,
    createdBy,
  };
}

export function isAssessmentClaim(claimKey: MaterialClaimKey): boolean {
  return (ASSESSMENT_CLAIM_KEYS as readonly string[]).includes(claimKey);
}

export interface EvidenceRecord {
  id: number;
  companyId: number;
  assessmentId: number | null;
  claimKey: MaterialClaimKey;
  grade: EvidenceGrade;
  confidence: EvidenceConfidence;
  claimValue: string | null;
  notes: string | null;
  sourceUrl: string | null;
  greenbookVisible: boolean;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  labeled: boolean;
}

export function withEvidenceLabels<T extends { grade: EvidenceGrade }>(row: T): T & { labeled: boolean } {
  return {
    ...row,
    labeled: row.grade === "UndisclosedSpeculative",
  };
}

export interface QcClaimStatus {
  claimKey: MaterialClaimKey;
  label: string;
  present: boolean;
  grade: EvidenceGrade | null;
  confidence: EvidenceConfidence | null;
  labeled: boolean;
  missing: string[];
}

export interface ScorecardQcResult {
  passed: boolean;
  status: "passed" | "failed";
  failClosed: true;
  claims: QcClaimStatus[];
  missingClaimKeys: MaterialClaimKey[];
}

export function evaluateScorecardQc(
  evidenceByClaim: Partial<Record<MaterialClaimKey, Pick<EvidenceRecord, "grade" | "confidence"> | null | undefined>>,
): ScorecardQcResult {
  const claims: QcClaimStatus[] = MATERIAL_CLAIM_KEYS.map((claimKey) => {
    const ev = evidenceByClaim[claimKey];
    const grade = ev?.grade ?? null;
    const confidence = ev?.confidence ?? null;
    const missing: string[] = [];
    if (!grade) missing.push("grade");
    if (!confidence) missing.push("confidence");
    return {
      claimKey,
      label: MATERIAL_CLAIM_LABELS[claimKey],
      present: missing.length === 0,
      grade,
      confidence,
      labeled: grade === "UndisclosedSpeculative",
      missing,
    };
  });
  const missingClaimKeys = claims.filter((c) => !c.present).map((c) => c.claimKey);
  const passed = missingClaimKeys.length === 0;
  return {
    passed,
    status: passed ? "passed" : "failed",
    failClosed: true,
    claims,
    missingClaimKeys,
  };
}

export function qcBlockedError(qc: ScorecardQcResult, pathway: "export" | "ship"): ScorecardEvidenceError {
  return new ScorecardEvidenceError(
    `${pathway === "ship" ? "Ship" : "Export"} blocked: Scorecard QC failed. Material claims missing Evidence.grade or confidence.`,
    409,
    { qc, status: "failed" },
  );
}
