import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Building2 } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import type { Company } from "@shared/schema";

export default function SearchPage() {
  const [query, setQuery] = useState("");

  const { data: results, isLoading } = useQuery<Company[]>({
    queryKey: ["/api/search", query],
    queryFn: async () => {
      if (!query) return [];
      const res = await apiRequest("GET", `/api/search?q=${encodeURIComponent(query)}`);
      return res.json();
    },
    enabled: query.length > 1,
  });

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-xl font-bold mb-2">Advanced Search</h1>
        <p className="text-sm text-muted-foreground mb-6">Search across all company fields — name, description, category, technology, notes, and more</p>

        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
          <Input
            data-testid="input-advanced-search"
            type="search"
            placeholder="Search across all fields..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-12 py-6 text-base"
          />
        </div>

        {query && results && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">{results.length} results for "{query}"</div>
            {results.map((c) => (
              <Link key={c.id} href={`/companies/${c.id}`}>
                <Card className="bg-card border-border hover:border-primary/40 cursor-pointer transition-colors" data-testid={`search-result-${c.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Building2 size={14} className="text-primary" />
                          <h3 className="font-semibold text-sm">{c.name}</h3>
                        </div>
                        <div className="flex gap-1.5 mb-2 flex-wrap">
                          {c.competitionYear && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{c.competitionYear}</Badge>}
                          {c.category && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{c.category}</Badge>}
                          {c.competitionStatus && (
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${c.competitionStatus.toLowerCase() === 'winner' ? 'text-yellow-400 border-yellow-500/30' : ''}`}>
                              {c.competitionStatus}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{c.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {query && !isLoading && results?.length === 0 && (
          <div className="text-center py-12">
            <Search size={48} className="text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="font-semibold mb-2">No results found</h3>
            <p className="text-sm text-muted-foreground">Try a different search term</p>
          </div>
        )}

        {!query && (
          <div className="text-center py-12">
            <Search size={48} className="text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="font-semibold mb-2">Start typing to search</h3>
            <p className="text-sm text-muted-foreground">Search across company names, descriptions, categories, technologies, and more</p>
          </div>
        )}
      </div>
    </div>
  );
}
