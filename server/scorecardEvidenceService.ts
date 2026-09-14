import type Database from "better-sqlite3";
import {
  MATERIAL_CLAIM_KEYS,
  ScorecardEvidenceError,
  evaluateScorecardQc,
  isAssessmentClaim,
  parseEvidenceWrite,
  qcBlockedError,
  withEvidenceLabels,
  type EvidenceRecord,
  type MaterialClaimKey,
  type ParsedEvidenceWrite,
  type ScorecardQcResult,
} from "@shared/scorecardEvidence";

interface EvidenceRow {
  id: number;
  company_id: number;
  assessment_id: number | null;
  claim_key: string;
  grade: string;
  confidence: string;
  claim_value: string | null;
  notes: string | null;
  source_url: string | null;
  greenbook_visible: number;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

function rowToEvidence(row: EvidenceRow): EvidenceRecord {
  return withEvidenceLabels({
    id: row.id,
    companyId: row.company_id,
    assessmentId: row.assessment_id,
    claimKey: row.claim_key as MaterialClaimKey,
    grade: row.grade as EvidenceRecord["grade"],
    confidence: row.confidence as EvidenceRecord["confidence"],
    claimValue: row.claim_value,
    notes: row.notes,
    sourceUrl: row.source_url,
    greenbookVisible: !!row.greenbook_visible,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createScorecardEvidenceService(sqlite: Database.Database) {
  const firmExists = sqlite.prepare("SELECT id FROM companies WHERE id = ?");
  const assessmentExists = sqlite.prepare(
    "SELECT id, firm_id FROM valuation_assessments WHERE id = ?",
  );
  const latestAssessment = sqlite.prepare(`
    SELECT id FROM valuation_assessments
    WHERE firm_id = ?
    ORDER BY scored_at DESC, id DESC
    LIMIT 1
  `);
  const selectById = sqlite.prepare("SELECT * FROM scorecard_evidence WHERE id = ?");
  const selectByFirm = sqlite.prepare(`
    SELECT * FROM scorecard_evidence
    WHERE company_id = ?
    ORDER BY claim_key ASC
  `);
  const selectByFirmClaim = sqlite.prepare(`
    SELECT * FROM scorecard_evidence
    WHERE company_id = ? AND claim_key = ?
  `);

  const insertRow = sqlite.prepare(`
    INSERT INTO scorecard_evidence (
      company_id, assessment_id, claim_key, grade, confidence,
      claim_value, notes, source_url, greenbook_visible, created_by,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateRow = sqlite.prepare(`
    UPDATE scorecard_evidence SET
      assessment_id = ?,
      grade = ?,
      confidence = ?,
      claim_value = ?,
      notes = ?,
      source_url = ?,
      greenbook_visible = ?,
      created_by = COALESCE(?, created_by),
      updated_at = ?
    WHERE id = ?
  `);

  function requireFirm(companyId: number): void {
    if (!Number.isInteger(companyId) || companyId <= 0) {
      throw new ScorecardEvidenceError("Invalid company id", 400);
    }
    const row = firmExists.get(companyId);
    if (!row) throw new ScorecardEvidenceError("Company not found", 404);
  }

  function resolveAssessmentId(
    companyId: number,
    claimKey: MaterialClaimKey,
    requested: number | null,
  ): number | null {
    if (requested != null) {
      const row = assessmentExists.get(requested) as { id: number; firm_id: number } | undefined;
      if (!row) throw new ScorecardEvidenceError("Assessment not found", 404);
      if (row.firm_id !== companyId) {
        throw new ScorecardEvidenceError("assessment_id does not belong to this company", 400);
      }
      return requested;
    }
    if (isAssessmentClaim(claimKey)) {
      const latest = latestAssessment.get(companyId) as { id: number } | undefined;
      return latest?.id ?? null;
    }
    return null;
  }

  function getRaw(id: number): EvidenceRow | undefined {
    return selectById.get(id) as EvidenceRow | undefined;
  }

  function list(companyId: number): EvidenceRecord[] {
    requireFirm(companyId);
    return (selectByFirm.all(companyId) as EvidenceRow[]).map(rowToEvidence);
  }

  function get(id: number): EvidenceRecord | undefined {
    const row = getRaw(id);
    return row ? rowToEvidence(row) : undefined;
  }

  function upsert(companyId: number, body: Record<string, unknown>): EvidenceRecord {
    requireFirm(companyId);
    const parsed = parseEvidenceWrite(body);
    return persist(companyId, parsed);
  }

  function persist(companyId: number, parsed: ParsedEvidenceWrite): EvidenceRecord {
    const assessmentId = resolveAssessmentId(companyId, parsed.claimKey, parsed.assessmentId);
    const existing = selectByFirmClaim.get(companyId, parsed.claimKey) as EvidenceRow | undefined;
    const ts = nowIso();

    if (existing) {
      updateRow.run(
        assessmentId,
        parsed.grade,
        parsed.confidence,
        parsed.claimValue,
        parsed.notes,
        parsed.sourceUrl,
        parsed.greenbookVisible ? 1 : 0,
        parsed.createdBy,
        ts,
        existing.id,
      );
      return rowToEvidence(getRaw(existing.id)!);
    }

    const result = insertRow.run(
      companyId,
      assessmentId,
      parsed.claimKey,
      parsed.grade,
      parsed.confidence,
      parsed.claimValue,
      parsed.notes,
      parsed.sourceUrl,
      parsed.greenbookVisible ? 1 : 0,
      parsed.createdBy,
      ts,
      ts,
    );
    return rowToEvidence(getRaw(Number(result.lastInsertRowid))!);
  }

  function upsertMany(companyId: number, items: unknown): EvidenceRecord[] {
    requireFirm(companyId);
    if (!Array.isArray(items)) {
      throw new ScorecardEvidenceError("items must be an array of evidence records", 400);
    }
    const parsed = items.map((item, i) => {
      if (item == null || typeof item !== "object" || Array.isArray(item)) {
        throw new ScorecardEvidenceError(`items[${i}] must be an object`, 400);
      }
      return parseEvidenceWrite(item as Record<string, unknown>);
    });
    const tx = sqlite.transaction((rows: ParsedEvidenceWrite[]) =>
      rows.map((row) => persist(companyId, row)),
    );
    return tx(parsed);
  }

  function qc(companyId: number): ScorecardQcResult {
    requireFirm(companyId);
    const rows = list(companyId);
    const byClaim: Partial<Record<MaterialClaimKey, EvidenceRecord>> = {};
    for (const row of rows) byClaim[row.claimKey] = row;
    return evaluateScorecardQc(byClaim);
  }

  function assertExportAllowed(companyId: number, pathway: "export" | "ship"): ScorecardQcResult {
    const result = qc(companyId);
    if (!result.passed) throw qcBlockedError(result, pathway);
    return result;
  }

  function remove(id: number): void {
    const row = getRaw(id);
    if (!row) throw new ScorecardEvidenceError("Evidence not found", 404);
    sqlite.prepare("DELETE FROM scorecard_evidence WHERE id = ?").run(id);
  }

  function removeForCompany(companyId: number): void {
    sqlite.prepare("DELETE FROM scorecard_evidence WHERE company_id = ?").run(companyId);
  }

  function detachAssessment(assessmentId: number): void {
    sqlite.prepare("UPDATE scorecard_evidence SET assessment_id = NULL WHERE assessment_id = ?").run(assessmentId);
  }

  /**
   * Scorecard export payload. Never auto-copies Gen2 vault paths onto
   * greenbook_visible evidence — only persisted, validated source_url values.
   */
  function exportScorecard(companyId: number): {
    qc: ScorecardQcResult;
    evidence: EvidenceRecord[];
    exportedAt: string;
    format: "iiv-scorecard-evidence-v1";
  } {
    const result = assertExportAllowed(companyId, "export");
    return {
      qc: result,
      evidence: list(companyId),
      exportedAt: nowIso(),
      format: "iiv-scorecard-evidence-v1",
    };
  }

  function ship(companyId: number): {
    shipped: true;
    shippedAt: string;
    qc: ScorecardQcResult;
  } {
    const result = assertExportAllowed(companyId, "ship");
    return {
      shipped: true,
      shippedAt: nowIso(),
      qc: result,
    };
  }

  return {
    list,
    get,
    upsert,
    upsertMany,
    qc,
    assertExportAllowed,
    exportScorecard,
    ship,
    remove,
    removeForCompany,
    detachAssessment,
    materialClaimKeys: MATERIAL_CLAIM_KEYS,
  };
}

export type ScorecardEvidenceService = ReturnType<typeof createScorecardEvidenceService>;
