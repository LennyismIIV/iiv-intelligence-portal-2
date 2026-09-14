import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import {
  MATERIAL_CLAIM_KEYS,
  SCORECARD_EVIDENCE_CREATE_SQL,
  ScorecardEvidenceError,
  evaluateScorecardQc,
} from "../shared/scorecardEvidence.ts";
import { VALUATION_TAPE_CREATE_SQL } from "../shared/valuationTape.ts";
import { VALUATION_ASSESSMENT_CREATE_SQL } from "../shared/valuationAssessment.ts";
import {
  AI_CONTROL_POINT_DOCTRINE,
  DRAFT_WATERMARK,
  FORBIDDEN_CEO_EDITION_TERMS,
  GAP_PREFIX,
  INSTRUMENT_A_NAME,
  SCORECARD_BRAND,
  SCORECARD_EDITION,
  SCORECARD_FORMAT,
  SECTION_IDS,
  SECTION_TITLES,
  assembleScorecardDocument,
  emptyQc,
  flattenDocumentText,
  forbiddenCeoEditionHits,
  sectionOrderOf,
  type ScorecardExportInput,
} from "../shared/scorecardExport.ts";
import { createValuationTapeService } from "./valuationTapeService.ts";
import { createValuationAssessmentService } from "./valuationAssessmentService.ts";
import { createScorecardEvidenceService } from "./scorecardEvidenceService.ts";
import {
  createSqliteScorecardExportService,
  parseExportQuery,
} from "./scorecardExportService.ts";
import { renderScorecardDocx } from "./scorecardDocx.ts";
import { extractPdfText, pdfContainsSectionOrder, pdfSafe, renderScorecardPdf } from "./scorecardPdf.ts";

const COMPANIES_SQL = `
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    map_a_x REAL,
    map_a_y REAL,
    strategic_posture TEXT,
    valuation_category TEXT,
    vc_control_layers TEXT,
    gen2_relationship TEXT,
    brand_tags TEXT
  );
`;

function liveAsOf(offset = 0): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 15))
    .toISOString()
    .slice(0, 10);
}

function mem() {
  const db = new Database(":memory:");
  db.exec(COMPANIES_SQL);
  db.exec(VALUATION_TAPE_CREATE_SQL);
  db.exec(VALUATION_ASSESSMENT_CREATE_SQL);
  db.exec(SCORECARD_EVIDENCE_CREATE_SQL);
  const firm = db.prepare("INSERT INTO companies (name) VALUES (?)").run("Acme Insights");
  const tapes = createValuationTapeService(db);
  const assessments = createValuationAssessmentService(db, tapes);
  const evidence = createScorecardEvidenceService(db);
  const exporter = createSqliteScorecardExportService(db, {
    evidence,
    getLatestAssessment: (id) => assessments.getLatest(id),
    getCurrentApprovedTape: () => tapes.getCurrentApprovedTape(),
  });
  return { db, tapes, assessments, evidence, exporter, firmId: Number(firm.lastInsertRowid) };
}

function completeSix(overrides: Record<string, Record<string, unknown>> = {}) {
  return MATERIAL_CLAIM_KEYS.map((claim_key) => ({
    claim_key,
    grade: "CompanyClaim",
    confidence: "moderate",
    ...(overrides[claim_key] ?? {}),
  }));
}

function emptyInput(overrides: Partial<ScorecardExportInput> = {}): ScorecardExportInput {
  return {
    firm: {
      id: 1,
      name: "Empty Co",
      mapAX: null,
      mapAY: null,
      strategicPosture: null,
      valuationCategory: null,
      vcControlLayers: null,
    },
    assessment: null,
    tape: null,
    evidence: [],
    qc: emptyQc(),
    exportedAt: "2026-09-14T12:00:00.000Z",
    draft: true,
    ...overrides,
  };
}

function xmlText(xml: string): string {
  return xml.replace(/<[^>]+>/g, "");
}

function unzipDocx(buf: Buffer): { document: string; header: string; footer: string; files: string } {
  const dir = mkdtempSync(join(tmpdir(), "scorecard-docx-"));
  const path = join(dir, "scorecard.docx");
  writeFileSync(path, buf);
  const files = execFileSync("unzip", ["-l", path], { encoding: "utf8" });
  const document = execFileSync("unzip", ["-p", path, "word/document.xml"], { encoding: "utf8" });
  let header = "";
  let footer = "";
  try { header = execFileSync("unzip", ["-p", path, "word/header1.xml"], { encoding: "utf8" }); } catch { /* optional */ }
  try { footer = execFileSync("unzip", ["-p", path, "word/footer1.xml"], { encoding: "utf8" }); } catch { /* optional */ }
  return { document, header, footer, files };
}

function assertSectionOrder(text: string) {
  let last = -1;
  for (const id of SECTION_IDS) {
    const idx = text.indexOf(SECTION_TITLES[id]);
    assert.ok(idx >= 0, `missing section ${id}: ${SECTION_TITLES[id]}`);
    assert.ok(idx > last, `section ${id} out of order`);
    last = idx;
  }
}

// --- Unit: assembly

test("empty SoR uses labeled placeholders and gap flags — no invented multiples", () => {
  const doc = assembleScorecardDocument(emptyInput());
  assert.equal(doc.brand, SCORECARD_BRAND);
  assert.equal(doc.edition, SCORECARD_EDITION);
  assert.equal(doc.instrumentA, INSTRUMENT_A_NAME);
  assert.deepEqual(sectionOrderOf(doc), [...SECTION_IDS]);
  assert.equal(doc.valuation.tapeRanges.gap, true);
  assert.equal(doc.valuation.band.gap, true);
  assert.ok(doc.valuation.tapeRanges.value.startsWith(GAP_PREFIX));
  assert.equal(/\d+[–-]\d+x/.test(doc.valuation.tapeRanges.value), false);
  assert.equal(/\d+\.\d+x/.test(flattenDocumentText(doc)), false);
  assert.ok(doc.gaps.some((g) => g.key === "tape_ranges"));
  assert.ok(doc.trifecta.agenda.length === 6);
  assert.ok(doc.trifecta.agenda.every((item) => item.gap));
  assert.equal(doc.trifecta.supplier.gap, true);
  assert.equal(forbiddenCeoEditionHits(flattenDocumentText(doc)).length, 0);
  for (const term of FORBIDDEN_CEO_EDITION_TERMS) {
    assert.equal(flattenDocumentText(doc).includes(term), false, `must not include ${term}`);
  }
});

test("partial SoR fills known fields and gaps the rest", () => {
  const doc = assembleScorecardDocument(emptyInput({
    firm: {
      id: 1,
      name: "Partial Co",
      mapAX: 7.2,
      mapAY: 3.1,
      strategicPosture: "orchestrator",
      valuationCategory: "AI-First",
      vcControlLayers: ["VC1", "VC3"],
    },
    draft: true,
  }));
  assert.equal(doc.header.firmName.value, "Partial Co");
  assert.equal(doc.mapA.mapAX.present, true);
  assert.equal(doc.mapA.quadrant.present, true);
  assert.match(doc.mapA.quadrant.value, /High uniqueness/);
  assert.match(doc.mapA.quadrant.value, /lower-right/);
  assert.equal(doc.strategicPosture.lead.value, "Orchestrator");
  assert.equal(doc.controlPoint.vcControlLayers.value, "VC1, VC3");
  assert.equal(doc.valuation.band.gap, true);
  assert.equal(doc.valuation.tapeRanges.gap, true);
  assert.equal(doc.header.evaluator.gap, true);
});

test("assessment tape snapshot supplies bands — never evergreen defaults", () => {
  const doc = assembleScorecardDocument(emptyInput({
    firm: {
      id: 1,
      name: "Acme Insights",
      mapAX: 8,
      mapAY: 8,
      strategicPosture: "trust_builder",
      valuationCategory: "AI-First",
      vcControlLayers: ["VC2"],
    },
    assessment: {
      id: 9,
      evaluatorId: "Leonard",
      scoredAt: "2026-09-10T15:00:00.000Z",
      tapeAsOf: "2026-09-01",
      valuationCategory: "AI-First",
      recommendedBand: "ai_first_defensible",
      finalBand: "ai_first_defensible",
      hardRulesFired: ["ai_wrapper_penalty"],
      conviction: 0.72,
      narrative: "Reclassification holds on proprietary data.",
      recommendedBandRanges: { bandId: "ai_first_defensible", maRev: { low: 21, high: 29 }, sourceUrls: [] },
      finalBandRanges: { bandId: "ai_first_defensible", maRev: { low: 21, high: 29 }, sourceUrls: [] },
      bandRanges: [{ bandId: "ai_first_defensible", maRev: { low: 21, high: 29 }, sourceUrls: [] }],
    },
    evidence: [
      {
        id: 1, companyId: 1, assessmentId: 9, claimKey: "map_a_x",
        grade: "VerifiedFact", confidence: "high", claimValue: "8",
        notes: null, sourceUrl: null, greenbookVisible: false,
        createdBy: null, createdAt: null, updatedAt: null, labeled: false,
      },
      {
        id: 2, companyId: 1, assessmentId: 9, claimKey: "map_a_y",
        grade: "CompanyClaim", confidence: "moderate", claimValue: "8",
        notes: null, sourceUrl: null, greenbookVisible: false,
        createdBy: null, createdAt: null, updatedAt: null, labeled: false,
      },
      {
        id: 3, companyId: 1, assessmentId: 9, claimKey: "strategic_posture",
        grade: "Inference", confidence: "moderate", claimValue: "trust_builder",
        notes: "Owns the trust layer in buyer workflows.",
        sourceUrl: null, greenbookVisible: false,
        createdBy: null, createdAt: null, updatedAt: null, labeled: false,
      },
      {
        id: 4, companyId: 1, assessmentId: 9, claimKey: "valuation_band",
        grade: "Inference", confidence: "high", claimValue: "ai_first_defensible",
        notes: null, sourceUrl: null, greenbookVisible: false,
        createdBy: null, createdAt: null, updatedAt: null, labeled: false,
      },
      {
        id: 5, companyId: 1, assessmentId: 9, claimKey: "control_point_ownership",
        grade: "CompanyClaim", confidence: "moderate", claimValue: "proprietary_data",
        notes: null, sourceUrl: null, greenbookVisible: false,
        createdBy: null, createdAt: null, updatedAt: null, labeled: false,
      },
      {
        id: 6, companyId: 1, assessmentId: 9, claimKey: "ai_on_control_point",
        grade: "Inference", confidence: "low", claimValue: "inconclusive",
        notes: "AI sits beside the control point, not on it.",
        sourceUrl: null, greenbookVisible: false,
        createdBy: null, createdAt: null, updatedAt: null, labeled: false,
      },
    ],
    qc: evaluateScorecardQc({
      map_a_x: { grade: "VerifiedFact", confidence: "high" },
      map_a_y: { grade: "CompanyClaim", confidence: "moderate" },
      strategic_posture: { grade: "Inference", confidence: "moderate" },
      valuation_band: { grade: "Inference", confidence: "high" },
      control_point_ownership: { grade: "CompanyClaim", confidence: "moderate" },
      ai_on_control_point: { grade: "Inference", confidence: "low" },
    }),
    draft: false,
  }));

  assert.equal(doc.header.evaluator.value, "Leonard");
  assert.equal(doc.header.scoredAt.value, "2026-09-10T15:00:00.000Z");
  assert.equal(doc.header.tapeAsOf.value, "2026-09-01");
  assert.equal(doc.header.brand.value, "Gen2");
  assert.match(doc.header.confidenceRollup.value, /Low/);
  assert.equal(doc.valuation.band.value, "ai_first_defensible");
  assert.match(doc.valuation.tapeRanges.value, /21–29x/);
  assert.match(doc.valuation.hardRulesFired.value, /AI wrapper penalty/);
  assert.equal(doc.aiOnControlPoint.result.value, "Ambiguous");
  assert.equal(doc.aiOnControlPoint.doctrine.value, AI_CONTROL_POINT_DOCTRINE);
  assert.equal(doc.controlPoint.primary.value, "Proprietary data rights");
  assert.equal(doc.watermark, null);
});

test("inconclusive AI result maps to Ambiguous; draft watermark is explicit", () => {
  const doc = assembleScorecardDocument(emptyInput({ draft: true }));
  assert.equal(doc.watermark, DRAFT_WATERMARK);
  assert.equal(doc.draft, true);
});

test("parseExportQuery accepts format + draft + edition", () => {
  assert.deepEqual(parseExportQuery({}), { format: "json", draft: false, edition: "ceo" });
  assert.deepEqual(parseExportQuery({ format: "DOCX", draft: "1" }), { format: "docx", draft: true, edition: "ceo" });
  assert.deepEqual(parseExportQuery({ format: "pdf", draft: "true" }), { format: "pdf", draft: true, edition: "ceo" });
  assert.deepEqual(parseExportQuery({ format: "docx", edition: "iiv" }), { format: "docx", draft: false, edition: "iiv" });
});

// --- Renderers

test("DOCX header/footer name Instrument A; PRD section order; Gen2 not Greenbook", async () => {
  const doc = assembleScorecardDocument(emptyInput({
    firm: {
      id: 1,
      name: "Acme Insights",
      mapAX: null,
      mapAY: null,
      strategicPosture: null,
      valuationCategory: null,
      vcControlLayers: null,
    },
  }));
  const buf = await renderScorecardDocx(doc);
  assert.ok(buf.length > 1000);
  const { document, header, footer } = unzipDocx(buf);
  const body = xmlText(document);
  const chrome = xmlText(header) + xmlText(footer);
  assertSectionOrder(body);
  assert.ok(chrome.includes("Instrument A"), "header/footer must name Instrument A");
  assert.ok(chrome.includes("Competitive Map"));
  assert.ok(chrome.includes("Gen2"));
  assert.ok(!chrome.includes("Greenbook"));
  assert.ok(!body.includes("Greenbook"));
  assert.ok(!body.includes("Map B"));
  assert.ok(body.includes(GAP_PREFIX));
  assert.ok(body.includes(DRAFT_WATERMARK));
  assert.ok(body.includes(AI_CONTROL_POINT_DOCTRINE));
});

test("print PDF from the same model preserves section order and Instrument A chrome", async () => {
  const doc = assembleScorecardDocument(emptyInput());
  const buf = await renderScorecardPdf(doc);
  assert.equal(buf.subarray(0, 4).toString(), "%PDF");
  assert.equal(pdfContainsSectionOrder(buf, [...SECTION_IDS]), true);
  const text = extractPdfText(buf);
  assert.ok(text.includes(pdfSafe(INSTRUMENT_A_NAME)));
  assert.ok(text.includes("Gen2"));
  assert.ok(text.includes("LOCKED SEND"));
  assert.ok(!text.includes("Greenbook"));
  assert.ok(!text.includes("Map B"));
});

// --- Service: fail-closed vs draft

test("client export is fail-closed (409) until QC passes; draft is watermarked", async () => {
  const { exporter, evidence, firmId } = mem();

  await assert.rejects(
    () => exporter.exportJson(firmId, false),
    (err: unknown) =>
      err instanceof ScorecardEvidenceError
      && err.statusCode === 409
      && /Export blocked/.test(err.message),
  );
  await assert.rejects(
    () => exporter.exportDocx(firmId, false),
    (err: unknown) => err instanceof ScorecardEvidenceError && err.statusCode === 409,
  );

  const draft = await exporter.exportJson(firmId, true);
  assert.equal(draft.format, SCORECARD_FORMAT);
  assert.equal(draft.brand, "Gen2");
  assert.equal(draft.draft, true);
  assert.equal(draft.watermark, DRAFT_WATERMARK);
  assert.ok(draft.gaps.length > 0);
  assert.equal(draft.document.valuation.tapeRanges.gap, true);

  const draftDocx = await exporter.exportDocx(firmId, true);
  assert.equal(draftDocx.format, "docx");
  assert.match(draftDocx.filename, /gen2-ceo-scorecard-acme_insights/);
  const { document } = unzipDocx(draftDocx.buffer);
  assert.ok(xmlText(document).includes(DRAFT_WATERMARK));

  evidence.upsertMany(firmId, completeSix({
    control_point_ownership: { claim_value: "proprietary_data" },
    ai_on_control_point: { claim_value: "pass" },
  }));

  const client = await exporter.exportJson(firmId, false);
  assert.equal(client.qc.passed, true);
  assert.equal(client.draft, false);
  assert.equal(client.watermark, null);
  assert.equal(client.evidence.length, 6);

  const clientDocx = await exporter.exportDocx(firmId, false);
  const unpacked = unzipDocx(clientDocx.buffer);
  assertSectionOrder(xmlText(unpacked.document));
  assert.ok((unpacked.header + unpacked.footer).includes("Instrument A"));

  const pdf = await exporter.exportPdf(firmId, false);
  assert.equal(pdf.format, "pdf");
  assert.equal(pdf.buffer.subarray(0, 4).toString(), "%PDF");
  assert.ok(pdf.pdfSource === "docx-print" || pdf.pdfSource === "docx-libreoffice");
  if (pdf.pdfSource === "docx-print") {
    assert.equal(pdfContainsSectionOrder(pdf.buffer, [...SECTION_IDS]), true);
  }
});

test("filled SoR export includes tape ranges from the assessment snapshot only", async () => {
  const { exporter, tapes, assessments, evidence, db, firmId } = mem();
  db.prepare(`
    UPDATE companies SET
      map_a_x = ?, map_a_y = ?, strategic_posture = ?, valuation_category = ?, vc_control_layers = ?
    WHERE id = ?
  `).run(6, 7, "decision_partner", "HITL", JSON.stringify(["VC4"]), firmId);

  const draft = tapes.createDraft({
    as_of: liveAsOf(0),
    drafted_by: "Signal Desk",
    bands: [{ band_id: "hitl_strategic", ma_rev: { low: 4, high: 8 } }],
  });
  const tape = tapes.approve(draft.tapeId, { approver_id: "Leonard" });
  assessments.create(firmId, {
    evaluator_id: "judge-test",
    recommended_band: "hitl_strategic",
    final_band: "hitl_strategic",
    hard_rules_fired: "none",
    tape_id: tape.tapeId,
    conviction: 0.6,
    narrative: "HITL routing holds.",
    valuation_category: "HITL",
  });
  evidence.upsertMany(firmId, completeSix({
    strategic_posture: { notes: "Decision partner in the workflow." },
    control_point_ownership: { claim_value: "benchmarked_quality" },
    ai_on_control_point: { claim_value: "fail", notes: "AI does not sit on the control point." },
  }));

  const json = await exporter.exportJson(firmId, false);
  assert.equal(json.document.strategicPosture.lead.value, "Decision Partner");
  assert.equal(json.document.valuation.band.value, "hitl_strategic");
  assert.match(json.document.valuation.tapeRanges.value, /4–8x/);
  assert.equal(json.document.valuation.hardRulesFired.value, "None");
  assert.equal(json.document.header.evaluator.value, "judge-test");
  assert.equal(json.document.aiOnControlPoint.result.value, "Fail");
  assert.equal(json.document.controlPoint.primary.value, "Independently benchmarked quality");
  assert.doesNotMatch(json.document.valuation.tapeRanges.value, /21–29/);
});

test("API: client formats 409 until QC; draft DOCX and locked PDF work", async () => {
  const { exporter, evidence, firmId } = mem();
  const express = (await import("express")).default;
  const { parseExportQuery: parseQ } = await import("./scorecardExportService.ts");

  const app = express();
  app.use(express.json());
  app.get("/api/companies/:id/export/scorecard", async (req, res) => {
    try {
      const { format, draft } = parseQ(req.query as Record<string, unknown>);
      const result = await exporter.exportScorecard(parseInt(req.params.id), { format, draft });
      if ("buffer" in result) {
        res.setHeader("Content-Type", result.contentType);
        res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
        if (result.pdfSource) res.setHeader("X-Scorecard-Pdf-Source", result.pdfSource);
        return res.send(result.buffer);
      }
      res.json(result);
    } catch (err) {
      if (err instanceof ScorecardEvidenceError) {
        return res.status(err.statusCode).json({ message: err.message, ...err.extras });
      }
      res.status(500).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });

  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;

  try {
    const blocked = await fetch(`${base}/api/companies/${firmId}/export/scorecard?format=docx`);
    assert.equal(blocked.status, 409);

    const blockedPdf = await fetch(`${base}/api/companies/${firmId}/export/scorecard?format=pdf`);
    assert.equal(blockedPdf.status, 409);

    const draft = await fetch(`${base}/api/companies/${firmId}/export/scorecard?format=docx&draft=1`);
    assert.equal(draft.status, 200);
    assert.match(draft.headers.get("content-type") || "", /officedocument.wordprocessingml/);
    const draftBuf = Buffer.from(await draft.arrayBuffer());
    const draftXml = unzipDocx(draftBuf);
    assert.ok(xmlText(draftXml.document).includes(DRAFT_WATERMARK));
    assert.ok((draftXml.header + draftXml.footer).includes("Instrument A"));

    evidence.upsertMany(firmId, completeSix());

    const json = await fetch(`${base}/api/companies/${firmId}/export/scorecard`);
    assert.equal(json.status, 200);
    const payload = await json.json();
    assert.equal(payload.format, SCORECARD_FORMAT);
    assert.equal(payload.brand, "Gen2");
    assert.deepEqual(payload.document.sections.map((s: { id: string }) => s.id), [...SECTION_IDS]);

    const docx = await fetch(`${base}/api/companies/${firmId}/export/scorecard?format=docx`);
    assert.equal(docx.status, 200);
    const docxBuf = Buffer.from(await docx.arrayBuffer());
    assertSectionOrder(xmlText(unzipDocx(docxBuf).document));

    const pdf = await fetch(`${base}/api/companies/${firmId}/export/scorecard?format=pdf`);
    assert.equal(pdf.status, 200);
    assert.match(pdf.headers.get("content-type") || "", /pdf/);
    const pdfBuf = Buffer.from(await pdf.arrayBuffer());
    assert.equal(pdfBuf.subarray(0, 4).toString(), "%PDF");
    const source = pdf.headers.get("X-Scorecard-Pdf-Source");
    if (source === "docx-print") {
      assert.equal(pdfContainsSectionOrder(pdfBuf, [...SECTION_IDS]), true);
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
