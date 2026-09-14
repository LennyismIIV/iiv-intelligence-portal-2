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
} from "../shared/scorecardEvidence.ts";
import { VALUATION_TAPE_CREATE_SQL } from "../shared/valuationTape.ts";
import { VALUATION_ASSESSMENT_CREATE_SQL } from "../shared/valuationAssessment.ts";
import {
  DRAFT_WATERMARK,
  GAP_PREFIX,
  IIV_PRODUCT_TITLE,
  IIV_SCORECARD_BRAND,
  IIV_SCORECARD_EDITION,
  IIV_SCORECARD_FORMAT,
  IIV_SECTION_IDS,
  INSTRUMENT_A_NAME,
  FORBIDDEN_IIV_EDITION_TERMS,
  assembleIivVerdictDocument,
  assembleScorecardDocument,
  assembleSharedScorecardGraph,
  emptyQc,
  flattenDocumentText,
  forbiddenIivEditionHits,
  sectionOrderOf,
  type ScorecardExportInput,
} from "../shared/scorecardExport.ts";
import {
  IIV_VERDICTS,
  IivVerdictError,
  assertIivVerdictWritable,
  collectIivBlockers,
  parseIivVerdict,
} from "../shared/scorecardVerdict.ts";
import { createValuationTapeService } from "./valuationTapeService.ts";
import { createValuationAssessmentService } from "./valuationAssessmentService.ts";
import { createScorecardEvidenceService } from "./scorecardEvidenceService.ts";
import { createSqliteScorecardExportService } from "./scorecardExportService.ts";
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
    brand_tags TEXT,
    iiv_verdict TEXT DEFAULT 'PENDING'
  );
`;

const DECISION_SQL = `
  CREATE TABLE IF NOT EXISTS findings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    finding_text TEXT NOT NULL,
    source_doc TEXT,
    date_raised TEXT DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'unverified-owner-assigned',
    severity TEXT NOT NULL DEFAULT 'medium',
    owner TEXT,
    deadline TEXT,
    resolution_note TEXT,
    raised_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS gates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    gate_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    trigger_event TEXT,
    last_evaluated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    evaluator TEXT,
    re_evaluation_triggers TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS dimension_floors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    lens_type TEXT NOT NULL,
    dimension TEXT NOT NULL,
    capped_at REAL NOT NULL,
    reason TEXT NOT NULL,
    evidence_ref TEXT,
    created_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`;

function mem() {
  const db = new Database(":memory:");
  db.exec(COMPANIES_SQL);
  db.exec(DECISION_SQL);
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
    iivVerdict: "PENDING",
    decision: { findings: [], gates: [], dimensionFloors: [] },
    ...overrides,
  };
}

function xmlText(xml: string): string {
  return xml.replace(/<[^>]+>/g, "");
}

function unzipDocx(buf: Buffer): { document: string; header: string; footer: string } {
  const dir = mkdtempSync(join(tmpdir(), "iiv-docx-"));
  const path = join(dir, "scorecard.docx");
  writeFileSync(path, buf);
  const document = execFileSync("unzip", ["-p", path, "word/document.xml"], { encoding: "utf8" });
  let header = "";
  let footer = "";
  try { header = execFileSync("unzip", ["-p", path, "word/header1.xml"], { encoding: "utf8" }); } catch { /* optional */ }
  try { footer = execFileSync("unzip", ["-p", path, "word/footer1.xml"], { encoding: "utf8" }); } catch { /* optional */ }
  return { document, header, footer };
}

function filledGraphInput(): ScorecardExportInput {
  return emptyInput({
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
    draft: false,
    iivVerdict: "WATCH",
  });
}

test("IIV verdict enum is enforced", () => {
  assert.deepEqual([...IIV_VERDICTS], ["INVEST", "WATCH", "PASS", "PENDING"]);
  assert.equal(parseIivVerdict("WATCH"), "WATCH");
  assert.equal(parseIivVerdict(null), "PENDING");
  assert.throws(() => parseIivVerdict("invest"), IivVerdictError);
  assert.throws(() => parseIivVerdict("HOLD"), /INVEST \| WATCH \| PASS \| PENDING/);
});

test("open critical Finding blocks INVEST; other verdicts remain writable", () => {
  const decision = {
    findings: [{
      id: 12,
      findingText: "Customer concentration unverified",
      severity: "critical",
      status: "unverified-owner-assigned",
    }],
    gates: [],
    dimensionFloors: [],
  };
  const collected = collectIivBlockers(decision);
  assert.equal(collected.findingsPresent, true);
  assert.equal(collected.investHardBlocked, true);
  assert.ok(collected.blockers.some((b) => b.kind === "critical_finding"));
  assert.throws(
    () => assertIivVerdictWritable("INVEST", decision),
    (err: unknown) => err instanceof IivVerdictError && err.statusCode === 409,
  );
  assert.doesNotThrow(() => assertIivVerdictWritable("WATCH", decision));
  assert.doesNotThrow(() => assertIivVerdictWritable("PASS", decision));
  assert.doesNotThrow(() => assertIivVerdictWritable("PENDING", decision));
});

test("absent Findings/Gates/Floors produce gap flags — never invented blockers", () => {
  const collected = collectIivBlockers({ findings: [], gates: [], dimensionFloors: [] });
  assert.equal(collected.ledgerPresent, false);
  assert.equal(collected.blockers.length, 0);
  assert.ok(collected.gaps.some((g) => g.code === "findings_absent"));
  assert.ok(collected.gaps.some((g) => g.code === "gates_absent"));
  assert.ok(collected.gaps.some((g) => g.code === "floors_absent"));
  assert.equal(collected.investHardBlocked, false);
  assert.doesNotThrow(() => assertIivVerdictWritable("INVEST", { findings: [], gates: [], dimensionFloors: [] }));
});

test("failed Gates and DimensionFloors surface as blockers when present", () => {
  const collected = collectIivBlockers({
    findings: [],
    gates: [{ gateId: "G1", status: "failed" }],
    dimensionFloors: [{ lensType: "thesis", dimension: "fit", cappedAt: 2, reason: "No buyer access" }],
  });
  assert.equal(collected.ledgerPresent, true);
  assert.ok(collected.blockers.some((b) => b.kind === "failed_gate" && b.severity === "block"));
  assert.ok(collected.blockers.some((b) => b.kind === "dimension_floor" && b.severity === "warn"));
  assert.equal(collected.investHardBlocked, true);
});

test("IIV edition shares Map A / tape / evidence graph with Gen2 — no second scorer", () => {
  const input = filledGraphInput();
  const gen2 = assembleScorecardDocument(input);
  const iiv = assembleIivVerdictDocument(input);
  const sharedGen2 = assembleSharedScorecardGraph(input, "Gen2");
  const sharedIiv = assembleSharedScorecardGraph(input, "IIV");

  assert.deepEqual(sharedIiv.mapA, sharedGen2.mapA);
  assert.deepEqual(sharedIiv.strategicPosture, sharedGen2.strategicPosture);
  assert.deepEqual(sharedIiv.valuation, sharedGen2.valuation);
  assert.deepEqual(sharedIiv.controlPoint, sharedGen2.controlPoint);
  assert.deepEqual(sharedIiv.aiOnControlPoint, sharedGen2.aiOnControlPoint);
  assert.deepEqual(sharedIiv.appendix, sharedGen2.appendix);
  assert.equal(iiv.mapA.mapAX.value, gen2.mapA.mapAX.value);
  assert.equal(iiv.valuation.band.value, gen2.valuation.band.value);
  assert.match(iiv.valuation.tapeRanges.value, /21–29x/);
  assert.equal(iiv.header.brand.value, "IIV");
  assert.equal(gen2.header.brand.value, "Gen2");
});

test("IIV document is verdict edition: INVEST|WATCH|PASS|PENDING + blockers; not Gen2 CEO / Greenbook", () => {
  const doc = assembleIivVerdictDocument(emptyInput({
    iivVerdict: "PENDING",
    decision: { findings: [], gates: [], dimensionFloors: [] },
  }));
  assert.equal(doc.brand, IIV_SCORECARD_BRAND);
  assert.equal(doc.edition, IIV_SCORECARD_EDITION);
  assert.equal(doc.format, IIV_SCORECARD_FORMAT);
  assert.deepEqual(sectionOrderOf(doc), [...IIV_SECTION_IDS]);
  assert.ok(doc.verdict);
  assert.equal(doc.verdict.verdict.value, "PENDING");
  assert.ok(doc.verdict.blockers.every((b) => b.gap));
  assert.ok(doc.verdict.blockers.some((b) => b.value.includes("No Findings recorded")));
  const text = flattenDocumentText(doc);
  assert.ok(text.includes("IIV verdict"));
  assert.ok(!text.includes("Implication Trifecta"));
  assert.ok(!text.includes("90-day agenda"));
  assert.ok(!text.includes("CEO Reclassification"));
  assert.equal(forbiddenIivEditionHits(text).length, 0);
  for (const term of FORBIDDEN_IIV_EDITION_TERMS) {
    assert.equal(text.includes(term), false, `must not include ${term}`);
  }
});

test("IIV export lists open critical Finding as a BLOCK against INVEST", () => {
  const doc = assembleIivVerdictDocument(emptyInput({
    iivVerdict: "WATCH",
    decision: {
      findings: [{
        id: 3,
        findingText: "IP assignment missing",
        severity: "critical",
        status: "unverified-owner-assigned",
      }],
      gates: [],
      dimensionFloors: [],
    },
  }));
  assert.equal(doc.verdict?.investHardBlocked, true);
  assert.match(doc.verdict?.investWritable.value ?? "", /No/);
  const block = doc.verdict?.blockers.find((b) => b.label.includes("critical"));
  assert.ok(block);
  assert.equal(block?.present, true);
  assert.match(block?.value ?? "", /IP assignment missing/);
  assert.equal(doc.verdict?.blockers.some((b) => /invented/i.test(b.value)), false);
});

test("IIV DOCX/PDF use IIV chrome, Instrument A, verdict section, draft watermark", async () => {
  const doc = assembleIivVerdictDocument(emptyInput({ draft: true }));
  const buf = await renderScorecardDocx(doc);
  const { document, header, footer } = unzipDocx(buf);
  const body = xmlText(document);
  const chrome = xmlText(header) + xmlText(footer);
  assert.ok(body.includes(IIV_PRODUCT_TITLE) || chrome.includes("Verdict Scorecard"));
  assert.ok(chrome.includes("IIV"));
  assert.ok(chrome.includes("Instrument A"));
  assert.ok(!chrome.includes("CEO Reclassification"));
  assert.ok(!body.includes("Greenbook"));
  assert.ok(!body.includes("Implication Trifecta"));
  assert.ok(body.includes("IIV verdict"));
  assert.ok(body.includes(DRAFT_WATERMARK));
  assert.ok(body.includes(GAP_PREFIX));

  const pdf = await renderScorecardPdf(doc);
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  assert.equal(pdfContainsSectionOrder(pdf, [...IIV_SECTION_IDS]), true);
  const text = extractPdfText(pdf);
  assert.ok(text.includes(pdfSafe(INSTRUMENT_A_NAME)));
  assert.ok(text.includes("IIV"));
  assert.ok(!text.includes("CEO Reclassification"));
  assert.ok(!text.includes("Greenbook"));
  assert.ok(!text.includes("LOCKED SEND"));
});

test("IIV client export is fail-closed until QC; draft is watermarked", async () => {
  const { exporter, evidence, firmId } = mem();

  await assert.rejects(
    () => exporter.exportJson(firmId, false, "iiv"),
    (err: unknown) => err instanceof ScorecardEvidenceError && err.statusCode === 409,
  );

  const draft = await exporter.exportJson(firmId, true, "iiv");
  assert.equal(draft.format, IIV_SCORECARD_FORMAT);
  assert.equal(draft.brand, "IIV");
  assert.equal(draft.edition, "IIV");
  assert.equal(draft.watermark, DRAFT_WATERMARK);
  assert.ok(draft.document.verdict?.blockers.some((b) => b.gap));
  assert.equal(draft.document.valuation.tapeRanges.gap, true);

  const draftDocx = await exporter.exportDocx(firmId, true, "iiv");
  assert.match(draftDocx.filename, /iiv-verdict-scorecard-acme_insights/);
  assert.ok(xmlText(unzipDocx(draftDocx.buffer).document).includes(DRAFT_WATERMARK));

  evidence.upsertMany(firmId, completeSix({
    control_point_ownership: { claim_value: "proprietary_data" },
    ai_on_control_point: { claim_value: "pass" },
  }));

  const client = await exporter.exportJson(firmId, false, "iiv");
  assert.equal(client.qc.passed, true);
  assert.equal(client.draft, false);
  assert.equal(client.document.verdict?.verdict.value, "PENDING");
  assert.deepEqual(client.document.sections.map((s) => s.id), [...IIV_SECTION_IDS]);
});

test("API: IIV edition 409 until QC; INVEST blocked by critical Finding; draft DOCX works", async () => {
  const { exporter, evidence, db, firmId } = mem();
  const express = (await import("express")).default;
  const { parseExportQuery } = await import("./scorecardExportService.ts");

  const app = express();
  app.use(express.json());
  app.put("/api/companies/:id/iiv-verdict", (req, res) => {
    try {
      const verdict = parseIivVerdict(req.body?.verdict);
      const findings = db.prepare(
        "SELECT id, finding_text AS findingText, severity, status FROM findings WHERE company_id = ?",
      ).all(parseInt(req.params.id)) as Array<{
        id: number; findingText: string; severity: string; status: string;
      }>;
      const gates = db.prepare(
        "SELECT gate_id AS gateId, status FROM gates WHERE company_id = ?",
      ).all(parseInt(req.params.id)) as Array<{ gateId: string; status: string }>;
      const dimensionFloors = db.prepare(
        "SELECT lens_type AS lensType, dimension, capped_at AS cappedAt, reason FROM dimension_floors WHERE company_id = ?",
      ).all(parseInt(req.params.id)) as Array<{
        lensType: string; dimension: string; cappedAt: number; reason: string;
      }>;
      assertIivVerdictWritable(verdict, { findings, gates, dimensionFloors });
      db.prepare("UPDATE companies SET iiv_verdict = ? WHERE id = ?").run(verdict, parseInt(req.params.id));
      res.json({ iivVerdict: verdict });
    } catch (err) {
      if (err instanceof IivVerdictError) {
        return res.status(err.statusCode).json({ message: err.message, ...err.extras });
      }
      res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
    }
  });
  app.get("/api/companies/:id/export/scorecard", async (req, res) => {
    try {
      const { format, draft, edition } = parseExportQuery(req.query as Record<string, unknown>);
      const result = await exporter.exportScorecard(parseInt(req.params.id), { format, draft, edition });
      if ("buffer" in result) {
        res.setHeader("Content-Type", result.contentType);
        res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
        res.setHeader("X-Scorecard-Edition", edition === "iiv" ? "iiv_verdict" : "gen2_ceo");
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
    const badEnum = await fetch(`${base}/api/companies/${firmId}/iiv-verdict`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verdict: "MAYBE" }),
    });
    assert.equal(badEnum.status, 400);

    db.prepare(
      "INSERT INTO findings (company_id, finding_text, severity, status) VALUES (?, ?, ?, ?)",
    ).run(firmId, "Key-man risk untested", "critical", "unverified-owner-assigned");

    const blockedInvest = await fetch(`${base}/api/companies/${firmId}/iiv-verdict`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verdict: "INVEST" }),
    });
    assert.equal(blockedInvest.status, 409);

    const watch = await fetch(`${base}/api/companies/${firmId}/iiv-verdict`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verdict: "WATCH" }),
    });
    assert.equal(watch.status, 200);
    assert.equal((await watch.json()).iivVerdict, "WATCH");

    const blocked = await fetch(`${base}/api/companies/${firmId}/export/scorecard?format=docx&edition=iiv`);
    assert.equal(blocked.status, 409);

    const draft = await fetch(`${base}/api/companies/${firmId}/export/scorecard?format=docx&edition=iiv&draft=1`);
    assert.equal(draft.status, 200);
    assert.equal(draft.headers.get("X-Scorecard-Edition"), "iiv_verdict");
    const draftXml = unzipDocx(Buffer.from(await draft.arrayBuffer()));
    const draftText = xmlText(draftXml.document);
    assert.ok(draftText.includes(DRAFT_WATERMARK));
    assert.ok(draftText.includes("WATCH") || draftText.includes("IIV verdict"));
    assert.ok(draftText.includes("Key-man risk untested"));
    assert.ok(!(draftXml.header + draftXml.footer).includes("CEO Reclassification"));

    evidence.upsertMany(firmId, completeSix());
    const json = await fetch(`${base}/api/companies/${firmId}/export/scorecard?edition=iiv`);
    assert.equal(json.status, 200);
    const payload = await json.json();
    assert.equal(payload.format, IIV_SCORECARD_FORMAT);
    assert.equal(payload.brand, "IIV");
    assert.deepEqual(payload.document.sections.map((s: { id: string }) => s.id), [...IIV_SECTION_IDS]);
    assert.equal(payload.document.verdict.verdict.value, "WATCH");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
