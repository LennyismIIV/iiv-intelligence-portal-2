import { test } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  VALUATION_TAPE_CREATE_SQL,
  computeExpiresAt,
  assertHumanApprover,
  normalizeDraftedBy,
  parseBands,
  encodeBands,
  isPastExpiry,
  ValuationTapeError,
  TAPE_GRACE_DAYS_MAX,
  DEFAULT_DRAFTED_BY,
} from "../shared/valuationTape.ts";
import { createValuationTapeService } from "./valuationTapeService.ts";

function memService() {
  const db = new Database(":memory:");
  db.exec(VALUATION_TAPE_CREATE_SQL);
  return { db, svc: createValuationTapeService(db) };
}

/** Mid-month as_of `offset` months from now — expires_at is always next-month+7d (still live). */
function liveAsOf(offset = 0): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 15))
    .toISOString()
    .slice(0, 10);
}

// --- Acceptance 4: expires_at = calendar-month end of as_of + ≤7d grace (D2 locked)

test("expires_at is month-end of as_of plus 7-day grace", () => {
  assert.equal(computeExpiresAt("2026-08-15"), "2026-09-07");
  assert.equal(computeExpiresAt("2026-08-01"), "2026-09-07");
  assert.equal(computeExpiresAt("2026-08-31"), "2026-09-07");
  assert.equal(computeExpiresAt("2026-01-31"), "2026-02-07");
  assert.equal(computeExpiresAt("2026-02-01"), "2026-03-07");
  assert.equal(computeExpiresAt("2024-02-10"), "2024-03-07"); // leap year month-end 29
  assert.equal(computeExpiresAt("2026-12-20"), "2027-01-07");
  assert.equal(TAPE_GRACE_DAYS_MAX, 7);
  assert.equal(computeExpiresAt("2026-08-15", 0), "2026-08-31");
  assert.throws(() => computeExpiresAt("2026-08-15", 8), /D2 locked|0–7/);
  assert.throws(() => computeExpiresAt("08/15/2026"), /YYYY-MM-DD/);
});

test("isPastExpiry is exclusive of the expires_at calendar day", () => {
  assert.equal(isPastExpiry("2026-09-07", "2026-09-07"), false);
  assert.equal(isPastExpiry("2026-09-07", "2026-09-08"), true);
  assert.equal(isPastExpiry(null, "2026-09-08"), false);
});

test("bot / Content Studio approvers are rejected; human approver_id is kept", () => {
  assert.equal(assertHumanApprover("Leonard"), "Leonard");
  assert.equal(assertHumanApprover("  leonard.murphy  "), "leonard.murphy");
  for (const bad of ["bot", "auto-approve", "system", "Content Studio", "auto", "ai", "bot:nightly"]) {
    assert.throws(() => assertHumanApprover(bad), /human|Content Studio|approver_id/);
  }
  assert.throws(() => assertHumanApprover(""), /as_of \+ approver_id/);
  assert.throws(() => assertHumanApprover("   "), /as_of \+ approver_id/);
  assert.throws(() => normalizeDraftedBy("Content Studio"), /Content Studio/);
  assert.equal(normalizeDraftedBy(undefined), DEFAULT_DRAFTED_BY);
});

test("bands encode/decode round-trip (band_id → ma_rev / ma_ebitda / vc_rev + source URLs)", () => {
  const parsed = parseBands([
    {
      band_id: "ai_first_defensible",
      ma_rev: { low: 10, median: 14, high: 18 },
      vc_rev: { low: 15, high: 25 },
      source_urls: ["https://example.com/tape"],
    },
  ]);
  assert.equal(parsed[0].bandId, "ai_first_defensible");
  assert.deepEqual(parsed[0].maRev, { low: 10, median: 14, high: 18 });
  const encoded = encodeBands(parsed);
  const again = parseBands(encoded);
  assert.deepEqual(again, parsed);
  assert.throws(() => parseBands([{ ma_rev: { low: 1, high: 2 } }]), /band_id/);
});

// --- Acceptance 1: cannot mark approved without as_of + approver_id

test("cannot approve without as_of + approver_id; no bot default", () => {
  const { svc } = memService();
  const asOf = liveAsOf(0);
  const draft = svc.createDraft({ as_of: asOf, drafted_by: "Signal Desk" });
  assert.equal(draft.status, "draft");
  assert.equal(draft.draftedBy, "Signal Desk");
  assert.equal(draft.approverId, null);
  assert.equal(draft.expiresAt, computeExpiresAt(asOf));

  assert.throws(
    () => svc.approve(draft.tapeId, {}),
    (err: unknown) => err instanceof ValuationTapeError && /as_of \+ approver_id/.test(err.message),
  );
  assert.throws(
    () => svc.approve(draft.tapeId, { approver_id: "bot" }),
    /human|bot/,
  );
  assert.throws(
    () => svc.createDraft({ drafted_by: "Signal Desk" }),
    /as_of is required/,
  );
});

// --- Acceptance 2: approving a new tape supersedes the prior current

test("approving a new tape supersedes the prior current approved tape", () => {
  const { svc } = memService();
  const asOf1 = liveAsOf(0);
  const asOf2 = liveAsOf(1);
  const first = svc.createDraft({
    as_of: asOf1,
    drafted_by: "Signal Desk",
    source_notes: "Monthly comps",
    bands: [{ band_id: "pure_services", ma_ebitda: { low: 4, high: 8 } }],
  });
  const approvedFirst = svc.approve(first.tapeId, { approver_id: "Leonard", versioned_by: "Leonard" });
  assert.equal(approvedFirst.status, "approved");
  assert.equal(approvedFirst.approverId, "Leonard");
  assert.equal(approvedFirst.versionedBy, "Leonard");
  assert.equal(approvedFirst.asOf, asOf1);
  assert.equal(approvedFirst.expiresAt, computeExpiresAt(asOf1));

  const current1 = svc.getCurrentApprovedTape();
  assert.equal(current1.tape?.tapeId, first.tapeId);

  const second = svc.createDraft({ as_of: asOf2, drafted_by: "Signal Desk" });
  const approvedSecond = svc.approve(second.tapeId, { approver_id: "Leonard" });
  assert.equal(approvedSecond.status, "approved");

  const prior = svc.get(first.tapeId)!;
  assert.equal(prior.status, "superseded");
  assert.equal(prior.supersededBy, second.tapeId);

  const current2 = svc.getCurrentApprovedTape();
  assert.equal(current2.tape?.tapeId, second.tapeId);
  assert.equal(current2.tape?.status, "approved");
});

// --- Acceptance 3: expired/superseded cannot be selected as current without override

test("expired and superseded tapes cannot be selected as current without override warning/flag", () => {
  const { db, svc } = memService();
  const first = svc.createDraft({ as_of: liveAsOf(0) });
  svc.approve(first.tapeId, { approver_id: "Leonard" });

  const second = svc.createDraft({ as_of: liveAsOf(1) });
  svc.approve(second.tapeId, { approver_id: "Leonard" });
  // second is current; first is superseded
  const superseded = svc.get(first.tapeId)!;
  assert.equal(superseded.status, "superseded");

  assert.throws(
    () => svc.getCurrentApprovedTape({ tapeId: superseded.tapeId }),
    (err: unknown) =>
      err instanceof ValuationTapeError
      && err.statusCode === 409
      && err.extras.requiresOverride === true
      && /override/.test(String(err.extras.warning ?? err.message)),
  );

  const overridden = svc.getCurrentApprovedTape({ tapeId: superseded.tapeId, override: true });
  assert.equal(overridden.overrideApplied, true);
  assert.match(overridden.warning ?? "", /Override applied/);
  assert.equal(overridden.tape?.tapeId, superseded.tapeId);

  // Force-expire the current approved tape and require override to select it.
  db.prepare("UPDATE valuation_tapes SET expires_at = '2026-01-01' WHERE tape_id = ?").run(second.tapeId);
  svc.expireStale("2026-01-08");
  const expired = svc.get(second.tapeId)!;
  assert.equal(expired.status, "expired");

  assert.throws(
    () => svc.getCurrentApprovedTape({ tapeId: expired.tapeId }),
    (err: unknown) => err instanceof ValuationTapeError && err.extras.requiresOverride === true,
  );
  const expiredOverride = svc.getCurrentApprovedTape({ tapeId: expired.tapeId, override: true });
  assert.equal(expiredOverride.overrideApplied, true);
  assert.equal(expiredOverride.tape?.tapeId, expired.tapeId);

  assert.equal(svc.getCurrentApprovedTape().tape, null);
});

test("lazy expire turns a past-due approved tape into expired so it is no longer current", () => {
  const { db, svc } = memService();
  const tape = svc.createDraft({ as_of: liveAsOf(0) });
  svc.approve(tape.tapeId, { approver_id: "Leonard" });
  db.prepare("UPDATE valuation_tapes SET expires_at = '2026-07-07' WHERE tape_id = ?").run(tape.tapeId);

  const current = svc.getCurrentApprovedTape({ now: "2026-07-08" });
  assert.equal(current.tape, null);
  assert.equal(svc.get(tape.tapeId)?.status, "expired");
});

test("draft create/update and list; Content Studio cannot own a tape", () => {
  const { svc } = memService();
  const asOf = liveAsOf(0);
  const asOf2 = liveAsOf(0).replace(/-\d{2}$/, "-20");
  const draft = svc.createDraft({
    asOf,
    draftedBy: "Signal Desk",
    sourceNotes: "https://example.com/evidence",
    bands: [{ bandId: "ai_wrappers", maRev: { low: 3, high: 8 }, sourceUrls: ["https://iconic.co"] }],
  });
  assert.equal(draft.asOf, asOf);
  assert.equal(draft.bands[0].bandId, "ai_wrappers");

  const updated = svc.updateDraft(draft.tapeId, {
    source_notes: "updated notes",
    as_of: asOf2,
  });
  assert.equal(updated.sourceNotes, "updated notes");
  assert.equal(updated.asOf, asOf2);
  assert.equal(updated.expiresAt, computeExpiresAt(asOf2));

  const listed = svc.list("draft");
  assert.equal(listed.length, 1);

  assert.throws(() => svc.createDraft({ as_of: liveAsOf(0), drafted_by: "Content Studio" }), /Content Studio/);
});

test("boot-time CREATE TABLE is idempotent and readable after write", () => {
  const db = new Database(":memory:");
  db.exec(VALUATION_TAPE_CREATE_SQL);
  db.exec(VALUATION_TAPE_CREATE_SQL);
  const cols = db.prepare("PRAGMA table_info(valuation_tapes)").all() as Array<{ name: string }>;
  const names = cols.map((c) => c.name);
  for (const col of [
    "tape_id", "as_of", "expires_at", "status", "approver_id",
    "superseded_by", "bands", "source_notes", "drafted_by", "versioned_by",
  ]) {
    assert.ok(names.includes(col), `missing column ${col}`);
  }
  const svc = createValuationTapeService(db);
  const asOf = liveAsOf(0);
  const tape = svc.createDraft({ as_of: asOf });
  const row = db.prepare("SELECT * FROM valuation_tapes WHERE tape_id = ?").get(tape.tapeId) as { status: string; as_of: string };
  assert.equal(row.status, "draft");
  assert.equal(row.as_of, asOf);
  db.close();
});

// API contract (mini Express app — do not import server/routes.ts; it boots Vite)

test("API: draft → approve → current; reject approve without approver; override on superseded", async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "valuation-tape-api-"));
  const dbPath = join(dir, "test.db");
  const db = new Database(dbPath);
  db.exec(VALUATION_TAPE_CREATE_SQL);
  const svc = createValuationTapeService(db);
  const express = (await import("express")).default;
  const { ValuationTapeError } = await import("../shared/valuationTape.ts");

  const app = express();
  app.use(express.json());
  const sendErr = (err: any, res: any) => {
    if (err instanceof ValuationTapeError) {
      return res.status(err.statusCode).json({ message: err.message, ...err.extras });
    }
    return res.status(400).json({ message: err.message });
  };
  app.get("/api/valuation-tapes", (_req, res) => res.json(svc.list()));
  app.get("/api/valuation-tapes/current", (req, res) => {
    try {
      const tapeId = typeof req.query.tapeId === "string" ? req.query.tapeId : undefined;
      const override = req.query.override === "1" || req.query.override === "true";
      res.json(svc.getCurrentApprovedTape({ tapeId, override }));
    } catch (err: any) { sendErr(err, res); }
  });
  app.post("/api/valuation-tapes", (req, res) => {
    try { res.status(201).json(svc.createDraft(req.body || {})); }
    catch (err: any) { sendErr(err, res); }
  });
  app.post("/api/valuation-tapes/:tapeId/approve", (req, res) => {
    try { res.json(svc.approve(req.params.tapeId, req.body || {})); }
    catch (err: any) { sendErr(err, res); }
  });

  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;

  const asOf1 = liveAsOf(0);
  const asOf2 = liveAsOf(1);
  try {
    const created = await fetch(`${base}/api/valuation-tapes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ as_of: asOf1, drafted_by: "Signal Desk", source_notes: "Monthly tape" }),
    });
    assert.equal(created.status, 201, await created.clone().text());
    const draft = await created.json();
    assert.equal(draft.status, "draft");

    const noApprover = await fetch(`${base}/api/valuation-tapes/${draft.tapeId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(noApprover.status, 400);
    assert.match((await noApprover.json()).message, /as_of \+ approver_id/);

    const bot = await fetch(`${base}/api/valuation-tapes/${draft.tapeId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approver_id: "bot" }),
    });
    assert.equal(bot.status, 400);

    const approved = await fetch(`${base}/api/valuation-tapes/${draft.tapeId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approver_id: "Leonard" }),
    });
    assert.equal(approved.status, 200, await approved.clone().text());
    const approvedBody = await approved.json();
    assert.equal(approvedBody.status, "approved");
    assert.equal(approvedBody.approverId, "Leonard");
    assert.equal(approvedBody.expiresAt, computeExpiresAt(asOf1));

    const current = await (await fetch(`${base}/api/valuation-tapes/current`)).json();
    assert.equal(current.tape.tapeId, draft.tapeId);

    const draft2 = await (await fetch(`${base}/api/valuation-tapes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ as_of: asOf2, drafted_by: "Signal Desk" }),
    })).json();
    await fetch(`${base}/api/valuation-tapes/${draft2.tapeId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approver_id: "Leonard" }),
    });

    const denied = await fetch(`${base}/api/valuation-tapes/current?tapeId=${draft.tapeId}`);
    assert.equal(denied.status, 409);
    const deniedBody = await denied.json();
    assert.equal(deniedBody.requiresOverride, true);

    const forced = await fetch(`${base}/api/valuation-tapes/current?tapeId=${draft.tapeId}&override=1`);
    assert.equal(forced.status, 200);
    const forcedBody = await forced.json();
    assert.equal(forcedBody.overrideApplied, true);
    assert.match(forcedBody.warning, /Override applied/);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    db.close();
  }
});
