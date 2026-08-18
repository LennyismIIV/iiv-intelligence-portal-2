import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { AlertOctagon, CheckCircle2 } from "lucide-react";

interface Props {
  companyId: number;
}

interface DecisionSummary {
  gates: Array<{ gateId: string; status: string }>;
  openFindingsBySeverity: { low: number; medium: number; high: number; critical: number };
  openFindingsCount: number;
  criticalOrHighBlockers: number;
  dimensionFloors: Array<{ id: number; lensType: string; dimension: string; cappedAt: number }>;
  canWriteInvestVerdict: boolean;
  blockingReasons: string[];
}

export function VerdictBanner({ companyId }: Props) {
  const { data, isLoading } = useQuery<DecisionSummary>({
    queryKey: ["/api/companies", companyId, "decision-summary"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/companies/${companyId}/decision-summary`);
      return res.json();
    },
    refetchOnMount: "always",
  });

  if (isLoading || !data) return null;

  if (data.canWriteInvestVerdict) {
    return (
      <div
        className="flex items-center gap-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 mb-4"
        data-testid="verdict-banner-clear"
      >
        <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
        <div className="flex-1 text-sm">
          <span className="font-medium text-emerald-300">INVEST verdict is writable.</span>{" "}
          <span className="text-emerald-200/80">
            No open critical/high findings. All decision gates in good standing.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-start gap-3 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 mb-4"
      data-testid="verdict-banner-blocked"
    >
      <AlertOctagon size={20} className="text-red-400 shrink-0 mt-0.5" />
      <div className="flex-1 text-sm">
        <div className="font-medium text-red-300 mb-1">INVEST verdict is blocked.</div>
        <ul className="list-disc list-inside space-y-0.5 text-red-200/85 text-xs">
          {data.blockingReasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
