/**
 * VALUATION BANDS \u2014 Aug 2026 Cross-Category Benchmarks
 *
 * SOURCE OF TRUTH: /uploaded_attachments/98d37cd876244394b2881a9b22e10262/Comprehensive-Valuation-Benchmarks-Five-Categories-2026-1.docx
 * Prepared: August 2026. Refresh quarterly.
 *
 * Every multiple below is quoted VERBATIM from that document. The Valuation lens
 * renders these as the "live tape" \u2014 the judge sees the exact bands, medians,
 * and sources. Do not paraphrase or round; keep the doc's language.
 *
 * The band structure is designed so the recommended-band logic (hard doctrine
 * rules) can promote or penalize a company \u2014 e.g. an AI-First candidate with
 * no proprietary data drops to the "AI wrappers" sub-band; a Data Provider on
 * a take-private path uses the take-private sub-band instead of the public tier.
 */

export type BandKey =
  | "ai_first_defensible"
  | "ai_first_proprietary_ip"
  | "ai_wrappers"
  | "legacy_saas_ai_overlay"
  | "legacy_saas_no_ai"
  | "hitl_strategic"
  | "hitl_legacy_labeling"
  | "data_provider_public"
  | "data_provider_take_private"
  | "pure_services"
  | "services_specialization"
  | "services_data_asset";

export type CategoryKey = "ai_first" | "legacy_saas" | "hitl" | "data_provider" | "pure_services";

export interface Band {
  key: BandKey;
  label: string;
  category: CategoryKey;
  categoryLabel: string;
  /** Preferred multiple type for this band \u2014 drives which input the lens uses. */
  preferredMetric: "revenue" | "ebitda" | "both";
  /** M&A anchor bands \u2014 the doc's cross-category summary uses these as the reference. */
  ma: {
    evRevenue?: { low: number; high: number; note?: string };
    evEbitda?: { low: number; high: number; note?: string };
  };
  /** VC minority-round multiples where the doc provides them; else undefined. */
  vc?: {
    evRevenue?: { low: number; high: number; note?: string };
  };
  /** One-line doctrine read for this band. */
  doctrineRead: string;
  /** Primary source citations \u2014 shown next to the numbers in the UI. */
  sources: Array<{ label: string; url: string }>;
}

export const VALUATION_BANDS: Record<BandKey, Band> = {
  ai_first_defensible: {
    key: "ai_first_defensible",
    label: "AI-First (defensible)",
    category: "ai_first",
    categoryLabel: "AI-First (AI-Native)",
    preferredMetric: "revenue",
    ma: { evRevenue: { low: 10, high: 18, note: "M&A anchor" } },
    vc: { evRevenue: { low: 15, high: 25, note: "VC minority; Series A peak ~17.3x" } },
    doctrineRead:
      "Defensible AI-Native with real product-market fit but not yet at 'proprietary data + IP' tier. Series A is the peak stage (17.3x median). If the comp set is only Strategic Anchors and LLM Vendors, you're underwriting an option, not a business.",
    sources: [
      { label: "Finro Q2 2026 AI M&A dataset", url: "https://www.finrofca.com/news/ai-ma-multiples-by-funding-stage-q2-2026" },
      { label: "Ryan Allis, AI Software Valuation Report 2026", url: "https://www.linkedin.com/pulse/ai-software-valuation-report-2026-ryan-allis-cbehe" },
      { label: "Windsor Drake AI Valuations Q2 2026", url: "https://windsordrake.com/market-intelligence/reports/ai-valuations-q2-2026" },
    ],
  },
  ai_first_proprietary_ip: {
    key: "ai_first_proprietary_ip",
    label: "AI-First \u2014 proprietary data + real IP (top tier)",
    category: "ai_first",
    categoryLabel: "AI-First (AI-Native)",
    preferredMetric: "revenue",
    ma: { evRevenue: { low: 25, high: 40, note: "Top-tier only \u2014 proprietary data + IP must be provable" } },
    vc: { evRevenue: { low: 30, high: 60, note: "LLM Vendors 39.5x median; Strategic Anchors ~60x+" } },
    doctrineRead:
      "The premium accrues to companies with proprietary data + real IP. Rule-of-40 >50 companies command 15x+ EV/Rev. Do not underwrite off means \u2014 sample sizes for LLM Vendors and Strategic Anchors are small (n=11\u201327) and dominated by 3\u20135 companies (OpenAI, Anthropic, xAI, Perplexity, Mistral).",
    sources: [
      { label: "Iconic Capital, AI Company Valuation and Acquisition Multiples 2026", url: "https://iconic.co/blog/ai-company-valuation-and-acquisition-multiples/" },
      { label: "Finro Q1 2026 LLM/Search niches", url: "https://www.finrofca.com/research/ai-multiples-q1-2026" },
    ],
  },
  ai_wrappers: {
    key: "ai_wrappers",
    label: "AI wrappers / thin apps (no data moat)",
    category: "ai_first",
    categoryLabel: "AI-First (AI-Native)",
    preferredMetric: "revenue",
    ma: { evRevenue: { low: 3, high: 8, note: "Priced as legacy SaaS regardless of AI story" } },
    doctrineRead:
      "Thin AI wrappers with no data moat get a 3\u20138x EV/Rev multiple that looks a lot like legacy SaaS. The category label alone does not clear the market.",
    sources: [
      { label: "Iconic Capital 2026", url: "https://iconic.co/blog/ai-company-valuation-and-acquisition-multiples/" },
    ],
  },
  legacy_saas_ai_overlay: {
    key: "legacy_saas_ai_overlay",
    label: "Legacy SaaS with AI overlay",
    category: "legacy_saas",
    categoryLabel: "Legacy SaaS + AI",
    preferredMetric: "both",
    ma: {
      evRevenue: { low: 4, high: 7, note: "AI-Enabled SaaS M&A median 7.0x" },
      evEbitda: { low: 12, high: 18 },
    },
    vc: { evRevenue: { low: 6, high: 10, note: "AI-Enabled SaaS VC median 8.5x" } },
    doctrineRead:
      "'AI overlay' is worth a mid-tier premium, not a top-tier one. AI-Enabled SaaS clears 7.0x EV/Rev in M&A and 8.5x in VC \u2014 a real premium over Legacy SaaS but a fraction of AI-Native. If the AI is a feature layer, the market prices it as a feature. Reclassification thesis in action.",
    sources: [
      { label: "Ryan Allis 2026", url: "https://www.linkedin.com/pulse/ai-software-valuation-report-2026-ryan-allis-cbehe" },
      { label: "SaaS Capital Index", url: "https://www.saas-capital.com/the-saas-capital-index/" },
      { label: "Meritech Software Pulse April 2026", url: "https://meritech.substack.com/p/meritech-software-pulse-09-april" },
    ],
  },
  legacy_saas_no_ai: {
    key: "legacy_saas_no_ai",
    label: "Legacy SaaS (no AI / cosmetic AI)",
    category: "legacy_saas",
    categoryLabel: "Legacy SaaS + AI",
    preferredMetric: "both",
    ma: {
      evRevenue: { low: 3, high: 4, note: "Median SaaS Capital 3.4\u20133.8x; 80% of public SaaS below 5x NTM" },
      evEbitda: { low: 10, high: 14 },
    },
    vc: { evRevenue: { low: 4, high: 6, note: "VC minority median 5.5x" } },
    doctrineRead:
      "Public SaaS is at a decade low. SaaS Capital Index median hit 3.2x ARR in June 2026 \u2014 lowest since 2011. This is 2011 territory, not a temporary dislocation. Sub-10% growth SaaS: 1.9x median regardless of AI story.",
    sources: [
      { label: "SaaSValuationMultiple.com 2026", url: "https://saasvaluationmultiple.com/saas-valuation-multiples-2026" },
      { label: "SaaS Capital Index", url: "https://www.saas-capital.com/the-saas-capital-index/" },
    ],
  },
  hitl_strategic: {
    key: "hitl_strategic",
    label: "HITL \u2014 strategic frontier-adjacent (Scale/Turing/Prolific tier)",
    category: "hitl",
    categoryLabel: "Human-in-the-Loop / AI Training Data",
    preferredMetric: "revenue",
    ma: { evRevenue: { low: 5, high: 15, note: "Turing 7.3x on $300M ARR; Scale $29B implied EV ~33x rev (strategic buyer)" } },
    vc: { evRevenue: { low: 7, high: 20, note: "Only pay 20x+ if you are a frontier-lab strategic buyer" } },
    doctrineRead:
      "Two-tier market. Scale AI print is a strategic-buyer mark \u2014 Meta's $14.3B for 49% is model-training-infrastructure insurance; treat it as a ceiling, not a comp. Turing at 7.3x on $300M ARR is a more usable organic-growth comp. Buyers pay for control points (verified panel + workflow + governance), not headcount.",
    sources: [
      { label: "Teahose Scale AI valuation 2026", url: "https://www.teahose.com/guides/scale-ai-valuation" },
      { label: "Forbes on Meta / Scale AI", url: "https://www.forbes.com/sites/janakirammsv/2025/06/23/meta-invests-14-billion-in-scale-ai-to-strengthen-model-training/" },
      { label: "TechCrunch Turing Series E", url: "https://techcrunch.com/2025/03/06/turing-a-key-coding-provider-for-openai-and-other-llm-producers-raises-111m-at-a-2-2b-valuation/" },
    ],
  },
  hitl_legacy_labeling: {
    key: "hitl_legacy_labeling",
    label: "HITL \u2014 legacy labeling (Appen tier)",
    category: "hitl",
    categoryLabel: "Human-in-the-Loop / AI Training Data",
    preferredMetric: "both",
    ma: {
      evRevenue: { low: 1, high: 3, note: "Priced as IT services / BPO" },
      evEbitda: { low: 4, high: 8 },
    },
    doctrineRead:
      "Legacy labeling (Appen and adjacents) is being priced closer to IT services / BPO \u2014 low single-digit rev multiples, high-single-digit EBITDA multiples if that. Do not benchmark against the Scale/Turing ceiling.",
    sources: [
      { label: "Aventis Advisors IT Services 2015\u20132026", url: "https://aventis-advisors.com/it-services-valuation-multiples/" },
    ],
  },
  data_provider_public: {
    key: "data_provider_public",
    label: "Data Provider \u2014 public tier",
    category: "data_provider",
    categoryLabel: "Data Provider (Syndicated / Subscription Data)",
    preferredMetric: "both",
    ma: {
      evRevenue: { low: 10, high: 15, note: "MSCI 15x; Moody's/S&P ~11x; FactSet 3.9x (floor)" },
      evEbitda: { low: 15, high: 25, note: "MSCI 24.4x; Moody's 21.2x; S&P 11.3x; FactSet 10.1x (floor)" },
    },
    doctrineRead:
      "Highest-multiple public tier of the entire stack. Data providers with recurring subscription revenue clear at 20\u201328x EV/EBITDA and 11\u201316x EV/Revenue. FactSet at ~10x EBITDA is a useful floor for the tier. Doctrine map: far top-right \u2014 highest data uniqueness \u00d7 highest integration depth. Infrastructure repricing is most visible here.",
    sources: [
      { label: "Multiples.vc MSCI", url: "https://multiples.vc/public-comps/msci-valuation-multiples" },
      { label: "Multiples.vc Moody's", url: "https://multiples.vc/public-comps/moodys-valuation-multiples" },
      { label: "Multiples.vc S&P Global", url: "https://multiples.vc/public-comps/sandp-global-valuation-multiples" },
      { label: "Multiples.vc FactSet", url: "https://multiples.vc/public-comps/factset-valuation-multiples" },
    ],
  },
  data_provider_take_private: {
    key: "data_provider_take_private",
    label: "Data Provider \u2014 take-private / non-public",
    category: "data_provider",
    categoryLabel: "Data Provider (Syndicated / Subscription Data)",
    preferredMetric: "both",
    ma: {
      evRevenue: { low: 3, high: 6 },
      evEbitda: { low: 6, high: 10, note: "Nielsen 2022 8.0x fwd EBITDA; Kantar 2019 8.2x CY18 EBITDA" },
    },
    doctrineRead:
      "Take-privates of legacy syndicated data providers clear at ~8x EBITDA. Nielsen 2022 (8.0x forward EBITDA), Kantar 2019 (8.2x). This is what 'public \u2192 private' reclassification costs when the buyer is underwriting a turnaround. MSCI/Moody's cohort trades at 20\u201328x because they have not needed a turnaround.",
    sources: [
      { label: "Reuters Nielsen $16B deal", url: "https://www.reuters.com/business/media-telecom/brookfield-led-consortium-buy-nielsen-16-billion-deal-2022-03-29/" },
      { label: "Bain Capital Kantar 2019", url: "https://www.baincapital.com/news/investment-bain-capital-private-equity-values-kantar-c40bn-wpp-leverage-target-be-met-year" },
    ],
  },
  pure_services: {
    key: "pure_services",
    label: "Pure MR Services",
    category: "pure_services",
    categoryLabel: "Pure Services (MR, Consulting, IT Services)",
    preferredMetric: "both",
    ma: {
      evRevenue: { low: 0.5, high: 1.5, note: "Ipsos 0.7\u20130.8x on live tape" },
      evEbitda: { low: 4, high: 8, note: "Ipsos 4.9x LTM, near 13-year low of 4.78x; DI single-layer band" },
    },
    doctrineRead:
      "Ipsos priced as commodity services: 0.7x EV/Revenue and 4.9x EV/EBITDA is what the public market thinks pure market research is worth in 2026. That is not a temporary read \u2014 it is near the 13-year low. Confirms the doctrine's standing prior that pure Type-1 services commoditize. Doctrine map: bottom-left quadrant.",
    sources: [
      { label: "Multiples.vc Ipsos", url: "https://multiples.vc/public-comps/ipsos-valuation-multiples" },
      { label: "GuruFocus Ipsos historical", url: "https://www.gurufocus.com/term/enterprise-value-to-ebitda/IPSOF" },
      { label: "Aventis IT Services Q4 2025", url: "https://aventis-advisors.com/it-services-valuation-multiples/" },
    ],
  },
  services_specialization: {
    key: "services_specialization",
    label: "Services + specialization",
    category: "pure_services",
    categoryLabel: "Pure Services (MR, Consulting, IT Services)",
    preferredMetric: "both",
    ma: {
      evRevenue: { low: 1, high: 3 },
      evEbitda: { low: 8, high: 12, note: "IT services 10-year median 10.4x; Kantar 2019 8.2x; PE middle market 11.4x" },
    },
    doctrineRead:
      "Services + specialization: 8\u201312x EBITDA (Kantar 2019, Nielsen 2022, mid-tier PE middle market). IT services M&A median EBITDA multiple has ranged 8.5\u201312.7x over 10 years. Anything an MR services firm claims above ~12x needs to prove why it is not IT services.",
    sources: [
      { label: "Aventis Advisors IT Services", url: "https://aventis-advisors.com/it-services-valuation-multiples/" },
    ],
  },
  services_data_asset: {
    key: "services_data_asset",
    label: "Services + real data asset (reclassification ceiling)",
    category: "pure_services",
    categoryLabel: "Pure Services (MR, Consulting, IT Services)",
    preferredMetric: "both",
    ma: {
      evRevenue: { low: 3, high: 8 },
      evEbitda: { low: 12, high: 18, note: "DI framework full-DI band; Fractal $2.4B; Collingwood Information best assets 20x+" },
    },
    doctrineRead:
      "Services + real data asset = 12\u201318x EBITDA \u2014 the doctrine's reclassification ceiling. Matches Fractal Analytics $2.4B and best-in-class Collingwood Information assets at 20x+.",
    sources: [
      { label: "Collingwood Market Report 2025", url: "" },
      { label: "DI Investment Thesis Framework (project file)", url: "" },
    ],
  },
};

/**
 * Category label + description for the picker.
 */
export const CATEGORIES: Record<CategoryKey, { label: string; description: string; bands: BandKey[] }> = {
  ai_first: {
    label: "AI-First (AI-Native)",
    description: "Architected around AI from inception \u2014 model access, data pipelines, agentic workflows, vertical AI applications. AI is the product.",
    bands: ["ai_first_proprietary_ip", "ai_first_defensible", "ai_wrappers"],
  },
  legacy_saas: {
    label: "Legacy SaaS + AI",
    description: "Established SaaS platforms adding AI features to an existing subscription business. Multiple compression is the base case.",
    bands: ["legacy_saas_ai_overlay", "legacy_saas_no_ai"],
  },
  hitl: {
    label: "Human-in-the-Loop / AI Training Data",
    description: "Verified-human-data infrastructure for AI training and evaluation. Two-tier market: frontier-adjacent vs. legacy labeling.",
    bands: ["hitl_strategic", "hitl_legacy_labeling"],
  },
  data_provider: {
    label: "Data Provider",
    description: "Recurring subscription revenue, industry-critical datasets, high retention. Highest-quality public tier of the entire stack.",
    bands: ["data_provider_public", "data_provider_take_private"],
  },
  pure_services: {
    label: "Pure Services",
    description: "People-heavy, project-based revenue with lower recurring quality. Flight-to-quality penalty lands hardest.",
    bands: ["pure_services", "services_specialization", "services_data_asset"],
  },
};

/**
 * The doctrine's DI framework bands \u2014 shown as a secondary reference on the Valuation lens.
 * These are the category-agnostic anchor Lenny relies on across projects.
 */
export const DI_FRAMEWORK_BANDS = [
  { label: "Single-layer panel/survey", evEbitda: { low: 4, high: 6 } },
  { label: "Mid-transition", evEbitda: { low: 6, high: 10 } },
  { label: "Multi-layer", evEbitda: { low: 10, high: 15 } },
  { label: "Full DI + proprietary human data", evEbitda: { low: 12, high: 18 } },
];

/**
 * Prepared date + doc pointer for provenance in the UI.
 */
export const VALUATION_BANDS_META = {
  preparedDate: "August 2026",
  refresh: "Quarterly",
  sourceDoc: "Comprehensive Valuation Benchmarks \u2014 Five Categories (2026)",
};
