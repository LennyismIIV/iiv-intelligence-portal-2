import type Database from "better-sqlite3";
import {
  ScorecardEvidenceError,
  type EvidenceRecord,
  type ScorecardQcResult,
} from "@shared/scorecardEvidence";
import {
  EVIDENCE_FORMAT,
  SCORECARD_BRAND,
  SCORECARD_EDITION,
  SCORECARD_FORMAT,
  assembleScorecardDocument,
  emptyQc,
  type AssessmentExportSnapshot,
  type FirmExportSnapshot,
  type ScorecardDocument,
  type ScorecardExportInput,
  type TapeExportSnapshot,
} from "@shared/scorecardExport";
import { parseJsonStringArray } from "@shared/scorecardFields";
import type { ValuationAssessment } from "./valuationAssessmentService";
import type { ValuationTape } from "./valuationTapeService";
import type { ScorecardEvidenceService } from "./scorecardEvidenceService";
import { renderScorecardDocx } from "./scorecardDocx";
import { renderLockedSendPdf } from "./scorecardPdf";

export type ScorecardExportFormat = "json" | "docx" | "pdf";

export interface ScorecardExportJson {
  format: typeof SCORECARD_FORMAT;
  evidenceFormat: typeof EVIDENCE_FORMAT;
  edition: typeof SCORECARD_EDITION;
  brand: typeof SCORECARD_BRAND;
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
}

export interface ScorecardExportDeps {
  getFirm(companyId: number): FirmExportSnapshot | null;
  getLatestAssessment(companyId: number): AssessmentExportSnapshot | null;
  getCurrentApprovedTape(): TapeExportSnapshot | null;
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
} {
  const raw = String(query?.format ?? "json").toLowerCase();
  const format: ScorecardExportFormat =
    raw === "docx" || raw === "pdf" || raw === "json" ? raw : "json";
  const draftRaw = query?.draft;
  const draft = draftRaw === true || draftRaw === 1 || draftRaw === "1" || draftRaw === "true";
  return { format, draft };
}

function filenameFor(firmName: string, format: "docx" | "pdf", date: string): string {
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
    };
  }

  function toJson(input: ScorecardExportInput, document: ScorecardDocument): ScorecardExportJson {
    return {
      format: SCORECARD_FORMAT,
      evidenceFormat: EVIDENCE_FORMAT,
      edition: SCORECARD_EDITION,
      brand: SCORECARD_BRAND,
      draft: input.draft,
      watermark: document.watermark,
      qc: input.qc,
      evidence: input.evidence,
      exportedAt: input.exportedAt,
      document,
      gaps: document.gaps,
    };
  }

  function assemble(companyId: number, draft: boolean): { input: ScorecardExportInput; document: ScorecardDocument; json: ScorecardExportJson } {
    const input = loadInput(companyId, draft);
    const document = assembleScorecardDocument(input);
    return { input, document, json: toJson(input, document) };
  }

  async function exportJson(companyId: number, draft = false): Promise<ScorecardExportJson> {
    return assemble(companyId, draft).json;
  }

  async function exportDocx(companyId: number, draft = false): Promise<ScorecardBinaryExport> {
    const { document, json } = assemble(companyId, draft);
    const buffer = await renderScorecardDocx(document);
    return {
      format: "docx",
      filename: filenameFor(document.firmName, "docx", document.scorecardDate),
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer,
      json,
    };
  }

  async function exportPdf(companyId: number, draft = false): Promise<ScorecardBinaryExport> {
    const { document, json } = assemble(companyId, draft);
    const docx = await renderScorecardDocx(document);
    const { buffer, source } = await renderLockedSendPdf(document, docx);
    return {
      format: "pdf",
      filename: filenameFor(document.firmName, "pdf", document.scorecardDate),
      contentType: "application/pdf",
      buffer,
      json: { ...json, pdfSource: source },
      pdfSource: source,
    };
  }

  async function exportScorecard(
    companyId: number,
    opts: { format?: ScorecardExportFormat; draft?: boolean } = {},
  ): Promise<ScorecardExportJson | ScorecardBinaryExport> {
    const format = opts.format ?? "json";
    const draft = !!opts.draft;
    if (format === "docx") return exportDocx(companyId, draft);
    if (format === "pdf") return exportPdf(companyId, draft);
    return exportJson(companyId, draft);
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
    evidence: services.evidence,
  });
}
