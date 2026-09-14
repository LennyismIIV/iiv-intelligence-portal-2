import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Company } from "@shared/schema";
import { IIV_VERDICTS, type IivVerdict, type IivBlocker } from "@shared/schema";
import { AlertOctagon, CheckCircle2, Download, Save } from "lucide-react";
import { useEffect, useState } from "react";

interface DecisionSummary {
  canWriteInvestVerdict: boolean;
  blockingReasons: string[];
  iivVerdict: IivVerdict;
  iivBlockers: IivBlocker[];
  iivGaps: IivBlocker[];
}

interface QcResult {
  passed: boolean;
}

function verdictBadgeClass(verdict: IivVerdict): string {
  if (verdict === "INVEST") return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
  if (verdict === "WATCH") return "bg-amber-500/15 text-amber-300 border-amber-500/40";
  if (verdict === "PASS") return "bg-slate-500/15 text-slate-300 border-slate-500/40";
  return "bg-blue-500/15 text-blue-300 border-blue-500/40";
}

export function IivVerdictPanel({ company }: { company: Company }) {
  const qcClient = useQueryClient();
  const { toast } = useToast();
  const stored = ((company as Company & { iivVerdict?: string }).iivVerdict || "PENDING") as IivVerdict;
  const [verdict, setVerdict] = useState<IivVerdict>(stored);

  useEffect(() => {
    setVerdict(stored);
  }, [company.id, stored]);

  const { data: summary } = useQuery<DecisionSummary>({
    queryKey: ["/api/companies", company.id, "decision-summary"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/companies/${company.id}/decision-summary`);
      return res.json();
    },
  });

  const { data: qc } = useQuery<QcResult>({
    queryKey: ["/api/companies", company.id, "scorecard-qc"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/companies/${company.id}/scorecard-qc`);
      return res.json();
    },
  });

  const blockers = summary?.iivBlockers ?? [];
  const gaps = summary?.iivGaps ?? [];
  const investBlocked = summary?.canWriteInvestVerdict === false;
  const qcPassed = qc?.passed === true;

  const save = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/companies/${company.id}/iiv-verdict`, { verdict });
      return res.json();
    },
    onSuccess: (data) => {
      qcClient.invalidateQueries({ queryKey: ["/api/companies", company.id] });
      qcClient.invalidateQueries({ queryKey: ["/api/companies", String(company.id)] });
      qcClient.invalidateQueries({ queryKey: ["/api/companies", company.id, "decision-summary"] });
      toast({ title: "IIV verdict saved", description: data.iivVerdict });
    },
    onError: (err: any) => {
      toast({
        title: "Verdict not saved",
        description: err?.message || "INVEST is blocked by open Findings / Gates.",
        variant: "destructive",
      });
    },
  });

  const downloadExport = async (format: "docx" | "pdf", draft = false) => {
    const qs = new URLSearchParams({ format, edition: "iiv" });
    if (draft) qs.set("draft", "1");
    const res = await apiRequest("GET", `/api/companies/${company.id}/export/scorecard?${qs}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const cd = res.headers.get("Content-Disposition");
    const match = cd?.match(/filename="([^"]+)"/);
    const slug = (company.name || "company").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
    a.href = url;
    a.download = match?.[1] ?? `iiv-verdict-scorecard-${slug}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportDocx = useMutation({
    mutationFn: () => downloadExport("docx"),
    onSuccess: () => toast({ title: "IIV Verdict Scorecard DOCX downloaded" }),
    onError: (err: any) => {
      toast({ title: "Export blocked", description: err?.message || "QC failed", variant: "destructive" });
    },
  });

  const exportPdf = useMutation({
    mutationFn: () => downloadExport("pdf"),
    onSuccess: () => toast({ title: "IIV Verdict PDF downloaded" }),
    onError: (err: any) => {
      toast({ title: "Export blocked", description: err?.message || "QC failed", variant: "destructive" });
    },
  });

  const exportDraft = useMutation({
    mutationFn: () => downloadExport("docx", true),
    onSuccess: () => toast({ title: "Internal IIV draft downloaded", description: "Watermarked — not for client send." }),
    onError: (err: any) => {
      toast({ title: "Draft export failed", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });

  return (
    <Card className="border-blue-400/40" data-testid="iiv-verdict-panel">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          IIV verdict
          <Badge variant="outline" className={verdictBadgeClass(summary?.iivVerdict ?? verdict)} data-testid="iiv-verdict-badge">
            {summary?.iivVerdict ?? verdict}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Same Scorecard graph as Gen2 (Map A, posture, tape-dated band, evidence). Edition
          output is INVEST / WATCH / PASS / PENDING plus Portal blockers — not a second scoring
          model, not Gen2 CEO, not Greenbook.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Verdict</Label>
            <Select value={verdict} onValueChange={(v) => setVerdict(v as IivVerdict)}>
              <SelectTrigger data-testid="select-iiv-verdict">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IIV_VERDICTS.map((v) => (
                  <SelectItem key={v} value={v} disabled={v === "INVEST" && investBlocked}>
                    {v}{v === "INVEST" && investBlocked ? " (blocked)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              size="sm"
              onClick={() => save.mutate()}
              disabled={save.isPending}
              data-testid="button-save-iiv-verdict"
            >
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {save.isPending ? "Saving…" : "Save verdict"}
            </Button>
          </div>
        </div>

        {investBlocked ? (
          <div
            className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm"
            data-testid="iiv-invest-blocked"
          >
            <div className="flex items-center gap-2 font-medium text-red-300 mb-1">
              <AlertOctagon className="w-4 h-4" />
              INVEST is blocked
            </div>
            <ul className="list-disc list-inside text-xs text-red-200/85 space-y-0.5">
              {(summary?.blockingReasons ?? []).map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-emerald-300" data-testid="iiv-invest-clear">
            <CheckCircle2 className="w-3.5 h-3.5" />
            INVEST is writable — no open critical/high Findings or failed Gates.
          </div>
        )}

        <div className="space-y-1.5" data-testid="iiv-blockers-list">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Blockers</div>
          {blockers.length === 0 && gaps.length > 0 && (
            <ul className="space-y-1 text-xs">
              {gaps.map((g) => (
                <li key={g.code} className="text-amber-300/90" data-testid={`iiv-gap-${g.code}`}>
                  [GAP] {g.label}: {g.detail}
                </li>
              ))}
            </ul>
          )}
          {blockers.length > 0 && (
            <ul className="space-y-1 text-xs">
              {blockers.map((b) => (
                <li
                  key={b.code}
                  className={b.severity === "block" ? "text-red-300" : "text-amber-200"}
                  data-testid={`iiv-blocker-${b.code}`}
                >
                  <span className="font-medium">{b.severity === "block" ? "BLOCK" : "WARN"}</span>
                  {" · "}
                  {b.label}: {b.detail}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => exportDocx.mutate()}
            disabled={!qcPassed || exportDocx.isPending}
            data-testid="button-export-iiv-docx"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export IIV DOCX
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => exportPdf.mutate()}
            disabled={!qcPassed || exportPdf.isPending}
            data-testid="button-export-iiv-pdf"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export IIV PDF
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => exportDraft.mutate()}
            disabled={exportDraft.isPending}
            data-testid="button-export-iiv-draft"
          >
            Internal draft
          </Button>
          {!qcPassed && (
            <span className="text-xs text-red-400 self-center">
              Client export stays red until Scorecard QC passes
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
