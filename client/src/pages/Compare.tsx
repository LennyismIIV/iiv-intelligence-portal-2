import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Search, Plus, GitCompareArrows } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import type { Company } from "@shared/schema";

export default function Compare() {
  const [location] = useLocation();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");

  // Parse initial IDs from URL hash
  useEffect(() => {
    const hash = window.location.hash;
    const qIndex = hash.indexOf("?");
    if (qIndex !== -1) {
      const urlParams = new URLSearchParams(hash.substring(qIndex));
      const ids = urlParams.get("ids");
      if (ids) {
        setSelectedIds(ids.split(",").map(Number).filter(n => !isNaN(n)));
      }
    }
  }, []);

  const { data: searchResults } = useQuery<Company[]>({
    queryKey: ["/api/search", search],
    queryFn: async () => {
      if (!search) return [];
      const res = await apiRequest("GET", `/api/search?q=${encodeURIComponent(search)}`);
      return res.json();
    },
    enabled: search.length > 1,
  });

  const { data: compareData } = useQuery<Company[]>({
    queryKey: ["/api/compare", selectedIds.join(",")],
    queryFn: async () => {
      if (selectedIds.length === 0) return [];
      const res = await apiRequest("GET", `/api/compare?ids=${selectedIds.join(",")}`);
      return res.json();
    },
    enabled: selectedIds.length > 0,
  });

  const addCompany = (id: number) => {
    if (!selectedIds.includes(id) && selectedIds.length < 4) {
      setSelectedIds([...selectedIds, id]);
      setSearch("");
    }
  };

  const removeCompany = (id: number) => {
    setSelectedIds(selectedIds.filter(sid => sid !== id));
  };

  const comparisonRows = [
    { label: "Description", key: "description", truncate: true },
    { label: "Category", key: "category" },
    { label: "Competition Year", key: "competitionYear" },
    { label: "Competition Status", key: "competitionStatus" },
    { label: "Company Type", key: "companyType" },
    { label: "Year Founded", key: "yearFounded" },
    { label: "Employees", key: "employeeCount" },
    { label: "Revenue Stage", key: "revenueStage" },
    { label: "Est. Revenue", key: "estimatedRevenue", format: "currency" },
    { label: "M&A Status", key: "maStatus" },
    { label: "Capital Raised", key: "capitalRaised", format: "currency" },
    { label: "Workflow Primary", key: "workflowPrimary" },
    { label: "AI Primary", key: "aiPrimary" },
    { label: "Data Modalities", key: "dataModalities" },
    { label: "Business Model", key: "businessModel" },
    { label: "JTBD Primary", key: "jtbdPrimary" },
    { label: "Buyer Primary", key: "buyerPrimary" },
  ];

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <GitCompareArrows size={24} className="text-primary" />
          <div>
            <h1 className="text-xl font-bold">Compare Companies</h1>
            <p className="text-sm text-muted-foreground">Side-by-side comparison of up to 4 companies</p>
          </div>
        </div>

        {/* Company Selector */}
        <Card className="bg-card border-border mb-6">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 flex-wrap mb-3">
              {compareData?.map((c) => (
                <Badge key={c.id} variant="secondary" className="px-3 py-1.5 text-sm gap-2">
                  {c.name}
                  <button onClick={() => removeCompany(c.id)} data-testid={`button-remove-compare-${c.id}`}>
                    <X size={12} />
                  </button>
                </Badge>
              ))}
              {selectedIds.length < 4 && (
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                    <Input
                      data-testid="input-compare-search"
                      type="search"
                      placeholder="Search to add company..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9 w-64 h-9"
                    />
                  </div>
                  {search && searchResults && searchResults.length > 0 && (
                    <div className="absolute top-full left-0 w-64 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-auto z-50">
                      {searchResults.filter(c => !selectedIds.includes(c.id)).slice(0, 8).map((c) => (
                        <button
                          key={c.id}
                          onClick={() => addCompany(c.id)}
                          className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b border-border/50 last:border-0"
                          data-testid={`compare-add-${c.id}`}
                        >
                          <div className="font-medium">{c.name}</div>
                          <div className="text-xs text-muted-foreground">{c.competitionYear} · {c.category}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Comparison Table */}
        {compareData && compareData.length > 0 ? (
          <div className="border border-border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium text-xs w-48 min-w-[180px] sticky left-0 bg-muted/50">Field</th>
                  {compareData.map((c) => (
                    <th key={c.id} className="text-left p-3 font-semibold min-w-[220px]">
                      {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row) => {
                  const values = compareData.map((c) => (c as any)[row.key]);
                  const allSame = values.every((v) => v === values[0]);
                  return (
                    <tr key={row.key} className="border-t border-border">
                      <td className="p-3 text-muted-foreground text-xs font-medium sticky left-0 bg-card">{row.label}</td>
                      {compareData.map((c) => {
                        let val = (c as any)[row.key];
                        if (row.format === "currency" && val) {
                          const num = Number(val);
                          val = !isNaN(num) ? `$${num.toLocaleString()}` : val;
                        }
                        if (row.truncate && val) {
                          val = val.substring(0, 150) + (val.length > 150 ? "..." : "");
                        }
                        const isDifferent = !allSame && val;
                        return (
                          <td key={c.id} className={`p-3 text-sm ${isDifferent ? "bg-primary/5" : ""}`}>
                            {val || <span className="text-muted-foreground">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Card className="bg-card border-border">
            <CardContent className="p-12 text-center">
              <GitCompareArrows size={48} className="text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Select companies to compare</h3>
              <p className="text-sm text-muted-foreground">Use the search above to add 2-4 companies for side-by-side comparison</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
