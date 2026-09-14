import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  applyScorecardValidation,
  encodeScorecardArrays,
  decodeScorecardArrays,
  isGreenbookVisible,
  companyHasBrandTag,
  STRATEGIC_POSTURES,
  VALUATION_CATEGORIES,
  HUMAN_DATA_SUPPLY_CATEGORIES,
  PLATFORM_STAGES,
} from "../shared/scorecardFields.ts";

const ALL_Y_FIELDS = {
  mapAX: 7.5,
  mapAY: 2,
  strategicPosture: "orchestrator",
  valuationCategory: "AI-First",
  humanDataSupplyCategory: "panel_sample",
  platformStage: "data_insight_platform",
  vcControlLayers: ["VC1", "VC3", "VC5"],
  brandTags: ["gen2_client", "iiv_pipeline"],
};

test("create/update payload with all Scorecard Y fields is accepted", () => {
  const parsed = applyScorecardValidation({ name: "Acme Insights", ...ALL_Y_FIELDS });
  assert.equal(parsed.name, "Acme Insights");
  assert.equal(parsed.mapAX, 7.5);
  assert.equal(parsed.mapAY, 2);
  assert.equal(parsed.strategicPosture, "orchestrator");
  assert.equal(parsed.valuationCategory, "AI-First");
  assert.deepEqual(parsed.vcControlLayers, ["VC1", "VC3", "VC5"]);
  assert.deepEqual(parsed.brandTags, ["gen2_client", "iiv_pipeline"]);
});

test("snake_case aliases are accepted on write", () => {
  const parsed = applyScorecardValidation({
    map_a_x: 0,
    map_a_y: 10,
    strategic_posture: "trust_builder",
    valuation_category: "HITL",
    human_data_supply_category: "ai_training_annotation",
    platform_stage: "project_shop",
    vc_control_layers: ["VC2"],
    brand_tags: ["greenbook_visible"],
  });
  assert.equal(parsed.mapAX, 0);
  assert.equal(parsed.mapAY, 10);
  assert.equal(parsed.strategicPosture, "trust_builder");
  assert.equal(parsed.valuationCategory, "HITL");
  assert.deepEqual(parsed.brandTags, ["greenbook_visible"]);
  assert.equal("map_a_x" in parsed, false);
});

test("invalid enums are rejected", () => {
  const cases: Array<Record<string, unknown>> = [
    { strategicPosture: "translator" },
    { valuationCategory: "ai_first" },
    { humanDataSupplyCategory: "panel" },
    { platformStage: "platform" },
    { vcControlLayers: ["VC1", "VC6"] },
    { brandTags: ["gen2_client", "secret_export"] },
  ];
  for (const body of cases) {
    assert.throws(() => applyScorecardValidation(body), /invalid_enum_value|Invalid enum/);
  }
  assert.ok(STRATEGIC_POSTURES.includes("decision_partner"));
  assert.ok(VALUATION_CATEGORIES.includes("Legacy_SaaS_AI"));
  assert.ok(HUMAN_DATA_SUPPLY_CATEGORIES.includes("first_party_retail_fs_platform"));
  assert.ok(PLATFORM_STAGES.includes("di_infrastructure"));
});

test("map_a_x / map_a_y reject outside 0–10 (inclusive bounds allowed)", () => {
  assert.equal(applyScorecardValidation({ mapAX: 0 }).mapAX, 0);
  assert.equal(applyScorecardValidation({ mapAY: 10 }).mapAY, 10);
  assert.throws(() => applyScorecardValidation({ mapAX: -0.1 }), />= 0|Too small|must be/);
  assert.throws(() => applyScorecardValidation({ mapAY: 10.01 }), /<= 10|Too big|must be/);
  assert.throws(() => applyScorecardValidation({ map_a_x: 11 }), /<= 10|Too big|must be/);
});

test("read-back matches write (encode → decode, the GET-after-PATCH transform)", () => {
  const written = applyScorecardValidation({ id: 1, name: "Readback Co", ...ALL_Y_FIELDS });
  const stored = encodeScorecardArrays(written);
  assert.equal(typeof stored.vcControlLayers, "string");
  assert.equal(typeof stored.brandTags, "string");
  const read = decodeScorecardArrays(stored);
  assert.equal(read.id, 1);
  assert.equal(read.name, "Readback Co");
  assert.equal(read.mapAX, ALL_Y_FIELDS.mapAX);
  assert.equal(read.mapAY, ALL_Y_FIELDS.mapAY);
  assert.equal(read.strategicPosture, ALL_Y_FIELDS.strategicPosture);
  assert.equal(read.valuationCategory, ALL_Y_FIELDS.valuationCategory);
  assert.equal(read.humanDataSupplyCategory, ALL_Y_FIELDS.humanDataSupplyCategory);
  assert.equal(read.platformStage, ALL_Y_FIELDS.platformStage);
  assert.deepEqual(read.vcControlLayers, ALL_Y_FIELDS.vcControlLayers);
  assert.deepEqual(read.brandTags, ALL_Y_FIELDS.brandTags);
});

test("firm without greenbook_visible is not Greenbook-visible (ACL helper; no export exists)", () => {
  // TODO(P3.x): when a greenbook-visible export is added, filter with isGreenbookVisible().
  // No GET /api/companies/export/greenbook (or equivalent) exists in this portal today.
  const without = decodeScorecardArrays({
    name: "Private Co",
    brandTags: JSON.stringify(["gen2_client", "iiv_pipeline"]),
  });
  const withFlag = decodeScorecardArrays({
    name: "Public Co",
    brandTags: JSON.stringify(["greenbook_visible"]),
  });
  const unset = { name: "Unset Co", brandTags: null };
  assert.equal(isGreenbookVisible(without), false);
  assert.equal(companyHasBrandTag(without, "greenbook_visible"), false);
  assert.equal(isGreenbookVisible(withFlag), true);
  assert.equal(isGreenbookVisible(unset), false);
});

test("boot-time ALTER pattern + SQLite GET after write", () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE companies (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, gen2_relationship TEXT)");
  const cols = db.prepare("PRAGMA table_info(companies)").all() as Array<{ name: string }>;
  const has = (n: string) => cols.some((c) => c.name === n);
  const alters: Array<[string, string]> = [
    ["map_a_x", "ALTER TABLE companies ADD COLUMN map_a_x REAL"],
    ["map_a_y", "ALTER TABLE companies ADD COLUMN map_a_y REAL"],
    ["strategic_posture", "ALTER TABLE companies ADD COLUMN strategic_posture TEXT"],
    ["valuation_category", "ALTER TABLE companies ADD COLUMN valuation_category TEXT"],
    ["human_data_supply_category", "ALTER TABLE companies ADD COLUMN human_data_supply_category TEXT"],
    ["platform_stage", "ALTER TABLE companies ADD COLUMN platform_stage TEXT"],
    ["vc_control_layers", "ALTER TABLE companies ADD COLUMN vc_control_layers TEXT"],
    ["brand_tags", "ALTER TABLE companies ADD COLUMN brand_tags TEXT"],
  ];
  for (const [col, sql] of alters) {
    if (!has(col)) db.exec(sql);
  }

  const after = db.prepare("PRAGMA table_info(companies)").all() as Array<{ name: string }>;
  for (const [col] of alters) {
    assert.ok(after.some((c) => c.name === col), `missing column ${col}`);
  }

  db.prepare("INSERT INTO companies (name, gen2_relationship) VALUES (?, ?)").run("Legacy Gen2", "active partner");
  db.prepare(`
    UPDATE companies
    SET brand_tags = '["gen2_client"]'
    WHERE (brand_tags IS NULL OR brand_tags = '' OR brand_tags = '[]')
      AND gen2_relationship IS NOT NULL
      AND TRIM(gen2_relationship) != ''
  `).run();
  const mapped = db.prepare("SELECT brand_tags FROM companies WHERE name = ?").get("Legacy Gen2") as { brand_tags: string };
  assert.equal(mapped.brand_tags, '["gen2_client"]');

  const validated = applyScorecardValidation({ name: "Write Co", ...ALL_Y_FIELDS });
  const encoded = encodeScorecardArrays(validated);
  const insert = db.prepare(`
    INSERT INTO companies (
      name, map_a_x, map_a_y, strategic_posture, valuation_category,
      human_data_supply_category, platform_stage, vc_control_layers, brand_tags
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = insert.run(
    encoded.name,
    encoded.mapAX,
    encoded.mapAY,
    encoded.strategicPosture,
    encoded.valuationCategory,
    encoded.humanDataSupplyCategory,
    encoded.platformStage,
    encoded.vcControlLayers,
    encoded.brandTags,
  );

  const row = db.prepare("SELECT * FROM companies WHERE id = ?").get(info.lastInsertRowid) as Record<string, unknown>;
  const read = decodeScorecardArrays({
    id: row.id,
    name: row.name,
    mapAX: row.map_a_x,
    mapAY: row.map_a_y,
    strategicPosture: row.strategic_posture,
    valuationCategory: row.valuation_category,
    humanDataSupplyCategory: row.human_data_supply_category,
    platformStage: row.platform_stage,
    vcControlLayers: row.vc_control_layers,
    brandTags: row.brand_tags,
  });
  assert.equal(read.name, "Write Co");
  assert.equal(read.mapAX, 7.5);
  assert.equal(read.mapAY, 2);
  assert.deepEqual(read.vcControlLayers, ["VC1", "VC3", "VC5"]);
  assert.equal(isGreenbookVisible(read), false);

  db.close();
});

test("API GET after PATCH returns the same Scorecard fields", async () => {
  // Do not import server/routes.ts here: it pulls server/index.ts, which boots
  // the production listener + Vite. Exercise the same POST/PATCH/GET contract
  // the routes use (applyScorecardValidation + storage).
  const { mkdtempSync, copyFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "scorecard-api-"));
  const dbPath = join(dir, "test.db");
  copyFileSync(join(process.cwd(), "data.db"), dbPath);
  process.env.DB_PATH = dbPath;

  const { storage, sqlite } = await import("./storage.ts");
  const express = (await import("express")).default;

  const app = express();
  app.use(express.json());
  app.post("/api/companies", async (req, res) => {
    try {
      const parsed = applyScorecardValidation(req.body || {});
      const company = await storage.createCompany(parsed as any);
      res.status(201).json(company);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });
  app.patch("/api/companies/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const body = applyScorecardValidation(req.body || {});
      const company = await storage.updateCompany(id, body as any);
      if (!company) return res.status(404).json({ message: "Company not found" });
      res.json(company);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });
  app.get("/api/companies/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    const company = await storage.getCompany(id);
    if (!company) return res.status(404).json({ message: "Company not found" });
    res.json(company);
  });

  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;

  const created = await fetch(`${base}/api/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Scorecard API Co", ...ALL_Y_FIELDS }),
  });
  const createdText = await created.text();
  assert.equal(created.status, 201, createdText);
  const createdBody = JSON.parse(createdText);
  assert.equal(createdBody.name, "Scorecard API Co");
  assert.equal(createdBody.mapAX, 7.5);
  assert.deepEqual(createdBody.vcControlLayers, ["VC1", "VC3", "VC5"]);

  const badEnum = await fetch(`${base}/api/companies/${createdBody.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ strategicPosture: "not_a_posture" }),
  });
  assert.equal(badEnum.status, 400);

  const badCoord = await fetch(`${base}/api/companies/${createdBody.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ map_a_y: 12 }),
  });
  assert.equal(badCoord.status, 400);

  const patched = await fetch(`${base}/api/companies/${createdBody.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      map_a_x: 3.25,
      brand_tags: ["greenbook_visible"],
      vc_control_layers: ["VC2", "VC4"],
    }),
  });
  const patchedText = await patched.text();
  assert.equal(patched.status, 200, patchedText);

  const got = await fetch(`${base}/api/companies/${createdBody.id}`);
  assert.equal(got.status, 200);
  const read = await got.json();
  assert.equal(read.id, createdBody.id);
  assert.equal(read.name, "Scorecard API Co");
  assert.equal(read.mapAX, 3.25);
  assert.equal(read.mapAY, 2);
  assert.equal(read.strategicPosture, "orchestrator");
  assert.equal(read.valuationCategory, "AI-First");
  assert.equal(read.humanDataSupplyCategory, "panel_sample");
  assert.equal(read.platformStage, "data_insight_platform");
  assert.deepEqual(read.vcControlLayers, ["VC2", "VC4"]);
  assert.deepEqual(read.brandTags, ["greenbook_visible"]);

  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
  sqlite.close();
});
