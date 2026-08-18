import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  FINDING_STATUSES,
  FINDING_SEVERITIES,
  FINDING_TERMINAL_STATUSES,
  type Finding,
  type FindingStatus,
  type FindingSeverity,
} from "@shared/schema";
import { Plus, Trash2, AlertTriangle } from "lucide-react";

interface Props {
  companyId: number;
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

const STATUS_LABEL: Record<FindingStatus, string> = {
  "unverified-owner-assigned": "Unverified · owner assigned",
  "verified-incorporated": "Verified · incorporated",
  "verified-immaterial": "Verified · immaterial",
  rebutted: "Rebutted",
  rejected: "Rejected",
};

const SEVERITY_STYLES: Record<FindingSeverity, string> = {
  low: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  medium: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  high: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  critical: "bg-red-500/20 text-red-300 border-red-500/40",
};

const STATUS_STYLES: Record<FindingStatus, string> = {
  "unverified-owner-assigned": "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  "verified-incorporated": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "verified-immaterial": "bg-slate-500/15 text-slate-300 border-slate-500/30",
  rebutted: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  rejected: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

function isOpen(status: string): boolean {
  return !(FINDING_TERMINAL_STATUSES as string[]).includes(status);
}

export function FindingsLedger({ companyId }: Props) {
  const { toast } = useToast();
  const evaluatorId = useMemo(() => getOrCreateEvaluatorId(), []);

  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({
    findingText: "",
    severity: "medium" as FindingSeverity,
    owner: "",
    sourceDoc: "",
    deadline: "",
  });

  const findingsQuery = useQuery<Finding[]>({
    queryKey: ["/api/companies", companyId, "findings"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/companies/${companyId}/findings`);
      return res.json();
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "findings"] });
    queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "decision-summary"] });
    queryClient.invalidateQueries({ queryKey: ["/api/findings"] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        findingText: draft.findingText.trim(),
        severity: draft.severity,
        owner: draft.owner.trim() || null,
        sourceDoc: draft.sourceDoc.trim() || null,
        deadline: draft.deadline || null,
        raisedBy: evaluatorId,
      };
      const res = await apiRequest("POST", `/api/companies/${companyId}/findings`, payload);
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Finding raised" });
      setDraft({ findingText: "", severity: "medium", owner: "", sourceDoc: "", deadline: "" });
      setShowAdd(false);
    },
    onError: (err: any) => {
      toast({ title: "Failed to add finding", description: err?.message, variant: "destructive" });
    },
  });

  const patchMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Partial<Finding> }) => {
      const res = await apiRequest("PATCH", `/api/findings/${id}`, patch);
      return res.json();
    },
    onSuccess: () => {
      invalidate();
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err?.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/findings/${id}`);
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Finding deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err?.message, variant: "destructive" });
    },
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.findingText.trim()) {
      toast({ title: "Finding text is required", variant: "destructive" });
      return;
    }
    createMutation.mutate();
  };

  const findings = findingsQuery.data ?? [];
  const openCount = findings.filter((f) => isOpen(f.status)).length;
  const criticalOrHigh = findings.filter(
    (f) => isOpen(f.status) && (f.severity === "critical" || f.severity === "high"),
  ).length;

  return (
    <Card data-testid="findings-ledger">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-400" />
              Findings Ledger
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Adverse or pending facts that must be dispositioned before a verdict can be written.
              Every open finding of high or critical severity blocks INVEST.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-xs">
              <div className="text-muted-foreground">Open</div>
              <div className="text-lg font-semibold">
                {openCount}
                {criticalOrHigh > 0 && (
                  <span className="ml-2 text-red-400 text-sm">
                    ({criticalOrHigh} blocking)
                  </span>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant={showAdd ? "secondary" : "default"}
              onClick={() => setShowAdd((v) => !v)}
              data-testid="button-toggle-add-finding"
            >
              <Plus size={14} className="mr-1" />
              {showAdd ? "Cancel" : "Raise Finding"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showAdd && (
          <form
            onSubmit={handleAdd}
            className="space-y-3 border border-border rounded-md p-4 bg-muted/30"
          >
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Finding <span className="text-red-400">*</span>
              </label>
              <Textarea
                value={draft.findingText}
                onChange={(e) => setDraft({ ...draft, findingText: e.target.value })}
                placeholder="Describe the adverse or pending fact (e.g. 'Founder equity vests over 12 mo, not 4 yr')"
                rows={3}
                data-testid="input-finding-text"
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Severity</label>
                <Select
                  value={draft.severity}
                  onValueChange={(v) => setDraft({ ...draft, severity: v as FindingSeverity })}
                >
                  <SelectTrigger data-testid="select-severity">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FINDING_SEVERITIES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Owner</label>
                <Input
                  value={draft.owner}
                  onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
                  placeholder="Name or role"
                  data-testid="input-owner"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Deadline</label>
                <Input
                  type="date"
                  value={draft.deadline}
                  onChange={(e) => setDraft({ ...draft, deadline: e.target.value })}
                  data-testid="input-deadline"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Source</label>
                <Input
                  value={draft.sourceDoc}
                  onChange={(e) => setDraft({ ...draft, sourceDoc: e.target.value })}
                  placeholder="URL or doc name"
                  data-testid="input-source-doc"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Saving…" : "Save Finding"}
              </Button>
            </div>
          </form>
        )}

        {findingsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading findings…</p>
        ) : findings.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground border border-dashed border-border rounded-md">
            No findings raised yet. Verdicts can be written freely.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[35%]">Finding</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead>Resolution</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {findings.map((f) => {
                  const open = isOpen(f.status);
                  return (
                    <TableRow
                      key={f.id}
                      data-testid={`row-finding-${f.id}`}
                      className={open ? "" : "opacity-60"}
                    >
                      <TableCell className="align-top">
                        <div className="text-sm whitespace-pre-wrap">{f.findingText}</div>
                        {f.sourceDoc && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Source:{" "}
                            {f.sourceDoc.startsWith("http") ? (
                              <a
                                href={f.sourceDoc}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:underline"
                              >
                                {f.sourceDoc}
                              </a>
                            ) : (
                              f.sourceDoc
                            )}
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground mt-1">
                          Raised {f.dateRaised?.slice(0, 10)} by {f.raisedBy ?? "unknown"}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <Select
                          value={f.severity}
                          onValueChange={(v) =>
                            patchMutation.mutate({ id: f.id, patch: { severity: v as any } })
                          }
                        >
                          <SelectTrigger className="h-8 w-[110px]">
                            <SelectValue asChild>
                              <Badge
                                variant="outline"
                                className={SEVERITY_STYLES[f.severity as FindingSeverity]}
                              >
                                {f.severity}
                              </Badge>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {FINDING_SEVERITIES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="align-top">
                        <Select
                          value={f.status}
                          onValueChange={(v) =>
                            patchMutation.mutate({ id: f.id, patch: { status: v as any } })
                          }
                        >
                          <SelectTrigger className="h-8 w-[220px]">
                            <SelectValue asChild>
                              <Badge
                                variant="outline"
                                className={STATUS_STYLES[f.status as FindingStatus]}
                              >
                                {STATUS_LABEL[f.status as FindingStatus] ?? f.status}
                              </Badge>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {FINDING_STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {STATUS_LABEL[s]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="align-top">
                        <Input
                          className="h-8 w-[120px]"
                          defaultValue={f.owner ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v !== (f.owner ?? "")) {
                              patchMutation.mutate({ id: f.id, patch: { owner: v || null } });
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <Input
                          type="date"
                          className="h-8 w-[140px]"
                          defaultValue={f.deadline ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value;
                            if (v !== (f.deadline ?? "")) {
                              patchMutation.mutate({ id: f.id, patch: { deadline: v || null } });
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <Textarea
                          className="min-h-[36px] text-xs w-[180px]"
                          rows={1}
                          defaultValue={f.resolutionNote ?? ""}
                          placeholder="Required if resolving"
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v !== (f.resolutionNote ?? "")) {
                              patchMutation.mutate({
                                id: f.id,
                                patch: { resolutionNote: v || null },
                              });
                            }
                          }}
                        />
                      </TableCell>
                      <TableCell className="align-top">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (confirm("Delete this finding?")) deleteMutation.mutate(f.id);
                          }}
                          data-testid={`button-delete-finding-${f.id}`}
                        >
                          <Trash2 size={14} className="text-red-400" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
