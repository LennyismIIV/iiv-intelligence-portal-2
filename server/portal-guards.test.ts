import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";

const SECRET = "test-portal-secret";
const dir = mkdtempSync(join(tmpdir(), "iiv-guards-"));
const dbPath = join(dir, "test.db");
copyFileSync(join(process.cwd(), "data.db"), dbPath);
process.env.DB_PATH = dbPath;
process.env.SKIP_SEED = "1";
process.env.IIV_AUTH_SECRET = SECRET;
process.env.IIV_USERS = "ada:ada-password-1";
process.env.NODE_ENV = "test";

test("auth config rejects a short secret and a bad user list", async () => {
  const { loadAuthConfig, authenticateLogin, parseUsers } = await import("./auth.ts");
  assert.throws(() => loadAuthConfig({ IIV_AUTH_SECRET: "short" }), /IIV_AUTH_SECRET/);
  assert.throws(() => parseUsers("not-a-pair"), /username:password/);
  assert.throws(
    () => loadAuthConfig({ IIV_AUTH_SECRET: SECRET, IIV_USERS: "ada:ada-password-1,ada:other-password" }),
    /unique/,
  );

  const shared = loadAuthConfig({ IIV_AUTH_SECRET: SECRET });
  assert.equal(shared.loginMode, "shared");
  const named = authenticateLogin(shared, { name: "Ada Lovelace", password: SECRET });
  assert.equal(named.ok, true);
  if (named.ok) assert.equal(named.user.id, "Ada Lovelace");
  const missingName = authenticateLogin(shared, { password: SECRET });
  assert.equal(missingName.ok, false);
  if (!missingName.ok) assert.equal(missingName.status, 400);

  const users = loadAuthConfig({ IIV_AUTH_SECRET: SECRET, IIV_USERS: "ada:ada-password-1" });
  assert.equal(users.loginMode, "users");
  const bad = authenticateLogin(users, { username: "ada", password: SECRET });
  assert.equal(bad.ok, false);
  const good = authenticateLogin(users, { username: "ada", password: "ada-password-1" });
  assert.equal(good.ok, true);
  if (good.ok) assert.equal(good.user.id, "ada");
});

test("API auth, JSON 404s, and scores filtered by company id", async () => {
  const { isApiPath } = await import("./httpGuards.ts");
  assert.equal(isApiPath("/api"), true);
  assert.equal(isApiPath("/api/companies/1/scores"), true);
  assert.equal(isApiPath("/API/Nope"), true);
  assert.equal(isApiPath("/evaluations"), false);
  assert.equal(isApiPath("/apiary"), false);

  const express = (await import("express")).default;
  const { registerRoutes } = await import("./routes.ts");

  const app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  // Stand-in for the production SPA fallback, mounted after the API 404.
  app.use((req, res) => {
    res.status(200).type("html").send("<!DOCTYPE html><html><body>app</body></html>");
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = httpServer.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;

  const cookieFrom = (res: Response) =>
    (typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [])
      .map((c) => c.split(";")[0])
      .filter(Boolean)
      .join("; ");

  async function read(res: Response) {
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { text, json };
  }

  function assertJsonError(res: Response, text: string) {
    assert.match(res.headers.get("content-type") || "", /application\/json/);
    assert.equal(text.includes("<html"), false);
    assert.equal(text.includes("<!DOCTYPE"), false);
  }

  try {
    const open = await fetch(`${base}/api/auth/me`);
    const openBody = await read(open);
    assert.equal(open.status, 200);
    assert.equal(openBody.json.user, null);
    assert.equal(openBody.json.login.mode, "users");

    const unauthenticated: Array<[string, string]> = [
      ["GET", "/api/companies"],
      ["POST", "/api/companies"],
      ["PATCH", "/api/companies/1"],
      ["PUT", "/api/companies/1/founder-session"],
      ["DELETE", "/api/admin/scores/1"],
    ];
    for (const [method, path] of unauthenticated) {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "GET" ? undefined : "{}",
      });
      const body = await read(res);
      assert.equal(res.status, 401, `${method} ${path} -> ${res.status} ${body.text}`);
      assertJsonError(res, body.text);
      assert.equal(body.json.message, "Authentication required");
    }

    const unknownOpen = await fetch(`${base}/api/does-not-exist`);
    const unknownOpenBody = await read(unknownOpen);
    assert.equal(unknownOpen.status, 404, unknownOpenBody.text);
    assertJsonError(unknownOpen, unknownOpenBody.text);
    assert.equal(unknownOpenBody.json.message, "Not found");

    const page = await fetch(`${base}/evaluations`);
    const pageText = await page.text();
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type") || "", /html/);
    assert.match(pageText, /<html>/);

    const keyHeaders = { "X-API-Key": SECRET, "Content-Type": "application/json" };
    const unknownAuthed = await fetch(`${base}/api/also-missing`, { method: "POST", headers: keyHeaders, body: "{}" });
    const unknownAuthedBody = await read(unknownAuthed);
    assert.equal(unknownAuthed.status, 404, unknownAuthedBody.text);
    assertJsonError(unknownAuthed, unknownAuthedBody.text);

    const bearer = await fetch(`${base}/api/companies?limit=1`, {
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    assert.equal(bearer.status, 200);

    const noKey = await fetch(`${base}/api/companies`, { headers: { "X-API-Key": "wrong-secret-value" } });
    assert.equal(noKey.status, 401);

    const rejectedShared = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Ada", password: SECRET }),
    });
    assert.equal(rejectedShared.status, 401);

    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "ada", password: "ada-password-1" }),
    });
    const loginBody = await read(login);
    assert.equal(login.status, 200, loginBody.text);
    assert.equal(loginBody.json.user.id, "ada");
    const cookie = cookieFrom(login);
    assert.match(cookie, /iiv\.sid=/);

    const me = await fetch(`${base}/api/auth/me`, { headers: { cookie } });
    const meBody = await read(me);
    assert.equal(me.status, 200);
    assert.equal(meBody.json.user.id, "ada");
    assert.equal(meBody.json.user.name, "ada");

    const createdA = await fetch(`${base}/api/companies`, {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Guard Co A" }),
    });
    const companyA = (await read(createdA)).json;
    assert.equal(createdA.status, 201, JSON.stringify(companyA));

    const createdB = await fetch(`${base}/api/companies`, {
      method: "POST",
      headers: keyHeaders,
      body: JSON.stringify({ name: "Guard Co B" }),
    });
    const companyB = (await read(createdB)).json;
    assert.equal(createdB.status, 201, JSON.stringify(companyB));

    const scoreA = await fetch(`${base}/api/companies/${companyA.id}/scores`, {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ lensType: "iic", dimension: "market", score: 8, evaluatorId: "spoofed-browser" }),
    });
    const scoreABody = (await read(scoreA)).json;
    assert.equal(scoreA.status, 201, JSON.stringify(scoreABody));
    assert.equal(scoreABody.companyId, companyA.id);
    assert.equal(scoreABody.evaluatorId, "ada");

    const legacy = await fetch(`${base}/api/companies/${companyA.id}/scores`, {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ lensType: "iic", dimension: "team", score: 6 }),
    });
    const legacyBody = (await read(legacy)).json;
    assert.equal(legacy.status, 201, JSON.stringify(legacyBody));
    assert.equal(legacyBody.evaluatorId, null);
    assert.equal(legacyBody.companyId, companyA.id);

    const scoreB = await fetch(`${base}/api/companies/${companyB.id}/scores`, {
      method: "POST",
      headers: keyHeaders,
      body: JSON.stringify({ lensType: "iic", dimension: "market", score: 3, evaluatorId: "script-user" }),
    });
    const scoreBBody = (await read(scoreB)).json;
    assert.equal(scoreB.status, 201, JSON.stringify(scoreBBody));
    assert.equal(scoreBBody.evaluatorId, "script-user");
    assert.equal(scoreBBody.companyId, companyB.id);

    const founderB = await fetch(`${base}/api/companies/${companyB.id}/scores`, {
      method: "POST",
      headers: keyHeaders,
      body: JSON.stringify({ lensType: "founder", dimension: "vision", score: 5, evaluatorId: "script-user" }),
    });
    assert.equal(founderB.status, 201);

    const lensA = await fetch(`${base}/api/companies/${companyA.id}/scores?lens=iic`, { headers: keyHeaders });
    const lensABody = (await read(lensA)).json as Array<{ companyId: number; score: number; dimension: string }>;
    assert.equal(lensA.status, 200);
    assert.ok(Array.isArray(lensABody));
    assert.equal(lensABody.length, 2);
    assert.ok(lensABody.every((row) => row.companyId === companyA.id));
    assert.ok(lensABody.some((row) => row.dimension === "market" && row.score === 8));
    assert.equal(lensABody.some((row) => row.companyId === companyB.id), false);

    const lensB = await fetch(`${base}/api/companies/${companyB.id}/scores?lens=iic`, { headers: keyHeaders });
    const lensBBody = (await read(lensB)).json as Array<{ companyId: number; score: number; dimension: string; lensType: string }>;
    assert.equal(lensBBody.length, 1);
    assert.equal(lensBBody[0].companyId, companyB.id);
    assert.equal(lensBBody[0].score, 3);
    assert.equal(lensBBody[0].dimension, "market");

    const founderOnly = await fetch(`${base}/api/companies/${companyB.id}/scores?lens=founder`, { headers: keyHeaders });
    const founderOnlyBody = (await read(founderOnly)).json as Array<{ lensType: string; companyId: number }>;
    assert.equal(founderOnlyBody.length, 1);
    assert.equal(founderOnlyBody[0].lensType, "founder");
    assert.equal(founderOnlyBody[0].companyId, companyB.id);

    const otherLens = await fetch(`${base}/api/companies/${companyA.id}/scores?lens=founder`, { headers: keyHeaders });
    const otherLensBody = (await read(otherLens)).json;
    assert.deepEqual(otherLensBody, []);

    const allA = await fetch(`${base}/api/companies/${companyA.id}/scores`, { headers: keyHeaders });
    const allABody = (await read(allA)).json as Array<{ companyId: number }>;
    assert.equal(allABody.length, 2);
    assert.ok(allABody.every((row) => row.companyId === companyA.id));

    const founderPut = await fetch(`${base}/api/companies/${companyA.id}/founder-session`, {
      method: "PUT",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ evaluatorId: "spoofed-browser", architecture: "hybrid", stage: "seed" }),
    });
    const founderPutBody = (await read(founderPut)).json;
    assert.equal(founderPut.status, 200, JSON.stringify(founderPutBody));
    assert.equal(founderPutBody.evaluatorId, "ada");

    const founderGet = await fetch(
      `${base}/api/companies/${companyA.id}/founder-session?evaluatorId=spoofed-browser`,
      { headers: { cookie } },
    );
    const founderGetBody = (await read(founderGet)).json;
    assert.equal(founderGetBody.evaluatorId, "ada");
    assert.equal(founderGetBody.architecture, "hybrid");

    const logout = await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { cookie } });
    assert.equal(logout.status, 200);
    const after = await fetch(`${base}/api/companies`, { headers: { cookie } });
    assert.equal(after.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
