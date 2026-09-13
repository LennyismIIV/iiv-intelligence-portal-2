import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Company } from "@shared/schema";
import {
  VALUATION_CATEGORIES,
  VALUATION_CATEGORY_LABELS,
  FUNDING_STAGES,
  FUNDING_STAGE_LABELS,
  HARD_RULE_IDS,
  HARD_RULE_LABELS,
  DOCTRINE_FLAGS,
  DOCTRINE_FLAG_LABELS,
  evaluateHardRules,
  recommendBandFromInputs,
} from "@shared/schema";
import type { HardRuleId, DoctrineFlag } from "@shared/schema";
import { AlertTriangle, Save, Scale } from "lucide-react";

interface TapeBand {
  bandId: string;
  maRev?: { low: number; median?: number; high: number };
  maEbitda?: { low: number; median?: number; high: number };
  vcRev?: { low: number; median?: number; high: number };
}

interface ValuationTape {
  tapeId: string;
  asOf: string;
  status: string;
  bands: TapeBand[];
}

interface CurrentTapeResult {
  tape: ValuationTape | null;
  warning?: string;
}

interface Assessment {
  id: number;
  firmId: number;
  evaluatorId: string;
  mapAX: number | null;
  mapAY: number | null;
  valuationCategory: string | null;
  doctrineFlags: DoctrineFlag[];
  recommendedBand: string | null;
  finalBand: string | null;
  overrideReason: string | null;
  hardRulesFired: string[] | "none";
  hardRulesNone: boolean;
  tapeId: string;
  tapeAsOf: string;
  bandRanges: TapeBand[];
  recommendedBandRanges: TapeBand | null;
  finalBandRanges: TapeBand | null;
  conviction: number | null;
  narrative: string | null;
  scoredAt: string;
  financials: {
    arrUsd: number | null;
    ebitdaUsd: number | null;
    revenueGrowthPct: number | null;
    fcfMarginPct: number | null;
    fundingStage: string | null;
    financialsAsOf: string | null;
    confidence: "known" | "unknown";
  } | null;
}

function getOrCreateEvaluatorId(): string {
  if (typeof window === "undefined") return "anon";
  const KEY = "iiv_evaluator_id";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = "judge-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    window.localStorage.setItem(KEY, id);
  }
  return id;
}

function fmtTriple(t?: { low: number; median?: number; high: number }) {
  if (!t) return "—";
  return t.median != null ? `${t.low} / ${t.median} / ${t.high}` : `${t.low}–${t.high}`;
}

function bandLabel(bandId: string) {
  return bandId.replace(/_/g, " ");
}

function asCoord(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 5;
}

export function ValuationAssessmentPanel({ company }: { company: Company }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const evaluatorId = useMemo(() => getOrCreateEvaluatorId(), []);

  const { data: currentTape } = useQuery<CurrentTapeResult>({
    queryKey: ["/api/valuation-tapes/current"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/valuation-tapes/current");
      return res.json();
    },
  });

  const { data: assessments = [] } = useQuery<Assessment[]>({
    queryKey: ["/api/companies", company.id, "assessments"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/companies/${company.id}/assessments`);
      return res.json();
    },
  });

  const tape = currentTape?.tape ?? null;
  const tapeBands = tape?.bands ?? [];

  const [mapAX, setMapAX] = useState(asCoord(company.mapAX));
  const [mapAY, setMapAY] = useState(asCoord(company.mapAY));
  const [category, setCategory] = useState(company.valuationCategory || "");
  const [flags, setFlags] = useState<DoctrineFlag[]>([]);
  const [recommendedBand, setRecommendedBand] = useState("");
  const [finalBand, setFinalBand] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [noneFired, setNoneFired] = useState(true);
  const [fired, setFired] = useState<HardRuleId[]>([]);
  const [conviction, setConviction] = useState(5);
  const [narrative, setNarrative] = useState("");
  const [includeFinancials, setIncludeFinancials] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);

  useEffect(() => {
    setMapAX(asCoord(company.mapAX));
    setMapAY(asCoord(company.mapAY));
    setCategory(company.valuationCategory || "");
  }, [company.id, company.mapAX, company.mapAY, company.valuationCategory]);

  const suggestedRules = useMemo(
    () => evaluateHardRules({
      valuationCategory: category || null,
      mapAX,
      mapAY,
      doctrineFlags: flags,
      revenueGrowthPct: includeFinancials ? company.revenueGrowthPct : null,
    }),
    [category, mapAX, mapAY, flags, includeFinancials, company.revenueGrowthPct],
  );

  const suggestedBand = useMemo(
    () => recommendBandFromInputs({
      valuationCategory: category || null,
      mapAX,
      mapAY,
      doctrineFlags: flags,
      revenueGrowthPct: includeFinancials ? company.revenueGrowthPct : null,
    }),
    [category, mapAX, mapAY, flags, includeFinancials, company.revenueGrowthPct],
  );

  useEffect(() => {
    if (suggestedRules.length === 0) {
      setNoneFired(true);
      setFired([]);
    } else {
      setNoneFired(false);
      setFired(suggestedRules);
    }
    if (suggestedBand) {
      setRecommendedBand(suggestedBand);
      setFinalBand((prev) => prev || suggestedBand);
    }
  }, [suggestedRules, suggestedBand]);

  const isOverride = !!(recommendedBand && finalBand && recommendedBand !== finalBand);
  const canSave = !!tape && (!isOverride || overrideReason.trim().length > 0);

  const selectedRanges = tapeBands.find((b) => b.bandId === (finalBand || recommendedBand));

  const save = useMutation({
    mutationFn: async () => {
      const financials = includeFinancials
        ? {
            arrUsd: company.arrUsd ?? null,
            ebitdaUsd: company.ebitdaUsd ?? null,
            revenueGrowthPct: company.revenueGrowthPct ?? null,
            fcfMarginPct: company.fcfMarginPct ?? null,
            fundingStage: company.fundingStage ?? null,
            financialsAsOf: company.financialsAsOf ?? null,
          }
        : null;
      const res = await apiRequest("POST", `/api/companies/${company.id}/assessments`, {
        evaluatorId,
        mapAX,
        mapAY,
        valuationCategory: category || null,
        doctrineFlags: flags,
        recommendedBand: recommendedBand || null,
        finalBand: finalBand || recommendedBand || null,
        overrideReason: isOverride ? overrideReason : null,
        hardRulesFired: noneFired ? "none" : fired,
        tapeId: tape?.tapeId,
        conviction,
        narrative: narrative || null,
        financials,
      });
      return res.json();
    },
    onSuccess: (saved: Assessment) => {
      qc.invalidateQueries({ queryKey: ["/api/companies", company.id, "assessments"] });
      setViewId(saved.id);
      toast({ title: "Assessment saved", description: `Linked to tape ${saved.tapeAsOf} (${saved.tapeId.slice(0, 8)}…)` });
    },
    onError: (err: any) => {
      toast({ title: "Save rejected", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });

  const toggleFlag = (flag: DoctrineFlag) => {
    setFlags((prev) => (prev.includes(flag) ? prev.filter((f) => f !== flag) : [...prev, flag]));
  };

  const toggleRule = (id: HardRuleId) => {
    setNoneFired(false);
    setFired((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  };

  const viewed = assessments.find((a) => a.id === viewId) ?? assessments[0] ?? null;
  const bandChoices = tapeBands.length > 0
    ? tapeBands.map((b) => b.bandId)
    : Array.from(new Set([recommendedBand, finalBand, suggestedBand || ""].filter(Boolean)));

  return (
    <div className="space-y-6" data-testid="valuation-assessment-panel">
      <Card className="border-blue-200 dark:border-blue-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="w-4 h-4 text-blue-600" />
            Valuation assessment
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Persisted against this firm and the current approved tape. Band ranges come from the tape snapshot, not evergreen doctrine defaults.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {tape ? (
            <div className="rounded-md border p-3 text-sm bg-muted/40" data-testid="assessment-tape-link">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                  {tape.status}
                </Badge>
                <span className="font-medium">Tape as-of {tape.asOf}</span>
                <span className="text-muted-foreground font-mono text-xs">{tape.tapeId}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {tapeBands.length} band{tapeBands.length === 1 ? "" : "s"} on this snapshot.
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm flex gap-2" data-testid="assessment-no-tape">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">No approved ValuationTape</div>
                <p className="text-xs text-muted-foreground">
                  Save is rejected until a current approved tape exists. Draft a tape on the Valuation Tape page and have a human approve it.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <Label>Map A X</Label>
                <span className="text-primary font-semibold">{mapAX}/10</span>
              </div>
              <Slider min={0} max={10} step={0.5} value={[mapAX]} onValueChange={(v) => setMapAX(v[0])} />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <Label>Map A Y</Label>
                <span className="text-primary font-semibold">{mapAY}/10</span>
              </div>
              <Slider min={0} max={10} step={0.5} value={[mapAY]} onValueChange={(v) => setMapAY(v[0])} />
            </div>
            <div className="space-y-1.5">
              <Label>Valuation category</Label>
              <Select value={category || "unset"} onValueChange={(v) => setCategory(v === "unset" ? "" : v)}>
                <SelectTrigger data-testid="assessment-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">— Unset —</SelectItem>
                  {VALUATION_CATEGORIES.map((v) => (
                    <SelectItem key={v} value={v}>{VALUATION_CATEGORY_LABELS[v]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <Label>Conviction</Label>
                <span className="font-semibold">{conviction}/10</span>
              </div>
              <Slider min={0} max={10} step={1} value={[conviction]} onValueChange={(v) => setConviction(v[0])} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Doctrine flags</Label>
            <div className="flex flex-wrap gap-4">
              {DOCTRINE_FLAGS.map((flag) => (
                <label key={flag} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={flags.includes(flag)} onCheckedChange={() => toggleFlag(flag)} />
                  {DOCTRINE_FLAG_LABELS[flag]}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Recommended band</Label>
              <Select value={recommendedBand || "unset"} onValueChange={(v) => setRecommendedBand(v === "unset" ? "" : v)}>
                <SelectTrigger data-testid="assessment-recommended-band"><SelectValue placeholder="From tape" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">— Unset —</SelectItem>
                  {bandChoices.map((id) => (
                    <SelectItem key={id} value={id}>{bandLabel(id)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Final band</Label>
              <Select value={finalBand || "unset"} onValueChange={(v) => setFinalBand(v === "unset" ? "" : v)}>
                <SelectTrigger data-testid="assessment-final-band"><SelectValue placeholder="From tape" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">— Unset —</SelectItem>
                  {bandChoices.map((id) => (
                    <SelectItem key={id} value={id}>{bandLabel(id)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedRanges && (
            <div className="rounded-md border p-3 text-xs bg-muted/30" data-testid="assessment-tape-ranges">
              <div className="font-medium mb-1">Ranges from linked tape snapshot</div>
              <div>M&A Rev {fmtTriple(selectedRanges.maRev)} · M&A EBITDA {fmtTriple(selectedRanges.maEbitda)} · VC Rev {fmtTriple(selectedRanges.vcRev)}</div>
            </div>
          )}

          {isOverride && (
            <div className="space-y-1.5">
              <Label htmlFor="override-reason">Override reason (required)</Label>
              <Textarea
                id="override-reason"
                data-testid="assessment-override-reason"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Why does final band differ from the recommendation?"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Hard rules fired</Label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={noneFired}
                onCheckedChange={(v) => {
                  const on = v === true;
                  setNoneFired(on);
                  if (on) setFired([]);
                }}
                data-testid="assessment-hard-rules-none"
              />
              None fired
            </label>
            <div className="flex flex-wrap gap-4">
              {HARD_RULE_IDS.map((id) => (
                <label key={id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={!noneFired && fired.includes(id)}
                    onCheckedChange={() => toggleRule(id)}
                    data-testid={`assessment-hard-rule-${id}`}
                  />
                  {HARD_RULE_LABELS[id]}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={includeFinancials}
                onCheckedChange={(v) => setIncludeFinancials(v === true)}
                data-testid="assessment-include-financials"
              />
              Attach optional FinancialsRecord from the company (only known values; do not invent)
            </label>
            {includeFinancials && (
              <p className="text-[11px] text-muted-foreground">
                ARR {company.arrUsd ?? "unknown"} · EBITDA {company.ebitdaUsd ?? "unknown"} · Growth {company.revenueGrowthPct ?? "unknown"}%
                · FCF {company.fcfMarginPct ?? "unknown"}% · {company.fundingStage ? FUNDING_STAGE_LABELS[company.fundingStage as typeof FUNDING_STAGES[number]] ?? company.fundingStage : "stage unknown"}
                · as-of {company.financialsAsOf || "unknown"}. Missing fields stay null with confidence unknown.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="assessment-narrative">Narrative</Label>
            <Textarea
              id="assessment-narrative"
              data-testid="assessment-narrative"
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              placeholder="Written valuation narrative"
            />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => save.mutate()}
              disabled={!canSave || save.isPending}
              data-testid="button-save-assessment"
            >
              <Save className="w-4 h-4 mr-2" />
              {save.isPending ? "Saving…" : tape ? "Save assessment" : "Tape required"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saved assessments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {assessments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assessments saved for this firm yet.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {assessments.map((a) => (
                  <Button
                    key={a.id}
                    size="sm"
                    variant={viewed?.id === a.id ? "default" : "outline"}
                    onClick={() => setViewId(a.id)}
                    data-testid={`assessment-history-${a.id}`}
                  >
                    {a.scoredAt.slice(0, 10)} · {a.finalBand || "no band"}
                  </Button>
                ))}
              </div>
              {viewed && (
                <div className="rounded-md border p-3 text-sm space-y-2" data-testid="assessment-view">
                  <div className="flex flex-wrap gap-2 items-center">
                    <Badge variant="outline">tape {viewed.tapeAsOf}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">{viewed.tapeId}</span>
                    <Badge variant="secondary">{viewed.valuationCategory || "uncategorized"}</Badge>
                    <span>conviction {viewed.conviction ?? "—"}/10</span>
                  </div>
                  <div>
                    Recommended <strong>{viewed.recommendedBand || "—"}</strong>
                    {" → "}
                    Final <strong>{viewed.finalBand || "—"}</strong>
                    {viewed.overrideReason && (
                      <span className="text-muted-foreground"> — {viewed.overrideReason}</span>
                    )}
                  </div>
                  <div className="text-xs">
                    Hard rules: {viewed.hardRulesNone || viewed.hardRulesFired === "none"
                      ? "none"
                      : (viewed.hardRulesFired as string[]).join(", ")}
                  </div>
                  <div className="text-xs" data-testid="assessment-view-ranges">
                    Snapshot ranges ({viewed.bandRanges.length}):{" "}
                    {viewed.finalBandRanges
                      ? `M&A Rev ${fmtTriple(viewed.finalBandRanges.maRev)} · M&A EBITDA ${fmtTriple(viewed.finalBandRanges.maEbitda)}`
                      : "band not on tape snapshot"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Financials: {viewed.financials
                      ? `${viewed.financials.confidence} · ARR ${viewed.financials.arrUsd ?? "null"} · EBITDA ${viewed.financials.ebitdaUsd ?? "null"}`
                      : "null (not attached)"}
                  </div>
                  {viewed.narrative && <p className="text-sm">{viewed.narrative}</p>}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
