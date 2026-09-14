import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  EVIDENCE_GRADES,
  EVIDENCE_CONFIDENCE,
  MATERIAL_CLAIM_KEYS,
  SCORECARD_EVIDENCE_CREATE_SQL,
  SCORECARD_SHIP_CREATE_SQL,
  ScorecardEvidenceError,
  evaluatePrd9Blockers,
  evaluateScorecardQc,
  isGen2VaultPath,
  parseEvidenceWrite,
  parseGrade,
  parseConfidence,
  parseClaimKey,
  parseLeonardHours,
  parseShippedBy,
  assertNoGen2VaultOnGreenbookVisible,
} from "../shared/scorecardEvidence.ts";
import { VALUATION_TAPE_CREATE_SQL } from "../shared/valuationTape.ts";
import { VALUATION_ASSESSMENT_CREATE_SQL } from "../shared/valuationAssessment.ts";
import { createValuationTapeService } from "./valuationTapeService.ts";
import { createValuationAssessmentService } from "./valuationAssessmentService.ts";
import { createScorecardEvidenceService } from "./scorecardEvidenceService.ts";

const COMPANIES_SQL = `
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    map_a_x REAL,
    map_a_y REAL,
    strategic_posture TEXT,
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
  db.exec(SCORECARD_SHIP_CREATE_SQL);
  const firm = db.prepare("INSERT INTO companies (name, gen2_relationship) VALUES (?, ?)").run(
    "Acme Insights",
    "/Vault/Gen2/acme/scorecard.docx",
  );
  const tapes = createValuationTapeService(db);
  const assessments = createValuationAssessmentService(db, tapes);
  const evidence = createScorecardEvidenceService(db);
  return { db, tapes, assessments, evidence, firmId: Number(firm.lastInsertRowid) };
}

function completeSix(overrides: Record<string, Record<string, unknown>> = {}) {
  return MATERIAL_CLAIM_KEYS.map((claim_key) => ({
    claim_key,
    grade: "CompanyClaim",
    confidence: "moderate",
    ...(overrides[claim_key] ?? {}),
  }));
}

// --- Unit: enums + parse

test("grade and confidence enums are accepted; invalid values rejected", () => {
  for (const g of EVIDENCE_GRADES) assert.equal(parseGrade(g), g);
  for (const c of EVIDENCE_CONFIDENCE) assert.equal(parseConfidence(c), c);
  assert.throws(() => parseGrade("green"), /Invalid grade/);
  assert.throws(() => parseConfidence("medium"), /Invalid confidence/);
  assert.throws(() => parseGrade(""), /grade is required/);
  assert.throws(() => parseConfidence(undefined), /confidence is required/);
});

test("claim_key aliases map onto the six material claims", () => {
  assert.equal(parseClaimKey("mapAX"), "map_a_x");
  assert.equal(parseClaimKey("strategicPosture"), "strategic_posture");
  assert.equal(parseClaimKey("recommended_band"), "valuation_band");
  assert.equal(parseClaimKey("controlPointOwnership"), "control_point_ownership");
  assert.equal(parseClaimKey("aiOnControlPoint"), "ai_on_control_point");
  assert.throws(() => parseClaimKey("map_b_x"), /Invalid claim_key/);
});

test("UndisclosedSpeculative is allowed and labeled", () => {
  const parsed = parseEvidenceWrite({
    claim_key: "map_a_x",
    grade: "UndisclosedSpeculative",
    confidence: "low",
  });
  assert.equal(parsed.grade, "UndisclosedSpeculative");
  const qc = evaluateScorecardQc({
    map_a_x: parsed,
    map_a_y: { grade: "VerifiedFact", confidence: "high" },
    strategic_posture: { grade: "Inference", confidence: "moderate" },
    valuation_band: { grade: "CompanyClaim", confidence: "high" },
    control_point_ownership: { grade: "CompanyClaim", confidence: "moderate" },
    ai_on_control_point: { grade: "Inference", confidence: "low" },
  });
  assert.equal(qc.passed, true);
  assert.equal(qc.claims.find((c) => c.claimKey === "map_a_x")?.labeled, true);
});

test("QC fails closed when any minimum-set claim lacks grade or confidence", () => {
  const empty = evaluateScorecardQc({});
  assert.equal(empty.passed, false);
  assert.equal(empty.status, "failed");
  assert.equal(empty.failClosed, true);
  assert.deepEqual(empty.missingClaimKeys, [...MATERIAL_CLAIM_KEYS]);

  const partial = evaluateScorecardQc({
    map_a_x: { grade: "VerifiedFact", confidence: "high" },
    map_a_y: { grade: "CompanyClaim", confidence: "moderate" },
  });
  assert.equal(partial.passed, false);
  assert.ok(partial.missingClaimKeys.includes("strategic_posture"));
  assert.ok(partial.missingClaimKeys.includes("valuation_band"));
  assert.ok(partial.missingClaimKeys.includes("control_point_ownership"));
  assert.ok(partial.missingClaimKeys.includes("ai_on_control_point"));
});

test("Gen2 vault paths are rejected on greenbook_visible Evidence and never auto-copied", () => {
  assert.equal(isGen2VaultPath("/Vault/Gen2/acme/memo.pdf"), true);
  assert.equal(isGen2VaultPath("gen2://vault/clients/acme"), true);
  assert.equal(isGen2VaultPath("https://example.com/public-filing.pdf"), false);

  assert.throws(
    () => assertNoGen2VaultOnGreenbookVisible("/Vault/Gen2/acme/memo.pdf", true),
    /greenbook_visible/,
  );
  assert.doesNotThrow(() =>
    assertNoGen2VaultOnGreenbookVisible("/Vault/Gen2/acme/memo.pdf", false),
  );

  assert.throws(
    () => parseEvidenceWrite({
      claim_key: "map_a_x",
      grade: "VerifiedFact",
      confidence: "high",
      greenbook_visible: true,
      source_url: "gen2://vault/acme/scorecard",
    }),
    /Gen2 vault paths/,
  );
});

test("upsert persists grade + confidence; valuation_band attaches to latest assessment", () => {
  const { tapes, assessments, evidence, firmId } = mem();
  const draft = tapes.createDraft({
    as_of: liveAsOf(0),
    drafted_by: "Signal Desk",
    bands: [{ band_id: "ai_first_defensible", ma_rev: { low: 21, high: 29 } }],
  });
  const tape = tapes.approve(draft.tapeId, { approver_id: "Leonard" });
  const assessment = assessments.create(firmId, {
    evaluator_id: "judge-test",
    recommended_band: "ai_first_defensible",
    final_band: "ai_first_defensible",
    hard_rules_fired: "none",
    tape_id: tape.tapeId,
  });

  const saved = evidence.upsert(firmId, {
    claimKey: "valuation_band",
    grade: "Inference",
    confidence: "high",
    notes: "Recommended from current tape snapshot.",
  });
  assert.equal(saved.claimKey, "valuation_band");
  assert.equal(saved.grade, "Inference");
  assert.equal(saved.confidence, "high");
  assert.equal(saved.assessmentId, assessment.id);
  assert.equal(saved.labeled, false);
});

test("service QC / export / ship fail closed until all six claims are graded", () => {
  const { evidence, firmId, db } = mem();
  const qc0 = evidence.qc(firmId);
  assert.equal(qc0.passed, false);
  assert.equal(qc0.missingClaimKeys.length, 6);

  assert.throws(
    () => evidence.exportScorecard(firmId),
    (err: unknown) =>
      err instanceof ScorecardEvidenceError
      && err.statusCode === 409
      && /Export blocked/.test(err.message),
  );
  assert.throws(
    () => evidence.ship(firmId),
    (err: unknown) =>
      err instanceof ScorecardEvidenceError
      && err.statusCode === 409
      && /Ship blocked/.test(err.message),
  );

  evidence.upsertMany(firmId, completeSix({
    map_a_x: { grade: "VerifiedFact", confidence: "high", source_url: "https://example.com/map" },
    control_point_ownership: {
      grade: "CompanyClaim",
      confidence: "moderate",
      claim_value: "proprietary_data",
    },
    ai_on_control_point: {
      grade: "UndisclosedSpeculative",
      confidence: "low",
      claim_value: "inconclusive",
    },
  }));

  const qc1 = evidence.qc(firmId);
  assert.equal(qc1.passed, true);
  assert.equal(qc1.claims.find((c) => c.claimKey === "ai_on_control_point")?.labeled, true);

  const exported = evidence.exportScorecard(firmId);
  assert.equal(exported.format, "iiv-scorecard-evidence-v1");
  assert.equal(exported.evidence.length, 6);
  assert.equal(exported.qc.passed, true);

  const shipped = evidence.ship(firmId, { leonard_hours: 1.5, shipped_by: "Leonard" });
  assert.equal(shipped.shipped, true);
  assert.equal(shipped.leonardHours, 1.5);
  assert.equal(shipped.reviewerHours, 1.5);
  assert.equal(shipped.shippedBy, "Leonard");
  assert.ok(shipped.shippedAt);
  const persisted = db.prepare("SELECT * FROM scorecard_ships WHERE company_id = ?").get(firmId) as {
    leonard_hours: number;
    shipped_by: string;
    shipped_at: string;
  };
  assert.equal(persisted.leonard_hours, 1.5);
  assert.equal(persisted.shipped_by, "Leonard");
  assert.equal(persisted.shipped_at, shipped.shippedAt);

  // Evidence must not auto-copy the firm's Gen2 vault path onto a greenbook row.
  const gen2Path = db.prepare("SELECT gen2_relationship FROM companies WHERE id = ?").get(firmId) as {
    gen2_relationship: string;
  };
  assert.ok(isGen2VaultPath(gen2Path.gen2_relationship));
  const listed = evidence.list(firmId);
  for (const row of listed) {
    assert.notEqual(row.sourceUrl, gen2Path.gen2_relationship);
    assert.equal(isGen2VaultPath(row.sourceUrl), false);
  }

  assert.throws(
    () => evidence.upsert(firmId, {
      claim_key: "map_a_y",
      grade: "VerifiedFact",
      confidence: "high",
      greenbook_visible: true,
      source_url: gen2Path.gen2_relationship,
    }),
    /greenbook_visible/,
  );
});

test("API QC / export / ship fail closed; complete set exports", async () => {
  const { evidence, firmId } = mem();
  const express = (await import("express")).default;

  const app = express();
  app.use(express.json());

  function sendErr(err: unknown, res: import("express").Response) {
    if (err instanceof ScorecardEvidenceError) {
      res.status(err.statusCode).json({ message: err.message, ...err.extras });
      return;
    }
    res.status(400).json({ message: err instanceof Error ? err.message : String(err) });
  }

  app.get("/api/companies/:id/evidence", (req, res) => {
    try { res.json(evidence.list(parseInt(req.params.id))); }
    catch (err) { sendErr(err, res); }
  });
  app.put("/api/companies/:id/evidence", (req, res) => {
    try { res.json(evidence.upsert(parseInt(req.params.id), req.body || {})); }
    catch (err) { sendErr(err, res); }
  });
  app.put("/api/companies/:id/evidence/batch", (req, res) => {
    try { res.json(evidence.upsertMany(parseInt(req.params.id), req.body?.items)); }
    catch (err) { sendErr(err, res); }
  });
  app.get("/api/companies/:id/scorecard-qc", (req, res) => {
    try { res.json(evidence.qc(parseInt(req.params.id))); }
    catch (err) { sendErr(err, res); }
  });
  app.get("/api/companies/:id/export/scorecard", (req, res) => {
    try { res.json(evidence.exportScorecard(parseInt(req.params.id))); }
    catch (err) { sendErr(err, res); }
  });
  app.get("/api/companies/:id/export/decile", (req, res) => {
    try {
      const qc = evidence.assertExportAllowed(parseInt(req.params.id), "export");
      res.json({ format: "iiv-decile-v1", qc });
    } catch (err) { sendErr(err, res); }
  });
  app.post("/api/companies/:id/ship", (req, res) => {
    try { res.json(evidence.ship(parseInt(req.params.id), req.body || {})); }
    catch (err) { sendErr(err, res); }
  });

  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;

  const qcRed = await (await fetch(`${base}/api/companies/${firmId}/scorecard-qc`)).json();
  assert.equal(qcRed.status, "failed");
  assert.equal(qcRed.passed, false);

  const blockedExport = await fetch(`${base}/api/companies/${firmId}/export/scorecard`);
  assert.equal(blockedExport.status, 409);
  const blockedDecile = await fetch(`${base}/api/companies/${firmId}/export/decile`);
  assert.equal(blockedDecile.status, 409);
  const blockedShip = await fetch(`${base}/api/companies/${firmId}/ship`, { method: "POST" });
  assert.equal(blockedShip.status, 409);

  const badGrade = await fetch(`${base}/api/companies/${firmId}/evidence`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claim_key: "map_a_x", grade: "Rumor", confidence: "high" }),
  });
  assert.equal(badGrade.status, 400);

  const batch = await fetch(`${base}/api/companies/${firmId}/evidence/batch`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: completeSix({
      strategic_posture: { grade: "UndisclosedSpeculative", confidence: "unknown" },
    }) }),
  });
  assert.equal(batch.status, 200, await batch.clone().text());

  const qcGreen = await (await fetch(`${base}/api/companies/${firmId}/scorecard-qc`)).json();
  assert.equal(qcGreen.passed, true);
  assert.equal(qcGreen.claims.find((c: { claimKey: string }) => c.claimKey === "strategic_posture").labeled, true);

  const exported = await fetch(`${base}/api/companies/${firmId}/export/scorecard`);
  assert.equal(exported.status, 200);
  const decile = await fetch(`${base}/api/companies/${firmId}/export/decile`);
  assert.equal(decile.status, 200);
  const shippedNoHours = await fetch(`${base}/api/companies/${firmId}/ship`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(shippedNoHours.status, 400);
  assert.match((await shippedNoHours.json()).message, /leonard_hours/);

  const shipped = await fetch(`${base}/api/companies/${firmId}/ship`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reviewer_hours: 2, shipped_by: "Leonard" }),
  });
  assert.equal(shipped.status, 200);
  const shippedJson = await shipped.json();
  assert.equal(shippedJson.leonardHours, 2);
  assert.equal(shippedJson.shippedBy, "Leonard");

  const qcAfterShip = await (await fetch(`${base}/api/companies/${firmId}/scorecard-qc`)).json();
  assert.equal(qcAfterShip.latestShip.leonardHours, 2);
  assert.equal(qcAfterShip.latestShip.shippedBy, "Leonard");
  assert.ok(qcAfterShip.prd9.some((b: { id: string }) => b.id === "tape_current"));
  assert.ok(qcAfterShip.prd9.some((b: { id: string }) => b.id === "hard_rules_fired"));
  assert.ok(qcAfterShip.prd9.some((b: { id: string }) => b.id === "tape_as_of"));

  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

test("leonard_hours / reviewer_hours required and must be > 0", () => {
  assert.throws(() => parseLeonardHours({}), /leonard_hours is required/);
  assert.throws(() => parseLeonardHours({ leonard_hours: 0 }), /greater than 0/);
  assert.throws(() => parseLeonardHours({ reviewerHours: -1 }), /greater than 0/);
  assert.throws(() => parseLeonardHours({ leonardHours: "abc" }), /greater than 0/);
  assert.equal(parseLeonardHours({ leonard_hours: 3 }), 3);
  assert.equal(parseLeonardHours({ reviewer_hours: "1.25" }), 1.25);
  assert.equal(parseShippedBy({ shipped_by: " Leonard " }), "Leonard");
  assert.equal(parseShippedBy({}), null);
});

test("PRD §9 blockers mirror tape blank/stale, grades, hard_rules_fired, tape_as_of", () => {
  const empty = evaluatePrd9Blockers({
    tape: null,
    assessment: null,
    evidencePassed: false,
    missingClaimCount: 6,
  });
  assert.equal(empty.find((b) => b.id === "tape_current")?.passed, false);
  assert.match(empty.find((b) => b.id === "tape_current")!.detail, /blank/);
  assert.equal(empty.find((b) => b.id === "evidence_grades")?.passed, false);
  assert.equal(empty.find((b) => b.id === "hard_rules_fired")?.passed, false);
  assert.equal(empty.find((b) => b.id === "tape_as_of")?.passed, false);

  const stale = evaluatePrd9Blockers({
    tape: { status: "expired", asOf: "2026-01-15" },
    assessment: { hardRulesFired: "none", tapeAsOf: "2026-01-15" },
    evidencePassed: true,
    missingClaimCount: 0,
  });
  assert.equal(stale.find((b) => b.id === "tape_current")?.passed, false);
  assert.match(stale.find((b) => b.id === "tape_current")!.detail, /stale/);
  assert.equal(stale.find((b) => b.id === "hard_rules_fired")?.passed, true);
  assert.equal(stale.find((b) => b.id === "tape_as_of")?.passed, true);

  const green = evaluatePrd9Blockers({
    tape: { status: "approved", asOf: "2026-09-01" },
    assessment: { hardRulesFired: ["services_floor"], tapeAsOf: "2026-09-01" },
    evidencePassed: true,
    missingClaimCount: 0,
  });
  assert.ok(green.every((b) => b.passed));
});

test("service QC surfaces PRD §9 rows; ship without hours fails after evidence is complete", () => {
  const { tapes, assessments, evidence, firmId, db } = mem();
  evidence.upsertMany(firmId, completeSix());

  assert.throws(
    () => evidence.ship(firmId, {}),
    (err: unknown) =>
      err instanceof ScorecardEvidenceError
      && err.statusCode === 400
      && /leonard_hours/.test(err.message),
  );

  const qcBlank = evidence.qc(firmId);
  assert.equal(qcBlank.passed, true);
  assert.equal(qcBlank.prd9.find((b) => b.id === "tape_current")?.passed, false);
  assert.equal(qcBlank.prd9.find((b) => b.id === "hard_rules_fired")?.passed, false);
  assert.equal(qcBlank.prd9.find((b) => b.id === "tape_as_of")?.passed, false);

  const draft = tapes.createDraft({
    as_of: liveAsOf(0),
    drafted_by: "Signal Desk",
    bands: [{ band_id: "ai_first_defensible", ma_rev: { low: 21, high: 29 } }],
  });
  const tape = tapes.approve(draft.tapeId, { approver_id: "Leonard" });
  assessments.create(firmId, {
    evaluator_id: "judge-test",
    recommended_band: "ai_first_defensible",
    final_band: "ai_first_defensible",
    hard_rules_fired: "none",
    tape_id: tape.tapeId,
  });

  const qcReady = evidence.qc(firmId);
  assert.equal(qcReady.prd9.find((b) => b.id === "tape_current")?.passed, true);
  assert.equal(qcReady.prd9.find((b) => b.id === "hard_rules_fired")?.passed, true);
  assert.equal(qcReady.prd9.find((b) => b.id === "tape_as_of")?.passed, true);

  const shipped = evidence.ship(firmId, { leonardHours: 0.5, shippedBy: "Leonard" });
  assert.equal(shipped.leonardHours, 0.5);
  assert.equal(evidence.latestShip(firmId)?.leonardHours, 0.5);
  const count = db.prepare("SELECT COUNT(*) AS n FROM scorecard_ships").get() as { n: number };
  assert.equal(count.n, 1);
});
