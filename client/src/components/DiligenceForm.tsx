import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { History, Save } from "lucide-react";

interface Props {
  companyId: number;
}

// Per-judge identity (localStorage UUID) — same pattern as LensSelector.
function getOrCreateEvaluatorId(): string {
  const key = "iiv_evaluator_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = (crypto as any).randomUUID
      ? (crypto as any).randomUUID()
      : `judge-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

// 19 diligence questions, verbatim, grouped into logical sections.
type Question = { id: string; label: string };
type Section = { key: string; title: string; questions: Question[] };

const SECTIONS: Section[] = [
  {
    key: "problem_product",
    title: "Problem & Product",
    questions: [
      { id: "q1", label: "What problem is the company solving?" },
      { id: "q2", label: "What is the product/service? How does it solve the pain point/need?" },
    ],
  },
  {
    key: "market",
    title: "Market",
    questions: [
      { id: "q3", label: "Describe the market (and size) that the company will penetrate or create." },
      { id: "q5", label: "What is the companies' target geography/demographic?" },
    ],
  },
  {
    key: "competition",
    title: "Competition & Moat",
    questions: [
      { id: "q6", label: "Who are your main competitors? What is the company's competitive advantage / unique value proposition/key differentiation that sets you apart?" },
      { id: "q7", label: "What barriers to entry do competitors face?" },
      { id: "q8", label: "What is the moat the business is creating - or will create?" },
    ],
  },
  {
    key: "gtm_growth",
    title: "GTM & Growth",
    questions: [
      { id: "q9", label: "What do you think will bring the company to significant market presence and growth to venture scale. This includes geographic/market segments, brand strategy, GTM strategy, sales strategy, and channels/partnerships." },
      { id: "q11", label: "What are the key business and product milestones over the next 12-24 months? What is your roadmap, KPIs and capital requirements looking out over that time?" },
    ],
  },
  {
    key: "business_model",
    title: "Business Model & Economics",
    questions: [
      { id: "q10", label: "What are the current and target unit economics of the business? What is the business model?" },
      { id: "q12", label: "What is the company's potential exit plan? Who are potential acquirers?" },
      { id: "q13", label: "How do the company's products/services positively impact life on our planet?" },
    ],
  },
  {
    key: "financials",
    title: "Financials & Round",
    questions: [
      { id: "q4", label: "What are the key terms of your SAFE and what is the existing capital structure and cash on hand?" },
      { id: "q14", label: "What is the use of funds?" },
      { id: "q15", label: "What is their current cash on hand, if available? How much runway does the company have?" },
      { id: "q16", label: "Who are the other major investors in this round? Who are the noteworthy current investors?" },
      { id: "q17", label: "When are you closing this SAFE round?" },
      { id: "q18", label: "What is your cap table?" },
    ],
  },
  {
    key: "legal",
    title: "Legal Structure",
    questions: [
      { id: "q19", label: "What is the exact legal structure of the entity? Is the company currently or will become a limited liability company, limited partnership, or other passthrough entity?" },
    ],
  },
];

const ALL_QUESTIONS = SECTIONS.flatMap(s => s.questions);

interface DiligenceRow {
  id: number;
  companyId: number;
  version: number;
  responses: string; // JSON string
  filledBy: string | null;
  isExternal: number | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

function safeParse(s: string): Record<string, string> {
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function DiligenceForm({ companyId }: Props) {
  const { toast } = useToast();
  const evaluatorId = useMemo(() => getOrCreateEvaluatorId(), []);

  // Server-side history (newest first). Latest is rows[0].
  const historyQuery = useQuery<DiligenceRow[]>({
    queryKey: ["/api/companies", companyId, "diligence"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/companies/${companyId}/diligence`);
      return res.json();
    },
  });

  const latest = historyQuery.data?.[0];

  // Local form state — editable in place; explicit Save Draft inserts a new version row.
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<DiligenceRow | null>(null);

  // Hydrate from latest version when it loads / changes (unless user is mid-edit).
  useEffect(() => {
    if (!latest) {
      setAnswers({});
      return;
    }
    if (dirty) return; // Don't clobber unsaved edits.
    setAnswers(safeParse(latest.responses));
  }, [latest?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/diligence`, {
        responses: answers,
        filledBy: evaluatorId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "diligence"] });
      setDirty(false);
      toast({ title: "Diligence saved", description: "New version created." });
    },
    onError: (err: any) => {
      toast({
        title: "Save failed",
        description: err?.message || "Unknown error",
        variant: "destructive",
      });
    },
  });

  const handleChange = (qid: string, value: string) => {
    setAnswers(prev => ({ ...prev, [qid]: value }));
    setDirty(true);
  };

  const answeredCount = ALL_QUESTIONS.filter(q => (answers[q.id] || "").trim().length > 0).length;
  const completionPct = Math.round((answeredCount / ALL_QUESTIONS.length) * 100);

  const versions = historyQuery.data || [];

  return (
    <div className="space-y-6">
      {/* Header card with progress + Save Draft + History */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Diligence Questionnaire</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                19 questions across 7 sections. Each save creates a new version.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {answeredCount}/{ALL_QUESTIONS.length} answered ({completionPct}%)
              </Badge>
              {latest && (
                <Badge variant="secondary" className="text-xs">
                  Current: v{latest.version}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-muted-foreground">
              {dirty ? (
                <span className="text-amber-500">Unsaved changes</span>
              ) : latest ? (
                <span>
                  Last saved {latest.updatedAt ? (() => {
                    try { return format(new Date(latest.updatedAt), "MMM d, yyyy 'at' h:mm a"); }
                    catch { return latest.updatedAt; }
                  })() : "—"}
                  {latest.filledBy ? ` by ${latest.filledBy.slice(0, 8)}…` : ""}
                </span>
              ) : (
                <span>No saved version yet</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={versions.length === 0}
                onClick={() => setHistoryOpen(true)}
              >
                <History className="h-4 w-4 mr-1" />
                History ({versions.length})
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saveMutation.isPending || !dirty}
                onClick={() => saveMutation.mutate()}
              >
                <Save className="h-4 w-4 mr-1" />
                {saveMutation.isPending ? "Saving..." : "Save Draft"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sectioned accordion form */}
      <Accordion
        type="multiple"
        defaultValue={SECTIONS.map(s => s.key)}
        className="space-y-2"
      >
        {SECTIONS.map(section => {
          const answeredInSection = section.questions.filter(
            q => (answers[q.id] || "").trim().length > 0
          ).length;
          return (
            <AccordionItem
              key={section.key}
              value={section.key}
              className="border rounded-lg bg-card"
            >
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex items-center gap-3">
                  <span className="font-medium">{section.title}</span>
                  <Badge variant="outline" className="text-xs">
                    {answeredInSection}/{section.questions.length}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-5">
                  {section.questions.map(q => (
                    <div key={q.id} className="space-y-2">
                      <label className="text-sm font-medium block">
                        <span className="text-muted-foreground mr-2">
                          {q.id.replace("q", "")}.
                        </span>
                        {q.label}
                      </label>
                      <Textarea
                        value={answers[q.id] || ""}
                        onChange={(e) => handleChange(q.id, e.target.value)}
                        rows={4}
                        placeholder="Answer..."
                      />
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Sticky save bar at bottom of form */}
      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          disabled={!dirty || saveMutation.isPending}
          onClick={() => {
            if (latest) setAnswers(safeParse(latest.responses));
            else setAnswers({});
            setDirty(false);
          }}
        >
          Revert
        </Button>
        <Button
          type="button"
          disabled={!dirty || saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          <Save className="h-4 w-4 mr-1" />
          {saveMutation.isPending ? "Saving..." : "Save Draft"}
        </Button>
      </div>

      {/* History modal */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
          </DialogHeader>
          {!viewingVersion ? (
            <div className="space-y-2">
              {versions.length === 0 && (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No versions saved yet.
                </p>
              )}
              {versions.map(v => (
                <button
                  key={v.id}
                  className="w-full text-left p-3 rounded-md border hover:bg-accent/40 transition"
                  onClick={() => setViewingVersion(v)}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">Version {v.version}</div>
                    <div className="text-xs text-muted-foreground">
                      {v.updatedAt ? (() => {
                        try { return format(new Date(v.updatedAt), "MMM d, yyyy 'at' h:mm a"); }
                        catch { return v.updatedAt; }
                      })() : "—"}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    by {v.filledBy ? v.filledBy.slice(0, 8) + "…" : "team"}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Version {viewingVersion.version}</div>
                  <div className="text-xs text-muted-foreground">
                    {viewingVersion.updatedAt ? (() => {
                      try { return format(new Date(viewingVersion.updatedAt), "MMM d, yyyy 'at' h:mm a"); }
                      catch { return viewingVersion.updatedAt; }
                    })() : "—"}
                    {" • "}
                    by {viewingVersion.filledBy ? viewingVersion.filledBy.slice(0, 8) + "…" : "team"}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setViewingVersion(null)}
                >
                  ← Back to list
                </Button>
              </div>
              <div className="space-y-4">
                {ALL_QUESTIONS.map(q => {
                  const v = safeParse(viewingVersion.responses)[q.id];
                  if (!v) return null;
                  return (
                    <div key={q.id}>
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        {q.id.replace("q", "")}. {q.label}
                      </div>
                      <div className="text-sm whitespace-pre-wrap p-3 rounded-md bg-muted/40 border">
                        {v}
                      </div>
                    </div>
                  );
                })}
                {Object.keys(safeParse(viewingVersion.responses)).length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    This version contained no answers.
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
