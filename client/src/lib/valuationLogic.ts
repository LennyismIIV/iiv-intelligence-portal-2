/**
 * Valuation lens \u2014 band recommendation logic.
 *
 * Design principle (per user brief): forces judgment calls to be EXPLICIT.
 * The tool recommends a band from positioning sliders + hard doctrine rules,
 * and the judge can override \u2014 but an override requires a written reason.
 */

import type { BandKey, CategoryKey } from "./valuationBands";

/**
 * Inputs the judge provides in the Valuation lens.
 * All optional except positioning axes; if numbers are missing, we degrade gracefully.
 */
export interface ValuationInputs {
  // Positioning \u2014 two-axis doctrine map (0\u201310 sliders).
  dataUniqueness: number;      // 0 = commodity/public data \u2192 10 = proprietary/exclusive/contractual
  integrationDepth: number;    // 0 = thin interface \u2192 10 = embedded workflow + governance + switching costs
  // Category the judge selected (drives which sub-bands apply).
  category: CategoryKey | null;
  // Financials (typically pulled from company record, overridable in the lens).
  arrUsd?: number | null;
  ebitdaUsd?: number | null;
  revenueGrowthPct?: number | null;
  fcfMarginPct?: number | null;
  fundingStage?: string | null;
  // Explicit "public path" flag \u2014 only meaningful for data providers.
  isPublicPath?: boolean;
  // Doctrine flags (checkboxes in the UI).
  hasProprietaryData?: boolean;    // \u2192 promotes AI-First to top tier
  hasRealIp?: boolean;             // \u2192 required alongside proprietary data for top tier
  aiIsLoadBearing?: boolean;       // \u2192 keeps Legacy SaaS + AI in the overlay band, not the "no AI" band
  isFrontierAdjacent?: boolean;    // \u2192 HITL strategic vs legacy
}

/**
 * Output of the recommender.
 * `hard`: whether a doctrine rule forced this band (i.e. sliders alone would have chosen differently).
 * `rationale`: human-readable explanation of the choice, shown in the UI.
 */
export interface BandRecommendation {
  band: BandKey;
  hard: boolean;
  rationale: string;
  softerAlternative?: BandKey;   // the band sliders alone would have chosen, if a hard rule overrode it
}

/**
 * Derived Rule-of-40 helper. Returns null if either input is missing.
 */
export function ruleOf40(growthPct?: number | null, fcfMarginPct?: number | null): number | null {
  if (growthPct == null || fcfMarginPct == null) return null;
  if (!Number.isFinite(growthPct) || !Number.isFinite(fcfMarginPct)) return null;
  return growthPct + fcfMarginPct;
}

/**
 * The core recommender. Returns the band the lens should default to given
 * category + positioning + doctrine flags. Judge can override with a reason.
 */
export function recommendBand(inputs: ValuationInputs): BandRecommendation | null {
  const { category, dataUniqueness, integrationDepth } = inputs;
  if (!category) return null;

  // Positioning score \u2014 average of the two axes, 0\u201310.
  const positioning = (dataUniqueness + integrationDepth) / 2;

  // -------------------------------------------------------------------------
  // Category: AI-First
  // -------------------------------------------------------------------------
  if (category === "ai_first") {
    // HARD RULE 1: proprietary data + real IP \u2192 top tier (25\u201340x)
    if (inputs.hasProprietaryData && inputs.hasRealIp) {
      return {
        band: "ai_first_proprietary_ip",
        hard: true,
        rationale:
          "Doctrine rule: proprietary data + real IP flags both set \u2192 top-tier AI-First band (25\u201340x EV/Rev). If either flag is aspirational rather than provable, downgrade to defensible band.",
      };
    }
    // HARD RULE 2: Low data uniqueness (<4) \u2192 forced into wrapper band regardless of AI story
    if (dataUniqueness < 4) {
      return {
        band: "ai_wrappers",
        hard: true,
        rationale:
          "Doctrine rule: Data Uniqueness below 4/10 = no data moat. AI wrappers with no data moat get 3\u20138x EV/Rev regardless of category label (Iconic 2026). Override with reason if you disagree.",
        softerAlternative: "ai_first_defensible",
      };
    }
    // Otherwise defensible AI-First.
    return {
      band: "ai_first_defensible",
      hard: false,
      rationale:
        "Positioning consistent with defensible AI-First (10\u201318x EV/Rev). Check the proprietary-data + real-IP flags if the company qualifies for the top-tier band.",
    };
  }

  // -------------------------------------------------------------------------
  // Category: Legacy SaaS + AI
  // -------------------------------------------------------------------------
  if (category === "legacy_saas") {
    // HARD RULE: sub-10% growth SaaS \u2192 no-AI band regardless of AI story
    if (inputs.revenueGrowthPct != null && inputs.revenueGrowthPct < 10) {
      return {
        band: "legacy_saas_no_ai",
        hard: true,
        rationale:
          "Doctrine rule: revenue growth below 10% \u2192 SaaS Capital sub-10% band (median 1.9x EV/Rev). AI story does not clear this floor.",
        softerAlternative: "legacy_saas_ai_overlay",
      };
    }
    // Load-bearing AI \u2192 overlay band; otherwise "no AI" band
    if (inputs.aiIsLoadBearing) {
      return {
        band: "legacy_saas_ai_overlay",
        hard: false,
        rationale:
          "AI is load-bearing \u2192 AI-Enabled SaaS band (M&A 7.0x, VC 8.5x). Mid-tier premium, not top-tier.",
      };
    }
    return {
      band: "legacy_saas_no_ai",
      hard: false,
      rationale:
        "AI is not load-bearing \u2192 priced as Legacy SaaS (3\u20134x EV/Rev, 10\u201314x EBITDA). 80% of public SaaS below 5x NTM revenue.",
    };
  }

  // -------------------------------------------------------------------------
  // Category: HITL
  // -------------------------------------------------------------------------
  if (category === "hitl") {
    if (inputs.isFrontierAdjacent) {
      return {
        band: "hitl_strategic",
        hard: false,
        rationale:
          "Frontier-lab-adjacent HITL infrastructure \u2192 strategic band (5\u201315x Rev). Only pay 20x+ if you are a frontier-lab strategic buyer (Scale is a strategic-buyer ceiling, not a comp).",
      };
    }
    return {
      band: "hitl_legacy_labeling",
      hard: false,
      rationale:
        "Not frontier-adjacent \u2192 legacy labeling band (1\u20133x Rev, 4\u20138x EBITDA). Priced closer to IT services / BPO.",
    };
  }

  // -------------------------------------------------------------------------
  // Category: Data Provider
  // -------------------------------------------------------------------------
  if (category === "data_provider") {
    if (inputs.isPublicPath) {
      return {
        band: "data_provider_public",
        hard: false,
        rationale:
          "Public-quality data provider \u2192 10\u201315x EV/Rev, 15\u201325x EBITDA (MSCI/Moody's/S&P tier). FactSet ~10x EBITDA is a useful floor.",
      };
    }
    return {
      band: "data_provider_take_private",
      hard: false,
      rationale:
        "Take-private / non-public data provider \u2192 3\u20136x EV/Rev, 6\u201310x EBITDA (Nielsen 2022 8.0x, Kantar 2019 8.2x). This is what public\u2192private reclassification costs.",
    };
  }

  // -------------------------------------------------------------------------
  // Category: Pure Services
  // -------------------------------------------------------------------------
  if (category === "pure_services") {
    // HARD RULE: low data uniqueness + shallow integration = commodity services floor
    if (positioning < 4) {
      return {
        band: "pure_services",
        hard: true,
        rationale:
          "Doctrine rule: average positioning below 4/10 \u2192 commodity services floor (0.5\u20131.5x Rev, 4\u20138x EBITDA). Ipsos live tape confirms this is the market's verdict on pure MR.",
      };
    }
    // High positioning + real data asset = reclassification ceiling
    if (positioning >= 7 && dataUniqueness >= 7) {
      return {
        band: "services_data_asset",
        hard: false,
        rationale:
          "Services + real data asset \u2192 12\u201318x EBITDA (Fractal, Collingwood Information best assets, DI full-DI band). This is the doctrine's reclassification ceiling.",
      };
    }
    // Mid-positioning = specialization band
    return {
      band: "services_specialization",
      hard: false,
      rationale:
        "Services + specialization \u2192 8\u201312x EBITDA (Kantar 2019 8.2x, PE middle market 11.4x, IT services 10-year median 10.4x). Anything above ~12x needs to prove why it is not IT services.",
    };
  }

  return null;
}

/**
 * Given a company's ARR + EBITDA + a band, produce low/point/high valuation ranges
 * for both M&A and VC (where the band has VC comps).
 */
export interface ValuationEstimate {
  metric: "revenue" | "ebitda";
  low: number;
  point: number;
  high: number;
  multipleLow: number;
  multiplePoint: number;
  multipleHigh: number;
  note?: string;
}

export function computeEstimate(
  arrUsd: number | null | undefined,
  ebitdaUsd: number | null | undefined,
  multipleLow: number,
  multipleHigh: number,
  metric: "revenue" | "ebitda",
  note?: string,
): ValuationEstimate | null {
  const base = metric === "revenue" ? arrUsd : ebitdaUsd;
  if (base == null || !Number.isFinite(base)) return null;
  // EBITDA can legitimately be negative; ARR should not be.
  if (metric === "revenue" && base <= 0) return null;
  if (metric === "ebitda" && base <= 0) return null; // negative EBITDA => multiples not meaningful
  const point = (multipleLow + multipleHigh) / 2;
  return {
    metric,
    low: base * multipleLow,
    point: base * point,
    high: base * multipleHigh,
    multipleLow,
    multiplePoint: point,
    multipleHigh,
    note,
  };
}

/**
 * Format $ range compactly ($1.2M, $850K, $2.4B).
 */
export function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return "\u2014";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
