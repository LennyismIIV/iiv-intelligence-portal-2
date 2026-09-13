import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  type TapeBand,
  type TapeStatus,
  TAPE_STATUSES,
  ValuationTapeError,
  assertHumanApprover,
  assertNotContentStudioOwned,
  computeExpiresAt,
  encodeBands,
  expiredOrSupersededWarning,
  isPastExpiry,
  normalizeDraftedBy,
  parseBands,
  requireAsOf,
  todayUtcDate,
  approveTapeSchema,
  createDraftTapeSchema,
  updateDraftTapeSchema,
} from "@shared/valuationTape";

export interface ValuationTape {
  tapeId: string;
  asOf: string;
  expiresAt: string | null;
  status: TapeStatus;
  approverId: string | null;
  supersededBy: string | null;
  bands: TapeBand[];
  sourceNotes: string | null;
  draftedBy: string | null;
  versionedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CurrentTapeResult {
  tape: ValuationTape | null;
  warning?: string;
  overrideApplied?: boolean;
}

interface TapeRow {
  tape_id: string;
  as_of: string;
  expires_at: string | null;
  status: string;
  approver_id: string | null;
  superseded_by: string | null;
  bands: string | null;
  source_notes: string | null;
  drafted_by: string | null;
  versioned_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

function rowToTape(row: TapeRow): ValuationTape {
  return {
    tapeId: row.tape_id,
    asOf: row.as_of,
    expiresAt: row.expires_at,
    status: row.status as TapeStatus,
    approverId: row.approver_id,
    supersededBy: row.superseded_by,
    bands: parseBands(row.bands),
    sourceNotes: row.source_notes,
    draftedBy: row.drafted_by,
    versionedBy: row.versioned_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function pick(body: Record<string, unknown>, camel: string, snake: string): unknown {
  if (body[camel] !== undefined) return body[camel];
  return body[snake];
}

export function createValuationTapeService(sqlite: Database.Database) {
  const selectById = sqlite.prepare("SELECT * FROM valuation_tapes WHERE tape_id = ?");
  const selectAll = sqlite.prepare(`
    SELECT * FROM valuation_tapes
    ORDER BY
      CASE status
        WHEN 'approved' THEN 0
        WHEN 'draft' THEN 1
        WHEN 'superseded' THEN 2
        WHEN 'expired' THEN 3
        ELSE 4
      END,
      as_of DESC,
      created_at DESC
  `);
  const selectByStatus = sqlite.prepare(`
    SELECT * FROM valuation_tapes
    WHERE status = ?
    ORDER BY as_of DESC, created_at DESC
  `);
  const selectApproved = sqlite.prepare(`
    SELECT * FROM valuation_tapes
    WHERE status = 'approved'
    ORDER BY as_of DESC, updated_at DESC
  `);

  function getRaw(tapeId: string): TapeRow | undefined {
    return selectById.get(tapeId) as TapeRow | undefined;
  }

  function expireStale(today: string = todayUtcDate()): number {
    const result = sqlite.prepare(`
      UPDATE valuation_tapes
      SET status = 'expired', updated_at = CURRENT_TIMESTAMP
      WHERE status = 'approved'
        AND expires_at IS NOT NULL
        AND expires_at < ?
    `).run(today);
    return result.changes;
  }

  function list(status?: string): ValuationTape[] {
    expireStale();
    if (!status || status === "all") {
      return (selectAll.all() as TapeRow[]).map(rowToTape);
    }
    const statuses = status.split(",").map((s) => s.trim()).filter(Boolean);
    for (const s of statuses) {
      if (!(TAPE_STATUSES as readonly string[]).includes(s)) {
        throw new ValuationTapeError(`Invalid status '${s}'. Must be one of: ${TAPE_STATUSES.join(", ")}`, 400);
      }
    }
    const rows = statuses.length === 1
      ? (selectByStatus.all(statuses[0]) as TapeRow[])
      : (selectAll.all() as TapeRow[]).filter((r) => statuses.includes(r.status));
    return rows.map(rowToTape);
  }

  function get(tapeId: string): ValuationTape | undefined {
    expireStale();
    const row = getRaw(tapeId);
    return row ? rowToTape(row) : undefined;
  }

  function createDraft(body: Record<string, unknown>): ValuationTape {
    const parsed = createDraftTapeSchema.parse(body);
    const asOf = requireAsOf(
      parsed.as_of ?? parsed.asOf ?? pick(body, "asOf", "as_of"),
      "as_of is required to create a draft tape",
    );
    const draftedBy = normalizeDraftedBy(
      (parsed.drafted_by ?? parsed.draftedBy ?? pick(body, "draftedBy", "drafted_by")) as string | undefined,
    );
    const sourceNotes = (parsed.source_notes ?? parsed.sourceNotes ?? pick(body, "sourceNotes", "source_notes") ?? null) as string | null;
    const bands = parseBands(parsed.bands ?? body.bands ?? []);
    const tapeId = randomUUID();
    const expiresAt = computeExpiresAt(asOf);

    sqlite.prepare(`
      INSERT INTO valuation_tapes (
        tape_id, as_of, expires_at, status, bands, source_notes, drafted_by
      ) VALUES (?, ?, ?, 'draft', ?, ?, ?)
    `).run(tapeId, asOf, expiresAt, encodeBands(bands), sourceNotes, draftedBy);

    return get(tapeId)!;
  }

  function updateDraft(tapeId: string, body: Record<string, unknown>): ValuationTape {
    updateDraftTapeSchema.parse(body);
    const existing = getRaw(tapeId);
    if (!existing) throw new ValuationTapeError("Tape not found", 404);
    if (existing.status !== "draft") {
      throw new ValuationTapeError("Only draft tapes can be updated", 400);
    }

    const asOfRaw = pick(body, "asOf", "as_of");
    const asOf = asOfRaw !== undefined
      ? requireAsOf(asOfRaw, "as_of must be YYYY-MM-DD")
      : existing.as_of;
    const draftedRaw = pick(body, "draftedBy", "drafted_by");
    const draftedBy = draftedRaw !== undefined
      ? normalizeDraftedBy(draftedRaw as string)
      : existing.drafted_by;
    const notesRaw = pick(body, "sourceNotes", "source_notes");
    const sourceNotes = notesRaw !== undefined ? (notesRaw as string | null) : existing.source_notes;
    const bands = body.bands !== undefined ? parseBands(body.bands) : parseBands(existing.bands);
    const expiresAt = computeExpiresAt(asOf);

    sqlite.prepare(`
      UPDATE valuation_tapes
      SET as_of = ?, expires_at = ?, bands = ?, source_notes = ?, drafted_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE tape_id = ?
    `).run(asOf, expiresAt, encodeBands(bands), sourceNotes, draftedBy, tapeId);

    return get(tapeId)!;
  }

  function approve(tapeId: string, body: Record<string, unknown>): ValuationTape {
    const parsed = approveTapeSchema.parse(body ?? {});
    expireStale();

    const existing = getRaw(tapeId);
    if (!existing) throw new ValuationTapeError("Tape not found", 404);
    if (existing.status === "approved") {
      throw new ValuationTapeError("Tape is already approved", 400);
    }
    if (existing.status !== "draft") {
      throw new ValuationTapeError(`Cannot approve a ${existing.status} tape; create a new draft`, 400);
    }

    const asOf = requireAsOf(
      parsed.as_of ?? parsed.asOf ?? existing.as_of,
      "Cannot mark approved without as_of + approver_id",
    );
    const approverId = assertHumanApprover(parsed.approver_id ?? parsed.approverId);
    const versionedByRaw = (parsed.versioned_by ?? parsed.versionedBy ?? approverId) as string;
    const versionedBy = versionedByRaw.trim();
    assertNotContentStudioOwned(versionedBy, "versioned_by");
    const expiresAt = computeExpiresAt(asOf);

    const tx = sqlite.transaction(() => {
      const current = selectApproved.all() as TapeRow[];
      for (const prior of current) {
        if (prior.tape_id === tapeId) continue;
        sqlite.prepare(`
          UPDATE valuation_tapes
          SET status = 'superseded', superseded_by = ?, updated_at = CURRENT_TIMESTAMP
          WHERE tape_id = ? AND status = 'approved'
        `).run(tapeId, prior.tape_id);
      }
      sqlite.prepare(`
        UPDATE valuation_tapes
        SET status = 'approved',
            as_of = ?,
            expires_at = ?,
            approver_id = ?,
            versioned_by = ?,
            superseded_by = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE tape_id = ?
      `).run(asOf, expiresAt, approverId, versionedBy, tapeId);
    });
    tx();

    return get(tapeId)!;
  }

  /**
   * Current approved (non-expired) tape.
   * Passing tapeId selects that tape as current for the read:
   * expired/superseded require override=true and return a warning.
   */
  function getCurrentApprovedTape(opts: {
    tapeId?: string;
    override?: boolean;
    now?: string;
  } = {}): CurrentTapeResult {
    const today = opts.now ?? todayUtcDate();
    expireStale(today);

    if (opts.tapeId) {
      const row = getRaw(opts.tapeId);
      if (!row) throw new ValuationTapeError("Tape not found", 404);
      const tape = rowToTape(row);

      if (tape.status === "draft") {
        throw new ValuationTapeError("Draft tapes cannot be selected as current; approve first", 400);
      }

      const stale = tape.status === "expired" || tape.status === "superseded"
        || (tape.status === "approved" && isPastExpiry(tape.expiresAt, today));

      if (stale) {
        const statusForWarn: TapeStatus = tape.status === "approved" ? "expired" : tape.status;
        const warning = expiredOrSupersededWarning(statusForWarn);
        if (!opts.override) {
          throw new ValuationTapeError(warning, 409, {
            requiresOverride: true,
            warning,
            status: tape.status,
            tapeId: tape.tapeId,
          });
        }
        return { tape, warning, overrideApplied: true };
      }

      return { tape };
    }

    const current = selectApproved.get() as TapeRow | undefined;
    if (!current) return { tape: null };
    return { tape: rowToTape(current) };
  }

  return {
    expireStale,
    list,
    get,
    createDraft,
    updateDraft,
    approve,
    getCurrentApprovedTape,
  };
}

export type ValuationTapeService = ReturnType<typeof createValuationTapeService>;
