import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { AlertTriangle, ExternalLink, Search } from "lucide-react";
import {
  FINDING_SEVERITIES,
  type Finding,
  type FindingSeverity,
} from "@shared/schema";

type OpenFinding = Finding & { companyName: string };

const SEVERITY_STYLES: Record<FindingSeverity, string> = {
  low: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  medium: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  high: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  critical: "bg-red-500/20 text-red-300 border-red-500/40",
};

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export default function Findings() {
  const [severity, setSeverity] = useState<"all" | FindingSeverity>("all");
  const [q, setQ] = useState("");

  const findingsQuery = useQuery<OpenFinding[]>({
    queryKey: ["/api/findings"],
  });

  const findings = findingsQuery.data ?? [];

  const filtered = useMemo(() => {
    const lower = q.trim().toLowerCase();
    return findings
      .filter((f) => (severity === "all" ? true : f.severity === severity))
      .filter((f) => {
        if (!lower) return true;
        return (
          (f.findingText ?? "").toLowerCase().includes(lower) ||
          (f.companyName ?? "").toLowerCase().includes(lower) ||
          (f.owner ?? "").toLowerCase().includes(lower)
        );
      })
      .sort((a, b) => {
        const sa = SEVERITY_RANK[a.severity as FindingSeverity] ?? 99;
        const sb = SEVERITY_RANK[b.severity as FindingSeverity] ?? 99;
        if (sa !== sb) return sa - sb;
        return (b.dateRaised ?? "").localeCompare(a.dateRaised ?? "");
      });
  }, [findings, severity, q]);

  const bySev = useMemo(() => {
    const acc: Record<FindingSeverity, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    findings.forEach((f) => {
      const s = f.severity as FindingSeverity;
      if (s in acc) acc[s]++;
    });
    return acc;
  }, [findings]);

  const blockingCount = bySev.critical + bySev.high;

  return (
    <div className="flex-1 overflow-auto">
      <div className="bg-gradient-to-br from-[#012652] to-[#032958] px-8 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle size={22} className="text-amber-300" />
            <h1 className="text-2xl font-bold text-white">Open Findings</h1>
          </div>
          <p className="text-blue-200/70 text-sm max-w-3xl">
            Every open finding across the portfolio. High and critical findings block INVEST
            verdicts on their company until dispositioned.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-8 py-6 space-y-6">
        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Kpi label="Total Open" value={findings.length} tone="neutral" />
          <Kpi
            label="Blocking (High+Critical)"
            value={blockingCount}
            tone={blockingCount > 0 ? "danger" : "success"}
          />
          <Kpi label="Critical" value={bySev.critical} tone="danger" />
          <Kpi label="High" value={bySev.high} tone="warning" />
          <Kpi label="Medium" value={bySev.medium} tone="neutral" />
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Filter</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[220px] relative">
              <Search
                size={14}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search company, finding text, or owner"
                className="pl-7"
                data-testid="input-findings-search"
              />
            </div>
            <Select value={severity} onValueChange={(v) => setSeverity(v as any)}>
              <SelectTrigger className="w-[180px]" data-testid="select-findings-severity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                {FINDING_SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {filtered.length} finding{filtered.length === 1 ? "" : "s"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {findingsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : filtered.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground border border-dashed border-border rounded-md">
                No open findings match the current filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company</TableHead>
                      <TableHead className="w-[35%]">Finding</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Deadline</TableHead>
                      <TableHead>Raised</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((f) => (
                      <TableRow key={f.id} data-testid={`row-open-finding-${f.id}`}>
                        <TableCell>
                          <Link
                            href={`/companies/${f.companyId}`}
                            data-testid={`link-company-${f.companyId}`}
                          >
                            <span className="text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer">
                              {f.companyName || `#${f.companyId}`}
                              <ExternalLink size={12} />
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="whitespace-pre-wrap">{f.findingText}</div>
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
                                  link
                                </a>
                              ) : (
                                f.sourceDoc
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={SEVERITY_STYLES[f.severity as FindingSeverity]}
                          >
                            {f.severity}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{f.owner ?? "—"}</TableCell>
                        <TableCell className="text-sm">{f.deadline ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {f.dateRaised?.slice(0, 10)}
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
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "text-red-400"
      : tone === "warning"
        ? "text-amber-400"
        : tone === "success"
          ? "text-emerald-400"
          : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold mt-1 ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
