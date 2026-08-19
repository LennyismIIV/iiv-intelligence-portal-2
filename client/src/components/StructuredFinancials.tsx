import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Company } from "@shared/schema";
import { FUNDING_STAGES, FUNDING_STAGE_LABELS } from "@shared/schema";
import { Save, Info } from "lucide-react";

/**
 * Structured Financials editor.
 *
 * These fields feed the Valuation lens. Numeric where possible, so the lens can
 * compute multiples without parsing free text. Keeps the legacy
 * `estimatedRevenue`/`estimatedValuation`/`capitalRaised` fields untouched \u2014 they
 * remain the display-friendly text/legacy fields. Structured fields are the
 * source of truth for the lens.
 */
export function StructuredFinancials({ company }: { company: Company }) {
  const [arrUsd, setArrUsd] = useState<string>(company.arrUsd != null ? String(company.arrUsd) : "");
  const [ebitdaUsd, setEbitdaUsd] = useState<string>(company.ebitdaUsd != null ? String(company.ebitdaUsd) : "");
  const [growthPct, setGrowthPct] = useState<string>(company.revenueGrowthPct != null ? String(company.revenueGrowthPct) : "");
  const [fcfMarginPct, setFcfMarginPct] = useState<string>(company.fcfMarginPct != null ? String(company.fcfMarginPct) : "");
  const [fundingStage, setFundingStage] = useState<string>(company.fundingStage || "");
  const [asOf, setAsOf] = useState<string>(company.financialsAsOf || "");

  // Re-hydrate if the company prop changes (e.g. user navigates between companies).
  useEffect(() => {
    setArrUsd(company.arrUsd != null ? String(company.arrUsd) : "");
    setEbitdaUsd(company.ebitdaUsd != null ? String(company.ebitdaUsd) : "");
    setGrowthPct(company.revenueGrowthPct != null ? String(company.revenueGrowthPct) : "");
    setFcfMarginPct(company.fcfMarginPct != null ? String(company.fcfMarginPct) : "");
    setFundingStage(company.fundingStage || "");
    setAsOf(company.financialsAsOf || "");
  }, [company.id, company.arrUsd, company.ebitdaUsd, company.revenueGrowthPct, company.fcfMarginPct, company.fundingStage, company.financialsAsOf]);

  const qc = useQueryClient();
  const { toast } = useToast();

  const save = useMutation({
    mutationFn: async () => {
      const parseNum = (v: string) => (v === "" ? null : Number(v));
      const body = {
        arrUsd: parseNum(arrUsd),
        ebitdaUsd: parseNum(ebitdaUsd),
        revenueGrowthPct: parseNum(growthPct),
        fcfMarginPct: parseNum(fcfMarginPct),
        fundingStage: fundingStage || null,
        financialsAsOf: asOf || null,
      };
      const res = await apiRequest("PATCH", `/api/companies/${company.id}/financials`, body);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/companies", String(company.id)] });
      qc.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "Saved", description: "Structured financials updated." });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });

  const derivedRuleOf40 = (() => {
    const g = Number(growthPct);
    const f = Number(fcfMarginPct);
    if (!Number.isFinite(g) || !Number.isFinite(f)) return null;
    if (growthPct === "" || fcfMarginPct === "") return null;
    return g + f;
  })();

  return (
    <Card className="border-blue-200 dark:border-blue-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Info className="w-4 h-4 text-blue-600" />
          Structured Financials (feeds Valuation lens)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Numeric fields the Valuation lens pulls from. Leave blank if unknown \u2014 the lens will prompt for the value inline.
          Existing legacy fields (Est. Revenue, Est. Valuation, Capital Raised) above are unchanged.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="arr">ARR / LTM Revenue (USD)</Label>
            <Input id="arr" type="number" inputMode="decimal" placeholder="e.g. 5000000"
                   value={arrUsd} onChange={e => setArrUsd(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">Enter as raw dollars (5000000 = $5M).</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ebitda">LTM EBITDA (USD)</Label>
            <Input id="ebitda" type="number" inputMode="decimal" placeholder="Can be negative"
                   value={ebitdaUsd} onChange={e => setEbitdaUsd(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">Negative allowed for cash-burning growth.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="growth">Revenue Growth % (LTM YoY)</Label>
            <Input id="growth" type="number" inputMode="decimal" placeholder="e.g. 45"
                   value={growthPct} onChange={e => setGrowthPct(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">Enter as percent (45 = 45%).</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fcf">FCF Margin % (LTM)</Label>
            <Input id="fcf" type="number" inputMode="decimal" placeholder="e.g. 12"
                   value={fcfMarginPct} onChange={e => setFcfMarginPct(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">Free cash flow margin. Negative allowed.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stage">Funding Stage</Label>
            <Select value={fundingStage || "unset"} onValueChange={v => setFundingStage(v === "unset" ? "" : v)}>
              <SelectTrigger id="stage"><SelectValue placeholder="Select stage" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">\u2014 Unset \u2014</SelectItem>
                {FUNDING_STAGES.map(s => (
                  <SelectItem key={s} value={s}>{FUNDING_STAGE_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="asof">Financials as-of (date)</Label>
            <Input id="asof" type="date" value={asOf} onChange={e => setAsOf(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">Date these numbers reflect.</p>
          </div>
        </div>

        {derivedRuleOf40 !== null && (
          <div className="rounded-md border p-3 text-sm bg-muted/40">
            <span className="font-medium">Derived Rule of 40:</span>{" "}
            <span className={derivedRuleOf40 >= 40 ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-amber-600 dark:text-amber-400 font-semibold"}>
              {derivedRuleOf40.toFixed(1)}
            </span>
            <span className="text-muted-foreground ml-2">
              {derivedRuleOf40 >= 40 ? "\u2014 qualifies for premium AI-First bands where applicable." : "\u2014 below the 40 threshold; premium multiples not justified on Rule-of-40 basis alone."}
            </span>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="w-4 h-4 mr-2" />
            {save.isPending ? "Saving\u2026" : "Save Financials"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
