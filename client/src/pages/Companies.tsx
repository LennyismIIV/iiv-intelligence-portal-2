import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Grid3x3, List, Plus, ExternalLink, Users, ChevronLeft, ChevronRight, X, Filter } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import type { Company } from "@shared/schema";
import { AddCompanyDialog } from "@/components/AddCompanyDialog";

export default function Companies() {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [sort, setSort] = useState("name");
  const [order, setOrder] = useState("asc");
  const [page, setPage] = useState(1);
  const [limit] = useState(24);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Filter state
  const [yearFilter, setYearFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [maFilter, setMaFilter] = useState("");
  const [workflowFilter, setWorkflowFilter] = useState("");
  const [aiFilter, setAiFilter] = useState("");
  const [dataFilter, setDataFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");

  const { data: filterValues } = useQuery<any>({
    queryKey: ["/api/filters"],
  });

  const queryParams = new URLSearchParams();
  if (search) queryParams.set("search", search);
  if (yearFilter) queryParams.set("year", yearFilter);
  if (statusFilter) queryParams.set("status", statusFilter);
  if (categoryFilter) queryParams.set("category", categoryFilter);
  if (maFilter) queryParams.set("maStatus", maFilter);
  if (workflowFilter) queryParams.set("workflow", workflowFilter);
  if (aiFilter) queryParams.set("aiRole", aiFilter);
  if (dataFilter) queryParams.set("dataModality", dataFilter);
  if (modelFilter) queryParams.set("businessModel", modelFilter);
  queryParams.set("sort", sort);
  queryParams.set("order", order);
  queryParams.set("page", String(page));
  queryParams.set("limit", String(limit));

  const { data, isLoading } = useQuery<{ companies: Company[]; total: number }>({
    queryKey: ["/api/companies", queryParams.toString()],
    queryFn: async () => {
      const { apiRequest } = await import("@/lib/queryClient");
      const res = await apiRequest("GET", `/api/companies?${queryParams.toString()}`);
      return res.json();
    },
  });

  const totalPages = Math.ceil((data?.total || 0) / limit);
  const activeFilters = [yearFilter, statusFilter, categoryFilter, maFilter, workflowFilter, aiFilter, dataFilter, modelFilter].filter(Boolean).length;

  const clearFilters = () => {
    setYearFilter(""); setStatusFilter(""); setCategoryFilter(""); setMaFilter("");
    setWorkflowFilter(""); setAiFilter(""); setDataFilter(""); setModelFilter("");
    setPage(1);
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="flex">
        {/* Sidebar Filters */}
        <aside className={`border-r border-border bg-card/50 transition-all duration-200 overflow-y-auto ${filtersOpen ? 'w-64 p-4' : 'w-0 p-0 overflow-hidden'}`}>
          <div className="space-y-4 min-w-[220px]">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Filters</h3>
              {activeFilters > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs h-7" data-testid="button-clear-filters">
                  Clear all
                </Button>
              )}
            </div>

            <FilterSelect label="Competition Year" value={yearFilter} onChange={(v) => { setYearFilter(v); setPage(1); }}
              options={(filterValues?.years || []).map((y: number) => ({ value: String(y), label: String(y) }))} testId="filter-year" />

            <FilterSelect label="Competition Status" value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }}
              options={(filterValues?.statuses || []).map((s: string) => ({ value: s, label: s }))} testId="filter-status" />

            <FilterSelect label="Category" value={categoryFilter} onChange={(v) => { setCategoryFilter(v); setPage(1); }}
              options={(filterValues?.categories || []).map((c: string) => ({ value: c, label: c }))} testId="filter-category" />

            <FilterSelect label="M&A Status" value={maFilter} onChange={(v) => { setMaFilter(v); setPage(1); }}
              options={(filterValues?.maStatuses || []).filter((m: string) => m).slice(0, 20).map((m: string) => ({ value: m, label: m.substring(0, 40) }))} testId="filter-ma" />

            <FilterSelect label="Workflow" value={workflowFilter} onChange={(v) => { setWorkflowFilter(v); setPage(1); }}
              options={(filterValues?.workflows || []).map((w: string) => ({ value: w, label: w }))} testId="filter-workflow" />

            <FilterSelect label="AI Role" value={aiFilter} onChange={(v) => { setAiFilter(v); setPage(1); }}
              options={(filterValues?.aiRoles || []).map((a: string) => ({ value: a, label: a }))} testId="filter-ai" />

            <FilterSelect label="Data Modalities" value={dataFilter} onChange={(v) => { setDataFilter(v); setPage(1); }}
              options={(filterValues?.dataModalities || []).map((d: string) => ({ value: d, label: d.substring(0, 40) }))} testId="filter-data" />

            <FilterSelect label="Business Model" value={modelFilter} onChange={(v) => { setModelFilter(v); setPage(1); }}
              options={(filterValues?.businessModels || []).map((b: string) => ({ value: b, label: b }))} testId="filter-model" />
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 p-6">
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Button variant="outline" size="sm" onClick={() => setFiltersOpen(!filtersOpen)} data-testid="button-toggle-filters" className="gap-2">
                <Filter size={14} />
                Filters
                {activeFilters > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5">{activeFilters}</Badge>
                )}
              </Button>
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input
                  data-testid="input-company-search"
                  type="search"
                  placeholder="Search companies..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={sort} onValueChange={(v) => setSort(v)}>
                <SelectTrigger className="w-36 h-9" data-testid="select-sort">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="year">Year</SelectItem>
                  <SelectItem value="revenue">Revenue</SelectItem>
                  <SelectItem value="employees">Employees</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => setOrder(order === "asc" ? "desc" : "asc")} data-testid="button-toggle-order">
                {order === "asc" ? "A→Z" : "Z→A"}
              </Button>
              <div className="flex border border-border rounded-md">
                <Button variant={view === "grid" ? "secondary" : "ghost"} size="sm" onClick={() => setView("grid")} data-testid="button-grid-view">
                  <Grid3x3 size={14} />
                </Button>
                <Button variant={view === "table" ? "secondary" : "ghost"} size="sm" onClick={() => setView("table")} data-testid="button-table-view">
                  <List size={14} />
                </Button>
              </div>
              <Button size="sm" onClick={() => setShowAddDialog(true)} data-testid="button-add-company" className="gap-1.5">
                <Plus size={14} /> Add Company
              </Button>
            </div>
          </div>

          {/* Results count */}
          <div className="text-xs text-muted-foreground mb-4">
            Showing {data?.companies?.length || 0} of {data?.total || 0} companies
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-lg" />
              ))}
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data?.companies?.map((c) => (
                <CompanyCard key={c.id} company={c} />
              ))}
            </div>
          ) : (
            <CompanyTable companies={data?.companies || []} />
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} data-testid="button-prev-page">
                <ChevronLeft size={14} />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)} data-testid="button-next-page">
                <ChevronRight size={14} />
              </Button>
            </div>
          )}
        </div>
      </div>

      <AddCompanyDialog open={showAddDialog} onOpenChange={setShowAddDialog} />
    </div>
  );
}

function CompanyCard({ company: c }: { company: Company }) {
  return (
    <Link href={`/companies/${c.id}`}>
      <Card className="bg-card border-border hover:border-primary/40 cursor-pointer transition-colors h-full" data-testid={`company-card-${c.id}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-semibold text-sm">{c.name}</h3>
            {c.website && <ExternalLink size={12} className="text-muted-foreground flex-shrink-0 ml-1 mt-0.5" />}
          </div>
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {c.competitionYear && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{c.competitionYear}</Badge>}
            <StatusBadge status={c.competitionStatus} />
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{c.description}</p>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{c.category}</span>
            <div className="flex items-center gap-2">
              {c.employeeCount && (
                <span className="flex items-center gap-0.5"><Users size={10} /> {c.employeeCount}</span>
              )}
              {c.maStatus && (
                <Badge variant="outline" className="text-[10px] px-1 py-0">{c.maStatus.substring(0, 20)}</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function CompanyTable({ companies }: { companies: Company[] }) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left p-3 font-medium text-xs">Company</th>
            <th className="text-left p-3 font-medium text-xs">Year</th>
            <th className="text-left p-3 font-medium text-xs">Status</th>
            <th className="text-left p-3 font-medium text-xs">Category</th>
            <th className="text-left p-3 font-medium text-xs">Employees</th>
            <th className="text-left p-3 font-medium text-xs">M&A Status</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((c) => (
            <tr key={c.id} className="border-t border-border hover:bg-muted/30">
              <td className="p-3">
                <Link href={`/companies/${c.id}`}>
                  <span className="text-primary hover:underline cursor-pointer font-medium" data-testid={`table-company-${c.id}`}>{c.name}</span>
                </Link>
              </td>
              <td className="p-3 text-muted-foreground">{c.competitionYear}</td>
              <td className="p-3"><StatusBadge status={c.competitionStatus} /></td>
              <td className="p-3 text-muted-foreground text-xs">{c.category}</td>
              <td className="p-3 text-muted-foreground">{c.employeeCount || "—"}</td>
              <td className="p-3 text-muted-foreground text-xs">{c.maStatus?.substring(0, 30) || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const lower = status.toLowerCase();
  let classes = "text-[10px] px-1.5 py-0 ";
  if (lower === "winner") classes += "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  else if (lower === "runner up") classes += "bg-blue-500/20 text-blue-300 border-blue-500/30";
  else classes += "bg-muted text-muted-foreground";
  return <Badge variant="outline" className={classes}>{status}</Badge>;
}

function FilterSelect({ label, value, onChange, options, testId }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; testId: string;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground font-medium mb-1 block">{label}</label>
      <Select value={value || "all"} onValueChange={(v) => onChange(v === "all" ? "" : v)}>
        <SelectTrigger className="h-8 text-xs" data-testid={testId}>
          <SelectValue placeholder={`All ${label}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
