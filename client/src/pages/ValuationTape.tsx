import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { VALUATION_BANDS, VALUATION_BANDS_META } from "@/lib/valuationBands";
import { LineChart, Plus, Check, AlertTriangle, RefreshCw } from "lucide-react";

type TapeStatus = "draft" | "approved" | "expired" | "superseded";

interface TapeBand {
  bandId: string;
  maRev?: { low: number; median?: number; high: number };
  maEbitda?: { low: number; median?: number; high: number };
  vcRev?: { low: number; median?: number; high: number };
  sourceUrls?: string[];
}

interface ValuationTape {
  tapeId: string;
  asOf: string;
  expiresAt: string | null;
  status: TapeStatus;
  approverId: string | null;
  supersededBy: string | null;
  bands: TapeBand[];
  sourceNotes: string | null;
  draftedBy: string | null;
  versionedBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface CurrentResult {
  tape: ValuationTape | null;
  warning?: string;
  overrideApplied?: boolean;
}

const STATUS_STYLES: Record<TapeStatus, string> = {
  draft: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  expired: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  superseded: "bg-blue-500/15 text-blue-300 border-blue-500/30",
};

function staticTapeBands(): TapeBand[] {
  return Object.values(VALUATION_BANDS).map((b) => ({
    bandId: b.key,
    maRev: b.ma.evRevenue ? { low: b.ma.evRevenue.low, high: b.ma.evRevenue.high } : undefined,
    maEbitda: b.ma.evEbitda ? { low: b.ma.evEbitda.low, high: b.ma.evEbitda.high } : undefined,
    vcRev: b.vc?.evRevenue ? { low: b.vc.evRevenue.low, high: b.vc.evRevenue.high } : undefined,
    sourceUrls: b.sources.map((s) => s.url).filter(Boolean),
  }));
}

function fmtTriple(t?: { low: number; median?: number; high: number }) {
  if (!t) return "—";
  return t.median != null ? `${t.low} / ${t.median} / ${t.high}` : `${t.low}–${t.high}`;
}

export default function ValuationTapePage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<"draft,approved" | "all" | TapeStatus>("draft,approved");
  const [createOpen, setCreateOpen] = useState(false);
  const [asOf, setAsOf] = useState("");
  const [draftedBy, setDraftedBy] = useState("Signal Desk");
  const [sourceNotes, setSourceNotes] = useState("");
  const [prefillBands, setPrefillBands] = useState(true);
  const [approveFor, setApproveFor] = useState<ValuationTape | null>(null);
  const [approverId, setApproverId] = useState("");
  const [overrideTape, setOverrideTape] = useState<ValuationTape | null>(null);
  const [overrideAck, setOverrideAck] = useState(false);
  const [overrideWarning, setOverrideWarning] = useState<string | null>(null);
  const [overrideSelected, setOverrideSelected] = useState<ValuationTape | null>(null);

  const listQuery = useQuery<ValuationTape[]>({
    queryKey: ["/api/valuation-tapes", statusFilter],
    queryFn: async () => {
      const q = statusFilter === "all" ? "" : `?status=${encodeURIComponent(statusFilter)}`;
      const res = await apiRequest("GET", `/api/valuation-tapes${q}`);
      return res.json();
    },
  });

  const currentQuery = useQuery<CurrentResult>({
    queryKey: ["/api/valuation-tapes/current"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/valuation-tapes/current");
      return res.json();
    },
  });

  const tapes = listQuery.data ?? [];
  const current = currentQuery.data?.tape ?? null;

  const counts = useMemo(() => {
    const acc = { draft: 0, approved: 0, expired: 0, superseded: 0 };
    for (const t of tapes) acc[t.status] += 1;
    return acc;
  }, [tapes]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/valuation-tapes"] });
  };

  const createDraft = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/valuation-tapes", {
        as_of: asOf,
        drafted_by: draftedBy,
        source_notes: sourceNotes || null,
        bands: prefillBands ? staticTapeBands() : [],
      });
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setCreateOpen(false);
      setAsOf("");
      setSourceNotes("");
      toast({ title: "Draft created", description: "Signal Desk draft tape saved. Approve is a separate human action." });
    },
    onError: (err: any) => {
      toast({ title: "Could not create draft", description: err?.message, variant: "destructive" });
    },
  });

  const approve = useMutation({
    mutationFn: async () => {
      if (!approveFor) throw new Error("No tape selected");
      const res = await apiRequest("POST", `/api/valuation-tapes/${approveFor.tapeId}/approve`, {
        approver_id: approverId,
        versioned_by: approverId,
      });
      return res.json();
    },
    onSuccess: (tape: ValuationTape) => {
      invalidate();
      setApproveFor(null);
      setApproverId("");
      toast({ title: "Tape approved", description: `as_of ${tape.asOf} · expires ${tape.expiresAt}. Prior current (if any) is superseded.` });
    },
    onError: (err: any) => {
      toast({ title: "Approve failed", description: err?.message, variant: "destructive" });
    },
  });

  const selectOverride = useMutation({
    mutationFn: async () => {
      if (!overrideTape) throw new Error("No tape selected");
      if (!overrideAck) throw new Error("Check the override flag to select an expired or superseded tape as current.");
      const res = await fetch(
        `/api/valuation-tapes/current?tapeId=${encodeURIComponent(overrideTape.tapeId)}&override=1`,
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || res.statusText);
      return body as CurrentResult;
    },
    onSuccess: (result) => {
      setOverrideTape(null);
      setOverrideSelected(result.tape);
      setOverrideWarning(result.warning ?? "Override applied — this tape is not the live approved current.");
      toast({ title: "Override applied (not live current)", description: result.warning });
    },
    onError: (err: any) => {
      toast({ title: "Cannot select as current", description: err?.message, variant: "destructive" });
    },
  });

  return (
    <div className="flex-1 overflow-auto">
      <div className="bg-gradient-to-br from-[#012652] to-[#032958] px-8 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <LineChart size={22} className="text-cyan-300" />
            <h1 className="text-2xl font-bold text-white">Valuation Tape</h1>
          </div>
          <p className="text-blue-200/70 text-sm max-w-3xl">
            Dated comps tape. Signal Desk drafts; a human (Leonard — ops policy) approves.
            No bot default. Not Content Studio–owned. Approving a new tape supersedes the prior current.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-8 py-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Drafts (this view)" value={counts.draft} />
          <Kpi label="Approved (this view)" value={counts.approved} />
          <Kpi label="Current as_of" value={current?.asOf ?? "—"} />
          <Kpi label="Current expires" value={current?.expiresAt ?? "—"} />
        </div>

        {current ? (
          <Card data-testid="current-approved-tape" className="border-emerald-700/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Check size={16} className="text-emerald-400" />
                Current approved tape
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div><span className="text-muted-foreground">tape_id</span> · <span className="font-mono text-xs">{current.tapeId}</span></div>
              <div>as_of {current.asOf} · expires_at {current.expiresAt} · approved by {current.approverId}</div>
              <div className="text-muted-foreground">{current.bands.length} band{current.bands.length === 1 ? "" : "s"} · drafted by {current.draftedBy ?? "—"} · versioned by {current.versionedBy ?? "—"}</div>
              {current.sourceNotes && <div className="text-xs text-muted-foreground whitespace-pre-wrap">{current.sourceNotes}</div>}
            </CardContent>
          </Card>
        ) : (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No current approved tape</AlertTitle>
            <AlertDescription>Create a draft and have a human approve it. getCurrentApprovedTape() is empty.</AlertDescription>
          </Alert>
        )}

        {overrideWarning && (
          <Alert variant="destructive" data-testid="override-warning">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Override current (not the live approved tape)</AlertTitle>
            <AlertDescription>
              {overrideWarning}
              {overrideSelected && (
                <div className="mt-2 text-xs">
                  Selected {overrideSelected.tapeId} · as_of {overrideSelected.asOf} · status {overrideSelected.status}.
                  The banner above remains getCurrentApprovedTape() (approved, non-expired).
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-[220px]" data-testid="select-tape-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft,approved">Drafts + approved</SelectItem>
              <SelectItem value="draft">Drafts</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="superseded">Superseded</SelectItem>
              <SelectItem value="all">All statuses</SelectItem>
            </SelectContent>
          </Select>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-draft">
                <Plus size={16} className="mr-2" />
                Create draft
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create draft tape</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="tape-as-of">as_of (comps date)</Label>
                  <Input id="tape-as-of" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} data-testid="input-as-of" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tape-drafted-by">drafted_by</Label>
                  <Input id="tape-drafted-by" value={draftedBy} onChange={(e) => setDraftedBy(e.target.value)} data-testid="input-drafted-by" />
                  <p className="text-[11px] text-muted-foreground">Signal Desk is the expected drafter. Content Studio is rejected.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tape-notes">source_notes</Label>
                  <Textarea id="tape-notes" value={sourceNotes} onChange={(e) => setSourceNotes(e.target.value)} rows={3} data-testid="input-source-notes" />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={prefillBands} onCheckedChange={(v) => setPrefillBands(v === true)} data-testid="check-prefill-bands" />
                  Prefill bands from {VALUATION_BANDS_META.preparedDate} live tape snapshot
                </label>
                <div className="flex justify-end">
                  <Button onClick={() => createDraft.mutate()} disabled={!asOf || createDraft.isPending} data-testid="button-submit-draft">
                    {createDraft.isPending ? "Saving…" : "Save draft"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{tapes.length} tape{tapes.length === 1 ? "" : "s"}</CardTitle>
          </CardHeader>
          <CardContent>
            {listQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : tapes.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-md">
                No tapes in this filter. Create a Signal Desk draft to start the monthly cycle.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>as_of</TableHead>
                      <TableHead>expires_at</TableHead>
                      <TableHead>Drafted / approved</TableHead>
                      <TableHead>Bands</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tapes.map((t) => (
                      <TableRow key={t.tapeId} data-testid={`row-tape-${t.status}`}>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_STYLES[t.status]}>{t.status}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{t.asOf}</TableCell>
                        <TableCell className="text-sm">{t.expiresAt ?? "—"}</TableCell>
                        <TableCell className="text-xs">
                          <div>{t.draftedBy ?? "—"}</div>
                          <div className="text-muted-foreground">{t.approverId ? `approved by ${t.approverId}` : "not approved"}</div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {t.bands.length}
                          {t.bands[0] && (
                            <div className="mt-1">{t.bands[0].bandId}: MA rev {fmtTriple(t.bands[0].maRev)}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          {t.status === "draft" && (
                            <Button size="sm" variant="secondary" onClick={() => { setApproveFor(t); setApproverId(""); }} data-testid="button-approve-tape">
                              Approve
                            </Button>
                          )}
                          {(t.status === "expired" || t.status === "superseded") && (
                            <Button size="sm" variant="outline" onClick={() => { setOverrideTape(t); setOverrideAck(false); }} data-testid="button-select-override">
                              Use as current…
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!approveFor} onOpenChange={(open) => { if (!open) setApproveFor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve tape</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Requires as_of (already on the draft) and a human approver_id. Leonard-only is ops policy —
            the API will not default a bot or system user. Approving supersedes the prior current approved tape.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="approver-id">approver_id</Label>
            <Input
              id="approver-id"
              value={approverId}
              onChange={(e) => setApproverId(e.target.value)}
              placeholder="Leonard"
              data-testid="input-approver-id"
            />
          </div>
          <div className="text-xs text-muted-foreground">
            as_of {approveFor?.asOf} → expires_at {approveFor?.expiresAt} (month-end + 7-day grace)
          </div>
          <div className="flex justify-end">
            <Button onClick={() => approve.mutate()} disabled={!approverId.trim() || approve.isPending} data-testid="button-confirm-approve">
              {approve.isPending ? "Approving…" : "Approve"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!overrideTape} onOpenChange={(open) => { if (!open) setOverrideTape(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select expired/superseded as current</DialogTitle>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Override required</AlertTitle>
            <AlertDescription>
              This tape is {overrideTape?.status}. It cannot be selected as current without an explicit override flag.
            </AlertDescription>
          </Alert>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={overrideAck} onCheckedChange={(v) => setOverrideAck(v === true)} data-testid="check-override-flag" />
            I explicitly override and understand this is not the live approved tape
          </label>
          <div className="flex justify-end">
            <Button
              variant="destructive"
              onClick={() => selectOverride.mutate()}
              disabled={!overrideAck || selectOverride.isPending}
              data-testid="button-confirm-override"
            >
              <RefreshCw size={14} className="mr-2" />
              Select with override
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
