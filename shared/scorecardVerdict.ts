/**
 * P3.6 IIV verdict edition — INVEST | WATCH | PASS | PENDING + blockers.
 *
 * Blockers come from Portal Findings / Gates / DimensionFloors when those
 * ledgers have rows. If they are absent, export shows explicit [GAP] flags
 * instead of inventing blockers. Open critical Findings (and the existing
 * Portal INVEST gate: high findings, failed Gates, open G2) block INVEST.
 */

/** Mirror of schema FINDING_TERMINAL_STATUSES — kept local to avoid a circular import. */
const FINDING_TERMINAL_STATUSES = [
  "verified-incorporated",
  "verified-immaterial",
  "rebutted",
  "rejected",
] as const;

export const IIV_VERDICTS = ["INVEST", "WATCH", "PASS", "PENDING"] as const;
export type IivVerdict = (typeof IIV_VERDICTS)[number];

export const IIV_VERDICT_LABELS: Record<IivVerdict, string> = {
  INVEST: "INVEST",
  WATCH: "WATCH",
  PASS: "PASS",
  PENDING: "PENDING",
};

export const DEFAULT_IIV_VERDICT: IivVerdict = "PENDING";

export const IIV_SCORECARD_BRAND = "IIV" as const;
export const IIV_SCORECARD_EDITION = "IIV" as const;
export const IIV_SCORECARD_FORMAT = "iiv-verdict-scorecard-v1" as const;
export const IIV_PRODUCT_TITLE = "IIV Verdict Scorecard";

export const FORBIDDEN_IIV_EDITION_TERMS = [
  "Greenbook",
  "Map B",
  "Instrument B",
  "CEO Reclassification",
  "Implication Trifecta",
] as const;

export type IivBlockerKind =
  | "critical_finding"
  | "high_finding"
  | "failed_gate"
  | "open_gate"
  | "dimension_floor"
  | "gap";

export type IivBlockerSeverity = "block" | "warn" | "gap";

export interface IivBlocker {
  kind: IivBlockerKind;
  code: string;
  severity: IivBlockerSeverity;
  label: string;
  detail: string;
}

export interface IivFindingInput {
  id: number;
  findingText: string;
  severity: string;
  status: string;
}

export interface IivGateInput {
  gateId: string;
  status: string;
}

export interface IivFloorInput {
  id?: number;
  lensType: string;
  dimension: string;
  cappedAt: number;
  reason: string;
}

export interface IivDecisionInput {
  findings: IivFindingInput[];
  gates: IivGateInput[];
  dimensionFloors: IivFloorInput[];
}

export interface IivBlockerResult {
  ledgerPresent: boolean;
  findingsPresent: boolean;
  gatesPresent: boolean;
  floorsPresent: boolean;
  blockers: IivBlocker[];
  gaps: IivBlocker[];
  investHardBlocked: boolean;
  investBlockedBy: IivBlocker[];
}

export class IivVerdictError extends Error {
  statusCode: number;
  extras: Record<string, unknown>;

  constructor(message: string, statusCode = 400, extras: Record<string, unknown> = {}) {
    super(message);
    this.name = "IivVerdictError";
    this.statusCode = statusCode;
    this.extras = extras;
  }
}

export function isIivVerdict(value: unknown): value is IivVerdict {
  return typeof value === "string" && (IIV_VERDICTS as readonly string[]).includes(value);
}

export function parseIivVerdict(value: unknown): IivVerdict {
  if (value == null || value === "") return DEFAULT_IIV_VERDICT;
  if (!isIivVerdict(value)) {
    throw new IivVerdictError(
      `Verdict must be one of: ${IIV_VERDICTS.join(" | ")}`,
      400,
    );
  }
  return value;
}

export function normalizeStoredVerdict(value: unknown): IivVerdict {
  try {
    return parseIivVerdict(value);
  } catch {
    return DEFAULT_IIV_VERDICT;
  }
}

function isOpenFinding(status: string): boolean {
  return !(FINDING_TERMINAL_STATUSES as readonly string[]).includes(status);
}

/**
 * Collect display blockers from Portal ledgers. Never invents Findings /
 * Gates / floors when those tables have no rows for the company.
 */
export function collectIivBlockers(
  decision: IivDecisionInput | null | undefined,
): IivBlockerResult {
  const findings = decision?.findings ?? [];
  const gates = decision?.gates ?? [];
  const floors = decision?.dimensionFloors ?? [];
  const findingsPresent = findings.length > 0;
  const gatesPresent = gates.length > 0;
  const floorsPresent = floors.length > 0;
  const ledgerPresent = findingsPresent || gatesPresent || floorsPresent;

  const blockers: IivBlocker[] = [];
  const gaps: IivBlocker[] = [];

  if (!findingsPresent) {
    gaps.push({
      kind: "gap",
      code: "findings_absent",
      severity: "gap",
      label: "Findings",
      detail: "No Findings recorded in Portal — blockers not assessed",
    });
  } else {
    for (const finding of findings) {
      if (!isOpenFinding(finding.status)) continue;
      if (finding.severity === "critical") {
        blockers.push({
          kind: "critical_finding",
          code: `finding_${finding.id}`,
          severity: "block",
          label: "Open critical Finding",
          detail: finding.findingText,
        });
      } else if (finding.severity === "high") {
        blockers.push({
          kind: "high_finding",
          code: `finding_${finding.id}`,
          severity: "block",
          label: "Open high Finding",
          detail: finding.findingText,
        });
      }
    }
  }

  if (!gatesPresent) {
    gaps.push({
      kind: "gap",
      code: "gates_absent",
      severity: "gap",
      label: "Gates",
      detail: "No Gates recorded in Portal — blockers not assessed",
    });
  } else {
    for (const gate of gates) {
      if (gate.status === "failed") {
        blockers.push({
          kind: "failed_gate",
          code: `gate_${gate.gateId}`,
          severity: "block",
          label: `Failed gate ${gate.gateId}`,
          detail: `Gate ${gate.gateId} is failed`,
        });
      } else if (gate.status === "open" && gate.gateId === "G2") {
        blockers.push({
          kind: "open_gate",
          code: `gate_${gate.gateId}_open`,
          severity: "block",
          label: "Open G2 gate",
          detail: "G2 (final IC gate) is still open",
        });
      }
    }
  }

  if (!floorsPresent) {
    gaps.push({
      kind: "gap",
      code: "floors_absent",
      severity: "gap",
      label: "DimensionFloors",
      detail: "No DimensionFloors recorded in Portal — blockers not assessed",
    });
  } else {
    for (const floor of floors) {
      blockers.push({
        kind: "dimension_floor",
        code: `floor_${floor.lensType}_${floor.dimension}${floor.id != null ? `_${floor.id}` : ""}`,
        severity: "warn",
        label: `DimensionFloor ${floor.lensType}/${floor.dimension}`,
        detail: `Capped at ${floor.cappedAt}: ${floor.reason}`,
      });
    }
  }

  const investBlockedBy = blockers.filter((b) => b.severity === "block");
  return {
    ledgerPresent,
    findingsPresent,
    gatesPresent,
    floorsPresent,
    blockers,
    gaps,
    investHardBlocked: investBlockedBy.length > 0,
    investBlockedBy,
  };
}

export function assertIivVerdictWritable(
  verdict: IivVerdict,
  decision: IivDecisionInput | null | undefined,
): IivBlockerResult {
  const result = collectIivBlockers(decision);
  if (verdict === "INVEST" && result.investHardBlocked) {
    throw new IivVerdictError(
      "INVEST verdict is blocked. Open critical/high Findings, failed Gates, or an open G2 must be dispositioned first.",
      409,
      {
        verdict,
        blockers: result.investBlockedBy,
        canWriteInvestVerdict: false,
      },
    );
  }
  return result;
}

/** Avoid a circular import of schema.ts FINDING_TERMINAL_STATUSES in some test loads. */
export function isTerminalFindingStatus(status: string): boolean {
  return (FINDING_TERMINAL_STATUSES as readonly string[]).includes(status);
}
