import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Company } from "@shared/schema";
import {
  EVIDENCE_GRADES,
  EVIDENCE_GRADE_LABELS,
  EVIDENCE_CONFIDENCE,
  EVIDENCE_CONFIDENCE_LABELS,
  MATERIAL_CLAIM_KEYS,
  MATERIAL_CLAIM_LABELS,
  CONTROL_POINT_VALUES,
  CONTROL_POINT_LABELS,
  AI_ON_CONTROL_POINT_RESULTS,
} from "@shared/schema";
import type {
  MaterialClaimKey,
  EvidenceRecord,
  ScorecardQcResult,
  Prd9Blocker,
} from "@shared/schema";
import { AlertOctagon, CheckCircle2, Clock, Download, Save, ShieldAlert, Ship } from "lucide-react";

interface AssessmentSummary {
  id: number;
  recommendedBand: string | null;
}

interface DraftRow {
  claimKey: MaterialClaimKey;
  grade: string;
  confidence: string;
  claimValue: string;
  notes: string;
  sourceUrl: string;
  greenbookVisible: boolean;
}

function emptyRow(claimKey: MaterialClaimKey): DraftRow {
  return {
    claimKey,
    grade: "",
    confidence: "",
    claimValue: "",
    notes: "",
    sourceUrl: "",
    greenbookVisible: false,
  };
}

function claimHint(company: Company, claimKey: MaterialClaimKey, latest?: AssessmentSummary | null): string {
  if (claimKey === "map_a_x") return company.mapAX == null ? "Unset on firm" : `Firm Map A X = ${company.mapAX}`;
  if (claimKey === "map_a_y") return company.mapAY == null ? "Unset on firm" : `Firm Map A Y = ${company.mapAY}`;
  if (claimKey === "strategic_posture") {
    return company.strategicPosture ? `Firm posture = ${company.strategicPosture}` : "Unset on firm";
  }
  if (claimKey === "valuation_band") {
    return latest?.recommendedBand
      ? `Latest recommended band = ${latest.recommendedBand}`
      : "No assessment band yet — grade the recommendation itself";
  }
  return "Record the claim value below, then grade it";
}

export function ScorecardEvidencePanel({ company }: { company: Company }) {
  const qcClient = useQueryClient();
  const { toast } = useToast();

  const { data: evidence = [] } = useQuery<EvidenceRecord[]>({
    queryKey: ["/api/companies", company.id, "evidence"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/companies/${company.id}/evidence`);
      return res.json();
    },
  });

  const { data: qc } = useQuery<ScorecardQcResult>({
    queryKey: ["/api/companies", company.id, "scorecard-qc"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/companies/${company.id}/scorecard-qc`);
      return res.json();
    },
  });

  const { data: latestAssessment } = useQuery<AssessmentSummary | null>({
    queryKey: ["/api/companies", company.id, "assessments", "latest"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/companies/${company.id}/assessments/latest`);
      return res.json();
    },
  });

  const [rows, setRows] = useState<DraftRow[]>(() => MATERIAL_CLAIM_KEYS.map(emptyRow));
  const [leonardHours, setLeonardHours] = useState("");
  const [shippedBy, setShippedBy] = useState("");

  useEffect(() => {
    const byKey = new Map(evidence.map((e) => [e.claimKey, e]));
    setRows(MATERIAL_CLAIM_KEYS.map((key) => {
      const ev = byKey.get(key);
      if (!ev) return emptyRow(key);
      return {
        claimKey: key,
        grade: ev.grade,
        confidence: ev.confidence,
        claimValue: ev.claimValue ?? "",
        notes: ev.notes ?? "",
        sourceUrl: ev.sourceUrl ?? "",
        greenbookVisible: ev.greenbookVisible,
      };
    }));
  }, [company.id, evidence]);

  const passed = qc?.passed === true;

  const updateRow = (claimKey: MaterialClaimKey, patch: Partial<DraftRow>) => {
    setRows((prev) => prev.map((r) => (r.claimKey === claimKey ? { ...r, ...patch } : r)));
  };

  const invalidate = () => {
    qcClient.invalidateQueries({ queryKey: ["/api/companies", company.id, "evidence"] });
    qcClient.invalidateQueries({ queryKey: ["/api/companies", company.id, "scorecard-qc"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const items = rows
        .filter((r) => r.grade && r.confidence)
        .map((r) => ({
          claimKey: r.claimKey,
          grade: r.grade,
          confidence: r.confidence,
          claimValue: r.claimValue || null,
          notes: r.notes || null,
          sourceUrl: r.sourceUrl || null,
          greenbookVisible: r.greenbookVisible,
        }));
      if (items.length === 0) {
        throw new Error("Set grade and confidence on at least one claim before saving.");
      }
      const res = await apiRequest("PUT", `/api/companies/${company.id}/evidence/batch`, { items });
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Saved", description: "Evidence grades and confidence updated." });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });

  const hoursValue = Number(leonardHours);
  const hoursOk = Number.isFinite(hoursValue) && hoursValue > 0;
  const shipBody = () => ({
    leonardHours: hoursValue,
    shippedBy: shippedBy.trim() || undefined,
  });

  const downloadExport = async (format: "docx" | "pdf" | "json", draft = false) => {
    const qs = new URLSearchParams({ format });
    if (draft) qs.set("draft", "1");
    const res = await apiRequest("GET", `/api/companies/${company.id}/export/scorecard?${qs}`);
    const slug = (company.name || "company").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
    if (format === "json") {
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gen2-ceo-scorecard-${slug}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const cd = res.headers.get("Content-Disposition");
    const match = cd?.match(/filename="([^"]+)"/);
    a.href = url;
    a.download = match?.[1] ?? `gen2-ceo-scorecard-${slug}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const persistShipAfterClientExport = async () => {
    if (!hoursOk) return;
    const res = await apiRequest("POST", `/api/companies/${company.id}/ship`, shipBody());
    return res.json();
  };

  const exportDocx = useMutation({
    mutationFn: async () => {
      await downloadExport("docx");
      return persistShipAfterClientExport();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Gen2 CEO Scorecard DOCX downloaded", description: "Hour log recorded on ship." });
    },
    onError: (err: any) => {
      toast({ title: "Export blocked", description: err?.message || "QC failed", variant: "destructive" });
    },
  });

  const exportPdf = useMutation({
    mutationFn: async () => {
      await downloadExport("pdf");
      return persistShipAfterClientExport();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Locked-send PDF downloaded", description: "Hour log recorded on ship." });
    },
    onError: (err: any) => {
      toast({ title: "Export blocked", description: err?.message || "QC failed", variant: "destructive" });
    },
  });

  const exportDraft = useMutation({
    mutationFn: () => downloadExport("docx", true),
    onSuccess: () => toast({ title: "Internal draft DOCX downloaded", description: "Watermarked — not for client send." }),
    onError: (err: any) => {
      toast({ title: "Draft export failed", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });

  const ship = useMutation({
    mutationFn: async () => {
      if (!hoursOk) {
        throw new Error("Leonard hours are required and must be greater than 0.");
      }
      const res = await apiRequest("POST", `/api/companies/${company.id}/ship`, shipBody());
      return res.json();
    },
    onSuccess: (data) => {
      invalidate();
      toast({
        title: "Shipped",
        description: `Hour log recorded: ${data.leonardHours}h${data.shippedBy ? ` by ${data.shippedBy}` : ""}.`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Ship blocked", description: err?.message || "QC failed", variant: "destructive" });
    },
  });

  const missingCount = useMemo(
    () => qc?.missingClaimKeys.length ?? MATERIAL_CLAIM_KEYS.length,
    [qc],
  );

  const prd9Rows: Prd9Blocker[] = (qc?.prd9 ?? []).filter((row) => row.id !== "evidence_grades");
  const latestShip = qc?.latestShip ?? null;
  const clientSendBlocked = !passed || !hoursOk;

  return (
    <div className="space-y-4" data-testid="scorecard-evidence-panel">
      <Card
        className={passed
          ? "border-emerald-400/50 bg-emerald-500/5"
          : "border-red-500/50 bg-red-500/5"}
        data-testid="scorecard-qc-checklist"
      >
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            {passed ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : (
              <AlertOctagon className="w-4 h-4 text-red-500" />
            )}
            Scorecard QC
            <Badge
              variant="outline"
              className={passed
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                : "bg-red-500/15 text-red-300 border-red-500/40"}
              data-testid="scorecard-qc-status"
            >
              {passed ? "passed" : "failed"}
            </Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Fail-closed: client DOCX / locked-send PDF stay red until every material claim has
            Evidence.grade and confidence. Internal draft is watermarked and may include [GAP]
            placeholders. Undisclosed / speculative is allowed when labeled. Ship and client
            send require Leonard hours &gt; 0.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {prd9Rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-3 text-sm"
              data-testid={`qc-prd9-${row.id}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {row.passed
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  : <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                <span className="truncate">{row.label}</span>
              </div>
              <span className={`text-xs text-right ${row.passed ? "text-emerald-400" : "text-red-400"}`}>
                {row.detail}
              </span>
            </div>
          ))}
          {(qc?.claims ?? MATERIAL_CLAIM_KEYS.map((claimKey) => ({
            claimKey,
            label: MATERIAL_CLAIM_LABELS[claimKey],
            present: false,
            labeled: false,
            missing: ["grade", "confidence"],
          }))).map((claim) => (
            <div
              key={claim.claimKey}
              className="flex items-center justify-between gap-3 text-sm"
              data-testid={`qc-row-${claim.claimKey}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {claim.present
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  : <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                <span className="truncate">{claim.label}</span>
                {claim.labeled && (
                  <Badge variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-500/40 text-[10px]">
                    Undisclosed / speculative
                  </Badge>
                )}
              </div>
              <span className={`text-xs ${claim.present ? "text-emerald-400" : "text-red-400"}`}>
                {claim.present ? "graded" : `missing ${(claim.missing ?? ["grade", "confidence"]).join(" + ")}`}
              </span>
            </div>
          ))}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="leonard-hours">Leonard hours</Label>
              <Input
                id="leonard-hours"
                type="number"
                min={0.1}
                step={0.25}
                inputMode="decimal"
                value={leonardHours}
                onChange={(e) => setLeonardHours(e.target.value)}
                placeholder="Hours spent reviewing"
                data-testid="input-leonard-hours"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shipped-by">Shipped by (optional)</Label>
              <Input
                id="shipped-by"
                value={shippedBy}
                onChange={(e) => setShippedBy(e.target.value)}
                placeholder="Leonard"
                data-testid="input-shipped-by"
              />
            </div>
          </div>
          {!hoursOk && (
            <div
              className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
              data-testid="hours-required-warning"
            >
              Ship and client send require Leonard hours greater than 0. Hours are not invented.
            </div>
          )}
          {latestShip && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="latest-ship-meta">
              <Clock className="w-3.5 h-3.5" />
              Last shipped {latestShip.shippedAt}
              {latestShip.shippedBy ? ` by ${latestShip.shippedBy}` : ""}
              {" · "}
              {latestShip.leonardHours}h logged
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => exportDocx.mutate()}
              disabled={clientSendBlocked || exportDocx.isPending}
              data-testid="button-export-scorecard"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export Gen2 DOCX
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => exportPdf.mutate()}
              disabled={clientSendBlocked || exportPdf.isPending}
              data-testid="button-export-scorecard-pdf"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Locked send PDF
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => exportDraft.mutate()}
              disabled={exportDraft.isPending}
              data-testid="button-export-scorecard-draft"
            >
              Internal draft
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => ship.mutate()}
              disabled={clientSendBlocked || ship.isPending}
              data-testid="button-ship-scorecard"
            >
              <Ship className="w-3.5 h-3.5 mr-1.5" />
              Ship
            </Button>
            {!passed && (
              <span className="text-xs text-red-400 self-center">
                {missingCount} claim{missingCount === 1 ? "" : "s"} still ungraded
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-blue-200 dark:border-blue-900">
        <CardHeader>
          <CardTitle className="text-base">Evidence grades</CardTitle>
          <p className="text-xs text-muted-foreground">
            Attach grade + confidence to the six material Scorecard judgments. Do not paste Gen2 vault
            paths into evidence marked Greenbook visible.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {rows.map((row) => (
            <div
              key={row.claimKey}
              className="rounded-md border border-border bg-muted/20 p-3 space-y-3"
              data-testid={`evidence-row-${row.claimKey}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-sm">{MATERIAL_CLAIM_LABELS[row.claimKey]}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {claimHint(company, row.claimKey, latestAssessment)}
                  </div>
                </div>
                {row.grade === "UndisclosedSpeculative" && (
                  <Badge variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-500/40">
                    Labeled speculative
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Grade</Label>
                  <Select
                    value={row.grade || "unset"}
                    onValueChange={(v) => updateRow(row.claimKey, { grade: v === "unset" ? "" : v })}
                  >
                    <SelectTrigger data-testid={`select-grade-${row.claimKey}`}>
                      <SelectValue placeholder="Select grade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unset">— Unset —</SelectItem>
                      {EVIDENCE_GRADES.map((g) => (
                        <SelectItem key={g} value={g}>{EVIDENCE_GRADE_LABELS[g]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Confidence</Label>
                  <Select
                    value={row.confidence || "unset"}
                    onValueChange={(v) => updateRow(row.claimKey, { confidence: v === "unset" ? "" : v })}
                  >
                    <SelectTrigger data-testid={`select-confidence-${row.claimKey}`}>
                      <SelectValue placeholder="Select confidence" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unset">— Unset —</SelectItem>
                      {EVIDENCE_CONFIDENCE.map((c) => (
                        <SelectItem key={c} value={c}>{EVIDENCE_CONFIDENCE_LABELS[c]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {row.claimKey === "control_point_ownership" && (
                  <div className="space-y-1.5">
                    <Label>Primary ControlPoint</Label>
                    <Select
                      value={row.claimValue || "unset"}
                      onValueChange={(v) => updateRow(row.claimKey, { claimValue: v === "unset" ? "" : v })}
                    >
                      <SelectTrigger data-testid="select-control-point">
                        <SelectValue placeholder="Select control point" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unset">— Unset —</SelectItem>
                        {CONTROL_POINT_VALUES.map((v) => (
                          <SelectItem key={v} value={v}>{CONTROL_POINT_LABELS[v]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {row.claimKey === "ai_on_control_point" && (
                  <div className="space-y-1.5">
                    <Label>AI-on-control-point result</Label>
                    <Select
                      value={row.claimValue || "unset"}
                      onValueChange={(v) => updateRow(row.claimKey, { claimValue: v === "unset" ? "" : v })}
                    >
                      <SelectTrigger data-testid="select-ai-on-control-point">
                        <SelectValue placeholder="Select result" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unset">— Unset —</SelectItem>
                        {AI_ON_CONTROL_POINT_RESULTS.map((v) => (
                          <SelectItem key={v} value={v}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Source URL (optional)</Label>
                  <Input
                    value={row.sourceUrl}
                    placeholder="https://…"
                    onChange={(e) => updateRow(row.claimKey, { sourceUrl: e.target.value })}
                    data-testid={`input-source-${row.claimKey}`}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Notes / justification</Label>
                <Textarea
                  rows={2}
                  value={row.notes}
                  onChange={(e) => updateRow(row.claimKey, { notes: e.target.value })}
                  placeholder={row.claimKey === "strategic_posture" ? "Why this posture?" : "Optional supporting note"}
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={row.greenbookVisible}
                  onCheckedChange={(checked) => updateRow(row.claimKey, { greenbookVisible: checked === true })}
                  data-testid={`check-greenbook-${row.claimKey}`}
                />
                Greenbook visible — Gen2 vault paths are rejected
              </label>
            </div>
          ))}

          <div className="flex justify-end">
            <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-evidence">
              <Save className="w-4 h-4 mr-2" />
              {save.isPending ? "Saving…" : "Save evidence grades"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
