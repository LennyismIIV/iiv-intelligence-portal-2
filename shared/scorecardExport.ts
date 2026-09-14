/**
 * P3.5 Gen2 CEO Reclassification Scorecard — document model + SoR assembly.
 *
 * Extends the P3.4 Scorecard export (evidence + fail-closed QC) into the
 * PRD section order. Empty/partial SoR becomes labeled placeholders + gap
 * flags. Never invents multiples, Map B, or Greenbook branding.
 */

import {
  CONTROL_POINT_LABELS,
  EVIDENCE_CONFIDENCE_LABELS,
  EVIDENCE_GRADE_LABELS,
  MATERIAL_CLAIM_KEYS,
  MATERIAL_CLAIM_LABELS,
  type EvidenceConfidence,
  type EvidenceGrade,
  type EvidenceRecord,
  type MaterialClaimKey,
  type ScorecardQcResult,
} from "./scorecardEvidence";
import {
  STRATEGIC_POSTURE_LABELS,
  VALUATION_CATEGORY_LABELS,
  type StrategicPosture,
  type ValuationCategory,
} from "./scorecardFields";
import { HARD_RULE_LABELS, type HardRuleId } from "./valuationAssessment";
import type { TapeBand } from "./valuationTape";

export const SCORECARD_BRAND = "Gen2" as const;
export const SCORECARD_EDITION = "CEO" as const;
export const SCORECARD_FORMAT = "gen2-ceo-scorecard-v1" as const;
export const EVIDENCE_FORMAT = "iiv-scorecard-evidence-v1" as const;

/** Exact Instrument A name — header, footer, and Map A section. */
export const INSTRUMENT_A_NAME =
  "Instrument A — Competitive Map (Data Uniqueness × Infrastructure/Integration Depth)";

export const AI_CONTROL_POINT_DOCTRINE = "ai.reclassification_not_automation";

export const DRAFT_WATERMARK = "INTERNAL DRAFT — NOT FOR CLIENT SEND";
export const LOCKED_SEND_LABEL = "LOCKED SEND";
export const GAP_PREFIX = "[GAP]";

export const FORBIDDEN_CEO_EDITION_TERMS = ["Greenbook", "Map B", "Instrument B"] as const;

export const SECTION_IDS = [
  "header",
  "map_a",
  "strategic_posture",
  "valuation_category_band",
  "control_point_read",
  "ai_on_control_point",
  "implication_trifecta",
  "evidence_appendix",
] as const;
export type ScorecardSectionId = (typeof SECTION_IDS)[number];

export const SECTION_TITLES: Record<ScorecardSectionId, string> = {
  header: "1. Header",
  map_a: `2. Map A — ${INSTRUMENT_A_NAME}`,
  strategic_posture: "3. Strategic posture",
  valuation_category_band: "4. Valuation category + band",
  control_point_read: "5. Control-point read",
  ai_on_control_point: "6. AI-on-control-point test",
  implication_trifecta: "7a. Implication Trifecta",
  evidence_appendix: "8. Evidence appendix",
};

const CONFIDENCE_RANK: Record<EvidenceConfidence, number> = {
  unknown: 0,
  low: 1,
  moderate: 2,
  high: 3,
};

const AI_RESULT_LABELS: Record<string, string> = {
  pass: "Pass",
  fail: "Fail",
  inconclusive: "Ambiguous",
  ambiguous: "Ambiguous",
};

export interface GapFlag {
  key: string;
  field: string;
  reason: string;
}

export interface ExportField {
  key: string;
  label: string;
  value: string;
  present: boolean;
  gap: boolean;
}

export interface ScorecardSection {
  id: ScorecardSectionId;
  title: string;
  blocks: string[];
}

export interface FirmExportSnapshot {
  id: number;
  name: string;
  mapAX: number | null;
  mapAY: number | null;
  strategicPosture: string | null;
  valuationCategory: string | null;
  vcControlLayers: string[] | null;
}

export interface AssessmentExportSnapshot {
  id: number;
  evaluatorId: string;
  scoredAt: string;
  tapeAsOf: string;
  valuationCategory: string | null;
  recommendedBand: string | null;
  finalBand: string | null;
  hardRulesFired: string[] | "none";
  conviction: number | null;
  narrative: string | null;
  recommendedBandRanges: TapeBand | null;
  finalBandRanges: TapeBand | null;
  bandRanges: TapeBand[];
}

export interface TapeExportSnapshot {
  tapeId: string;
  asOf: string;
  status: string;
  bands: TapeBand[];
}

export interface ScorecardExportInput {
  firm: FirmExportSnapshot;
  assessment: AssessmentExportSnapshot | null;
  tape: TapeExportSnapshot | null;
  evidence: EvidenceRecord[];
  qc: ScorecardQcResult;
  exportedAt: string;
  draft: boolean;
}

export interface ScorecardDocument {
  format: typeof SCORECARD_FORMAT;
  edition: typeof SCORECARD_EDITION;
  brand: typeof SCORECARD_BRAND;
  instrumentA: typeof INSTRUMENT_A_NAME;
  draft: boolean;
  watermark: string | null;
  exportedAt: string;
  firmName: string;
  scorecardDate: string;
  sections: ScorecardSection[];
  gaps: GapFlag[];
  header: {
    firmName: ExportField;
    scorecardDate: ExportField;
    scoredAt: ExportField;
    tapeAsOf: ExportField;
    brand: ExportField;
    evaluator: ExportField;
    confidenceRollup: ExportField;
  };
  mapA: {
    instrument: ExportField;
    mapAX: ExportField;
    mapAY: ExportField;
    quadrant: ExportField;
    gradeX: ExportField;
    gradeY: ExportField;
  };
  strategicPosture: {
    lead: ExportField;
    justification: ExportField;
  };
  valuation: {
    category: ExportField;
    band: ExportField;
    hardRulesFired: ExportField;
    tapeRanges: ExportField;
    conviction: ExportField;
    narrative: ExportField;
    tapeAsOf: ExportField;
  };
  controlPoint: {
    primary: ExportField;
    vcControlLayers: ExportField;
  };
  aiOnControlPoint: {
    result: ExportField;
    doctrine: ExportField;
    evidence: ExportField;
  };
  trifecta: {
    supplier: ExportField;
    buyer: ExportField;
    investor: ExportField;
    agenda: ExportField[];
  };
  appendix: Array<{
    claimKey: MaterialClaimKey;
    label: string;
    claimValue: ExportField;
    grade: ExportField;
    confidence: ExportField;
    notes: ExportField;
  }>;
}

export function presentField(key: string, label: string, value: string): ExportField {
  return { key, label, value, present: true, gap: false };
}

export function gapField(key: string, label: string, reason: string): ExportField {
  return {
    key,
    label,
    value: `${GAP_PREFIX} ${reason}`,
    present: false,
    gap: true,
  };
}

export function fieldFrom(key: string, label: string, raw: unknown, reason: string): ExportField {
  if (raw == null || raw === "") return gapField(key, label, reason);
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return presentField(key, label, String(raw));
  }
  if (typeof raw === "string" && raw.trim()) {
    return presentField(key, label, raw.trim());
  }
  return gapField(key, label, reason);
}

export function scorecardDateFrom(exportedAt: string): string {
  const d = exportedAt.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : exportedAt;
}

export function mapAQuadrant(x: number | null, y: number | null): ExportField {
  if (x == null || y == null) {
    return gapField(
      "map_a_quadrant",
      "Quadrant",
      "Map A quadrant unavailable — map_a_x and map_a_y are required",
    );
  }
  const uniq = x >= 5 ? "High" : "Low";
  const infra = y >= 5 ? "High" : "Low";
  const corner = x >= 5
    ? (y >= 5 ? "upper-right" : "lower-right")
    : (y >= 5 ? "upper-left" : "lower-left");
  return presentField(
    "map_a_quadrant",
    "Quadrant",
    `${uniq} uniqueness × ${infra} infrastructure (${corner})`,
  );
}

export function rollupConfidence(evidence: Array<{ confidence?: EvidenceConfidence | null }>): ExportField {
  const values = evidence
    .map((row) => row.confidence)
    .filter((c): c is EvidenceConfidence => !!c && c in CONFIDENCE_RANK);
  if (values.length === 0) {
    return gapField(
      "confidence_rollup",
      "Confidence rollup",
      "Confidence rollup unavailable — no graded evidence",
    );
  }
  const worst = values.reduce((acc, cur) =>
    CONFIDENCE_RANK[cur] < CONFIDENCE_RANK[acc] ? cur : acc,
  );
  return presentField(
    "confidence_rollup",
    "Confidence rollup",
    `${EVIDENCE_CONFIDENCE_LABELS[worst]} (lowest of ${values.length} graded claim${values.length === 1 ? "" : "s"})`,
  );
}

function evidenceByClaim(rows: EvidenceRecord[]): Partial<Record<MaterialClaimKey, EvidenceRecord>> {
  const out: Partial<Record<MaterialClaimKey, EvidenceRecord>> = {};
  for (const row of rows) out[row.claimKey] = row;
  return out;
}

function gradeField(claim: EvidenceRecord | undefined, key: string, label: string): ExportField {
  if (!claim?.grade) {
    return gapField(key, label, `${label} unavailable — Evidence.grade not set`);
  }
  return presentField(key, label, EVIDENCE_GRADE_LABELS[claim.grade as EvidenceGrade] ?? claim.grade);
}

function formatTriple(
  triple: { low: number; median?: number; high: number } | undefined,
  metric: string,
): string | null {
  if (!triple) return null;
  const median = triple.median != null ? `, median ${triple.median}x` : "";
  return `${metric} ${triple.low}–${triple.high}x${median}`;
}

export function formatTapeBandRanges(band: TapeBand | null | undefined): string | null {
  if (!band) return null;
  const parts = [
    formatTriple(band.maRev, "M&A EV/Rev"),
    formatTriple(band.maEbitda, "M&A EV/EBITDA"),
    formatTriple(band.vcRev, "VC EV/Rev"),
  ].filter((p): p is string => !!p);
  if (parts.length === 0) return `Band ${band.bandId} (no ranges on tape snapshot)`;
  return `Band ${band.bandId}: ${parts.join("; ")}`;
}

function formatAllTapeBands(bands: TapeBand[]): string | null {
  if (!bands.length) return null;
  const lines = bands.map((b) => formatTapeBandRanges(b)).filter((l): l is string => !!l);
  return lines.length ? lines.join(" | ") : null;
}

function formatHardRules(rules: string[] | "none" | null | undefined): ExportField {
  if (rules == null) {
    return gapField("hard_rules_fired", "Hard rules fired", "Hard rules unavailable — no ValuationAssessment");
  }
  if (rules === "none" || (Array.isArray(rules) && rules.length === 0)) {
    return presentField("hard_rules_fired", "Hard rules fired", "None");
  }
  const labels = rules.map((id) => HARD_RULE_LABELS[id as HardRuleId] ?? id);
  return presentField("hard_rules_fired", "Hard rules fired", labels.join("; "));
}

function postureLabel(value: string | null): string | null {
  if (!value) return null;
  return STRATEGIC_POSTURE_LABELS[value as StrategicPosture] ?? value;
}

function categoryLabel(value: string | null): string | null {
  if (!value) return null;
  return VALUATION_CATEGORY_LABELS[value as ValuationCategory] ?? value;
}

function line(field: ExportField): string {
  return `${field.label}: ${field.value}`;
}

function collectGaps(fields: ExportField[]): GapFlag[] {
  return fields.filter((f) => f.gap).map((f) => ({
    key: f.key,
    field: f.label,
    reason: f.value.replace(`${GAP_PREFIX} `, ""),
  }));
}

export function forbiddenCeoEditionHits(text: string): string[] {
  return FORBIDDEN_CEO_EDITION_TERMS.filter((term) => text.includes(term));
}

export function flattenDocumentText(doc: ScorecardDocument): string {
  const sectionText = doc.sections
    .map((s) => [s.title, ...s.blocks].join("\n"))
    .join("\n");
  return [
    doc.brand,
    doc.edition,
    doc.instrumentA,
    doc.watermark ?? "",
    sectionText,
  ].join("\n");
}

export function sectionOrderOf(doc: ScorecardDocument): ScorecardSectionId[] {
  return doc.sections.map((s) => s.id);
}

/**
 * Assemble the Gen2 CEO Scorecard from Portal SoR only.
 * Missing values become [GAP] placeholders — never invented multiples.
 */
export function assembleScorecardDocument(input: ScorecardExportInput): ScorecardDocument {
  const { firm, assessment, tape, evidence, exportedAt, draft } = input;
  const byClaim = evidenceByClaim(evidence);
  const scorecardDate = scorecardDateFrom(exportedAt);

  const header = {
    firmName: fieldFrom("firm_name", "Firm", firm.name, "Firm display name unavailable"),
    scorecardDate: presentField("scorecard_date", "Scorecard date", scorecardDate),
    scoredAt: fieldFrom("scored_at", "scored_at", assessment?.scoredAt ?? null, "scored_at unavailable — no ValuationAssessment"),
    tapeAsOf: fieldFrom(
      "tape_as_of",
      "tape_as_of",
      assessment?.tapeAsOf ?? tape?.asOf ?? null,
      "tape_as_of unavailable — no approved ValuationTape snapshot",
    ),
    brand: presentField("brand", "Brand", SCORECARD_BRAND),
    evaluator: fieldFrom("evaluator", "Evaluator", assessment?.evaluatorId ?? null, "Evaluator unavailable — no ValuationAssessment"),
    confidenceRollup: rollupConfidence(evidence),
  };

  const mapA = {
    instrument: presentField("instrument_a", "Instrument", INSTRUMENT_A_NAME),
    mapAX: fieldFrom("map_a_x", "map_a_x", firm.mapAX, "map_a_x unavailable on Firm SoR"),
    mapAY: fieldFrom("map_a_y", "map_a_y", firm.mapAY, "map_a_y unavailable on Firm SoR"),
    quadrant: mapAQuadrant(firm.mapAX, firm.mapAY),
    gradeX: gradeField(byClaim.map_a_x, "map_a_x_grade", "Evidence grade (X)"),
    gradeY: gradeField(byClaim.map_a_y, "map_a_y_grade", "Evidence grade (Y)"),
  };

  const postureValue = postureLabel(firm.strategicPosture);
  const postureNotes = byClaim.strategic_posture?.notes ?? byClaim.strategic_posture?.claimValue ?? null;
  const strategicPosture = {
    lead: fieldFrom(
      "strategic_posture",
      "Lead posture",
      postureValue,
      "Strategic posture unavailable — set one lead (orchestrator | trust_builder | decision_partner)",
    ),
    justification: fieldFrom(
      "strategic_posture_justification",
      "Justification",
      postureNotes,
      "Posture justification unavailable — Evidence notes not set",
    ),
  };

  const snapshotBand = assessment?.finalBandRanges
    ?? assessment?.recommendedBandRanges
    ?? null;
  const snapshotRanges = formatTapeBandRanges(snapshotBand);
  const approvedTapeRanges = !snapshotRanges && tape?.bands?.length
    ? formatAllTapeBands(tape.bands)
    : null;
  const tapeRangesValue = snapshotRanges
    ?? (approvedTapeRanges
      ? `Approved tape (no assessment snapshot): ${approvedTapeRanges}`
      : null);

  const bandId = assessment?.finalBand ?? assessment?.recommendedBand ?? null;
  const valuation = {
    category: fieldFrom(
      "valuation_category",
      "Valuation category",
      categoryLabel(assessment?.valuationCategory ?? firm.valuationCategory ?? null),
      "Valuation category unavailable on Firm / Assessment SoR",
    ),
    band: fieldFrom(
      "valuation_band",
      "Valuation band",
      bandId,
      "Valuation band unavailable — no Assessment recommendation (bands come from tape snapshot only)",
    ),
    hardRulesFired: formatHardRules(assessment?.hardRulesFired ?? null),
    tapeRanges: fieldFrom(
      "tape_ranges",
      "Tape ranges",
      tapeRangesValue,
      "Tape ranges unavailable — no approved ValuationTape snapshot / assessment",
    ),
    conviction: fieldFrom(
      "conviction",
      "Conviction",
      assessment?.conviction ?? null,
      "Conviction unavailable — no ValuationAssessment",
    ),
    narrative: fieldFrom(
      "narrative",
      "Narrative",
      assessment?.narrative ?? null,
      "Narrative unavailable — no ValuationAssessment",
    ),
    tapeAsOf: fieldFrom(
      "valuation_tape_as_of",
      "tape_as_of",
      assessment?.tapeAsOf ?? tape?.asOf ?? null,
      "tape_as_of unavailable — no approved ValuationTape snapshot",
    ),
  };

  const primaryCp = byClaim.control_point_ownership?.claimValue ?? null;
  const primaryCpLabel = primaryCp
    ? (CONTROL_POINT_LABELS[primaryCp as keyof typeof CONTROL_POINT_LABELS] ?? primaryCp)
    : null;
  const layers = firm.vcControlLayers?.length ? firm.vcControlLayers.join(", ") : null;
  const controlPoint = {
    primary: fieldFrom(
      "control_point_ownership",
      "Primary ControlPoint",
      primaryCpLabel,
      "Primary ControlPoint unavailable — Evidence claim_value not set",
    ),
    vcControlLayers: fieldFrom(
      "vc_control_layers",
      "vc_control_layers",
      layers,
      "vc_control_layers unavailable on Firm SoR",
    ),
  };

  const aiRaw = byClaim.ai_on_control_point?.claimValue ?? null;
  const aiLabel = aiRaw ? (AI_RESULT_LABELS[aiRaw] ?? aiRaw) : null;
  const aiNotes = byClaim.ai_on_control_point?.notes ?? null;
  const aiGrade = byClaim.ai_on_control_point
    ? `${EVIDENCE_GRADE_LABELS[byClaim.ai_on_control_point.grade]} / ${EVIDENCE_CONFIDENCE_LABELS[byClaim.ai_on_control_point.confidence]}`
    : null;
  const aiEvidenceText = [aiNotes, aiGrade].filter(Boolean).join(" — ") || null;
  const aiOnControlPoint = {
    result: fieldFrom(
      "ai_on_control_point",
      "Result",
      aiLabel,
      "AI-on-control-point result unavailable — Evidence claim_value not set (pass | fail | ambiguous)",
    ),
    doctrine: presentField("ai_doctrine", "Doctrine", AI_CONTROL_POINT_DOCTRINE),
    evidence: fieldFrom(
      "ai_on_control_point_evidence",
      "Evidence",
      aiEvidenceText,
      "AI-on-control-point evidence unavailable — grade + notes not set",
    ),
  };

  const trifecta = {
    supplier: gapField(
      "implication_supplier",
      "Supplier implication",
      "Not yet in Portal SoR — editable placeholder",
    ),
    buyer: gapField(
      "implication_buyer",
      "Buyer implication",
      "Not yet in Portal SoR — editable placeholder",
    ),
    investor: gapField(
      "implication_investor",
      "Investor implication",
      "Not yet in Portal SoR — editable placeholder",
    ),
    agenda: Array.from({ length: 6 }, (_, i) =>
      gapField(
        `agenda_90_day_${i + 1}`,
        `90-day agenda item ${i + 1}`,
        "Not yet in Portal SoR — editable placeholder",
      ),
    ),
  };

  const appendix = MATERIAL_CLAIM_KEYS.map((claimKey) => {
    const ev = byClaim[claimKey];
    return {
      claimKey,
      label: MATERIAL_CLAIM_LABELS[claimKey],
      claimValue: fieldFrom(
        `${claimKey}_value`,
        "Claim value",
        ev?.claimValue ?? null,
        "Claim value not set",
      ),
      grade: gradeField(ev, `${claimKey}_grade`, "Grade"),
      confidence: ev?.confidence
        ? presentField(`${claimKey}_confidence`, "Confidence", EVIDENCE_CONFIDENCE_LABELS[ev.confidence])
        : gapField(`${claimKey}_confidence`, "Confidence", "Evidence.confidence not set"),
      notes: fieldFrom(`${claimKey}_notes`, "Notes", ev?.notes ?? null, "Notes not set"),
    };
  });

  const allFields: ExportField[] = [
    ...Object.values(header),
    ...Object.values(mapA),
    ...Object.values(strategicPosture),
    ...Object.values(valuation),
    ...Object.values(controlPoint),
    ...Object.values(aiOnControlPoint),
    trifecta.supplier,
    trifecta.buyer,
    trifecta.investor,
    ...trifecta.agenda,
    ...appendix.flatMap((row) => [row.claimValue, row.grade, row.confidence, row.notes]),
  ];

  const sections: ScorecardSection[] = [
    {
      id: "header",
      title: SECTION_TITLES.header,
      blocks: [
        line(header.firmName),
        line(header.scorecardDate),
        line(header.scoredAt),
        line(header.tapeAsOf),
        line(header.brand),
        `Edition: ${SCORECARD_EDITION}`,
        line(header.evaluator),
        line(header.confidenceRollup),
      ],
    },
    {
      id: "map_a",
      title: SECTION_TITLES.map_a,
      blocks: [
        line(mapA.instrument),
        line(mapA.mapAX),
        line(mapA.mapAY),
        line(mapA.quadrant),
        line(mapA.gradeX),
        line(mapA.gradeY),
      ],
    },
    {
      id: "strategic_posture",
      title: SECTION_TITLES.strategic_posture,
      blocks: [
        "One lead only (orchestrator | trust_builder | decision_partner).",
        line(strategicPosture.lead),
        line(strategicPosture.justification),
      ],
    },
    {
      id: "valuation_category_band",
      title: SECTION_TITLES.valuation_category_band,
      blocks: [
        line(valuation.category),
        line(valuation.band),
        line(valuation.hardRulesFired),
        line(valuation.tapeRanges),
        line(valuation.conviction),
        line(valuation.narrative),
        line(valuation.tapeAsOf),
        "Bands are taken only from the approved tape snapshot / assessment. No evergreen multiples.",
      ],
    },
    {
      id: "control_point_read",
      title: SECTION_TITLES.control_point_read,
      blocks: [
        line(controlPoint.primary),
        line(controlPoint.vcControlLayers),
      ],
    },
    {
      id: "ai_on_control_point",
      title: SECTION_TITLES.ai_on_control_point,
      blocks: [
        line(aiOnControlPoint.result),
        line(aiOnControlPoint.doctrine),
        line(aiOnControlPoint.evidence),
        "Doctrine: reclassification is not automation.",
      ],
    },
    {
      id: "implication_trifecta",
      title: SECTION_TITLES.implication_trifecta,
      blocks: [
        "Supplier / Buyer / Investor implications + ≤6 item 90-day agenda.",
        line(trifecta.supplier),
        line(trifecta.buyer),
        line(trifecta.investor),
        ...trifecta.agenda.map(line),
      ],
    },
    {
      id: "evidence_appendix",
      title: SECTION_TITLES.evidence_appendix,
      blocks: appendix.flatMap((row) => [
        `${row.label} (${row.claimKey})`,
        line(row.claimValue),
        line(row.grade),
        line(row.confidence),
        line(row.notes),
      ]),
    },
  ];

  const doc: ScorecardDocument = {
    format: SCORECARD_FORMAT,
    edition: SCORECARD_EDITION,
    brand: SCORECARD_BRAND,
    instrumentA: INSTRUMENT_A_NAME,
    draft,
    watermark: draft ? DRAFT_WATERMARK : null,
    exportedAt,
    firmName: firm.name,
    scorecardDate,
    sections,
    gaps: collectGaps(allFields),
    header,
    mapA,
    strategicPosture,
    valuation,
    controlPoint,
    aiOnControlPoint,
    trifecta,
    appendix,
  };

  const hits = forbiddenCeoEditionHits(flattenDocumentText(doc));
  if (hits.length) {
    throw new Error(`Gen2 CEO Scorecard must not include: ${hits.join(", ")}`);
  }

  return doc;
}

export function emptyQc(): ScorecardQcResult {
  return {
    passed: false,
    status: "failed",
    failClosed: true,
    claims: MATERIAL_CLAIM_KEYS.map((claimKey) => ({
      claimKey,
      label: MATERIAL_CLAIM_LABELS[claimKey],
      present: false,
      grade: null,
      confidence: null,
      labeled: false,
      missing: ["grade", "confidence"],
    })),
    missingClaimKeys: [...MATERIAL_CLAIM_KEYS],
  };
}
