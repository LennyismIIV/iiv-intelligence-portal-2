import { useQuery } from "@tanstack/react-query";
import { IIVLogo } from "@/components/IIVLogo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Trophy, Activity, DollarSign, Landmark, Search, ExternalLink } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { useState } from "react";
import { Link } from "wouter";
import type { Company } from "@shared/schema";

const CHART_COLORS = ["#3b82f6", "#06b6d4", "#2dd4bf", "#60a5fa", "#38bdf8", "#818cf8", "#a78bfa", "#67e8f9"];

function formatRevenue(val: number): string {
  if (!val) return "$0";
  if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
  return `$${val}`;
}

export default function Dashboard() {
  const [search, setSearch] = useState("");

  const { data: stats, isLoading: statsLoading } = useQuery<any>({
    queryKey: ["/api/stats"],
  });

  const { data: searchResults } = useQuery<Company[]>({
    queryKey: ["/api/search", search],
    queryFn: async () => {
      if (!search) return [];
      const { apiRequest } = await import("@/lib/queryClient");
      const res = await apiRequest("GET", `/api/search?q=${encodeURIComponent(search)}`);
      return res.json();
    },
    enabled: search.length > 1,
  });

  const { data: recentCompanies } = useQuery<{ companies: Company[]; total: number }>({
    queryKey: ["/api/companies", "recent"],
    queryFn: async () => {
      const { apiRequest } = await import("@/lib/queryClient");
      const res = await apiRequest("GET", "/api/companies?sort=year&order=desc&limit=8");
      return res.json();
    },
  });

  const kpiCards = [
    { label: "Total Companies", value: stats?.totalCompanies || 0, icon: Building2, color: "text-blue-400" },
    { label: "Competition Winners", value: stats?.winners || 0, icon: Trophy, color: "text-yellow-400" },
    { label: "Active Companies", value: stats?.activeCompanies || 0, icon: Activity, color: "text-emerald-400" },
    { label: "Total Est. Revenue", value: formatRevenue(stats?.totalRevenue || 0), icon: DollarSign, color: "text-green-400" },
    { label: "Companies with Funding", value: stats?.withFunding || 0, icon: Landmark, color: "text-cyan-400" },
  ];

  // Prepare MA status data for pie chart
  const maData = stats?.byMaStatus
    ?.filter((m: any) => m.count > 3)
    .map((m: any) => ({
      name: (m.maStatus || "Unknown").substring(0, 30),
      value: m.count,
    }))
    .sort((a: any, b: any) => b.value - a.value)
    .slice(0, 8) || [];

  // Prepare category data
  const categoryData = stats?.byCategory
    ?.sort((a: any, b: any) => b.count - a.count)
    .slice(0, 10)
    .map((c: any) => ({
      name: (c.category || "Unknown").substring(0, 25),
      count: c.count,
    })) || [];

  return (
    <div className="flex-1 overflow-auto">
      {/* Hero Section */}
      <div className="relative bg-gradient-to-br from-[#012652] to-[#032958] px-8 py-12">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 25% 25%, rgba(59, 130, 246, 0.15) 0%, transparent 50%),
              radial-gradient(circle at 75% 75%, rgba(6, 182, 212, 0.1) 0%, transparent 50%)`,
          }} />
        </div>
        <div className="relative max-w-6xl mx-auto">
          <div className="flex items-center gap-4 mb-4">
            <IIVLogo size={48} className="text-white" />
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Company Intelligence Portal</h1>
              <p className="text-blue-200/70 text-sm">Real-time competitive intelligence for 289+ insights & analytics startups</p>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative mt-6 max-w-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-300/60" size={20} />
            <Input
              data-testid="input-global-search"
              type="search"
              placeholder="Search companies, categories, technologies..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-12 pr-4 py-6 text-base bg-white/10 border-white/20 text-white placeholder:text-blue-200/50 focus:bg-white/15 focus:border-blue-400/50 rounded-lg"
            />
            {/* Search Results Dropdown */}
            {search && searchResults && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-lg shadow-lg max-h-80 overflow-auto z-50">
                {searchResults.slice(0, 10).map((c) => (
                  <Link key={c.id} href={`/companies/${c.id}`}>
                    <div className="px-4 py-3 hover:bg-muted cursor-pointer border-b border-border/50 last:border-0" data-testid={`search-result-${c.id}`}>
                      <div className="font-medium text-sm">{c.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{c.category} · {c.competitionYear} · {c.competitionStatus}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="max-w-6xl mx-auto px-8 -mt-6 relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {kpiCards.map((kpi, i) => (
            <Card key={i} className="bg-card border-border" data-testid={`kpi-${kpi.label.toLowerCase().replace(/\s/g, '-')}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <kpi.icon size={16} className={kpi.color} />
                  <span className="text-xs text-muted-foreground">{kpi.label}</span>
                </div>
                {statsLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <div className="text-xl font-bold">{kpi.value}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Charts */}
      <div className="max-w-6xl mx-auto px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Companies by Year */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Companies by Competition Year</CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={stats?.byYear || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 25%)" />
                    <XAxis dataKey="year" tick={{ fill: "hsl(0, 0%, 55%)", fontSize: 11 }} />
                    <YAxis tick={{ fill: "hsl(0, 0%, 55%)", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: "hsl(220, 49%, 10%)", border: "1px solid hsl(220, 20%, 25%)", borderRadius: "8px", color: "white" }}
                    />
                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Companies" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* M&A Status Pie Chart */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Companies by M&A Status</CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={maData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      dataKey="value"
                      paddingAngle={2}
                    >
                      {maData.map((_: any, index: number) => (
                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "hsl(220, 49%, 10%)", border: "1px solid hsl(220, 20%, 25%)", borderRadius: "8px", color: "white" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
              <div className="flex flex-wrap gap-2 mt-2">
                {maData.map((item: any, i: number) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span>{item.name} ({item.value})</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Companies by Category */}
          <Card className="bg-card border-border lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Companies by Category</CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={categoryData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 20%, 25%)" />
                    <XAxis type="number" tick={{ fill: "hsl(0, 0%, 55%)", fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={180} tick={{ fill: "hsl(0, 0%, 55%)", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: "hsl(220, 49%, 10%)", border: "1px solid hsl(220, 20%, 25%)", borderRadius: "8px", color: "white" }}
                    />
                    <Bar dataKey="count" fill="#06b6d4" radius={[0, 4, 4, 0]} name="Companies" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent Companies Grid */}
      <div className="max-w-6xl mx-auto px-8 pb-8">
        <h2 className="text-sm font-semibold mb-4">Recent Competition Entries</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {recentCompanies?.companies?.map((c) => (
            <Link key={c.id} href={`/companies/${c.id}`}>
              <Card className="bg-card border-border hover:border-primary/40 cursor-pointer transition-colors h-full" data-testid={`company-card-${c.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-sm truncate">{c.name}</h3>
                    {c.website && (
                      <ExternalLink size={12} className="text-muted-foreground flex-shrink-0 ml-1" />
                    )}
                  </div>
                  <div className="flex gap-1.5 mb-2 flex-wrap">
                    {c.competitionYear && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{c.competitionYear}</Badge>
                    )}
                    {c.competitionStatus && (
                      <Badge
                        className={`text-[10px] px-1.5 py-0 ${
                          c.competitionStatus.toLowerCase() === "winner"
                            ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                            : c.competitionStatus === "Finalist"
                            ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                            : "bg-muted text-muted-foreground"
                        }`}
                        variant="outline"
                      >
                        {c.competitionStatus}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{c.description}</p>
                  {c.category && (
                    <div className="text-[10px] text-muted-foreground">{c.category}</div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border py-6 px-8 bg-card/50">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <IIVLogo size={16} className="text-muted-foreground" />
            <span>Insight Innovation Ventures</span>
          </div>
          <a
            href="https://www.perplexity.ai/computer"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors"
          >
            Created with Perplexity Computer
          </a>
        </div>
      </footer>
    </div>
  );
}
