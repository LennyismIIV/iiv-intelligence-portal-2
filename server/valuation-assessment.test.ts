import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  VALUATION_TAPE_CREATE_SQL,
  computeExpiresAt,
} from "../shared/valuationTape.ts";
import {
  VALUATION_ASSESSMENT_CREATE_SQL,
  ValuationAssessmentError,
  parseHardRulesFired,
  parseFinancialsRecord,
  encodeHardRulesFired,
  decodeHardRulesFired,
  evaluateHardRules,
  recommendBandFromInputs,
} from "../shared/valuationAssessment.ts";
import { createValuationTapeService } from "./valuationTapeService.ts";
import { createValuationAssessmentService } from "./valuationAssessmentService.ts";

const COMPANIES_SQL = `
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
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
  const firm = db.prepare("INSERT INTO companies (name) VALUES (?)").run("Acme Insights");
  const tapes = createValuationTapeService(db);
  const assessments = createValuationAssessmentService(db, tapes);
  return { db, tapes, assessments, firmId: Number(firm.lastInsertRowid) };
}

function approveTape(
  tapes: ReturnType<typeof createValuationTapeService>,
  bands: unknown[] = [
    { band_id: "ai_wrappers", ma_rev: { low: 11, high: 17 } },
    { band_id: "ai_first_defensible", ma_rev: { low: 21, high: 29 } },
  ],
) {
  const draft = tapes.createDraft({
    as_of: liveAsOf(0),
    drafted_by: "Signal Desk",
    bands,
  });
  return tapes.approve(draft.tapeId, { approver_id: "Leonard" });
}

const VALID_BODY = {
  evaluator_id: "judge-test",
  map_a_x: 6,
  map_a_y: 4,
  valuation_category: "AI-First",
  doctrine_flags: ["has_proprietary_data"],
  recommended_band: "ai_first_defensible",
  final_band: "ai_first_defensible",
  hard_rules_fired: "none",
  conviction: 7,
  narrative: "Defensible AI-First on the current tape.",
};

// --- Unit: hard_rules_fired present (array or explicit none)

test("hard_rules_fired requires array or explicit none", () => {
  assert.deepEqual(parseHardRulesFired("none"), { ids: [], none: true });
  assert.deepEqual(parseHardRulesFired({ none: true }), { ids: [], none: true });
  assert.deepEqual(parseHardRulesFired([]), { ids: [], none: true });
  assert.deepEqual(parseHardRulesFired(["none"]), { ids: [], none: true });
  assert.deepEqual(parseHardRulesFired(["ai_wrapper_penalty", "hitl_routing"]), {
    ids: ["ai_wrapper_penalty", "hitl_routing"],
    none: false,
  });
  assert.throws(() => parseHardRulesFired(undefined), /required/);
  assert.throws(() => parseHardRulesFired(null), /required/);
  assert.throws(() => parseHardRulesFired(["not_a_rule"]), /Invalid hard rule/);
  const encoded = encodeHardRulesFired({ ids: [], none: true });
  assert.deepEqual(decodeHardRulesFired(encoded), { ids: [], none: true });
});

test("optional FinancialsRecord stays null and never invents numbers", () => {
  assert.equal(parseFinancialsRecord(undefined), null);
  assert.equal(parseFinancialsRecord(null), null);
  const partial = parseFinancialsRecord({ arr_usd: 5_000_000 });
  assert.equal(partial?.arrUsd, 5_000_000);
  assert.equal(partial?.ebitdaUsd, null);
  assert.equal(partial?.revenueGrowthPct, null);
  assert.equal(partial?.confidence, "unknown");
});

test("simple hard-rule evaluator maps category + flags onto persisted ids", () => {
  assert.deepEqual(
    evaluateHardRules({ valuationCategory: "AI-First", mapAX: 2, mapAY: 5 }),
    ["ai_wrapper_penalty"],
  );
  assert.deepEqual(
    evaluateHardRules({
      valuationCategory: "AI-First",
      doctrineFlags: ["has_proprietary_data", "has_real_ip"],
    }),
    ["top_tier_promotion"],
  );
  assert.deepEqual(
    evaluateHardRules({ valuationCategory: "Legacy_SaaS_AI", revenueGrowthPct: 8 }),
    ["sub10_growth_floor"],
  );
  assert.ok(evaluateHardRules({ valuationCategory: "HITL" }).includes("hitl_routing"));
  assert.ok(evaluateHardRules({ valuationCategory: "Data_Provider" }).includes("data_provider_routing"));
  assert.equal(recommendBandFromInputs({ valuationCategory: "Pure_Services", mapAX: 2, mapAY: 1 }), "pure_services");
});

// --- Acceptance 1: save without tape is rejected

test("create assessment without a tape is rejected", () => {
  const { assessments, firmId } = mem();
  assert.throws(
    () => assessments.create(firmId, { ...VALID_BODY }),
    (err: unknown) =>
      err instanceof ValuationAssessmentError
      && err.statusCode === 400
      && /approved ValuationTape/.test(err.message),
  );
  assert.throws(
    () => assessments.create(firmId, { ...VALID_BODY, tape_id: null }),
    /approved ValuationTape/,
  );
});

test("create assessment against a draft tape is rejected", () => {
  const { tapes, assessments, firmId } = mem();
  const draft = tapes.createDraft({ as_of: liveAsOf(0), drafted_by: "Signal Desk" });
  assert.throws(
    () => assessments.create(firmId, { ...VALID_BODY, tape_id: draft.tapeId }),
    /draft tape/,
  );
});

// --- Acceptance 2 + 3 + 4 + 5

test("create links current approved tape; band ranges match tape snapshot; financials null OK", () => {
  const { tapes, assessments, firmId } = mem();
  const tape = approveTape(tapes, [
    { band_id: "ai_wrappers", ma_rev: { low: 11, high: 17 } },
    { band_id: "ai_first_defensible", ma_rev: { low: 21, high: 29 } },
  ]);

  const saved = assessments.create(firmId, {
    ...VALID_BODY,
    hard_rules_fired: ["ai_wrapper_penalty"],
  });
  assert.equal(saved.firmId, firmId);
  assert.equal(saved.tapeId, tape.tapeId);
  assert.equal(saved.tapeAsOf, tape.asOf);
  assert.equal(saved.hardRulesNone, false);
  assert.deepEqual(saved.hardRulesFired, ["ai_wrapper_penalty"]);
  assert.equal(saved.financials, null);
  // Distinctive tape numbers — not evergreen wrapper 3–8 or defensible 10–18.
  assert.deepEqual(saved.bandRanges.find((b) => b.bandId === "ai_wrappers")?.maRev, { low: 11, high: 17 });
  assert.deepEqual(saved.finalBandRanges?.maRev, { low: 21, high: 29 });
  assert.deepEqual(saved.recommendedBandRanges?.maRev, { low: 21, high: 29 });
  assert.equal(saved.bandRanges.length, tape.bands.length);
});

test("override without override_reason is rejected; with reason is saved", () => {
  const { tapes, assessments, firmId } = mem();
  approveTape(tapes);

  assert.throws(
    () => assessments.create(firmId, {
      ...VALID_BODY,
      recommended_band: "ai_first_defensible",
      final_band: "ai_wrappers",
    }),
    /override_reason/,
  );

  const saved = assessments.create(firmId, {
    ...VALID_BODY,
    recommended_band: "ai_first_defensible",
    final_band: "ai_wrappers",
    override_reason: "Wrapper economics despite category label.",
  });
  assert.equal(saved.finalBand, "ai_wrappers");
  assert.equal(saved.recommendedBand, "ai_first_defensible");
  assert.match(saved.overrideReason ?? "", /Wrapper economics/);
});

test("optional financials persist supplied numbers only; missing stay null / unknown", () => {
  const { tapes, assessments, firmId } = mem();
  approveTape(tapes);
  const saved = assessments.create(firmId, {
    ...VALID_BODY,
    financials: { arr_usd: 8_000_000, funding_stage: "series_a" },
  });
  assert.equal(saved.financials?.arrUsd, 8_000_000);
  assert.equal(saved.financials?.ebitdaUsd, null);
  assert.equal(saved.financials?.revenueGrowthPct, null);
  assert.equal(saved.financials?.fcfMarginPct, null);
  assert.equal(saved.financials?.fundingStage, "series_a");
  assert.equal(saved.financials?.confidence, "unknown");
});

test("missing hard_rules_fired is rejected even when a tape exists", () => {
  const { tapes, assessments, firmId } = mem();
  approveTape(tapes);
  const { hard_rules_fired: _omit, ...rest } = VALID_BODY;
  assert.throws(
    () => assessments.create(firmId, rest),
    /hard_rules_fired/,
  );
});

test("list / latest / update / delete; client cannot overwrite band ranges", () => {
  const { tapes, assessments, firmId } = mem();
  const tape = approveTape(tapes);
  const first = assessments.create(firmId, VALID_BODY);
  const second = assessments.create(firmId, {
    ...VALID_BODY,
    narrative: "Second look",
    conviction: 4,
  });
  const listed = assessments.list(firmId);
  assert.equal(listed.length, 2);
  assert.equal(assessments.getLatest(firmId)?.id, second.id);

  const updated = assessments.update(first.id, {
    conviction: 0,
    narrative: "Updated conviction",
    recommended_band: "ai_wrappers",
    final_band: "ai_first_defensible",
    override_reason: "Stay on defensible despite wrapper flag.",
  });
  assert.equal(updated.conviction, 0);
  assert.equal(updated.tapeId, tape.tapeId);
  assert.deepEqual(updated.bandRanges.find((b) => b.bandId === "ai_wrappers")?.maRev, { low: 11, high: 17 });

  assessments.remove(second.id);
  assert.equal(assessments.get(second.id), undefined);
  assert.equal(assessments.list(firmId).length, 1);
});

test("boot-time CREATE TABLE is idempotent and readable after write", () => {
  const db = new Database(":memory:");
  db.exec(COMPANIES_SQL);
  db.exec(VALUATION_TAPE_CREATE_SQL);
  db.exec(VALUATION_ASSESSMENT_CREATE_SQL);
  db.exec(VALUATION_ASSESSMENT_CREATE_SQL);
  const cols = db.prepare("PRAGMA table_info(valuation_assessments)").all() as Array<{ name: string }>;
  const names = cols.map((c) => c.name);
  for (const col of [
    "firm_id", "evaluator_id", "map_a_x", "map_a_y", "valuation_category",
    "doctrine_flags", "recommended_band", "final_band", "override_reason",
    "hard_rules_fired", "tape_id", "tape_as_of", "band_ranges",
    "conviction", "narrative", "scored_at", "financials_json",
  ]) {
    assert.ok(names.includes(col), `missing column ${col}`);
  }
  db.close();
});

// API contract (mini Express app — do not import server/routes.ts; it boots Vite)

test("API: reject without tape; persist with current tape + hard rules + override reason", async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "valuation-assessment-api-"));
  const dbPath = join(dir, "test.db");
  const db = new Database(dbPath);
  db.exec(COMPANIES_SQL);
  db.exec(VALUATION_TAPE_CREATE_SQL);
  db.exec(VALUATION_ASSESSMENT_CREATE_SQL);
  const firmId = Number(db.prepare("INSERT INTO companies (name) VALUES (?)").run("Acme").lastInsertRowid);
  const tapes = createValuationTapeService(db);
  const assessments = createValuationAssessmentService(db, tapes);
  const express = (await import("express")).default;

  const app = express();
  app.use(express.json());
  const sendErr = (err: any, res: any) => {
    if (err instanceof ValuationAssessmentError) {
      return res.status(err.statusCode).json({ message: err.message, ...err.extras });
    }
    return res.status(400).json({ message: err.message });
  };
  app.post("/api/companies/:id/assessments", (req, res) => {
    try { res.status(201).json(assessments.create(parseInt(req.params.id), req.body || {})); }
    catch (err: any) { sendErr(err, res); }
  });
  app.get("/api/companies/:id/assessments", (req, res) => {
    try { res.json(assessments.list(parseInt(req.params.id))); }
    catch (err: any) { sendErr(err, res); }
  });

  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;

  try {
    const noTape = await fetch(`${base}/api/companies/${firmId}/assessments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    assert.equal(noTape.status, 400);
    assert.match((await noTape.json()).message, /approved ValuationTape/);

    const tape = await approveTape(tapes, [
      { band_id: "pure_services", ma_ebitda: { low: 4.2, high: 7.7 } },
    ]);

    const missingRules = await fetch(`${base}/api/companies/${firmId}/assessments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evaluator_id: "judge-test", recommended_band: "pure_services", final_band: "pure_services" }),
    });
    assert.equal(missingRules.status, 400);
    assert.match((await missingRules.json()).message, /hard_rules_fired/);

    const created = await fetch(`${base}/api/companies/${firmId}/assessments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        evaluator_id: "judge-test",
        valuation_category: "Pure_Services",
        recommended_band: "pure_services",
        final_band: "services_specialization",
        override_reason: "Specialization is real.",
        hard_rules_fired: ["services_floor"],
        conviction: 6,
      }),
    });
    assert.equal(created.status, 201, await created.clone().text());
    const body = await created.json();
    assert.equal(body.tapeId, tape.tapeId);
    assert.equal(body.tapeAsOf, tape.asOf);
    assert.deepEqual(body.hardRulesFired, ["services_floor"]);
    assert.deepEqual(body.bandRanges[0].maEbitda, { low: 4.2, high: 7.7 });
    assert.equal(body.financials, null);
    assert.equal(body.expiresAt, undefined);
    assert.equal(computeExpiresAt(tape.asOf), tape.expiresAt);

    const listed = await (await fetch(`${base}/api/companies/${firmId}/assessments`)).json();
    assert.equal(listed.length, 1);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    db.close();
  }
});
