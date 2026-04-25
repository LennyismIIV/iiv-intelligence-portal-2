import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ExternalLink, ArrowLeft, Users, DollarSign, Calendar, Building2, Mail, Linkedin, Plus, Newspaper, GitCompareArrows, Pencil } from "lucide-react";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Company, Contact, IntelligenceEvent } from "@shared/schema";
import { LensSelector } from "@/components/LensSelector";

interface CompanyWithRelations extends Company {
  contacts: Contact[];
  events: IntelligenceEvent[];
}

export default function CompanyDetail() {
  const [, params] = useRoute("/companies/:id");
  const id = params?.id;
  const { toast } = useToast();

  const { data: company, isLoading } = useQuery<CompanyWithRelations>({
    queryKey: ["/api/companies", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/companies/${id}`);
      return res.json();
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex-1 p-6">
        <Skeleton className="h-48 w-full mb-6 rounded-lg" />
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center">
        <p className="text-muted-foreground">Company not found</p>
      </div>
    );
  }

  const websiteUrl = company.website ? (company.website.startsWith("http") ? company.website : `https://${company.website}`) : null;

  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#012652] to-[#032958] px-8 py-8">
        <div className="max-w-6xl mx-auto">
          <Link href="/companies">
            <span className="inline-flex items-center gap-1.5 text-blue-200/70 text-sm hover:text-white cursor-pointer mb-4" data-testid="link-back">
              <ArrowLeft size={14} /> Back to Companies
            </span>
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white mb-2" data-testid="text-company-name">{company.name}</h1>
              <div className="flex items-center gap-3 flex-wrap">
                {websiteUrl && (
                  <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-300 text-sm hover:text-white" data-testid="link-website">
                    <ExternalLink size={12} /> {company.website}
                  </a>
                )}
                {company.competitionYear && (
                  <Badge variant="secondary" className="bg-white/10 text-white border-white/20">{company.competitionYear}</Badge>
                )}
                {company.competitionStatus && (
                  <Badge className={`${company.competitionStatus.toLowerCase() === "winner" ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" : "bg-blue-500/20 text-blue-200 border-blue-500/30"}`} variant="outline">
                    {company.competitionStatus}
                  </Badge>
                )}
                {company.category && (
                  <Badge variant="outline" className="text-blue-200 border-blue-300/30">{company.category}</Badge>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Link href="/compare">
                <Button variant="outline" size="sm" className="gap-1.5 bg-white/10 border-white/20 text-white hover:bg-white/20" data-testid="button-compare">
                  <GitCompareArrows size={14} /> Compare
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-8 py-6">
        <div className="flex gap-6">
          {/* Main Content */}
          <div className="flex-1 min-w-0">
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="w-full justify-start bg-muted/50 mb-4" data-testid="company-tabs">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="taxonomy">Taxonomy</TabsTrigger>
                <TabsTrigger value="financials">Financials</TabsTrigger>
                <TabsTrigger value="contacts">Contacts</TabsTrigger>
                <TabsTrigger value="intelligence">Intelligence</TabsTrigger>
                <TabsTrigger value="evaluation">Evaluation</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
              </TabsList>

              <TabsContent value="overview">
                <div className="space-y-6">
                  {company.description && (
                    <Section title="Description" content={company.description} />
                  )}
                  {company.howItWorks && (
                    <Section title="How It Works" content={company.howItWorks} />
                  )}
                  {company.businessNeed && (
                    <Section title="Business Need" content={company.businessNeed} />
                  )}
                  {company.caseStudy && (
                    <Section title="Case Study" content={company.caseStudy} />
                  )}
                  {company.businessPotential && (
                    <Section title="Business Potential" content={company.businessPotential} />
                  )}
                  {!company.description && !company.howItWorks && !company.businessNeed && (
                    <Card className="bg-card border-border"><CardContent className="p-6 text-muted-foreground text-sm">No overview data available.</CardContent></Card>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="taxonomy">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TaxonomyCard label="Workflow Primary" value={company.workflowPrimary} />
                  <TaxonomyCard label="Workflow Secondary" value={company.workflowSecondary} />
                  <TaxonomyCard label="Data Modalities" value={company.dataModalities} />
                  <TaxonomyCard label="AI Primary" value={company.aiPrimary} />
                  <TaxonomyCard label="AI Secondary" value={company.aiSecondary} />
                  <TaxonomyCard label="Business Model" value={company.businessModel} />
                  <TaxonomyCard label="Revenue Stage" value={company.revenueStage} />
                  <TaxonomyCard label="JTBD Primary" value={company.jtbdPrimary} />
                  <TaxonomyCard label="JTBD Secondary" value={company.jtbdSecondary} />
                  <TaxonomyCard label="Buyer Primary" value={company.buyerPrimary} />
                </div>
              </TabsContent>

              <TabsContent value="financials">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <FinCard icon={<DollarSign size={16} />} label="Est. Revenue" value={company.estimatedRevenue ? `$${company.estimatedRevenue.toLocaleString()}` : "—"} />
                  <FinCard icon={<DollarSign size={16} />} label="Est. Valuation" value={company.estimatedValuation ? `$${company.estimatedValuation.toLocaleString()}` : "—"} />
                  <FinCard icon={<DollarSign size={16} />} label="Capital Raised" value={company.capitalRaised ? `$${Number(company.capitalRaised).toLocaleString()}` : "—"} />
                  <FinCard icon={<Building2 size={16} />} label="M&A Status" value={company.maStatus || "—"} />
                  <FinCard icon={<Users size={16} />} label="Employees" value={company.employeeCount ? String(company.employeeCount) : "—"} />
                  <FinCard icon={<Calendar size={16} />} label="Year Founded" value={company.yearFounded ? String(company.yearFounded) : "—"} />
                </div>
              </TabsContent>

              <TabsContent value="contacts">
                <ContactsTab companyId={company.id} contacts={company.contacts || []} />
              </TabsContent>

              <TabsContent value="intelligence">
                <IntelligenceTab companyId={company.id} events={company.events || []} />
              </TabsContent>

              <TabsContent value="evaluation">
                <LensSelector companyId={company.id} companyName={company.name} />
              </TabsContent>

              <TabsContent value="notes">
                <div className="space-y-4">
                  <Section title="Notes" content={company.notes || "No notes available."} />
                  <Section title="Gen2 Relationship" content={company.gen2Relationship || "—"} />
                  <Section title="Current Status" content={company.currentStatus || "—"} />
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <aside className="w-72 flex-shrink-0 hidden lg:block">
            <Card className="bg-card border-border sticky top-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Quick Facts</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <QuickFact label="Founded" value={company.yearFounded ? String(company.yearFounded) : "—"} />
                <QuickFact label="Employees" value={company.employeeCount ? String(company.employeeCount) : "—"} />
                <QuickFact label="Revenue Stage" value={company.revenueStage || "—"} />
                <QuickFact label="Company Type" value={company.companyType || "—"} />
                <QuickFact label="Status" value={company.competitionStatus || "—"} />
                <QuickFact label="M&A Status" value={company.maStatus?.substring(0, 40) || "—"} />
                {websiteUrl && (
                  <a href={websiteUrl} target="_blank" rel="noopener noreferrer" data-testid="button-visit-website" className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium bg-primary text-primary-foreground h-9 px-4 hover:bg-primary/90">
                    <ExternalLink size={14} /> Visit Website
                  </a>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Section({ title, content }: { title: string; content: string }) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{content}</p>
      </CardContent>
    </Card>
  );
}

function TaxonomyCard({ label, value }: { label: string; value: string | null }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground mb-1.5">{label}</div>
        {value ? (
          <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">{value}</Badge>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </CardContent>
    </Card>
  );
}

function FinCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1.5 text-muted-foreground">
          {icon}
          <span className="text-xs">{label}</span>
        </div>
        <div className="text-lg font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function QuickFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[140px] truncate">{value}</span>
    </div>
  );
}

function ContactsTab({ companyId, contacts }: { companyId: number; contacts: Contact[] }) {
  const [showAdd, setShowAdd] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const { toast } = useToast();

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/contacts`, { firstName, lastName, email, title });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", String(companyId)] });
      toast({ title: "Contact added" });
      setShowAdd(false);
      setFirstName(""); setLastName(""); setEmail(""); setTitle("");
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Contacts ({contacts.length})</h3>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5" data-testid="button-add-contact"><Plus size={14} /> Add Contact</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} data-testid="input-contact-first" />
              <Input placeholder="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} data-testid="input-contact-last" />
              <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-contact-email" />
              <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-contact-title" />
              <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending} className="w-full" data-testid="button-submit-contact">
                {addMutation.isPending ? "Adding..." : "Add Contact"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {contacts.length === 0 ? (
        <Card className="bg-card border-border"><CardContent className="p-6 text-muted-foreground text-sm text-center">No contacts yet.</CardContent></Card>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium text-xs">Name</th>
                <th className="text-left p-3 font-medium text-xs">Title</th>
                <th className="text-left p-3 font-medium text-xs">Email</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="p-3 font-medium">{c.firstName} {c.lastName}</td>
                  <td className="p-3 text-muted-foreground">{c.title || "—"}</td>
                  <td className="p-3">
                    {c.email ? (
                      <a href={`mailto:${c.email}`} className="text-primary hover:underline flex items-center gap-1" data-testid={`contact-email-${c.id}`}>
                        <Mail size={12} /> {c.email}
                      </a>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function IntelligenceTab({ companyId, events }: { companyId: number; events: IntelligenceEvent[] }) {
  const [showAdd, setShowAdd] = useState(false);
  const [eventType, setEventType] = useState("news");
  const [eventTitle, setEventTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceDate, setSourceDate] = useState("");
  const { toast } = useToast();

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/events`, {
        eventType, title: eventTitle, summary, sourceUrl, sourceDate,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", String(companyId)] });
      toast({ title: "Event added" });
      setShowAdd(false);
      setEventTitle(""); setSummary(""); setSourceUrl(""); setSourceDate("");
    },
  });

  const eventTypes = ['news', 'funding', 'product_update', 'ma_activity', 'partnership', 'leadership_change', 'social_media', 'conference', 'other'];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">Intelligence Events ({events.length})</h3>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5" data-testid="button-add-event"><Plus size={14} /> Add Event</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Intelligence Event</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger data-testid="select-event-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {eventTypes.map((t) => (
                    <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input placeholder="Title" value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} data-testid="input-event-title" />
              <Textarea placeholder="Summary" value={summary} onChange={(e) => setSummary(e.target.value)} data-testid="input-event-summary" />
              <Input placeholder="Source URL" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} data-testid="input-event-url" />
              <Input type="date" value={sourceDate} onChange={(e) => setSourceDate(e.target.value)} data-testid="input-event-date" />
              <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !eventTitle} className="w-full" data-testid="button-submit-event">
                {addMutation.isPending ? "Adding..." : "Add Event"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {events.length === 0 ? (
        <Card className="bg-card border-border"><CardContent className="p-6 text-muted-foreground text-sm text-center">No intelligence events recorded yet.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {events.map((e) => (
            <Card key={e.id} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Newspaper size={14} className="text-primary" />
                      <Badge variant="secondary" className="text-[10px]">{e.eventType.replace(/_/g, ' ')}</Badge>
                    </div>
                    <h4 className="font-medium text-sm">{e.title}</h4>
                    {e.summary && <p className="text-xs text-muted-foreground mt-1">{e.summary}</p>}
                  </div>
                  <div className="text-xs text-muted-foreground">{e.sourceDate || e.createdAt?.substring(0, 10)}</div>
                </div>
                {e.sourceUrl && (
                  <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline mt-2 inline-flex items-center gap-1">
                    <ExternalLink size={10} /> Source
                  </a>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
