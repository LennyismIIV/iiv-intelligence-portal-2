import type Database from "better-sqlite3";
import {
  ScorecardEvidenceError,
  type EvidenceRecord,
  type ScorecardQcResult,
} from "@shared/scorecardEvidence";
import {
  EVIDENCE_FORMAT,
  IIV_SCORECARD_BRAND,
  IIV_SCORECARD_EDITION,
  IIV_SCORECARD_FORMAT,
  SCORECARD_BRAND,
  SCORECARD_EDITION,
  SCORECARD_FORMAT,
  assembleIivVerdictDocument,
  assembleScorecardDocument,
  emptyQc,
  type AssessmentExportSnapshot,
  type FirmExportSnapshot,
  type ScorecardDocument,
  type ScorecardExportInput,
  type TapeExportSnapshot,
} from "@shared/scorecardExport";
import {
  DEFAULT_IIV_VERDICT,
  normalizeStoredVerdict,
  type IivDecisionInput,
  type IivVerdict,
} from "@shared/scorecardVerdict";
import { parseJsonStringArray } from "@shared/scorecardFields";
import type { ValuationAssessment } from "./valuationAssessmentService";
import type { ValuationTape } from "./valuationTapeService";
import type { ScorecardEvidenceService } from "./scorecardEvidenceService";
import { renderScorecardDocx } from "./scorecardDocx";
import { renderLockedSendPdf } from "./scorecardPdf";

export type ScorecardExportFormat = "json" | "docx" | "pdf";
export type ScorecardExportEdition = "ceo" | "iiv";

export interface ScorecardExportJson {
  format: typeof SCORECARD_FORMAT | typeof IIV_SCORECARD_FORMAT;
  evidenceFormat: typeof EVIDENCE_FORMAT;
  edition: typeof SCORECARD_EDITION | typeof IIV_SCORECARD_EDITION;
  brand: typeof SCORECARD_BRAND | typeof IIV_SCORECARD_BRAND;
  draft: boolean;
  watermark: string | null;
  qc: ScorecardQcResult;
  evidence: EvidenceRecord[];
  exportedAt: string;
  document: ScorecardDocument;
  gaps: ScorecardDocument["gaps"];
  pdfSource?: "docx-libreoffice" | "docx-print";
}

export interface ScorecardBinaryExport {
  format: "docx" | "pdf";
  filename: string;
  contentType: string;
  buffer: Buffer;
  json: ScorecardExportJson;
  pdfSource?: "docx-libreoffice" | "docx-print";
}

interface FirmRow {
  id: number;
  name: string;
  map_a_x: number | null;
  map_a_y: number | null;
  strategic_posture: string | null;
  valuation_category: string | null;
  vc_control_layers: string | null;
  iiv_verdict?: string | null;
}

export interface ScorecardExportDeps {
  getFirm(companyId: number): FirmExportSnapshot | null;
  getLatestAssessment(companyId: number): AssessmentExportSnapshot | null;
  getCurrentApprovedTape(): TapeExportSnapshot | null;
  getIivVerdict?(companyId: number): IivVerdict;
  getDecisionSnapshot?(companyId: number): IivDecisionInput;
  evidence: Pick<ScorecardEvidenceService, "list" | "qc" | "assertExportAllowed">;
}

function slugName(name: string): string {
  return (name || "company").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase() || "company";
}

export function firmFromRow(row: {
  id: number;
  name: string;
  mapAX?: number | null;
  mapAY?: number | null;
  map_a_x?: number | null;
  map_a_y?: number | null;
  strategicPosture?: string | null;
  strategic_posture?: string | null;
  valuationCategory?: string | null;
  valuation_category?: string | null;
  vcControlLayers?: unknown;
  vc_control_layers?: unknown;
}): FirmExportSnapshot {
  return {
    id: row.id,
    name: row.name,
    mapAX: row.mapAX ?? row.map_a_x ?? null,
    mapAY: row.mapAY ?? row.map_a_y ?? null,
    strategicPosture: row.strategicPosture ?? row.strategic_posture ?? null,
    valuationCategory: row.valuationCategory ?? row.valuation_category ?? null,
    vcControlLayers: parseJsonStringArray(row.vcControlLayers ?? row.vc_control_layers),
  };
}

export function assessmentSnapshot(row: ValuationAssessment): AssessmentExportSnapshot {
  return {
    id: row.id,
    evaluatorId: row.evaluatorId,
    scoredAt: row.scoredAt,
    tapeAsOf: row.tapeAsOf,
    valuationCategory: row.valuationCategory,
    recommendedBand: row.recommendedBand,
    finalBand: row.finalBand,
    hardRulesFired: row.hardRulesFired,
    conviction: row.conviction,
    narrative: row.narrative,
    recommendedBandRanges: row.recommendedBandRanges,
    finalBandRanges: row.finalBandRanges,
    bandRanges: row.bandRanges,
  };
}

export function tapeSnapshot(row: ValuationTape): TapeExportSnapshot {
  return {
    tapeId: row.tapeId,
    asOf: row.asOf,
    status: row.status,
    bands: row.bands,
  };
}

export function parseExportQuery(query: Record<string, unknown> | undefined): {
  format: ScorecardExportFormat;
  draft: boolean;
  edition: ScorecardExportEdition;
} {
  const raw = String(query?.format ?? "json").toLowerCase();
  const format: ScorecardExportFormat =
    raw === "docx" || raw === "pdf" || raw === "json" ? raw : "json";
  const draftRaw = query?.draft;
  const draft = draftRaw === true || draftRaw === 1 || draftRaw === "1" || draftRaw === "true";
  const editionRaw = String(query?.edition ?? "ceo").toLowerCase();
  const edition: ScorecardExportEdition = editionRaw === "iiv" ? "iiv" : "ceo";
  return { format, draft, edition };
}

function filenameFor(
  firmName: string,
  format: "docx" | "pdf",
  date: string,
  edition: ScorecardExportEdition,
): string {
  if (edition === "iiv") {
    return `iiv-verdict-scorecard-${slugName(firmName)}-${date}.${format}`;
  }
  const kind = format === "pdf" ? "locked-send" : "ceo";
  return `gen2-${kind}-scorecard-${slugName(firmName)}-${date}.${format}`;
}

export function createScorecardExportService(deps: ScorecardExportDeps) {
  function loadInput(companyId: number, draft: boolean): ScorecardExportInput {
    if (!Number.isInteger(companyId) || companyId <= 0) {
      throw new ScorecardEvidenceError("Invalid company id", 400);
    }
    const firm = deps.getFirm(companyId);
    if (!firm) throw new ScorecardEvidenceError("Company not found", 404);

    if (!draft) {
      deps.evidence.assertExportAllowed(companyId, "export");
    }

    let qc: ScorecardQcResult;
    let evidence: EvidenceRecord[];
    try {
      qc = deps.evidence.qc(companyId);
      evidence = deps.evidence.list(companyId);
    } catch (err) {
      if (err instanceof ScorecardEvidenceError && err.statusCode === 404) {
        qc = emptyQc();
        evidence = [];
      } else {
        throw err;
      }
    }

    return {
      firm,
      assessment: deps.getLatestAssessment(companyId),
      tape: deps.getCurrentApprovedTape(),
      evidence,
      qc,
      exportedAt: new Date().toISOString(),
      draft,
      iivVerdict: deps.getIivVerdict?.(companyId) ?? DEFAULT_IIV_VERDICT,
      decision: deps.getDecisionSnapshot?.(companyId) ?? { findings: [], gates: [], dimensionFloors: [] },
    };
  }

  function toJson(input: ScorecardExportInput, document: ScorecardDocument): ScorecardExportJson {
    return {
      format: document.format,
      evidenceFormat: EVIDENCE_FORMAT,
      edition: document.edition,
      brand: document.brand,
      draft: input.draft,
      watermark: document.watermark,
      qc: input.qc,
      evidence: input.evidence,
      exportedAt: input.exportedAt,
      document,
      gaps: document.gaps,
    };
  }

  function assemble(
    companyId: number,
    draft: boolean,
    edition: ScorecardExportEdition = "ceo",
  ): { input: ScorecardExportInput; document: ScorecardDocument; json: ScorecardExportJson } {
    const input = loadInput(companyId, draft);
    const document = edition === "iiv"
      ? assembleIivVerdictDocument(input)
      : assembleScorecardDocument(input);
    return { input, document, json: toJson(input, document) };
  }

  async function exportJson(
    companyId: number,
    draft = false,
    edition: ScorecardExportEdition = "ceo",
  ): Promise<ScorecardExportJson> {
    return assemble(companyId, draft, edition).json;
  }

  async function exportDocx(
    companyId: number,
    draft = false,
    edition: ScorecardExportEdition = "ceo",
  ): Promise<ScorecardBinaryExport> {
    const { document, json } = assemble(companyId, draft, edition);
    const buffer = await renderScorecardDocx(document);
    return {
      format: "docx",
      filename: filenameFor(document.firmName, "docx", document.scorecardDate, edition),
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer,
      json,
    };
  }

  async function exportPdf(
    companyId: number,
    draft = false,
    edition: ScorecardExportEdition = "ceo",
  ): Promise<ScorecardBinaryExport> {
    const { document, json } = assemble(companyId, draft, edition);
    const docx = await renderScorecardDocx(document);
    const { buffer, source } = await renderLockedSendPdf(document, docx);
    return {
      format: "pdf",
      filename: filenameFor(document.firmName, "pdf", document.scorecardDate, edition),
      contentType: "application/pdf",
      buffer,
      json: { ...json, pdfSource: source },
      pdfSource: source,
    };
  }

  async function exportScorecard(
    companyId: number,
    opts: { format?: ScorecardExportFormat; draft?: boolean; edition?: ScorecardExportEdition } = {},
  ): Promise<ScorecardExportJson | ScorecardBinaryExport> {
    const format = opts.format ?? "json";
    const draft = !!opts.draft;
    const edition = opts.edition ?? "ceo";
    if (format === "docx") return exportDocx(companyId, draft, edition);
    if (format === "pdf") return exportPdf(companyId, draft, edition);
    return exportJson(companyId, draft, edition);
  }

  return {
    assemble,
    exportJson,
    exportDocx,
    exportPdf,
    exportScorecard,
  };
}

export function createSqliteScorecardExportService(
  sqlite: Database.Database,
  services: {
    evidence: ScorecardExportDeps["evidence"];
    getLatestAssessment: (firmId: number) => ValuationAssessment | null;
    getCurrentApprovedTape: () => { tape: ValuationTape | null };
  },
) {
  const selectFirm = sqlite.prepare(`
    SELECT id, name, map_a_x, map_a_y, strategic_posture, valuation_category, vc_control_layers
    FROM companies WHERE id = ?
  `);
  const hasIivVerdict = (sqlite.prepare("PRAGMA table_info(companies)").all() as Array<{ name: string }>)
    .some((c) => c.name === "iiv_verdict");
  const selectVerdict = hasIivVerdict
    ? sqlite.prepare("SELECT iiv_verdict FROM companies WHERE id = ?")
    : null;

  const findingsTable = sqlite.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'findings'
  `).get() as { name: string } | undefined;
  const gatesTable = sqlite.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'gates'
  `).get() as { name: string } | undefined;
  const floorsTable = sqlite.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'dimension_floors'
  `).get() as { name: string } | undefined;

  const selectFindings = findingsTable
    ? sqlite.prepare("SELECT id, finding_text, severity, status FROM findings WHERE company_id = ?")
    : null;
  const selectGates = gatesTable
    ? sqlite.prepare("SELECT gate_id, status FROM gates WHERE company_id = ?")
    : null;
  const selectFloors = floorsTable
    ? sqlite.prepare("SELECT id, lens_type, dimension, capped_at, reason FROM dimension_floors WHERE company_id = ?")
    : null;

  return createScorecardExportService({
    getFirm(companyId) {
      const row = selectFirm.get(companyId) as FirmRow | undefined;
      return row ? firmFromRow(row) : null;
    },
    getLatestAssessment(companyId) {
      const row = services.getLatestAssessment(companyId);
      return row ? assessmentSnapshot(row) : null;
    },
    getCurrentApprovedTape() {
      const current = services.getCurrentApprovedTape();
      return current.tape ? tapeSnapshot(current.tape) : null;
    },
    getIivVerdict(companyId) {
      if (!selectVerdict) return DEFAULT_IIV_VERDICT;
      const row = selectVerdict.get(companyId) as { iiv_verdict: string | null } | undefined;
      return normalizeStoredVerdict(row?.iiv_verdict);
    },
    getDecisionSnapshot(companyId) {
      const findings = selectFindings
        ? (selectFindings.all(companyId) as Array<{
          id: number;
          finding_text: string;
          severity: string;
          status: string;
        }>).map((f) => ({
          id: f.id,
          findingText: f.finding_text,
          severity: f.severity,
          status: f.status,
        }))
        : [];
      const gates = selectGates
        ? (selectGates.all(companyId) as Array<{ gate_id: string; status: string }>).map((g) => ({
          gateId: g.gate_id,
          status: g.status,
        }))
        : [];
      const dimensionFloors = selectFloors
        ? (selectFloors.all(companyId) as Array<{
          id: number;
          lens_type: string;
          dimension: string;
          capped_at: number;
          reason: string;
        }>).map((f) => ({
          id: f.id,
          lensType: f.lens_type,
          dimension: f.dimension,
          cappedAt: f.capped_at,
          reason: f.reason,
        }))
        : [];
      return { findings, gates, dimensionFloors };
    },
    evidence: services.evidence,
  });
}
