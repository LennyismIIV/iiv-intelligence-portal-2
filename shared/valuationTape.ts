import { z } from "zod";

/**
 * P3.2 ValuationTape — dated comps tape with draft → approve → supersede/expire.
 * Portal-owned (Signal Desk drafts; Leonard approves). Never Content Studio–owned.
 * Never bot-approved. Leonard-only is ops policy; the API requires a human approver_id
 * string and does not default one.
 */

export const TAPE_STATUSES = ["draft", "approved", "expired", "superseded"] as const;
export type TapeStatus = (typeof TAPE_STATUSES)[number];

export const TAPE_GRACE_DAYS_MAX = 7;
export const DEFAULT_DRAFTED_BY = "Signal Desk";

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class ValuationTapeError extends Error {
  statusCode: number;
  extras: Record<string, unknown>;

  constructor(message: string, statusCode = 400, extras: Record<string, unknown> = {}) {
    super(message);
    this.name = "ValuationTapeError";
    this.statusCode = statusCode;
    this.extras = extras;
  }
}

const tripleSchema = z.object({
  low: z.number(),
  median: z.number().optional(),
  high: z.number(),
});

export const tapeBandSchema = z.object({
  bandId: z.string().min(1).optional(),
  band_id: z.string().min(1).optional(),
  maRev: tripleSchema.optional(),
  ma_rev: tripleSchema.optional(),
  maEbitda: tripleSchema.optional(),
  ma_ebitda: tripleSchema.optional(),
  vcRev: tripleSchema.optional(),
  vc_rev: tripleSchema.optional(),
  sourceUrls: z.array(z.string()).optional(),
  source_urls: z.array(z.string()).optional(),
}).transform((b) => {
  const bandId = (b.band_id ?? b.bandId ?? "").trim();
  if (!bandId) {
    throw new ValuationTapeError("each band requires band_id", 400);
  }
  return {
    bandId,
    maRev: b.ma_rev ?? b.maRev,
    maEbitda: b.ma_ebitda ?? b.maEbitda,
    vcRev: b.vc_rev ?? b.vcRev,
    sourceUrls: b.source_urls ?? b.sourceUrls ?? [],
  };
});

export type TapeBand = z.infer<typeof tapeBandSchema>;

const isoDate = z.string().regex(ISO_DATE_RE, "must be YYYY-MM-DD");

export const createDraftTapeSchema = z.object({
  asOf: isoDate.optional(),
  as_of: isoDate.optional(),
  bands: z.array(z.unknown()).optional(),
  sourceNotes: z.string().nullable().optional(),
  source_notes: z.string().nullable().optional(),
  draftedBy: z.string().nullable().optional(),
  drafted_by: z.string().nullable().optional(),
});

export const updateDraftTapeSchema = createDraftTapeSchema;

export const approveTapeSchema = z.object({
  approverId: z.string().optional(),
  approver_id: z.string().optional(),
  asOf: isoDate.optional(),
  as_of: isoDate.optional(),
  versionedBy: z.string().optional(),
  versioned_by: z.string().optional(),
});

export const VALUATION_TAPE_CREATE_SQL = `
  CREATE TABLE IF NOT EXISTS valuation_tapes (
    tape_id TEXT PRIMARY KEY,
    as_of TEXT NOT NULL,
    expires_at TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    approver_id TEXT,
    superseded_by TEXT,
    bands TEXT,
    source_notes TEXT,
    drafted_by TEXT,
    versioned_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS valuation_tapes_status_idx
    ON valuation_tapes(status);
  CREATE INDEX IF NOT EXISTS valuation_tapes_as_of_idx
    ON valuation_tapes(as_of DESC);
`;

const BLOCKED_APPROVERS = new Set([
  "bot",
  "auto",
  "system",
  "auto-approve",
  "autoapprove",
  "auto_approve",
  "content studio",
  "content_studio",
  "content-studio",
  "signal-bot",
  "ai",
  "assistant",
]);

export function todayUtcDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * expires_at = last calendar day of as_of's month + ≤7 days grace (D2 locked at 7).
 * Example: as_of 2026-08-15 → month end 2026-08-31 → +7d → 2026-09-07.
 */
export function computeExpiresAt(asOf: string, graceDays: number = TAPE_GRACE_DAYS_MAX): string {
  if (!ISO_DATE_RE.test(asOf)) {
    throw new ValuationTapeError("as_of must be YYYY-MM-DD", 400);
  }
  if (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > TAPE_GRACE_DAYS_MAX) {
    throw new ValuationTapeError(
      `grace days must be 0–${TAPE_GRACE_DAYS_MAX} (D2 locked)`,
      400,
    );
  }
  const [year, month] = asOf.split("-").map(Number);
  const endOfMonth = new Date(Date.UTC(year, month, 0));
  endOfMonth.setUTCDate(endOfMonth.getUTCDate() + graceDays);
  return endOfMonth.toISOString().slice(0, 10);
}

export function isPastExpiry(expiresAt: string | null | undefined, today: string = todayUtcDate()): boolean {
  if (!expiresAt) return false;
  return expiresAt < today;
}

export function assertNotContentStudioOwned(value: string | null | undefined, field: string): void {
  if (value && /content\s*studio/i.test(value)) {
    throw new ValuationTapeError(
      `${field} cannot be Content Studio — ValuationTape is not Content Studio–owned`,
      400,
    );
  }
}

export function assertHumanApprover(approverId: unknown): string {
  if (typeof approverId !== "string" || !approverId.trim()) {
    throw new ValuationTapeError("Cannot mark approved without as_of + approver_id", 400);
  }
  const trimmed = approverId.trim();
  const normalized = trimmed.toLowerCase();
  if (
    BLOCKED_APPROVERS.has(normalized)
    || /^(bot|auto)[-_:]/i.test(trimmed)
    || /(?:^|[^a-z])bot(?:[^a-z]|$)/i.test(normalized)
  ) {
    throw new ValuationTapeError("approver_id must be a human; bot approval is not allowed", 400);
  }
  assertNotContentStudioOwned(trimmed, "approver_id");
  return trimmed;
}

export function normalizeDraftedBy(value: string | null | undefined): string {
  const draftedBy = (value ?? DEFAULT_DRAFTED_BY).trim() || DEFAULT_DRAFTED_BY;
  assertNotContentStudioOwned(draftedBy, "drafted_by");
  return draftedBy;
}

export function parseBands(input: unknown): TapeBand[] {
  if (input == null) return [];
  if (typeof input === "string") {
    if (!input.trim()) return [];
    try {
      input = JSON.parse(input);
    } catch {
      throw new ValuationTapeError("bands must be valid JSON", 400);
    }
  }
  if (!Array.isArray(input)) {
    throw new ValuationTapeError("bands must be an array", 400);
  }
  return input.map((row, i) => {
    const parsed = tapeBandSchema.safeParse(row);
    if (!parsed.success) {
      throw new ValuationTapeError(`invalid band at index ${i}: ${parsed.error.message}`, 400);
    }
    return parsed.data;
  });
}

export function encodeBands(bands: TapeBand[]): string {
  return JSON.stringify(bands.map((b) => ({
    band_id: b.bandId,
    ma_rev: b.maRev,
    ma_ebitda: b.maEbitda,
    vc_rev: b.vcRev,
    source_urls: b.sourceUrls ?? [],
  })));
}

export function requireAsOf(value: unknown, message = "Cannot mark approved without as_of + approver_id"): string {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) {
    throw new ValuationTapeError(message, 400);
  }
  return value;
}

export function expiredOrSupersededWarning(status: TapeStatus): string {
  return `Tape is ${status} and cannot be selected as current without an explicit override.`;
}
