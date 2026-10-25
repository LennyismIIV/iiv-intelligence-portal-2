import { timingSafeEqual } from "node:crypto";
import type { Express, Request, RequestHandler } from "express";
import session from "express-session";
import createMemoryStore from "memorystore";
import { log } from "./log";
import { isApiPath } from "./httpGuards";

const MIN_SECRET_LENGTH = 8;
const SESSION_COOKIE = "iiv.sid";

export interface PortalUser {
  id: string;
  name: string;
  password: string;
}

export interface AuthConfig {
  secret: string;
  sessionSecret: string;
  users: PortalUser[];
  loginMode: "shared" | "users";
}

export interface AuthUser {
  id: string;
  name: string;
  method: "session" | "api-key";
}

declare module "express-session" {
  interface SessionData {
    user?: { id: string; name: string };
  }
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const secret = (env.IIV_AUTH_SECRET ?? "").trim();
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `IIV_AUTH_SECRET is required (at least ${MIN_SECRET_LENGTH} characters). ` +
        "Set it in the environment or in .env before starting the portal. " +
        "On Render, add it under the service Environment tab before deploying this version. " +
        "The process will not boot while it is missing, so the API is never left open.",
    );
  }
  const sessionSecret = (env.IIV_SESSION_SECRET ?? "").trim() || secret;
  const users = parseUsers(env.IIV_USERS);
  return {
    secret,
    sessionSecret,
    users,
    loginMode: users.length > 0 ? "users" : "shared",
  };
}

export function parseUsers(raw: string | undefined): PortalUser[] {
  if (!raw || !raw.trim()) return [];
  const users: PortalUser[] = [];
  for (const part of raw.split(",")) {
    const entry = part.trim();
    if (!entry) continue;
    const colon = entry.indexOf(":");
    if (colon <= 0 || colon === entry.length - 1) {
      throw new Error('IIV_USERS entries must be username:password, separated by commas');
    }
    const id = entry.slice(0, colon).trim();
    const password = entry.slice(colon + 1);
    if (!/^[A-Za-z0-9._@+-]{1,64}$/.test(id)) {
      throw new Error(
        `IIV_USERS username "${id}" must be 1–64 characters (letters, numbers, . _ @ + -)`,
      );
    }
    if (password.length < MIN_SECRET_LENGTH) {
      throw new Error(`IIV_USERS password for "${id}" must be at least ${MIN_SECRET_LENGTH} characters`);
    }
    users.push({ id, name: id, password });
  }
  const ids = new Set(users.map((u) => u.id));
  if (ids.size !== users.length) {
    throw new Error("IIV_USERS usernames must be unique");
  }
  return users;
}

export type LoginResult =
  | { ok: true; user: { id: string; name: string } }
  | { ok: false; status: number; message: string };

export function authenticateLogin(config: AuthConfig, body: unknown): LoginResult {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const password = typeof record.password === "string" ? record.password : "";
  const username = typeof record.username === "string" ? record.username.trim() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";

  if (config.users.length > 0) {
    const user = config.users.find((u) => u.id === username);
    if (!user || !password || !safeEqual(password, user.password)) {
      return { ok: false, status: 401, message: "Invalid username or password" };
    }
    return { ok: true, user: { id: user.id, name: user.name } };
  }

  const display = name || username;
  if (!display) {
    return { ok: false, status: 400, message: "Name is required" };
  }
  if (display.length > 80 || /[\u0000-\u001F]/.test(display)) {
    return { ok: false, status: 400, message: "Name must be 1–80 characters" };
  }
  if (!password || !safeEqual(password, config.secret)) {
    return { ok: false, status: 401, message: "Invalid password" };
  }
  return { ok: true, user: { id: display, name: display } };
}

function presentedApiKey(req: Request): string | null {
  const headerKey = req.get("x-api-key");
  if (headerKey != null && headerKey !== "") return headerKey.trim();
  const auth = req.get("authorization");
  if (!auth) return null;
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return match ? match[1].trim() : null;
}

function isPublicApiRoute(method: string, path: string): boolean {
  const normalized = path.split("?")[0].replace(/\/+$/, "") || "/";
  const verb = method.toLowerCase();
  if (verb === "get" && normalized === "/api/auth/me") return true;
  if (verb === "post" && (normalized === "/api/auth/login" || normalized === "/api/auth/logout")) return true;
  return false;
}

/**
 * Session logins are pinned to the authenticated user when the caller supplied
 * an evaluator id. A blank id stays blank so legacy IIC inserts (no evaluatorId,
 * append-only) are not switched onto the upsert path.
 * API-key callers keep the id they send.
 */
export function pinEvaluatorIfPresent(req: Request, supplied: unknown): string | null {
  const given = typeof supplied === "string" ? supplied.trim() : "";
  if (req.authUser?.method === "session") {
    return given ? req.authUser.id : null;
  }
  return given || null;
}

/**
 * Record the signed-in user on a write. API-key callers keep the supplied id,
 * or `fallback` when they omit it (existing "team" defaults).
 */
export function actorId(req: Request, supplied: unknown, fallback: string | null = null): string | null {
  if (req.authUser?.method === "session") return req.authUser.id;
  if (typeof supplied === "string" && supplied.trim()) return supplied.trim();
  return fallback;
}

function guardApiVerbs(app: Express, requireAuth: RequestHandler): void {
  const verbs = ["get", "post", "put", "patch", "delete"] as const;
  for (const verb of verbs) {
    const original = app[verb].bind(app) as (...args: unknown[]) => unknown;
    (app as unknown as Record<string, (...args: unknown[]) => unknown>)[verb] = (...args: unknown[]) => {
      if (verb === "get" && args.length === 1) return original(...args);
      const path = args[0];
      if (typeof path === "string" && isApiPath(path) && !isPublicApiRoute(verb, path)) {
        return original(path, requireAuth, ...args.slice(1));
      }
      return original(...args);
    };
  }
}

export function installAuth(app: Express): AuthConfig {
  const config = loadAuthConfig();
  app.set("trust proxy", 1);

  const MemoryStore = createMemoryStore(session);
  app.use(
    session({
      name: SESSION_COOKIE,
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: new MemoryStore({ checkPeriod: 86_400_000 }),
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: "auto",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/",
      },
    }),
  );

  const requireAuth: RequestHandler = (req, res, next) => {
    const sessionUser = req.session?.user;
    if (sessionUser && typeof sessionUser.id === "string" && sessionUser.id) {
      req.authUser = {
        id: sessionUser.id,
        name: sessionUser.name || sessionUser.id,
        method: "session",
      };
      next();
      return;
    }
    const presented = presentedApiKey(req);
    if (presented && safeEqual(presented, config.secret)) {
      req.authUser = { id: "api-key", name: "API key", method: "api-key" };
      next();
      return;
    }
    res.status(401).json({ message: "Authentication required" });
  };

  // Patch verb helpers before any /api route is registered so every later
  // GET/POST/PATCH/PUT/DELETE on /api requires a session or API key.
  // Unmatched /api paths never enter those handlers and fall through to the
  // JSON 404 mounted at the end of registerRoutes.
  guardApiVerbs(app, requireAuth);

  app.get("/api/auth/me", (req, res) => {
    const user = req.session.user ?? null;
    res.json({ user, login: { mode: config.loginMode } });
  });

  app.post("/api/auth/login", (req, res) => {
    const result = authenticateLogin(config, req.body);
    if (!result.ok) {
      res.status(result.status).json({ message: result.message });
      return;
    }
    const user = result.user;
    req.session.regenerate((err) => {
      if (err) {
        res.status(500).json({ message: "Could not start session" });
        return;
      }
      req.session.user = user;
      req.session.save((saveErr) => {
        if (saveErr) {
          res.status(500).json({ message: "Could not start session" });
          return;
        }
        res.json({ user });
      });
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    const finish = () => {
      res.clearCookie(SESSION_COOKIE, { path: "/" });
      res.json({ user: null });
    };
    if (!req.session) {
      finish();
      return;
    }
    req.session.destroy((err) => {
      if (err) {
        res.status(500).json({ message: "Could not end session" });
        return;
      }
      finish();
    });
  });

  const who = config.loginMode === "users" ? `${config.users.length} named user(s)` : "shared password";
  log(`Portal auth enabled (${who} + API key).`);
  return config;
}

export function sessionActor(req: Request): { id: string; name: string } | null {
  if (req.authUser?.method === "session") {
    return { id: req.authUser.id, name: req.authUser.name };
  }
  return null;
}
