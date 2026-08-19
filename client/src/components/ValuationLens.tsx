import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Company, EvaluationScore } from "@shared/schema";
import { FUNDING_STAGES, FUNDING_STAGE_LABELS } from "@shared/schema";
import { VALUATION_BANDS, CATEGORIES, DI_FRAMEWORK_BANDS, VALUATION_BANDS_META, type BandKey, type CategoryKey } from "@/lib/valuationBands";
import { recommendBand, ruleOf40, computeEstimate, fmtUsd, type ValuationInputs } from "@/lib/valuationLogic";
import { AlertTriangle, ExternalLink, Save, Pencil, Info, TrendingUp, Building2 } from "lucide-react";

/**
 * Valuation Lens \u2014 positioning-and-triangulation tool.
 *
 * Design principles (per Lenny brief):
 *   1. Places the company on the two-axis doctrine map.
 *   2. Recommends a category band from sliders + hard doctrine rules.
 *   3. Shows the live tape (Aug 2026 benchmarks) verbatim.
 *   4. Pulls ARR / EBITDA / growth / stage from the company record (structured fields).
 *   5. Judge can override band selection OR any specific multiple \u2014 but override requires a written reason.
 *   6. Emits VC & M&A valuation ranges (not a single point).
 */

interface ValuationLensProps {
  companyId: number;
  company: Company;
  evaluatorId: string;
}

// Persisted "score" dimensions on lensType='valuation':
//   _meta_data_uniqueness      score = 0-10
//   _meta_integration_depth    score = 0-10
//   _meta_category             notes = CategoryKey
//   _meta_band                 notes = BandKey (final choice; may equal or differ from recommendation)
//   _meta_override_reason      notes = string (required if band differs from recommendation)
//   _meta_flag_prop_data       score = 1 if checked, else 0
//   _meta_flag_real_ip         score = 1 if checked, else 0
//   _meta_flag_ai_loadbearing  score = 1 if checked, else 0
//   _meta_flag_frontier_adj    score = 1 if checked, else 0
//   _meta_flag_public_path     score = 1 if checked, else 0
//   _meta_mult_lo_override     score = judge-entered multiple low (M&A)
//   _meta_mult_hi_override     score = judge-entered multiple high (M&A)
//   _meta_mult_override_reason notes = string
//   _meta_conviction           score = 0-10
//   _meta_narrative            notes = judge's written valuation narrative

export function ValuationLens({ companyId, company, evaluatorId }: ValuationLensProps) {
  const { toast } = useToast();

  // --- Positioning + category state -----------------------------------------
  const [dataUniqueness, setDataUniqueness] = useState<number>(5);
  const [integrationDepth, setIntegrationDepth] = useState<number>(5);
  const [category, setCategory] = useState<CategoryKey | null>(null);

  // --- Doctrine flags -------------------------------------------------------
  const [hasProprietaryData, setHasProprietaryData] = useState(false);
  const [hasRealIp, setHasRealIp] = useState(false);
  const [aiIsLoadBearing, setAiIsLoadBearing] = useState(false);
  const [isFrontierAdjacent, setIsFrontierAdjacent] = useState(false);
  const [isPublicPath, setIsPublicPath] = useState(false);

  // --- Financials (pulled from company, overridable in the lens) ------------
  const [arrOverride, setArrOverride] = useState<string>("");
  const [ebitdaOverride, setEbitdaOverride] = useState<string>("");
  const [growthOverride, setGrowthOverride] = useState<string>("");
  const [fcfOverride, setFcfOverride] = useState<string>("");
  const [stageOverride, setStageOverride] = useState<string>("");

  // --- Band selection + override --------------------------------------------
  const [selectedBand, setSelectedBand] = useState<BandKey | null>(null);
  const [overrideReason, setOverrideReason] = useState<string>("");

  // --- Multiple overrides ---------------------------------------------------
  const [multLoOverride, setMultLoOverride] = useState<string>("");
  const [multHiOverride, setMultHiOverride] = useState<string>("");
  const [multOverrideReason, setMultOverrideReason] = useState<string>("");

  // --- Judge conviction + narrative ----------------------------------------
  const [conviction, setConviction] = useState<number>(5);
  const [narrative, setNarrative] = useState<string>("");

  // --- Hydrate saved lens state from server --------------------------------
  const { data: valuationRows = [] } = useQuery<EvaluationScore[]>({
    queryKey: ["/api/companies", companyId, "scores", "valuation"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/companies/${companyId}/scores?lens=valuation`);
      return res.json();
    },
  });

  useEffect(() => {
    if (!valuationRows || valuationRows.length === 0) return;
    for (const row of valuationRows) {
      if (row.evaluatorId !== evaluatorId) continue;
      switch (row.dimension) {
        case "_meta_data_uniqueness": setDataUniqueness(row.score); break;
        case "_meta_integration_depth": setIntegrationDepth(row.score); break;
        case "_meta_category": if (row.notes) setCategory(row.notes as CategoryKey); break;
        case "_meta_band": if (row.notes) setSelectedBand(row.notes as BandKey); break;
        case "_meta_override_reason": if (row.notes) setOverrideReason(row.notes); break;
        case "_meta_flag_prop_data": setHasProprietaryData(row.score >= 1); break;
        case "_meta_flag_real_ip": setHasRealIp(row.score >= 1); break;
        case "_meta_flag_ai_loadbearing": setAiIsLoadBearing(row.score >= 1); break;
        case "_meta_flag_frontier_adj": setIsFrontierAdjacent(row.score >= 1); break;
        case "_meta_flag_public_path": setIsPublicPath(row.score >= 1); break;
        case "_meta_mult_lo_override": setMultLoOverride(String(row.score)); break;
        case "_meta_mult_hi_override": setMultHiOverride(String(row.score)); break;
        case "_meta_mult_override_reason": if (row.notes) setMultOverrideReason(row.notes); break;
        case "_meta_conviction": setConviction(row.score); break;
        case "_meta_narrative": if (row.notes) setNarrative(row.notes); break;
        case "_meta_arr_override": if (row.score > 0) setArrOverride(String(row.score)); break;
        case "_meta_ebitda_override": setEbitdaOverride(String(row.score)); break;
        case "_meta_growth_override": setGrowthOverride(String(row.score)); break;
        case "_meta_fcf_override": setFcfOverride(String(row.score)); break;
        case "_meta_stage_override": if (row.notes) setStageOverride(row.notes); break;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuationRows, evaluatorId]);

  // --- Save mutation --------------------------------------------------------
  const save = useMutation({
    mutationFn: async (payload: { dimension: string; score: number; notes?: string }) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/scores`, {
        lensType: "valuation",
        evaluatorId,
        ...payload,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "scores", "valuation"] });
    },
  });

  // --- Effective financials (override wins over company record) ------------
  const effectiveArr = useMemo(() => {
    if (arrOverride !== "" && Number.isFinite(Number(arrOverride))) return Number(arrOverride);
    return company.arrUsd ?? null;
  }, [arrOverride, company.arrUsd]);
  const effectiveEbitda = useMemo(() => {
    if (ebitdaOverride !== "" && Number.isFinite(Number(ebitdaOverride))) return Number(ebitdaOverride);
    return company.ebitdaUsd ?? null;
  }, [ebitdaOverride, company.ebitdaUsd]);
  const effectiveGrowth = useMemo(() => {
    if (growthOverride !== "" && Number.isFinite(Number(growthOverride))) return Number(growthOverride);
    return company.revenueGrowthPct ?? null;
  }, [growthOverride, company.revenueGrowthPct]);
  const effectiveFcf = useMemo(() => {
    if (fcfOverride !== "" && Number.isFinite(Number(fcfOverride))) return Number(fcfOverride);
    return company.fcfMarginPct ?? null;
  }, [fcfOverride, company.fcfMarginPct]);
  const effectiveStage = stageOverride || company.fundingStage || "";
  const derivedRuleOf40 = ruleOf40(effectiveGrowth, effectiveFcf);

  // --- Band recommendation --------------------------------------------------
  const inputs: ValuationInputs = {
    dataUniqueness,
    integrationDepth,
    category,
    arrUsd: effectiveArr,
    ebitdaUsd: effectiveEbitda,
    revenueGrowthPct: effectiveGrowth,
    fcfMarginPct: effectiveFcf,
    fundingStage: effectiveStage,
    hasProprietaryData,
    hasRealIp,
    aiIsLoadBearing,
    isFrontierAdjacent,
    isPublicPath,
  };
  const recommendation = useMemo(() => recommendBand(inputs), [
    dataUniqueness, integrationDepth, category, effectiveArr, effectiveEbitda, effectiveGrowth,
    effectiveFcf, effectiveStage, hasProprietaryData, hasRealIp, aiIsLoadBearing, isFrontierAdjacent, isPublicPath,
  ]);

  // If the judge hasn't picked a band, default to the recommendation.
  const effectiveBand: BandKey | null = selectedBand || recommendation?.band || null;
  const bandDiffersFromRecommendation = !!(selectedBand && recommendation && selectedBand !== recommendation.band);

  // --- Estimates ------------------------------------------------------------
  const bandData = effectiveBand ? VALUATION_BANDS[effectiveBand] : null;
  const usingMultOverride = multLoOverride !== "" && multHiOverride !== "" &&
                            Number.isFinite(Number(multLoOverride)) && Number.isFinite(Number(multHiOverride));
  const [multLo, multHi] = usingMultOverride
    ? [Number(multLoOverride), Number(multHiOverride)]
    : [bandData?.ma.evRevenue?.low ?? 0, bandData?.ma.evRevenue?.high ?? 0];

  const maRevenueEstimate = bandData?.ma.evRevenue && effectiveArr
    ? computeEstimate(effectiveArr, effectiveEbitda, multLo, multHi, "revenue", bandData.ma.evRevenue.note)
    : null;
  const maEbitdaEstimate = bandData?.ma.evEbitda && effectiveEbitda && effectiveEbitda > 0
    ? computeEstimate(effectiveArr, effectiveEbitda, bandData.ma.evEbitda.low, bandData.ma.evEbitda.high, "ebitda", bandData.ma.evEbitda.note)
    : null;
  const vcRevenueEstimate = bandData?.vc?.evRevenue && effectiveArr
    ? computeEstimate(effectiveArr, effectiveEbitda, bandData.vc.evRevenue.low, bandData.vc.evRevenue.high, "revenue", bandData.vc.evRevenue.note)
    : null;

  // --- Save-all helper (persists everything in one click) ------------------
  const saveAll = async () => {
    try {
      const jobs: Array<Promise<any>> = [
        save.mutateAsync({ dimension: "_meta_data_uniqueness", score: dataUniqueness }),
        save.mutateAsync({ dimension: "_meta_integration_depth", score: integrationDepth }),
        save.mutateAsync({ dimension: "_meta_category", score: 0, notes: category || "" }),
        save.mutateAsync({ dimension: "_meta_band", score: 0, notes: effectiveBand || "" }),
        save.mutateAsync({ dimension: "_meta_override_reason", score: 0, notes: bandDiffersFromRecommendation ? overrideReason : "" }),
        save.mutateAsync({ dimension: "_meta_flag_prop_data", score: hasProprietaryData ? 1 : 0 }),
        save.mutateAsync({ dimension: "_meta_flag_real_ip", score: hasRealIp ? 1 : 0 }),
        save.mutateAsync({ dimension: "_meta_flag_ai_loadbearing", score: aiIsLoadBearing ? 1 : 0 }),
        save.mutateAsync({ dimension: "_meta_flag_frontier_adj", score: isFrontierAdjacent ? 1 : 0 }),
        save.mutateAsync({ dimension: "_meta_flag_public_path", score: isPublicPath ? 1 : 0 }),
        save.mutateAsync({ dimension: "_meta_mult_lo_override", score: usingMultOverride ? Number(multLoOverride) : 0 }),
        save.mutateAsync({ dimension: "_meta_mult_hi_override", score: usingMultOverride ? Number(multHiOverride) : 0 }),
        save.mutateAsync({ dimension: "_meta_mult_override_reason", score: 0, notes: usingMultOverride ? multOverrideReason : "" }),
        save.mutateAsync({ dimension: "_meta_conviction", score: conviction }),
        save.mutateAsync({ dimension: "_meta_narrative", score: 0, notes: narrative }),
        save.mutateAsync({ dimension: "_meta_arr_override", score: arrOverride !== "" ? Number(arrOverride) : 0 }),
        save.mutateAsync({ dimension: "_meta_ebitda_override", score: ebitdaOverride !== "" ? Number(ebitdaOverride) : 0 }),
        save.mutateAsync({ dimension: "_meta_growth_override", score: growthOverride !== "" ? Number(growthOverride) : 0 }),
        save.mutateAsync({ dimension: "_meta_fcf_override", score: fcfOverride !== "" ? Number(fcfOverride) : 0 }),
        save.mutateAsync({ dimension: "_meta_stage_override", score: 0, notes: stageOverride }),
      ];
      await Promise.all(jobs);
      toast({ title: "Saved", description: "Valuation lens saved." });
    } catch (err: any) {
      toast({ title: "Save failed", description: err?.message || "Unknown error", variant: "destructive" });
    }
  };

  // Validation: if band differs from rec, override reason required
  const overrideValid = !bandDiffersFromRecommendation || overrideReason.trim().length > 5;
  const multOverrideValid = !usingMultOverride || multOverrideReason.trim().length > 5;
  const canSave = overrideValid && multOverrideValid;

  return (
    <div className="space-y-6">
      {/* Header ------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Valuation Lens \u2014 Positioning & Triangulation</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Places the company on the doctrine's two-axis map, recommends a comp band, shows the live tape, forces judgment calls to be explicit.
              </p>
            </div>
            <div className="text-right">
              <Badge variant="outline" className="text-xs">{VALUATION_BANDS_META.preparedDate}</Badge>
              <div className="text-[11px] text-muted-foreground mt-1">Bands refresh: {VALUATION_BANDS_META.refresh}</div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Section 1: Positioning (two-axis map) ---------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            1. Positioning \u2014 Two-Axis Doctrine Map
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Data Uniqueness (proprietary/exclusive/contractual vs. commodity/public) \u00d7 Integration Depth (embedded workflow + governance + switching costs vs. thin interface).
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <Label className="font-medium">Data Uniqueness</Label>
                  <span className="text-primary font-semibold">{dataUniqueness}/10</span>
                </div>
                <Slider min={0} max={10} step={0.5} value={[dataUniqueness]} onValueChange={v => setDataUniqueness(v[0])} />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>Commodity / public</span>
                  <span>Proprietary / exclusive</span>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <Label className="font-medium">Integration Depth</Label>
                  <span className="text-primary font-semibold">{integrationDepth}/10</span>
                </div>
                <Slider min={0} max={10} step={0.5} value={[integrationDepth]} onValueChange={v => setIntegrationDepth(v[0])} />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>Thin interface</span>
                  <span>Embedded + governance</span>
                </div>
              </div>
            </div>
            {/* 2x2 quadrant visualization */}
            <div className="relative border rounded-lg p-4 bg-muted/20">
              <svg viewBox="0 0 200 200" className="w-full h-full max-h-[220px]">
                <rect x="0" y="0" width="100" height="100" fill="#fbbf24" opacity="0.15" />
                <rect x="100" y="0" width="100" height="100" fill="#10b981" opacity="0.15" />
                <rect x="0" y="100" width="100" height="100" fill="#ef4444" opacity="0.15" />
                <rect x="100" y="100" width="100" height="100" fill="#f59e0b" opacity="0.15" />
                <line x1="100" y1="0" x2="100" y2="200" stroke="#94a3b8" strokeWidth="0.5" />
                <line x1="0" y1="100" x2="200" y2="100" stroke="#94a3b8" strokeWidth="0.5" />
                <text x="150" y="15" textAnchor="middle" fontSize="7" fill="#065f46" fontWeight="bold">Infrastructure repricing</text>
                <text x="50" y="15" textAnchor="middle" fontSize="7" fill="#78350f">Data uniqueness only</text>
                <text x="150" y="195" textAnchor="middle" fontSize="7" fill="#78350f">Integration only</text>
                <text x="50" y="195" textAnchor="middle" fontSize="7" fill="#7f1d1d">Services compression</text>
                {/* Company position dot: dataUniqueness=x, integrationDepth=y (inverted so top=high integration) */}
                <circle cx={dataUniqueness * 20} cy={200 - integrationDepth * 20} r="6" fill="#2563eb" stroke="white" strokeWidth="2" />
              </svg>
              <div className="mt-2 text-[11px] text-center text-muted-foreground">
                Blue dot = current company. Top-right = infrastructure repricing premium. Bottom-left = services compression.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Category picker + doctrine flags ---------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            2. Category & Doctrine Flags
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Category selection drives the comp set. Doctrine flags trigger hard rules (top-tier promotion, wrapper penalty, etc.).
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category || "unset"} onValueChange={v => setCategory(v === "unset" ? null : v as CategoryKey)}>
                <SelectTrigger><SelectValue placeholder="Pick category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">\u2014 Pick a category \u2014</SelectItem>
                  {(Object.keys(CATEGORIES) as CategoryKey[]).map(k => (
                    <SelectItem key={k} value={k}>{CATEGORIES[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {category && (
                <p className="text-[11px] text-muted-foreground">{CATEGORIES[category].description}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Doctrine flags (all optional; drive band rules)</Label>
              <div className="space-y-1.5 text-sm">
                {category === "ai_first" && (
                  <>
                    <label className="flex items-center gap-2">
                      <Checkbox checked={hasProprietaryData} onCheckedChange={v => setHasProprietaryData(!!v)} />
                      <span>Proprietary data (exclusive/contractual, provable)</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <Checkbox checked={hasRealIp} onCheckedChange={v => setHasRealIp(!!v)} />
                      <span>Real IP (defensible tech beyond model access)</span>
                    </label>
                  </>
                )}
                {category === "legacy_saas" && (
                  <label className="flex items-center gap-2">
                    <Checkbox checked={aiIsLoadBearing} onCheckedChange={v => setAiIsLoadBearing(!!v)} />
                    <span>AI is load-bearing (not cosmetic overlay)</span>
                  </label>
                )}
                {category === "hitl" && (
                  <label className="flex items-center gap-2">
                    <Checkbox checked={isFrontierAdjacent} onCheckedChange={v => setIsFrontierAdjacent(!!v)} />
                    <span>Frontier-lab-adjacent (Scale/Turing/Prolific tier)</span>
                  </label>
                )}
                {category === "data_provider" && (
                  <label className="flex items-center gap-2">
                    <Checkbox checked={isPublicPath} onCheckedChange={v => setIsPublicPath(!!v)} />
                    <span>Public-quality tier (MSCI/Moody's/S&P quality)</span>
                  </label>
                )}
                {!category && <p className="text-[11px] text-muted-foreground italic">Pick a category to see relevant flags.</p>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Company inputs (pulled + overridable) ----------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Pencil className="w-4 h-4" />
            3. Company Inputs (from record, overridable)
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Blank = pulled from company record. Type a number to override for this valuation exercise only.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <FieldWithSource
              label="ARR / LTM Revenue (USD)"
              recordValue={company.arrUsd}
              overrideValue={arrOverride}
              onOverride={setArrOverride}
              formatter={v => v != null ? fmtUsd(v) : "\u2014"}
              placeholder="e.g. 5000000"
            />
            <FieldWithSource
              label="LTM EBITDA (USD)"
              recordValue={company.ebitdaUsd}
              overrideValue={ebitdaOverride}
              onOverride={setEbitdaOverride}
              formatter={v => v != null ? fmtUsd(v) : "\u2014"}
              placeholder="Can be negative"
            />
            <FieldWithSource
              label="Revenue Growth % (YoY)"
              recordValue={company.revenueGrowthPct}
              overrideValue={growthOverride}
              onOverride={setGrowthOverride}
              formatter={v => v != null ? `${v}%` : "\u2014"}
              placeholder="e.g. 45"
            />
            <FieldWithSource
              label="FCF Margin %"
              recordValue={company.fcfMarginPct}
              overrideValue={fcfOverride}
              onOverride={setFcfOverride}
              formatter={v => v != null ? `${v}%` : "\u2014"}
              placeholder="e.g. 12"
            />
            <div className="space-y-1.5">
              <Label>Funding Stage</Label>
              <Select value={stageOverride || "unset"} onValueChange={v => setStageOverride(v === "unset" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Pick stage" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">\u2014 From record: {company.fundingStage ? FUNDING_STAGE_LABELS[company.fundingStage as keyof typeof FUNDING_STAGE_LABELS] || company.fundingStage : "unset"} \u2014</SelectItem>
                  {FUNDING_STAGES.map(s => (
                    <SelectItem key={s} value={s}>{FUNDING_STAGE_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-md border p-3 text-sm bg-muted/40">
              <div className="text-xs text-muted-foreground mb-1">Rule of 40 (derived)</div>
              {derivedRuleOf40 !== null ? (
                <span className={derivedRuleOf40 >= 40 ? "text-emerald-600 dark:text-emerald-400 font-bold text-lg" : "text-amber-600 dark:text-amber-400 font-bold text-lg"}>
                  {derivedRuleOf40.toFixed(1)}
                </span>
              ) : <span className="text-muted-foreground italic">n/a (needs growth + FCF margin)</span>}
              {derivedRuleOf40 !== null && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {derivedRuleOf40 >= 40 ? "Qualifies for premium AI-First bands (Windsor Drake: R40>50 \u2192 15x+ EV/Rev)." : "Below 40 threshold; premium multiples not justified on R40 alone."}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 4: Recommended band + override --------------------------- */}
      {recommendation ? (
        <Card className={recommendation.hard ? "border-amber-400 dark:border-amber-700" : ""}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              4. Recommended Band
              {recommendation.hard && (
                <Badge variant="destructive" className="text-[10px]">HARD RULE</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border p-4 bg-primary/5">
              <div className="font-semibold text-primary">{VALUATION_BANDS[recommendation.band].label}</div>
              <div className="text-xs text-muted-foreground mt-1">{VALUATION_BANDS[recommendation.band].categoryLabel}</div>
              <p className="text-sm mt-2">{recommendation.rationale}</p>
              {recommendation.softerAlternative && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  Slider-only would have picked: <span className="font-medium">{VALUATION_BANDS[recommendation.softerAlternative].label}</span>
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Final band (override recommendation if needed)</Label>
              <Select value={effectiveBand || "unset"} onValueChange={v => setSelectedBand(v === "unset" ? null : v as BandKey)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">\u2014 Use recommendation \u2014</SelectItem>
                  {(Object.keys(VALUATION_BANDS) as BandKey[]).map(k => (
                    <SelectItem key={k} value={k}>{VALUATION_BANDS[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {bandDiffersFromRecommendation && (
                <div className="rounded-md border-2 border-amber-500 dark:border-amber-700 p-3 bg-amber-50/50 dark:bg-amber-950/30">
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    Override reason required
                  </div>
                  <Textarea
                    className="mt-2"
                    rows={3}
                    placeholder="Explain why you're overriding the recommendation. Required to save."
                    value={overrideReason}
                    onChange={e => setOverrideReason(e.target.value)}
                  />
                  {overrideReason.trim().length <= 5 && <p className="text-[11px] text-red-600 mt-1">At least a full sentence, please.</p>}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card><CardContent className="py-6 text-center text-muted-foreground text-sm">Pick a category above to see the band recommendation.</CardContent></Card>
      )}

      {/* Section 5: Live tape --------------------------------------------- */}
      {bandData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">5. Live Tape \u2014 {bandData.label}</CardTitle>
            <p className="text-xs text-muted-foreground">Verbatim from the Aug 2026 benchmark doc. These are the numbers to reason from.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {bandData.ma.evRevenue && (
                <div className="rounded-md border p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">M&A EV/Revenue</div>
                  <div className="text-xl font-bold">{bandData.ma.evRevenue.low}\u2013{bandData.ma.evRevenue.high}x</div>
                  {bandData.ma.evRevenue.note && <div className="text-[11px] text-muted-foreground mt-1">{bandData.ma.evRevenue.note}</div>}
                </div>
              )}
              {bandData.ma.evEbitda && (
                <div className="rounded-md border p-3">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">M&A EV/EBITDA</div>
                  <div className="text-xl font-bold">{bandData.ma.evEbitda.low}\u2013{bandData.ma.evEbitda.high}x</div>
                  {bandData.ma.evEbitda.note && <div className="text-[11px] text-muted-foreground mt-1">{bandData.ma.evEbitda.note}</div>}
                </div>
              )}
              {bandData.vc?.evRevenue && (
                <div className="rounded-md border p-3 bg-blue-50/40 dark:bg-blue-950/20">
                  <div className="text-xs uppercase tracking-wide text-blue-700 dark:text-blue-300">VC minority EV/Revenue</div>
                  <div className="text-xl font-bold">{bandData.vc.evRevenue.low}\u2013{bandData.vc.evRevenue.high}x</div>
                  {bandData.vc.evRevenue.note && <div className="text-[11px] text-muted-foreground mt-1">{bandData.vc.evRevenue.note}</div>}
                </div>
              )}
            </div>
            <div className="rounded-md bg-muted/40 p-3 text-sm">
              <span className="font-semibold">Doctrine read: </span>{bandData.doctrineRead}
            </div>
            <div className="text-[11px] text-muted-foreground space-y-1">
              <div className="font-semibold uppercase tracking-wide">Sources</div>
              {bandData.sources.map((s, i) => (
                <div key={i} className="flex items-center gap-1">
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                      {s.label} <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span>{s.label}</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 6: Estimate ranges (VC + M&A) --------------------------- */}
      {bandData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">6. Valuation Range Estimate</CardTitle>
            <p className="text-xs text-muted-foreground">
              Applied to your effective financials. Ranges, not points. VC and M&A shown separately per doctrine ("VC \u2260 M&A").
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {!effectiveArr && !effectiveEbitda && (
              <div className="text-sm text-muted-foreground italic p-3 bg-muted/40 rounded-md">
                Enter ARR and/or EBITDA above (or in the Financials tab) to compute a range.
              </div>
            )}
            {maRevenueEstimate && (
              <EstimateRow label="M&A \u2014 EV/Revenue" est={maRevenueEstimate} multiplier="EV/Rev" />
            )}
            {maEbitdaEstimate && (
              <EstimateRow label="M&A \u2014 EV/EBITDA" est={maEbitdaEstimate} multiplier="EV/EBITDA" />
            )}
            {vcRevenueEstimate && (
              <EstimateRow label="VC minority \u2014 EV/Revenue" est={vcRevenueEstimate} multiplier="EV/Rev" tone="vc" />
            )}
            {/* Multiple override */}
            <div className="border rounded-md p-3 space-y-2 bg-muted/20">
              <div className="text-xs font-semibold uppercase tracking-wide">Override multiple (M&A EV/Rev)</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Low</Label>
                  <Input type="number" step="0.1" value={multLoOverride} onChange={e => setMultLoOverride(e.target.value)} placeholder={String(bandData.ma.evRevenue?.low ?? "")} />
                </div>
                <div>
                  <Label className="text-xs">High</Label>
                  <Input type="number" step="0.1" value={multHiOverride} onChange={e => setMultHiOverride(e.target.value)} placeholder={String(bandData.ma.evRevenue?.high ?? "")} />
                </div>
              </div>
              {usingMultOverride && (
                <div>
                  <Label className="text-xs">Reason (required)</Label>
                  <Textarea rows={2} placeholder="Why override the band's default multiple?" value={multOverrideReason} onChange={e => setMultOverrideReason(e.target.value)} />
                  {multOverrideReason.trim().length <= 5 && <p className="text-[11px] text-red-600 mt-1">At least a full sentence, please.</p>}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 7: Conviction + narrative + save ------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="w-4 h-4" />
            7. Judge's Read
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between mb-2">
              <Label>Conviction</Label>
              <span className="text-primary font-semibold">{conviction}/10</span>
            </div>
            <Slider min={0} max={10} step={0.5} value={[conviction]} onValueChange={v => setConviction(v[0])} />
            <p className="text-[11px] text-muted-foreground mt-1">0 = 'we're guessing' \u2014 10 = 'well-anchored, tight range'.</p>
          </div>
          <div>
            <Label>Valuation narrative</Label>
            <Textarea rows={4} value={narrative} onChange={e => setNarrative(e.target.value)} placeholder="Your written read: why this band, what the range means, what would change your mind." />
          </div>
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              Saved per-judge. Other judges see their own valuation only.
            </div>
            <Button onClick={saveAll} disabled={!canSave || save.isPending}>
              <Save className="w-4 h-4 mr-2" />
              {save.isPending ? "Saving\u2026" : "Save Valuation"}
            </Button>
          </div>
          {!canSave && (
            <p className="text-xs text-red-600">Override reasons required before save.</p>
          )}
        </CardContent>
      </Card>

      {/* DI Framework reference card (secondary anchor) ------------------ */}
      <Card className="bg-muted/20">
        <CardHeader>
          <CardTitle className="text-sm">DI Framework Reference (category-agnostic EBITDA bands)</CardTitle>
          <p className="text-[11px] text-muted-foreground">The doctrine's evergreen anchor. Confirmed by 2026 live tape.</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {DI_FRAMEWORK_BANDS.map(b => (
              <div key={b.label} className="rounded-md border p-2 text-center">
                <div className="text-xs text-muted-foreground">{b.label}</div>
                <div className="font-bold">{b.evEbitda.low}\u2013{b.evEbitda.high}x EBITDA</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function FieldWithSource({
  label, recordValue, overrideValue, onOverride, formatter, placeholder,
}: {
  label: string;
  recordValue: number | null | undefined;
  overrideValue: string;
  onOverride: (v: string) => void;
  formatter: (v: number | null | undefined) => string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="number" step="any" value={overrideValue} onChange={e => onOverride(e.target.value)} placeholder={placeholder} />
      <p className="text-[11px] text-muted-foreground">
        From record: <span className="font-mono">{formatter(recordValue)}</span>
        {overrideValue && " \u00b7 override active"}
      </p>
    </div>
  );
}

function EstimateRow({ label, est, multiplier, tone = "ma" }: {
  label: string;
  est: { low: number; point: number; high: number; multipleLow: number; multiplePoint: number; multipleHigh: number; note?: string };
  multiplier: string;
  tone?: "ma" | "vc";
}) {
  const bg = tone === "vc" ? "bg-blue-50/40 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900" : "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900";
  return (
    <div className={`rounded-md border p-3 ${bg}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-[11px] text-muted-foreground">
          {multiplier}: {est.multipleLow}\u2013{est.multipleHigh}x
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[10px] uppercase text-muted-foreground">Low</div>
          <div className="font-bold text-lg">{fmtUsd(est.low)}</div>
          <div className="text-[11px] text-muted-foreground">{est.multipleLow}x</div>
        </div>
        <div className="border-l border-r px-2">
          <div className="text-[10px] uppercase text-muted-foreground">Point</div>
          <div className="font-bold text-xl text-primary">{fmtUsd(est.point)}</div>
          <div className="text-[11px] text-muted-foreground">{est.multiplePoint.toFixed(1)}x</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-muted-foreground">High</div>
          <div className="font-bold text-lg">{fmtUsd(est.high)}</div>
          <div className="text-[11px] text-muted-foreground">{est.multipleHigh}x</div>
        </div>
      </div>
      {est.note && <p className="text-[11px] text-muted-foreground mt-2 italic">{est.note}</p>}
    </div>
  );
}
