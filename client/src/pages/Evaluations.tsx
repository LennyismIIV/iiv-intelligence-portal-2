import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import {
  Trophy, TrendingUp, Users, ChartBar, ExternalLink, Search, Award,
  Filter, Activity, Target, Sparkles,
} from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";

// Lens metadata - matches LensSelector
const LENSES = [
  { key: "iic", label: "IIC Innovation", maxScore: 54, icon: Sparkles, status: "live" },
  { key: "thesis", label: "Thesis Alignment", maxScore: 100, icon: Target, status: "live" },
  { key: "grid", label: "Competitive Grid", maxScore: 100, icon: ChartBar, status: "live" },
  { key: "momentum", label: "Market Momentum", maxScore: 100, icon: TrendingUp, status: "phase 3" },
  { key: "grit", label: "GRIT Trends", maxScore: 100, icon: Activity, status: "phase 4" },
  { key: "diligence", label: "Due Diligence", maxScore: 100, icon: Award, status: "phase 6" },
  { key: "ai-native", label: "AI-Native Efficiency", maxScore: 100, icon: Sparkles, status: "phase 7" },
  { key: "valuation", label: "Valuation Model", maxScore: 100, icon: ChartBar, status: "phase 8" },
];

// IIC dimension labels for column headers
const IIC_DIMENSION_LABELS: Record<string, string> = {
  originality: "Originality",
  market_opportunity: "Market",
  scalability_ai: "Scalability",
  ease_adoption: "Adoption",
  clarity_impact: "Impact",
  ai_moat: "AI Moat",
  category_creation: "Category",
};

interface LeaderboardEntry {
  companyId: number;
  companyName: string;
  category: string | null;
  competitionStatus: string | null;
  competitionYear: number | null;
  companyType: string | null;
  totalScore: number;
  dimensionCount: number;
  dimensions: Array<{
    dimension: string;
    score: number;
    notes: string | null;
    evaluatorId: string | null;
    updatedAt: string | null;
  }>;
  lastUpdated: string | null;
}

interface LeaderboardResponse {
  lensType: string;
  entries: LeaderboardEntry[];
}

interface SummaryResponse {
  totalCompanies: number;
  evaluatedCompanies: number;
  coveragePercent: number;
  totalScoresRecorded: number;
  byLens: Array<{
    lensType: string;
    companiesEvaluated: number;
    totalScores: number;
    averageScore: number;
  }>;
}

export default function Evaluations() {
  const [activeLens, setActiveLens] = useState<string>("iic");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Summary across all lenses
  const { data: summary, isLoading: summaryLoading } = useQuery<SummaryResponse>({
    queryKey: ["/api/evaluations/summary"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/evaluations/summary");
      return res.json();
    },
  });

  // Leaderboard for active lens
  const { data: leaderboard, isLoading: lbLoading } = useQuery<LeaderboardResponse>({
    queryKey: ["/api/evaluations/leaderboard", activeLens],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/evaluations/leaderboard?lens=${activeLens}`);
      return res.json();
    },
  });

  const filteredEntries = useMemo(() => {
    if (!leaderboard?.entries) return [];
    return leaderboard.entries.filter(e => {
      if (search && !e.companyName.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== "all" && e.competitionStatus !== statusFilter) return false;
      return true;
    });
  }, [leaderboard, search, statusFilter]);

  const activeLensMeta = LENSES.find(l => l.key === activeLens) || LENSES[0];

  // Get top 10 for chart visualization
  const top10Chart = useMemo(() => {
    return filteredEntries.slice(0, 10).map(e => ({
      name: e.companyName.length > 18 ? e.companyName.substring(0, 16) + "…" : e.companyName,
      fullName: e.companyName,
      score: Number(e.totalScore.toFixed(1)),
    }));
  }, [filteredEntries]);

  // Average scores by dimension across the cohort (radar chart)
  const cohortAverages = useMemo(() => {
    if (!filteredEntries.length || activeLens !== "iic") return [];
    const dimensionTotals = new Map<string, { sum: number; count: number }>();
    filteredEntries.forEach(entry => {
      entry.dimensions.forEach(d => {
        const existing = dimensionTotals.get(d.dimension) || { sum: 0, count: 0 };
        existing.sum += d.score;
        existing.count += 1;
        dimensionTotals.set(d.dimension, existing);
      });
    });
    return Array.from(dimensionTotals.entries())
      .filter(([key]) => IIC_DIMENSION_LABELS[key])
      .map(([key, data]) => ({
        dimension: IIC_DIMENSION_LABELS[key] || key,
        average: Number((data.sum / data.count).toFixed(2)),
        fullMark: 10,
      }));
  }, [filteredEntries, activeLens]);

  return (
    <div className="flex-1 overflow-auto">
    <div className="space-y-6 p-6 max-w-[1400px] mx-auto" data-testid="evaluations-page">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Evaluations</h1>
        <p className="text-muted-foreground mt-1">
          Cross-company evaluation leaderboards, lens-by-lens rankings, and analytical comparison views
        </p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {summaryLoading ? (
          <>
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </>
        ) : (
          <>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold">{summary?.evaluatedCompanies || 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">Companies Evaluated</p>
                  </div>
                  <Users className="h-8 w-8 text-blue-400/60" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold">{summary?.coveragePercent || 0}%</div>
                    <p className="text-xs text-muted-foreground mt-1">Portfolio Coverage</p>
                  </div>
                  <Target className="h-8 w-8 text-green-400/60" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold">{summary?.totalScoresRecorded || 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">Total Scores Recorded</p>
                  </div>
                  <Activity className="h-8 w-8 text-cyan-400/60" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold">{summary?.byLens?.length || 0}</div>
                    <p className="text-xs text-muted-foreground mt-1">Active Lenses</p>
                  </div>
                  <Sparkles className="h-8 w-8 text-purple-400/60" />
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Lens-by-lens summary strip */}
      {summary && summary.byLens && summary.byLens.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Activity by Lens</CardTitle>
            <CardDescription>How many companies have been evaluated under each lens</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {LENSES.map(lens => {
                const data = summary.byLens.find(l => l.lensType === lens.key);
                const Icon = lens.icon;
                const hasData = !!data && data.companiesEvaluated > 0;
                return (
                  <button
                    key={lens.key}
                    onClick={() => setActiveLens(lens.key)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md border text-xs transition-colors ${
                      activeLens === lens.key
                        ? "bg-primary text-primary-foreground border-primary"
                        : hasData
                        ? "bg-card hover:bg-muted border-border"
                        : "bg-muted/30 text-muted-foreground border-border"
                    }`}
                    data-testid={`lens-button-${lens.key}`}
                  >
                    <Icon size={14} />
                    <span className="font-medium">{lens.label}</span>
                    <Badge
                      variant={hasData ? "default" : "outline"}
                      className="ml-1 text-[10px] h-5"
                    >
                      {data?.companiesEvaluated || 0}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Leaderboard Tabs */}
      <Tabs value={activeLens} onValueChange={setActiveLens}>
        <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8 text-xs">
          {LENSES.map(lens => (
            <TabsTrigger key={lens.key} value={lens.key} data-testid={`tab-${lens.key}`}>
              {lens.label.split(" ")[0]}
            </TabsTrigger>
          ))}
        </TabsList>

        {LENSES.map(lens => (
          <TabsContent key={lens.key} value={lens.key} className="space-y-4 mt-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <lens.icon size={20} />
                  {lens.label} Leaderboard
                </h2>
                <p className="text-sm text-muted-foreground">
                  {lens.status === "live"
                    ? `Ranked by total score across all dimensions (max ${lens.maxScore})`
                    : `Lens scheduled for ${lens.status} — scores will appear here once recorded`}
                </p>
              </div>
              {lens.status !== "live" && (
                <Badge variant="outline" className="text-xs">{lens.status}</Badge>
              )}
            </div>

            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter by company name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  data-testid="search-input"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]" data-testid="status-filter">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Winner">Winners</SelectItem>
                  <SelectItem value="Finalist">Finalists</SelectItem>
                  <SelectItem value="Entrant">Entrants</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Charts row */}
            {!lbLoading && filteredEntries.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Top 10 Scores</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={top10Chart} layout="vertical" margin={{ left: 5, right: 20, top: 5, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis type="number" domain={[0, lens.maxScore]} tick={{ fontSize: 11 }} />
                          <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                          <Tooltip
                            content={({ payload }) => {
                              if (payload && payload.length > 0) {
                                const d = payload[0].payload;
                                return (
                                  <div className="bg-background border p-2 rounded shadow text-sm">
                                    <div className="font-semibold">{d.fullName}</div>
                                    <div>Score: {d.score} / {lens.maxScore}</div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar dataKey="score" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {activeLens === "iic" && cohortAverages.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Cohort Average by Dimension</CardTitle>
                      <CardDescription className="text-xs">
                        Average scores across {filteredEntries.length} evaluated {filteredEntries.length === 1 ? "company" : "companies"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[280px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart data={cohortAverages}>
                            <PolarGrid className="stroke-muted" />
                            <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11 }} />
                            <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fontSize: 10 }} />
                            <Radar name="Average" dataKey="average" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.4} />
                            <Tooltip />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Leaderboard Table */}
            <Card>
              <CardContent className="p-0">
                {lbLoading ? (
                  <div className="p-6 space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : filteredEntries.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground">
                    <Trophy className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No evaluations recorded for this lens yet</p>
                    <p className="text-sm mt-1">
                      Score companies from their detail pages to populate this leaderboard
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold w-12">#</th>
                          <th className="px-4 py-3 text-left font-semibold">Company</th>
                          <th className="px-4 py-3 text-left font-semibold">Category</th>
                          <th className="px-4 py-3 text-left font-semibold">Status</th>
                          <th className="px-4 py-3 text-right font-semibold">Score</th>
                          <th className="px-4 py-3 text-center font-semibold">Dimensions</th>
                          <th className="px-4 py-3 text-left font-semibold">Last Updated</th>
                          <th className="px-4 py-3 text-right font-semibold w-12"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEntries.map((entry, idx) => {
                          const scoreColor =
                            entry.totalScore >= lens.maxScore * 0.75
                              ? "text-green-500"
                              : entry.totalScore >= lens.maxScore * 0.5
                              ? "text-blue-500"
                              : "text-muted-foreground";
                          return (
                            <tr
                              key={entry.companyId}
                              className="border-b hover:bg-muted/30 transition-colors"
                              data-testid={`leaderboard-row-${entry.companyId}`}
                            >
                              <td className="px-4 py-3 font-mono text-muted-foreground">
                                {idx === 0 && <Trophy className="h-4 w-4 inline text-yellow-500 mr-1" />}
                                {idx + 1}
                              </td>
                              <td className="px-4 py-3">
                                <Link href={`/companies/${entry.companyId}`}>
                                  <span className="font-medium hover:text-primary cursor-pointer">
                                    {entry.companyName}
                                  </span>
                                </Link>
                                {entry.competitionYear && (
                                  <span className="text-xs text-muted-foreground ml-2">
                                    {entry.competitionYear}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-muted-foreground text-xs">
                                {entry.category || "—"}
                              </td>
                              <td className="px-4 py-3">
                                {entry.competitionStatus && (
                                  <Badge
                                    variant={
                                      entry.competitionStatus === "Winner"
                                        ? "default"
                                        : entry.competitionStatus === "Finalist"
                                        ? "secondary"
                                        : "outline"
                                    }
                                    className="text-xs"
                                  >
                                    {entry.competitionStatus}
                                  </Badge>
                                )}
                              </td>
                              <td className={`px-4 py-3 text-right font-mono font-bold ${scoreColor}`}>
                                {entry.totalScore.toFixed(1)}
                                <span className="text-xs text-muted-foreground font-normal ml-1">
                                  / {lens.maxScore}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <TooltipProvider>
                                  <UITooltip>
                                    <TooltipTrigger asChild>
                                      <Badge variant="outline" className="text-xs cursor-help">
                                        {entry.dimensionCount}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <div className="text-xs space-y-1">
                                        {entry.dimensions.map(d => (
                                          <div key={d.dimension} className="flex justify-between gap-3">
                                            <span>
                                              {IIC_DIMENSION_LABELS[d.dimension] || d.dimension}:
                                            </span>
                                            <span className="font-mono font-semibold">{d.score}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </TooltipContent>
                                  </UITooltip>
                                </TooltipProvider>
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">
                                {entry.lastUpdated
                                  ? new Date(entry.lastUpdated).toLocaleDateString(undefined, {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                    })
                                  : "—"}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <Link href={`/companies/${entry.companyId}`}>
                                  <ExternalLink
                                    size={14}
                                    className="text-muted-foreground hover:text-primary cursor-pointer"
                                  />
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
    </div>
  );
}
