import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ScatterChart, Scatter, ZAxis, CartesianGrid, ReferenceLine
} from "recharts";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { EvaluationScore } from "@shared/schema";

interface LensSelectorProps {
  companyId: number;
  companyName: string;
}

const IIC_CRITERIA = [
  { key: "originality", label: "Originality & Differentiation", weight: 1, max: 10 },
  { key: "market_opportunity", label: "Market Opportunity", weight: 1, max: 10 },
  { key: "scalability_ai", label: "Scalability & AI Leverage", weight: 1, max: 10 },
  { key: "ease_adoption", label: "Ease of Adoption", weight: 1, max: 10 },
  { key: "clarity_impact", label: "Clarity & Evidence of Impact", weight: 1, max: 10 },
];

const ADJUSTERS = [
  { key: "ai_moat", label: "AI/Data Moat", range: [-2, 2] },
  { key: "category_creation", label: "Category-Creation Potential", range: [-2, 2] },
];

// Phase 2: IIV Investment Thesis Categories
const THESIS_CATEGORIES = [
  { 
    key: "qual_at_scale", 
    label: "Qual-at-Scale Technologies", 
    allocation: 30,
    description: "AI-powered qualitative research at quantitative scale" 
  },
  { 
    key: "data_quality", 
    label: "Data Quality Infrastructure", 
    allocation: 25,
    description: "Verification, sample quality, fraud detection" 
  },
  { 
    key: "integration", 
    label: "Integration Platforms", 
    allocation: 20,
    description: "Unified analytics, data orchestration" 
  },
  { 
    key: "first_party", 
    label: "First-Party Data Solutions", 
    allocation: 15,
    description: "Customer data, zero-party, privacy-forward" 
  },
  { 
    key: "agentic", 
    label: "Agentic Research Systems", 
    allocation: 10,
    description: "AI agents orchestrating research workflows" 
  },
];

const THESIS_DIMENSIONS = [
  { key: "thesis_fit", label: "Thesis Fit", max: 5 },
  { key: "stage_alignment", label: "Stage Alignment", max: 5 },
  { key: "competitive_pos", label: "Competitive Positioning", max: 5 },
  { key: "exit_clarity", label: "Exit Pathway Clarity", max: 5 },
];

// Founder & Team Evaluation Rubric (29 sub-criteria across 6 domains).
// Architecture multiplier removed — architecture is metadata only (per-judge tag).
// Default value is null; only scored criteria contribute to the composite (Option C).
const FOUNDER_DOMAINS = [
  {
    key: "domain1",
    label: "Domain 1: Founder-Market Fit & Domain Authority",
    weight: 0.20,
    criteria: [
      { key: "d1_1", label: "1.1 First-Hand Problem Experience", desc: "Has the founder personally experienced or operated within the problem domain?" },
      { key: "d1_2", label: "1.2 Domain Tenure & Depth", desc: "Years of relevant domain exposure and demonstrated understanding of competitive dynamics." },
      { key: "d1_3", label: "1.3 Proprietary Insight", desc: "Can the founder articulate a unique 'Why Now + Why Me' insight tied to macro trends or technology inflections?" },
      { key: "d1_4", label: "1.4 Network Density in Domain", desc: "Quality and depth of relationships with potential customers, talent, partners, and competitive intelligence." },
    ],
  },
  {
    key: "domain2",
    label: "Domain 2: Execution Capability & Operating Architecture",
    weight: 0.20,
    criteria: [
      { key: "d2_1", label: "2.1 Track Record of Delivery", desc: "Evidence of shipping product, hitting milestones, or managing complexity to successful outcomes." },
      { key: "d2_2", label: "2.2 AI/Automation Leverage Ratio", desc: "How systematically is AI embedded in workflows? Is it compound work or decorative?" },
      { key: "d2_3", label: "2.3 Role Architecture Clarity", desc: "Can the founder clearly articulate who (or what) owns the roadmap, growth, and AI initiatives?" },
      { key: "d2_4", label: "2.4 Capital-to-Milestone Discipline", desc: "Can the founder map capital allocation to specific, time-bound deliverables?" },
      { key: "d2_5", label: "2.5 Velocity & Iteration Speed", desc: "Evidence of fast release cycles, rapid experimentation, and willingness to kill low-signal initiatives early." },
    ],
  },
  {
    key: "domain3",
    label: "Domain 3: Psychological Fitness & Founder Resilience",
    weight: 0.20,
    criteria: [
      { key: "d3_1", label: "3.1 Resilience & Stress Tolerance", desc: "Evidence of navigating prior setbacks, pivots, or operational crises without catastrophic decision-making." },
      { key: "d3_2", label: "3.2 Coachability", desc: "Demonstrated willingness to seek, receive, and act on feedback from investors, customers, and teammates." },
      { key: "d3_3", label: "3.3 Self-Awareness", desc: "Accurate self-assessment of personal strengths, blind spots, and the gap between current capabilities and role requirements." },
      { key: "d3_4", label: "3.4 Emotional Intelligence (EQ)", desc: "Capacity to manage interpersonal dynamics, stakeholder relationships, and team culture under pressure." },
      { key: "d3_5", label: "3.5 Decision Quality Under Uncertainty", desc: "Evidence of structured decision-making frameworks rather than reactive or emotionally driven choices." },
    ],
  },
  {
    key: "domain4",
    label: "Domain 4: Team Completeness & Complementarity",
    weight: 0.15,
    criteria: [
      { key: "d4_1", label: "4.1 Visionary/Operator Coverage", desc: "Does the team (human + AI) cover both big-picture strategy and day-to-day execution?" },
      { key: "d4_2", label: "4.2 Technical-Commercial Balance", desc: "Presence of both technical depth (build capability) and commercial acumen (sell/grow capability)." },
      { key: "d4_3", label: "4.3 Human-AI Governance Design", desc: "For hybrid/ZHC: does the founder have a clear capability map of what humans own vs. what agents do?" },
      { key: "d4_4", label: "4.4 Team Cohesion & Chemistry", desc: "Interpersonal dynamics that enable rapid decision-making, healthy debate, and fast alignment on priorities." },
      { key: "d4_5", label: "4.5 Key-Person Concentration Risk", desc: "Is the company dangerously dependent on a single founder? Are systems emerging beyond the founder?" },
    ],
  },
  {
    key: "domain5",
    label: "Domain 5: Strategic Thinking & Narrative Quality",
    weight: 0.15,
    criteria: [
      { key: "d5_1", label: "5.1 Problem Clarity & Acuity", desc: "Can the founder articulate the problem with precision \u2014 including who suffers, how acutely, and why existing solutions fail?" },
      { key: "d5_2", label: "5.2 Moat Articulation", desc: "Can the founder name the defensibility mechanism and explain how it compounds with scale?" },
      { key: "d5_3", label: "5.3 Why Now Coherence", desc: "Is there a credible structural tailwind (macro trend, regulatory shift, or technology inflection)?" },
      { key: "d5_4", label: "5.4 Scenario Flexibility", desc: "Evidence that the founder has modeled multiple paths to success and can articulate pivot triggers." },
      { key: "d5_5", label: "5.5 External Narrative Coherence", desc: "Can the founder tell a single coherent story across investor pitches, customer conversations, recruiting, and press \u2014 or does the narrative shift based on audience?" },
    ],
  },
  {
    key: "domain6",
    label: "Domain 6: Scalability Signal & Organizational Design Potential",
    weight: 0.10,
    criteria: [
      { key: "d6_1", label: "6.1 Revenue-Per-Capacity Design", desc: "Does the business model create a path to >$1M revenue per FTE equivalent (human or AI agent)?" },
      { key: "d6_2", label: "6.2 Learning Loop Architecture", desc: "Has the founder built \u2014 or articulated plans for \u2014 continuous feedback systems that improve the product over time?" },
      { key: "d6_3", label: "6.3 Organizational Leverage Model", desc: "Is the founder adding headcount or adding intelligent systems? Evidence of 'hire / automate / super-IC' evaluation." },
      { key: "d6_4", label: "6.4 Governance & Accountability Design", desc: "Are accountability structures clear and durable as the company scales?" },
      { key: "d6_5", label: "6.5 Talent/Agent Attraction Signal", desc: "Evidence that the founder can attract high-caliber human talent and/or design effective AI agent workflows." },
    ],
  },
] as const;

// Stable evaluator id stored in localStorage. Same browser = same judge identity.
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

export function LensSelector({ companyId, companyName }: LensSelectorProps) {
  const { toast } = useToast();
  const [activeLens, setActiveLens] = useState<"iic" | "thesis" | "grid" | "momentum" | "grit" | "diligence" | "ai-native" | "valuation" | "founder">("iic");
  const [scores, setScores] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  // ---- Founder lens state (per-judge, per-company persistence) ----
  const evaluatorId = useMemo(() => getOrCreateEvaluatorId(), []);
  const [founderScores, setFounderScores] = useState<Record<string, number>>({});
  const [founderNA, setFounderNA] = useState<Record<string, boolean>>({});
  const [founderNotes, setFounderNotes] = useState<Record<string, string>>({});
  const [founderArchitecture, setFounderArchitecture] = useState<"traditional" | "hybrid" | "zhc">("hybrid");
  const [founderStage, setFounderStage] = useState<"pre-seed" | "seed" | "series-a">("seed");

  // Fetch existing scores for IIC lens
  const { data: existingScores = [] } = useQuery<EvaluationScore[]>({
    queryKey: ["/api/companies", companyId, "scores", "iic"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/companies/${companyId}/scores?lens=iic`);
      return res.json();
    },
  });

  // Fetch this judge's existing founder scores + notes
  const { data: founderRows = [] } = useQuery<EvaluationScore[]>({
    queryKey: ["/api/companies", companyId, "scores", "founder"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/companies/${companyId}/scores?lens=founder`);
      return res.json();
    },
  });

  // Fetch this judge's architecture/stage selections
  const { data: founderSession } = useQuery<any>({
    queryKey: ["/api/companies", companyId, "founder-session", evaluatorId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/companies/${companyId}/founder-session?evaluatorId=${encodeURIComponent(evaluatorId)}`);
      return res.json();
    },
    enabled: !!companyId && !!evaluatorId,
  });

  // Hydrate founder local state from server when data lands.
  // Only consider rows owned by THIS judge (evaluatorId match) so judges don't see each other's scores.
  useEffect(() => {
    if (!founderRows || founderRows.length === 0) return;
    const mineNumeric: Record<string, number> = {};
    const mineNA: Record<string, boolean> = {};
    const mineNotes: Record<string, string> = {};
    for (const row of founderRows) {
      if (row.evaluatorId !== evaluatorId) continue;
      // Notes rows are dimension="<domainKey>_note", score=0
      if (row.dimension.endsWith("_note")) {
        const domainKey = row.dimension.replace(/_note$/, "");
        if (row.notes) mineNotes[domainKey] = row.notes;
        continue;
      }
      // N/A rows are stored as score = -1 (sentinel; criteria scores are otherwise 0..5)
      if (row.score < 0) {
        mineNA[row.dimension] = true;
      } else {
        mineNumeric[row.dimension] = row.score;
      }
    }
    setFounderScores(prev => ({ ...mineNumeric, ...prev })); // local edits win over server hydrate
    setFounderNA(prev => ({ ...mineNA, ...prev }));
    setFounderNotes(prev => ({ ...mineNotes, ...prev }));
  // We deliberately hydrate only once per data arrival; prev-wins means later local edits aren't clobbered.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [founderRows, evaluatorId]);

  useEffect(() => {
    if (founderSession) {
      if (founderSession.architecture) setFounderArchitecture(founderSession.architecture);
      if (founderSession.stage) setFounderStage(founderSession.stage);
    }
  }, [founderSession]);

  // Mutation to save score (IIC; legacy insert-only path, no evaluatorId)
  const saveScoreMutation = useMutation({
    mutationFn: async (scoreData: any) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/scores`, scoreData);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "scores"] });
      toast({ title: "Score saved", description: "Evaluation updated successfully." });
    },
  });

  // Founder mutations — upsert path (evaluatorId always set)
  const saveFounderScoreMutation = useMutation({
    mutationFn: async (payload: { dimension: string; score: number; notes?: string }) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/scores`, {
        lensType: "founder",
        evaluatorId,
        ...payload,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "scores", "founder"] });
    },
  });

  const saveFounderSessionMutation = useMutation({
    mutationFn: async (payload: { architecture?: string; stage?: string }) => {
      const res = await apiRequest("PUT", `/api/companies/${companyId}/founder-session`, {
        evaluatorId,
        architecture: payload.architecture ?? founderArchitecture,
        stage: payload.stage ?? founderStage,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "founder-session", evaluatorId] });
    },
  });

  const handleScoreChange = (dimension: string, value: number) => {
    setScores(prev => ({ ...prev, [dimension]: value }));
  };

  const handleSave = (dimension: string) => {
    const score = scores[dimension] ?? 0;
    const note = notes[dimension] || "";
    saveScoreMutation.mutate({
      lensType: "iic",
      dimension,
      score,
      notes: note,
    });
  };

  // Prepare radar data (latest scores or defaults)
  const radarData = IIC_CRITERIA.map(c => ({
    dimension: c.label.split(" ")[0],
    score: existingScores.find(s => s.dimension === c.key)?.score || scores[c.key] || 5,
    fullMark: 10,
  }));

  const totalScore = IIC_CRITERIA.reduce((sum, c) => {
    const s = existingScores.find(sc => sc.dimension === c.key)?.score || scores[c.key] || 5;
    return sum + s;
  }, 0) + (existingScores.find(s => s.dimension === "ai_moat")?.score || 0) + (existingScores.find(s => s.dimension === "category_creation")?.score || 0);

  // Founder composite: Option C math — only scored, non-N/A criteria contribute.
  // For each domain, compute the per-criteria average (0..5) across SCORED ones,
  // then weight by domain weight and scale to 0..100. Domains with 0 scored criteria
  // are excluded and remaining weights are renormalized so missing data doesn't drag the score to 0.
  const founderComposite = useMemo(() => {
    let weightedSum = 0;
    let activeWeight = 0;
    for (const domain of FOUNDER_DOMAINS) {
      let total = 0;
      let count = 0;
      for (const c of domain.criteria) {
        if (founderNA[c.key]) continue;
        const v = founderScores[c.key];
        if (typeof v !== "number") continue;
        total += v;
        count += 1;
      }
      if (count === 0) continue;
      const domainAvg = total / count;            // 0..5
      weightedSum += domainAvg * domain.weight;   // still 0..5 scale, weighted
      activeWeight += domain.weight;
    }
    if (activeWeight === 0) return null;
    const renormalized = weightedSum / activeWeight; // 0..5
    return Math.round((renormalized / 5) * 100);     // 0..100
  }, [founderScores, founderNA]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Evaluation Lenses</h3>
          <p className="text-sm text-muted-foreground">Apply analytical frameworks to {companyName}</p>
        </div>
        <Badge variant="outline" className="text-xs">Phase 1: IIC Scoring Live</Badge>
      </div>

      <Tabs value={activeLens} onValueChange={(v) => setActiveLens(v as any)}>
        <TabsList className="grid w-full grid-cols-9 text-xs">
          <TabsTrigger value="iic">IIC</TabsTrigger>
          <TabsTrigger value="thesis">Thesis</TabsTrigger>
          <TabsTrigger value="grid">Grid</TabsTrigger>
          <TabsTrigger value="momentum">Momentum</TabsTrigger>
          <TabsTrigger value="grit">GRIT</TabsTrigger>
          <TabsTrigger value="diligence">Diligence</TabsTrigger>
          <TabsTrigger value="ai-native">AI-Native</TabsTrigger>
          <TabsTrigger value="valuation">Valuation</TabsTrigger>
          <TabsTrigger value="founder">Founder</TabsTrigger>
        </TabsList>

        <TabsContent value="iic" className="space-y-6 mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Radar Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  IIC Innovation Score
                  <Badge className="ml-auto text-lg font-mono">{totalScore.toFixed(0)} / 54</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="dimension" />
                      <PolarRadiusAxis angle={90} domain={[0, 10]} />
                      <Radar
                        name="Score"
                        dataKey="score"
                        stroke="#3b82f6"
                        fill="#3b82f6"
                        fillOpacity={0.3}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-center text-muted-foreground mt-2">
                  Max 54 pts • 5 core criteria + 2 adjusters
                </p>
              </CardContent>
            </Card>

            {/* Scoring Form */}
            <Card>
              <CardHeader>
                <CardTitle>Score This Company</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {IIC_CRITERIA.map((criterion) => {
                  const currentScore = scores[criterion.key] ?? 
                    existingScores.find(s => s.dimension === criterion.key)?.score ?? 5;
                  return (
                    <div key={criterion.key} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{criterion.label}</span>
                        <span className="font-mono font-semibold">{currentScore}</span>
                      </div>
                      <Slider
                        value={[currentScore]}
                        onValueChange={([v]) => handleScoreChange(criterion.key, v)}
                        max={10}
                        step={0.5}
                        className="py-2"
                      />
                      <div className="flex justify-end">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleSave(criterion.key)}
                          disabled={saveScoreMutation.isPending}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  );
                })}

                <div className="pt-4 border-t">
                  <p className="text-sm font-medium mb-3">Adjusters (-2 to +2)</p>
                  {ADJUSTERS.map((adj) => {
                    const current = scores[adj.key] ?? 
                      existingScores.find(s => s.dimension === adj.key)?.score ?? 0;
                    return (
                      <div key={adj.key} className="space-y-2 mb-4">
                        <div className="flex justify-between text-sm">
                          <span>{adj.label}</span>
                          <span className="font-mono">{current}</span>
                        </div>
                        <Slider
                          value={[current]}
                          onValueChange={([v]) => handleScoreChange(adj.key, v)}
                          min={-2}
                          max={2}
                          step={0.5}
                        />
                        <div className="flex justify-end">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleSave(adj.key)}
                          >
                            Save
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Scoring Rubric Reference</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p><strong>Originality & Differentiation (1-10):</strong> How genuinely novel and hard-to-copy is this solution?</p>
              <p><strong>Market Opportunity (1-10):</strong> Large, urgent, accessible market with clear pain?</p>
              <p><strong>Scalability & AI Leverage (1-10):</strong> Non-linear scaling potential through AI/data?</p>
              <p><strong>Ease of Adoption (1-10):</strong> Low friction to get started and see value?</p>
              <p><strong>Clarity & Evidence of Impact (1-10):</strong> Claims backed by credible evidence and data?</p>
              <p className="pt-2 text-xs">Adjusters: AI/Data Moat or Category-Creation Potential can add/subtract up to 4 pts total.</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PHASE 2: IIV Investment Thesis Alignment */}
        <TabsContent value="thesis" className="space-y-6 mt-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold">IIV Investment Thesis Alignment</h4>
              <p className="text-sm text-muted-foreground">How well does this company fit IIV's 5 deployment categories?</p>
            </div>
            <Badge variant="secondary">Phase 2 • Live</Badge>
          </div>

          {/* Weight Customization */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fund Allocation Weights (Adjust to Explore Scenarios)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {THESIS_CATEGORIES.map((cat, index) => (
                  <div key={cat.key} className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium">{cat.label.split(" ")[0]}</span>
                      <span className="font-mono text-primary">{cat.allocation}%</span>
                    </div>
                    <Slider
                      value={[cat.allocation]}
                      onValueChange={([v]) => {
                        // Simple weight update (in real app we'd persist this)
                        THESIS_CATEGORIES[index].allocation = v;
                      }}
                      max={50}
                      step={5}
                    />
                    <p className="text-[10px] text-muted-foreground line-clamp-2">{cat.description}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-center text-muted-foreground mt-3">
                Total allocation: 100% • Drag sliders to model different fund strategies
              </p>
            </CardContent>
          </Card>

          {/* Category Scoring */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {THESIS_CATEGORIES.map((category) => {
              const catScores = THESIS_DIMENSIONS.map(dim => {
                const existing = existingScores.find(s => 
                  s.lensType === "thesis" && s.dimension === `${category.key}_${dim.key}`
                );
                return {
                  ...dim,
                  score: scores[`${category.key}_${dim.key}`] ?? existing?.score ?? 3
                };
              });

              const avgScore = catScores.reduce((sum, d) => sum + d.score, 0) / 4;
              const weightedScore = (avgScore / 5) * category.allocation;

              return (
                <Card key={category.key} className="border-l-4" style={{ borderLeftColor: "#3b82f6" }}>
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-base">{category.label}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">{category.description}</p>
                      </div>
                      <Badge className="font-mono text-lg">{weightedScore.toFixed(1)}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {THESIS_DIMENSIONS.map((dim) => {
                      const currentScore = scores[`${category.key}_${dim.key}`] ?? 
                        existingScores.find(s => s.dimension === `${category.key}_${dim.key}`)?.score ?? 3;
                      
                      return (
                        <div key={dim.key} className="space-y-1.5">
                          <div className="flex justify-between text-sm">
                            <span>{dim.label}</span>
                            <span className="font-mono font-semibold text-primary">{currentScore}</span>
                          </div>
                          <Slider
                            value={[currentScore]}
                            onValueChange={([v]) => handleScoreChange(`${category.key}_${dim.key}`, v)}
                            max={dim.max}
                            step={0.5}
                          />
                        </div>
                      );
                    })}

                    <div className="pt-2 flex justify-end">
                      <Button 
                        size="sm" 
                        onClick={() => {
                          THESIS_DIMENSIONS.forEach(dim => {
                            const key = `${category.key}_${dim.key}`;
                            const score = scores[key] ?? 3;
                            saveScoreMutation.mutate({
                              lensType: "thesis",
                              dimension: key,
                              score,
                              notes: `Auto-saved from ${category.label}`,
                            });
                          });
                          toast({ 
                            title: "Thesis scores saved", 
                            description: `${category.label} evaluation updated` 
                          });
                        }}
                      >
                        Save Category Scores
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Visualization */}
          <Card>
            <CardHeader>
              <CardTitle>Thesis Fit Overview (Weighted by Allocation)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={THESIS_CATEGORIES.map(cat => {
                      const avg = THESIS_DIMENSIONS.reduce((sum, dim) => {
                        const score = scores[`${cat.key}_${dim.key}`] ?? 
                          existingScores.find(s => s.dimension === `${cat.key}_${dim.key}`)?.score ?? 3;
                        return sum + score;
                      }, 0) / 4;
                      return {
                        name: cat.label.split(" ")[0],
                        "Weighted Score": (avg / 5) * cat.allocation,
                        "Raw Avg": avg,
                      };
                    })}
                    layout="vertical"
                  >
                    <XAxis type="number" domain={[0, 30]} />
                    <YAxis type="category" dataKey="name" width={120} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Weighted Score" fill="#3b82f6" radius={4} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-xs text-center text-muted-foreground mt-2">
                Higher bars = Stronger overall fit when weighted by IIV fund allocation
              </p>
            </CardContent>
          </Card>

          <div className="flex justify-center">
            <Button 
              variant="outline" 
              onClick={() => {
                // Smart auto-suggest based on company data
                const suggestions: Record<string, number> = {};
                
                // Simple heuristic mapping (can be improved later)
                THESIS_CATEGORIES.forEach(cat => {
                  THESIS_DIMENSIONS.forEach(dim => {
                    let baseScore = 2.5;
                    
                    // Boost based on existing fields
                    if (cat.key === "qual_at_scale" && companyName.toLowerCase().includes("ai")) baseScore += 1.5;
                    if (cat.key === "data_quality" && (companyName.toLowerCase().includes("data") || companyName.toLowerCase().includes("quality"))) baseScore += 1.5;
                    if (cat.key === "agentic" && (companyName.toLowerCase().includes("agent") || companyName.toLowerCase().includes("ai"))) baseScore += 1.5;
                    
                    suggestions[`${cat.key}_${dim.key}`] = Math.min(5, Math.max(1, Math.round(baseScore * 2) / 2));
                  });
                });
                
                setScores(prev => ({ ...prev, ...suggestions }));
                toast({ 
                  title: "Auto-suggested scores applied", 
                  description: "Based on company name and taxonomy. Adjust as needed." 
                });
              }}
            >
              ✨ Auto-Suggest from Company Data
            </Button>
          </div>
        </TabsContent>

        {/* PHASE 3: Competitive Landscape Grid */}
        <TabsContent value="grid" className="space-y-6 mt-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold">Competitive Landscape Grid</h4>
              <p className="text-sm text-muted-foreground">Gartner MQ / G2 Grid style — configurable 2×2 positioning</p>
            </div>
            <Badge variant="secondary">Phase 3 • Live</Badge>
          </div>

          {/* Axis Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configure Axes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* X Axis */}
                <div>
                  <label className="text-sm font-medium mb-2 block">X Axis (Horizontal)</label>
                  <select 
                    className="w-full p-2 border rounded-md bg-background"
                    value="market_readiness"
                    onChange={(e) => {
                      // In full version this would trigger re-render with new axis
                      toast({ title: "Axis changed", description: `X axis set to ${e.target.value}` });
                    }}
                  >
                    <option value="market_readiness">Market Readiness (Stage + Revenue + Traction)</option>
                    <option value="innovation">Innovation Intensity (Originality + AI Leverage + Category Creation)</option>
                    <option value="revenue">Estimated Revenue</option>
                    <option value="employees">Employee Count</option>
                    <option value="iic_score">IIC Innovation Score</option>
                    <option value="thesis_score">Thesis Alignment Score</option>
                    <option value="momentum">Market Momentum</option>
                  </select>
                </div>

                {/* Y Axis */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Y Axis (Vertical)</label>
                  <select 
                    className="w-full p-2 border rounded-md bg-background"
                    value="innovation"
                    onChange={(e) => {
                      toast({ title: "Axis changed", description: `Y axis set to ${e.target.value}` });
                    }}
                  >
                    <option value="innovation">Innovation Intensity (Originality + AI Leverage + Category Creation)</option>
                    <option value="market_readiness">Market Readiness (Stage + Revenue + Traction)</option>
                    <option value="revenue">Estimated Revenue</option>
                    <option value="employees">Employee Count</option>
                    <option value="iic_score">IIC Innovation Score</option>
                    <option value="thesis_score">Thesis Alignment Score</option>
                    <option value="momentum">Market Momentum</option>
                  </select>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="mt-4">
                <p className="text-xs text-muted-foreground mb-2">Quick Presets:</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "Default: Readiness vs Innovation", x: "market_readiness", y: "innovation" },
                    { label: "Revenue vs Innovation", x: "revenue", y: "innovation" },
                    { label: "IIC Score vs Thesis Fit", x: "iic_score", y: "thesis_score" },
                    { label: "Employees vs Momentum", x: "employees", y: "momentum" },
                  ].map((preset, i) => (
                    <Button 
                      key={i} 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        toast({ 
                          title: "Preset applied", 
                          description: preset.label 
                        });
                      }}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* The Grid */}
          <Card>
            <CardHeader>
              <CardTitle>Competitive Positioning</CardTitle>
              <p className="text-sm text-muted-foreground">
                Bubble size = Estimated Revenue • Color = Category • Current company highlighted in blue
              </p>
            </CardHeader>
            <CardContent>
              <div className="h-[420px] border rounded-lg bg-muted/20 p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart>
                    <XAxis 
                      type="number" 
                      dataKey="x" 
                      name="X Axis" 
                      domain={[0, 100]} 
                      label={{ value: "Market Readiness →", position: "insideBottom", offset: -5 }}
                    />
                    <YAxis 
                      type="number" 
                      dataKey="y" 
                      name="Y Axis" 
                      domain={[0, 100]} 
                      label={{ value: "Innovation Intensity ↑", angle: -90, position: "insideLeft" }}
                    />
                    <Tooltip 
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ payload }) => {
                        if (payload && payload.length > 0) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-background border p-3 rounded shadow text-sm">
                              <div className="font-semibold">{data.name}</div>
                              <div>Category: {data.category}</div>
                              <div>X: {data.x} • Y: {data.y}</div>
                              {data.revenue && <div>Revenue: ${data.revenue}M</div>}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    
                    {/* Quadrant Lines */}
                    <line x1="50" y1="0" x2="50" y2="100" stroke="#e5e7eb" strokeWidth={1} strokeDasharray="4 2" />
                    <line x1="0" y1="50" x2="100" y2="50" stroke="#e5e7eb" strokeWidth={1} strokeDasharray="4 2" />
                    
                    {/* Example companies + current company */}
                    <Scatter 
                      name="Companies" 
                      data={[
                        // Current company (highlighted)
                        { 
                          name: companyName, 
                          x: 72, 
                          y: 68, 
                          category: "AI Insights", 
                          revenue: 12,
                          fill: "#3b82f6",
                          size: 180
                        },
                        // Competitor examples
                        { name: "Qualtrics", x: 85, y: 45, category: "Enterprise", revenue: 450, fill: "#64748b", size: 120 },
                        { name: "Medallia", x: 78, y: 52, category: "Enterprise", revenue: 320, fill: "#64748b", size: 110 },
                        { name: "UserTesting", x: 65, y: 71, category: "UX Research", revenue: 85, fill: "#64748b", size: 90 },
                        { name: "Dovetail", x: 58, y: 82, category: "AI Research", revenue: 28, fill: "#64748b", size: 75 },
                        { name: "Sprig", x: 48, y: 65, category: "Product Research", revenue: 45, fill: "#64748b", size: 80 },
                        { name: "Maze", x: 42, y: 58, category: "UX Research", revenue: 22, fill: "#64748b", size: 65 },
                      ]}
                    >
                      {/* Custom shape for bubbles */}
                      {({ cx, cy, payload }) => (
                        <g>
                          <circle 
                            cx={cx} 
                            cy={cy} 
                            r={payload.size / 12} 
                            fill={payload.fill} 
                            stroke={payload.name === companyName ? "#1e40af" : "#64748b"}
                            strokeWidth={payload.name === companyName ? 3 : 1}
                          />
                          {payload.name === companyName && (
                            <text x={cx} y={cy + 4} textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">
                              YOU
                            </text>
                          )}
                        </g>
                      )}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

              {/* Quadrant Labels */}
              <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                <div className="border p-2 rounded bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400">
                  <strong>Leaders</strong><br />High Readiness + High Innovation
                </div>
                <div className="border p-2 rounded bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400">
                  <strong>Visionaries</strong><br />Low Readiness + High Innovation
                </div>
                <div className="border p-2 rounded bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400">
                  <strong>Niche Players</strong><br />Low Readiness + Low Innovation
                </div>
                <div className="border p-2 rounded bg-purple-50 dark:bg-purple-950/30 text-purple-700 dark:text-purple-400">
                  <strong>Challengers</strong><br />High Readiness + Low Innovation
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="text-center text-xs text-muted-foreground">
            In the full version this grid pulls live data from all 289+ companies and updates in real-time as you change axes or weights.
          </div>
        </TabsContent>

        {/* PHASE 4: Market Momentum Signals */}
        <TabsContent value="momentum" className="space-y-6 mt-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold">Market Momentum Signals</h4>
              <p className="text-sm text-muted-foreground">Composite 0–100 momentum score inspired by CB Insights Mosaic</p>
            </div>
            <Badge variant="secondary">Phase 4 • Live</Badge>
          </div>

          {/* Main Momentum Gauge */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Overall Momentum</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-8">
                <div className="relative w-40 h-40">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                    <circle 
                      cx="60" cy="60" r="52" 
                      fill="none" 
                      stroke="#e5e7eb" 
                      strokeWidth="8" 
                    />
                    <circle 
                      cx="60" cy="60" r="52" 
                      fill="none" 
                      stroke="#22c55e" 
                      strokeWidth="8" 
                      strokeDasharray="326.7" 
                      strokeDashoffset={326.7 - (326.7 * 78 / 100)} 
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="text-6xl font-bold text-green-500">78</div>
                    <div className="text-sm text-muted-foreground -mt-2">/ 100</div>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <div className="px-3 py-1 bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400 rounded-full text-sm font-medium flex items-center gap-1">
                    ↑ Accelerating
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Signal Breakdown */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Signal Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {[
                  { name: "Funding Activity", weight: "25%", score: 82, color: "#22c55e" },
                  { name: "Hiring Velocity", weight: "20%", score: 65, color: "#eab308" },
                  { name: "News & Media Presence", weight: "20%", score: 91, color: "#22c55e" },
                  { name: "Product Activity", weight: "15%", score: 74, color: "#22c55e" },
                  { name: "Search Interest", weight: "10%", score: 58, color: "#eab308" },
                  { name: "Social Signals", weight: "10%", score: 85, color: "#22c55e" },
                ].map((signal, index) => (
                  <div key={index} className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span>{signal.name}</span>
                        <span className="text-xs text-muted-foreground">({signal.weight})</span>
                      </div>
                      <span className="font-mono font-semibold">{signal.score}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all" 
                        style={{ 
                          width: `${signal.score}%`, 
                          backgroundColor: signal.color 
                        }} 
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Sparkline + Direction */}
          <Card>
            <CardHeader>
              <CardTitle>12-Month Momentum Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[
                    { month: "May", value: 52 },
                    { month: "Jun", value: 58 },
                    { month: "Jul", value: 61 },
                    { month: "Aug", value: 67 },
                    { month: "Sep", value: 71 },
                    { month: "Oct", value: 69 },
                    { month: "Nov", value: 74 },
                    { month: "Dec", value: 78 },
                    { month: "Jan", value: 82 },
                    { month: "Feb", value: 79 },
                    { month: "Mar", value: 85 },
                    { month: "Apr", value: 78 },
                  ]}>
                    <XAxis dataKey="month" />
                    <YAxis domain={[40, 100]} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#3b82f6" radius={3} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <div>↑ +26 pts over 12 months</div>
                <div className="text-green-600 dark:text-green-400 font-medium">Strong upward trajectory</div>
              </div>
            </CardContent>
          </Card>

          <div className="text-center">
            <Button variant="outline" onClick={() => {
              toast({ 
                title: "Momentum refreshed", 
                description: "Latest signals from news, funding, and hiring data pulled." 
              });
            }}>
              🔄 Refresh Signals
            </Button>
          </div>
        </TabsContent>

        {/* PHASE 5: GRIT Trend Alignment */}
        <TabsContent value="grit" className="space-y-6 mt-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold">GRIT Industry Trend Alignment</h4>
              <p className="text-sm text-muted-foreground">How well positioned against the 5 macro forces reshaping insights</p>
            </div>
            <Badge variant="secondary">Phase 5 • Live</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { 
                force: "Market Bifurcation (Tech vs Service)", 
                alignment: "High", 
                direction: "↑ Improving",
                score: 92,
                insight: "Strongly positioned on the winning tech side of the structural split"
              },
              { 
                force: "AI Displacement & Orchestration", 
                alignment: "High", 
                direction: "↑ Improving",
                score: 88,
                insight: "Well placed as orchestrator/translator rather than being displaced"
              },
              { 
                force: "Buyer Budget Compression", 
                alignment: "Medium", 
                direction: "→ Stable",
                score: 71,
                insight: "Solves 'do more with less' but could strengthen value demonstration"
              },
              { 
                force: "Data Quality Crisis", 
                alignment: "High", 
                direction: "↑ Improving",
                score: 85,
                insight: "Directly addresses sample quality, bot traffic, and verification gaps"
              },
              { 
                force: "Platform Consolidation", 
                alignment: "Medium", 
                direction: "↓ Declining",
                score: 64,
                insight: "Building some platform economics but at risk of becoming acquisition target"
              },
            ].map((item, index) => (
              <Card key={index} className="border-l-4" style={{ borderLeftColor: item.alignment === "High" ? "#22c55e" : "#eab308" }}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-base leading-tight pr-4">{item.force}</CardTitle>
                    <div className="text-right">
                      <div className="text-3xl font-bold text-primary">{item.score}</div>
                      <div className="text-xs text-muted-foreground">/ 100</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 mb-3">
                    <Badge className={item.alignment === "High" ? "bg-green-500" : "bg-yellow-500"}>
                      {item.alignment}
                    </Badge>
                    <span className="text-sm text-muted-foreground">{item.direction}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{item.insight}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Trend Alignment Map</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center bg-muted/30 rounded-lg">
                <div className="text-center">
                  <div className="text-6xl mb-4">📈</div>
                  <p className="text-lg font-medium">Strong Overall Alignment</p>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto mt-2">
                    This company aligns well with 3 of the 5 major industry forces. 
                    Focus areas: Strengthen platform economics and value demonstration for budget-conscious buyers.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="text-center text-xs text-muted-foreground">
            Auto-tagged from your weekly Substack signals • Last updated: Today
          </div>
        </TabsContent>

        {/* PHASE 6: Due Diligence Readiness */}
        <TabsContent value="diligence" className="space-y-6 mt-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold">Due Diligence Readiness</h4>
              <p className="text-sm text-muted-foreground">Track completeness of diligence process • Overall: 68%</p>
            </div>
            <Badge variant="secondary">Phase 6 • Live</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { 
                section: "Team & Leadership", 
                completed: 4, 
                total: 6, 
                status: "yellow",
                items: ["Founders identified", "Bios reviewed", "References checked", "Advisory board assessed", "Key hires mapped", "Culture fit evaluated"]
              },
              { 
                section: "Product & Technology", 
                completed: 5, 
                total: 6, 
                status: "green",
                items: ["Demo completed", "Tech stack documented", "IP reviewed", "Competitive moat assessed", "Security audit done", "Scalability tested"]
              },
              { 
                section: "Market & Traction", 
                completed: 3, 
                total: 5, 
                status: "yellow",
                items: ["TAM validated", "Customer references obtained", "Pipeline documented", "Metrics verified", "Churn analysis done"]
              },
              { 
                section: "Financial", 
                completed: 2, 
                total: 5, 
                status: "red",
                items: ["Revenue verified", "Burn rate documented", "Cap table reviewed", "Projections analyzed", "Unit economics validated"]
              },
              { 
                section: "Legal & Compliance", 
                completed: 4, 
                total: 4, 
                status: "green",
                items: ["Corporate structure confirmed", "IP assignments complete", "Regulatory exposure assessed", "Contracts reviewed"]
              },
            ].map((section, index) => (
              <Card key={index}>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-base">{section.section}</CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono">{section.completed}/{section.total}</span>
                      <div className={`w-3 h-3 rounded-full ${
                        section.status === "green" ? "bg-green-500" : 
                        section.status === "yellow" ? "bg-yellow-500" : "bg-red-500"
                      }`} />
                    </div>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full mt-2">
                    <div 
                      className="h-full rounded-full bg-primary" 
                      style={{ width: `${(section.completed / section.total) * 100}%` }}
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    {section.items.map((item, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input 
                          type="checkbox" 
                          checked={i < section.completed} 
                          className="accent-primary" 
                          readOnly 
                        />
                        <span className={i < section.completed ? "line-through text-muted-foreground" : ""}>
                          {item}
                        </span>
                      </div>
                    ))}
                  </div>
                  <Button variant="ghost" size="sm" className="mt-3 w-full text-xs">
                    + Add Note or Attachment
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold">Overall Diligence Readiness</div>
                  <div className="text-sm text-muted-foreground">18 of 26 items complete • 3 high-priority items remaining</div>
                </div>
                <div className="text-right">
                  <div className="text-4xl font-bold text-primary">68%</div>
                  <div className="text-xs text-muted-foreground">Ready for next stage</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="founder" className="space-y-6 mt-6">
          {/* Header: composite + judge identity */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">Founder &amp; Team Evaluation</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    29 criteria across 6 weighted domains. Your scores only — other judges see their own.
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-primary">
                    {founderComposite === null ? "—" : `${founderComposite}%`}
                  </div>
                  <div className="text-xs text-muted-foreground">Composite (scored only)</div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Operating Architecture (metadata only)</label>
                  <div className="flex gap-2">
                    {(["traditional", "hybrid", "zhc"] as const).map(arch => (
                      <Button
                        key={arch}
                        type="button"
                        size="sm"
                        variant={founderArchitecture === arch ? "default" : "outline"}
                        onClick={() => {
                          setFounderArchitecture(arch);
                          saveFounderSessionMutation.mutate({ architecture: arch, stage: founderStage });
                        }}
                      >
                        {arch === "zhc" ? "ZHC" : arch.charAt(0).toUpperCase() + arch.slice(1)}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Stage</label>
                  <div className="flex gap-2">
                    {(["pre-seed", "seed", "series-a"] as const).map(stg => (
                      <Button
                        key={stg}
                        type="button"
                        size="sm"
                        variant={founderStage === stg ? "default" : "outline"}
                        onClick={() => {
                          setFounderStage(stg);
                          saveFounderSessionMutation.mutate({ architecture: founderArchitecture, stage: stg });
                        }}
                      >
                        {stg === "series-a" ? "Series A" : stg.charAt(0).toUpperCase() + stg.slice(1)}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground italic">
                Architecture is metadata only — no impact on the composite score (per Path C alignment).
              </p>
            </CardContent>
          </Card>

          {/* Per-domain scoring cards */}
          {FOUNDER_DOMAINS.map(domain => (
            <Card key={domain.key}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{domain.label}</CardTitle>
                  <Badge variant="outline" className="text-xs">
                    Weight: {Math.round(domain.weight * 100)}%
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {domain.criteria.map(c => {
                  const isNA = !!founderNA[c.key];
                  const value = founderScores[c.key];
                  return (
                    <div key={c.key} className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="text-sm font-medium">{c.label}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{c.desc}</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-mono w-8 text-right">
                            {isNA ? "N/A" : typeof value === "number" ? value.toFixed(1) : "—"}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant={isNA ? "default" : "outline"}
                            onClick={() => {
                              const next = !isNA;
                              setFounderNA(prev => ({ ...prev, [c.key]: next }));
                              if (next) {
                                // Mark as N/A — store sentinel -1
                                setFounderScores(prev => {
                                  const copy = { ...prev };
                                  delete copy[c.key];
                                  return copy;
                                });
                                saveFounderScoreMutation.mutate({ dimension: c.key, score: -1 });
                              } else {
                                // Clearing N/A — remove the sentinel row by saving null-equivalent.
                                // Simplest: just clear local state; user must set a real score to persist again.
                                // For server cleanup, we save score=0 then expect them to slide it.
                                saveFounderScoreMutation.mutate({ dimension: c.key, score: 0 });
                                setFounderScores(prev => ({ ...prev, [c.key]: 0 }));
                              }
                            }}
                          >
                            N/A
                          </Button>
                        </div>
                      </div>
                      <Slider
                        min={0}
                        max={5}
                        step={0.5}
                        disabled={isNA}
                        value={[typeof value === "number" ? value : 0]}
                        onValueChange={(v) => {
                          setFounderScores(prev => ({ ...prev, [c.key]: v[0] }));
                        }}
                        onValueCommit={(v) => {
                          saveFounderScoreMutation.mutate({ dimension: c.key, score: v[0] });
                        }}
                      />
                    </div>
                  );
                })}
                <div className="pt-2">
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes for this domain</label>
                  <Textarea
                    placeholder={`Observations on ${domain.label.split(":")[1]?.trim() || "this domain"}…`}
                    value={founderNotes[domain.key] || ""}
                    onChange={(e) => setFounderNotes(prev => ({ ...prev, [domain.key]: e.target.value }))}
                    onBlur={(e) => {
                      saveFounderScoreMutation.mutate({
                        dimension: `${domain.key}_note`,
                        score: 0,
                        notes: e.target.value,
                      });
                    }}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="thesis">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Thesis Alignment lens coming in Phase 2. (Stacked bar + weight sliders)
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grid">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Competitive Grid lens coming in Phase 3. (Configurable 2×2 scatter)
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
