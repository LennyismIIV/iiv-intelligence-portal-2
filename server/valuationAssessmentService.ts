import type Database from "better-sqlite3";
import {
  ValuationAssessmentError,
  assertOverrideReason,
  decodeFinancials,
  decodeHardRulesFired,
  encodeFinancials,
  encodeHardRulesFired,
  parseAssessmentWrite,
  parseDoctrineFlags,
  parseStoredBandRanges,
  rangesForBand,
  snapshotBandRanges,
  type DoctrineFlag,
  type FinancialsRecord,
  type HardRulesFired,
} from "@shared/valuationAssessment";
import type { TapeBand } from "@shared/valuationTape";
import type { ValuationCategory } from "@shared/scorecardFields";
import type { ValuationTapeService } from "./valuationTapeService";

export interface ValuationAssessment {
  id: number;
  firmId: number;
  evaluatorId: string;
  mapAX: number | null;
  mapAY: number | null;
  valuationCategory: ValuationCategory | null;
  doctrineFlags: DoctrineFlag[];
  recommendedBand: string | null;
  finalBand: string | null;
  overrideReason: string | null;
  hardRulesFired: HardRuleIdOrNone;
  hardRulesNone: boolean;
  tapeId: string;
  tapeAsOf: string;
  bandRanges: TapeBand[];
  recommendedBandRanges: TapeBand | null;
  finalBandRanges: TapeBand | null;
  conviction: number | null;
  narrative: string | null;
  scoredAt: string;
  financials: FinancialsRecord | null;
  createdAt: string | null;
  updatedAt: string | null;
}

type HardRuleIdOrNone = string[] | "none";

interface AssessmentRow {
  id: number;
  firm_id: number;
  evaluator_id: string;
  map_a_x: number | null;
  map_a_y: number | null;
  valuation_category: string | null;
  doctrine_flags: string | null;
  recommended_band: string | null;
  final_band: string | null;
  override_reason: string | null;
  hard_rules_fired: string;
  tape_id: string;
  tape_as_of: string;
  band_ranges: string;
  conviction: number | null;
  narrative: string | null;
  scored_at: string;
  financials_json: string | null;
  created_at: string | null;
  updated_at: string | null;
}

function rowToAssessment(row: AssessmentRow): ValuationAssessment {
  const rules = decodeHardRulesFired(row.hard_rules_fired);
  const bandRanges = parseStoredBandRanges(row.band_ranges);
  return {
    id: row.id,
    firmId: row.firm_id,
    evaluatorId: row.evaluator_id,
    mapAX: row.map_a_x,
    mapAY: row.map_a_y,
    valuationCategory: (row.valuation_category as ValuationCategory | null) ?? null,
    doctrineFlags: parseDoctrineFlags(row.doctrine_flags),
    recommendedBand: row.recommended_band,
    finalBand: row.final_band,
    overrideReason: row.override_reason,
    hardRulesFired: rules.none ? "none" : rules.ids,
    hardRulesNone: rules.none,
    tapeId: row.tape_id,
    tapeAsOf: row.tape_as_of,
    bandRanges,
    recommendedBandRanges: rangesForBand(bandRanges, row.recommended_band),
    finalBandRanges: rangesForBand(bandRanges, row.final_band),
    conviction: row.conviction,
    narrative: row.narrative,
    scoredAt: row.scored_at,
    financials: decodeFinancials(row.financials_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createValuationAssessmentService(
  sqlite: Database.Database,
  tapeService: ValuationTapeService,
) {
  const selectById = sqlite.prepare("SELECT * FROM valuation_assessments WHERE id = ?");
  const selectByFirm = sqlite.prepare(`
    SELECT * FROM valuation_assessments
    WHERE firm_id = ?
    ORDER BY scored_at DESC, id DESC
  `);
  const selectLatest = sqlite.prepare(`
    SELECT * FROM valuation_assessments
    WHERE firm_id = ?
    ORDER BY scored_at DESC, id DESC
    LIMIT 1
  `);
  const firmExists = sqlite.prepare("SELECT id FROM companies WHERE id = ?");

  function requireFirm(firmId: number): void {
    if (!Number.isInteger(firmId) || firmId <= 0) {
      throw new ValuationAssessmentError("Invalid firm_id", 400);
    }
    const row = firmExists.get(firmId);
    if (!row) throw new ValuationAssessmentError("Company not found", 404);
  }

  function getRaw(id: number): AssessmentRow | undefined {
    return selectById.get(id) as AssessmentRow | undefined;
  }

  /**
   * Resolve the required tape. Missing tape_id falls back to current approved.
   * Draft tapes cannot be linked. Band ranges are always taken from the tape
   * snapshot — never from evergreen doctrine defaults.
   */
  function resolveTape(tapeId: string | null | undefined): { tapeId: string; tapeAsOf: string; bandRanges: string } {
    if (tapeId === null) {
      throw new ValuationAssessmentError("Assessment requires a linked approved ValuationTape", 400);
    }

    if (tapeId) {
      const tape = tapeService.get(tapeId);
      if (!tape) throw new ValuationAssessmentError("Tape not found", 404);
      if (tape.status === "draft") {
        throw new ValuationAssessmentError("Cannot link an assessment to a draft tape; approve the tape first", 400);
      }
      return {
        tapeId: tape.tapeId,
        tapeAsOf: tape.asOf,
        bandRanges: snapshotBandRanges(tape.bands),
      };
    }

    const current = tapeService.getCurrentApprovedTape();
    if (!current.tape) {
      throw new ValuationAssessmentError("Assessment requires a linked approved ValuationTape", 400);
    }
    return {
      tapeId: current.tape.tapeId,
      tapeAsOf: current.tape.asOf,
      bandRanges: snapshotBandRanges(current.tape.bands),
    };
  }

  function list(firmId: number): ValuationAssessment[] {
    requireFirm(firmId);
    return (selectByFirm.all(firmId) as AssessmentRow[]).map(rowToAssessment);
  }

  function get(id: number): ValuationAssessment | undefined {
    const row = getRaw(id);
    return row ? rowToAssessment(row) : undefined;
  }

  function getLatest(firmId: number): ValuationAssessment | null {
    requireFirm(firmId);
    const row = selectLatest.get(firmId) as AssessmentRow | undefined;
    return row ? rowToAssessment(row) : null;
  }

  function create(firmId: number, body: Record<string, unknown>): ValuationAssessment {
    requireFirm(firmId);
    const parsed = parseAssessmentWrite(body, { requireHardRules: true, requireEvaluator: true });
    if (parsed.provided.tapeId && parsed.tapeId === null) {
      throw new ValuationAssessmentError("Assessment requires a linked approved ValuationTape", 400);
    }
    const tape = resolveTape(parsed.provided.tapeId ? parsed.tapeId : undefined);
    const scoredAt = parsed.scoredAt || nowIso();
    const doctrineJson = JSON.stringify(parsed.doctrineFlags);

    const result = sqlite.prepare(`
      INSERT INTO valuation_assessments (
        firm_id, evaluator_id, map_a_x, map_a_y, valuation_category,
        doctrine_flags, recommended_band, final_band, override_reason,
        hard_rules_fired, tape_id, tape_as_of, band_ranges,
        conviction, narrative, scored_at, financials_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      firmId,
      parsed.evaluatorId,
      parsed.mapAX,
      parsed.mapAY,
      parsed.valuationCategory,
      doctrineJson,
      parsed.recommendedBand,
      parsed.finalBand,
      parsed.overrideReason,
      encodeHardRulesFired(parsed.hardRulesFired),
      tape.tapeId,
      tape.tapeAsOf,
      tape.bandRanges,
      parsed.conviction,
      parsed.narrative,
      scoredAt,
      encodeFinancials(parsed.financials),
    );

    return get(Number(result.lastInsertRowid))!;
  }

  function update(id: number, body: Record<string, unknown>): ValuationAssessment {
    const existing = getRaw(id);
    if (!existing) throw new ValuationAssessmentError("Assessment not found", 404);
    const parsed = parseAssessmentWrite(body, { requireHardRules: false, requireEvaluator: false });

    if (parsed.provided.tapeId && parsed.tapeId === null) {
      throw new ValuationAssessmentError("Assessment requires a linked approved ValuationTape", 400);
    }

    const tape = parsed.provided.tapeId
      ? resolveTape(parsed.tapeId)
      : { tapeId: existing.tape_id, tapeAsOf: existing.tape_as_of, bandRanges: existing.band_ranges };

    const recommendedBand = parsed.provided.recommendedBand ? parsed.recommendedBand : existing.recommended_band;
    const finalBand = parsed.provided.finalBand ? parsed.finalBand : existing.final_band;
    const overrideReason = parsed.provided.overrideReason
      ? parsed.overrideReason
      : existing.override_reason;
    assertOverrideReason(recommendedBand, finalBand, overrideReason);

    const hardRules: HardRulesFired = parsed.provided.hardRulesFired
      ? parsed.hardRulesFired
      : decodeHardRulesFired(existing.hard_rules_fired);

    const financialsJson = parsed.provided.financials
      ? encodeFinancials(parsed.financials)
      : existing.financials_json;

    sqlite.prepare(`
      UPDATE valuation_assessments SET
        evaluator_id = ?,
        map_a_x = ?,
        map_a_y = ?,
        valuation_category = ?,
        doctrine_flags = ?,
        recommended_band = ?,
        final_band = ?,
        override_reason = ?,
        hard_rules_fired = ?,
        tape_id = ?,
        tape_as_of = ?,
        band_ranges = ?,
        conviction = ?,
        narrative = ?,
        scored_at = ?,
        financials_json = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      parsed.provided.evaluatorId ? parsed.evaluatorId : existing.evaluator_id,
      parsed.provided.mapAX ? parsed.mapAX : existing.map_a_x,
      parsed.provided.mapAY ? parsed.mapAY : existing.map_a_y,
      parsed.provided.valuationCategory ? parsed.valuationCategory : existing.valuation_category,
      parsed.provided.doctrineFlags ? JSON.stringify(parsed.doctrineFlags) : existing.doctrine_flags,
      recommendedBand,
      finalBand,
      overrideReason,
      encodeHardRulesFired(hardRules),
      tape.tapeId,
      tape.tapeAsOf,
      tape.bandRanges,
      parsed.provided.conviction ? parsed.conviction : existing.conviction,
      parsed.provided.narrative ? parsed.narrative : existing.narrative,
      parsed.provided.scoredAt && parsed.scoredAt ? parsed.scoredAt : existing.scored_at,
      financialsJson,
      id,
    );

    return get(id)!;
  }

  function remove(id: number): void {
    const existing = getRaw(id);
    if (!existing) throw new ValuationAssessmentError("Assessment not found", 404);
    sqlite.prepare("DELETE FROM valuation_assessments WHERE id = ?").run(id);
  }

  return { list, get, getLatest, create, update, remove };
}

export type ValuationAssessmentService = ReturnType<typeof createValuationAssessmentService>;
