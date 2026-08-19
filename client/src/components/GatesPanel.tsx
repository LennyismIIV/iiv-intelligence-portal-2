import { useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { GATE_IDS, GATE_STATUSES, type Gate, type GateId, type GateStatus } from "@shared/schema";
import { ShieldCheck, ShieldAlert, Shield } from "lucide-react";

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

const GATE_LABEL: Record<GateId, string> = {
  G0: "G0 · Integrity & Data Completeness",
  G1: "G1 · Investment Fit",
  G2: "G2 · Final IC Gate",
};

const GATE_DESCRIPTION: Record<GateId, string> = {
  G0: "Have we confirmed the basic facts, filings, and contact points? Anything missing here blocks everything downstream.",
  G1: "Does this fit IIV thesis, stage, ticket, and ownership targets? A failed G1 kills the memo before diligence begins.",
  G2: "Is the memo complete, gates passed, findings dispositioned? G2 must be cleared before an INVEST verdict can be written.",
};

const STATUS_STYLES: Record<GateStatus, string> = {
  open: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  cleared: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  failed: "bg-red-500/20 text-red-300 border-red-500/40",
  expired: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

function iconFor(status: GateStatus | undefined) {
  if (status === "cleared") return <ShieldCheck size={16} className="text-emerald-400" />;
  if (status === "failed") return <ShieldAlert size={16} className="text-red-400" />;
  return <Shield size={16} className="text-yellow-400" />;
}

export function GatesPanel({ companyId }: Props) {
  const { toast } = useToast();
  const evaluatorId = useMemo(() => getOrCreateEvaluatorId(), []);

  const gatesQuery = useQuery<Gate[]>({
    queryKey: ["/api/companies", companyId, "gates"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/companies/${companyId}/gates`);
      return res.json();
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "gates"] });
    queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "decision-summary"] });
  };

  const upsertMutation = useMutation({
    mutationFn: async ({
      gateId,
      status,
      notes,
    }: {
      gateId: GateId;
      status: GateStatus;
      notes?: string | null;
    }) => {
      const res = await apiRequest("PUT", `/api/companies/${companyId}/gates/${gateId}`, {
        status,
        notes: notes ?? undefined,
        evaluator: evaluatorId,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidate();
    },
    onError: (err: any) => {
      toast({ title: "Gate update failed", description: err?.message, variant: "destructive" });
    },
  });

  const byId = new Map<string, Gate>();
  (gatesQuery.data ?? []).forEach((g) => byId.set(g.gateId, g));

  return (
    <Card data-testid="gates-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-blue-400" />
          Decision Gates
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Three sequential gates. G2 must be cleared before an INVEST verdict can be written.
          A failed gate at any level blocks INVEST until it is re-opened and cleared.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {GATE_IDS.map((gid) => {
          const g = byId.get(gid);
          const status: GateStatus = (g?.status as GateStatus) ?? "open";
          return (
            <div
              key={gid}
              className="border border-border rounded-md p-3 bg-muted/20"
              data-testid={`gate-row-${gid}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {iconFor(status)}
                    <span className="font-medium text-sm">{GATE_LABEL[gid]}</span>
                    <Badge variant="outline" className={STATUS_STYLES[status]}>
                      {status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{GATE_DESCRIPTION[gid]}</p>
                </div>
                <Select
                  value={status}
                  onValueChange={(v) =>
                    upsertMutation.mutate({
                      gateId: gid,
                      status: v as GateStatus,
                      notes: g?.notes ?? null,
                    })
                  }
                >
                  <SelectTrigger className="h-8 w-[120px] shrink-0" data-testid={`select-gate-${gid}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GATE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                className="mt-2 text-xs"
                rows={1}
                defaultValue={g?.notes ?? ""}
                placeholder="Notes / rationale (optional)"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (g?.notes ?? "")) {
                    upsertMutation.mutate({ gateId: gid, status, notes: v || null });
                  }
                }}
              />
              {g?.lastEvaluatedAt && (
                <div className="text-[10px] text-muted-foreground mt-1">
                  Last evaluated {g.lastEvaluatedAt.slice(0, 16).replace("T", " ")} by{" "}
                  {g.evaluator ?? "unknown"}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
