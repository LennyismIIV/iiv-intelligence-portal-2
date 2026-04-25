import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editCompany?: any;
}

export function AddCompanyDialog({ open, onOpenChange, editCompany }: Props) {
  const { toast } = useToast();
  const isEdit = !!editCompany;

  const { data: filterValues } = useQuery<any>({
    queryKey: ["/api/filters"],
  });

  const [form, setForm] = useState<any>(editCompany || {
    name: "", website: "", description: "", category: "", companyType: "",
    competitionYear: "", competitionStatus: "", competitionEvent: "",
    yearFounded: "", employeeCount: "", estimatedRevenue: "", estimatedValuation: "",
    capitalRaised: "", maStatus: "", businessModel: "", revenueStage: "",
    workflowPrimary: "", workflowSecondary: "", dataModalities: "",
    aiPrimary: "", aiSecondary: "", jtbdPrimary: "", jtbdSecondary: "",
    buyerPrimary: "", gen2Relationship: "", currentStatus: "", notes: "",
  });

  const update = (key: string, val: any) => setForm((prev: any) => ({ ...prev, [key]: val }));

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        competitionYear: form.competitionYear ? parseInt(form.competitionYear) : null,
        yearFounded: form.yearFounded ? parseInt(form.yearFounded) : null,
        employeeCount: form.employeeCount ? parseInt(form.employeeCount) : null,
        estimatedRevenue: form.estimatedRevenue ? parseFloat(form.estimatedRevenue) : null,
        estimatedValuation: form.estimatedValuation ? parseFloat(form.estimatedValuation) : null,
      };
      if (isEdit) {
        return (await apiRequest("PATCH", `/api/companies/${editCompany.id}`, payload)).json();
      }
      return (await apiRequest("POST", "/api/companies", payload)).json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: isEdit ? "Company updated" : "Company created" });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Company" : "Add New Company"}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {/* Basic Info */}
            <fieldset>
              <legend className="text-sm font-semibold mb-3">Basic Information</legend>
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="Company Name *" value={form.name} onChange={(e) => update("name", e.target.value)} data-testid="input-company-name" />
                <Input placeholder="Website" value={form.website} onChange={(e) => update("website", e.target.value)} data-testid="input-company-website" />
                <div className="col-span-2">
                  <Textarea placeholder="Description" value={form.description} onChange={(e) => update("description", e.target.value)} data-testid="input-company-description" rows={3} />
                </div>
                <Select value={form.category || "none"} onValueChange={(v) => update("category", v === "none" ? "" : v)}>
                  <SelectTrigger data-testid="input-company-category"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select category</SelectItem>
                    {(filterValues?.categories || []).map((c: string) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                    <SelectItem value="In Person">In Person</SelectItem>
                    <SelectItem value="Sampling">Sampling</SelectItem>
                    <SelectItem value="Online Qual">Online Qual</SelectItem>
                    <SelectItem value="Shopper Insights">Shopper Insights</SelectItem>
                    <SelectItem value="Usability">Usability</SelectItem>
                    <SelectItem value="Communities">Communities</SelectItem>
                    <SelectItem value="Passive Collection">Passive Collection</SelectItem>
                    <SelectItem value="Employee Research">Employee Research</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={form.companyType || "none"} onValueChange={(v) => update("companyType", v === "none" ? "" : v)}>
                  <SelectTrigger data-testid="select-company-type"><SelectValue placeholder="Company Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select type</SelectItem>
                    <SelectItem value="Pure/Mostly Tech">Pure/Mostly Tech</SelectItem>
                    <SelectItem value="Service">Service</SelectItem>
                    <SelectItem value="Tech + Service">Tech + Service</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </fieldset>

            {/* Competition */}
            <fieldset>
              <legend className="text-sm font-semibold mb-3">Competition</legend>
              <div className="grid grid-cols-3 gap-3">
                <Input type="number" placeholder="Year" value={form.competitionYear} onChange={(e) => update("competitionYear", e.target.value)} data-testid="input-competition-year" />
                <Select value={form.competitionStatus || "none"} onValueChange={(v) => update("competitionStatus", v === "none" ? "" : v)}>
                  <SelectTrigger data-testid="select-competition-status"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select status</SelectItem>
                    <SelectItem value="Winner">Winner</SelectItem>
                    <SelectItem value="Finalist">Finalist</SelectItem>
                    <SelectItem value="Entrant">Entrant</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Event" value={form.competitionEvent} onChange={(e) => update("competitionEvent", e.target.value)} data-testid="input-competition-event" />
              </div>
            </fieldset>

            {/* Business */}
            <fieldset>
              <legend className="text-sm font-semibold mb-3">Business</legend>
              <div className="grid grid-cols-3 gap-3">
                <Input type="number" placeholder="Year Founded" value={form.yearFounded} onChange={(e) => update("yearFounded", e.target.value)} data-testid="input-year-founded" />
                <Input type="number" placeholder="Employee Count" value={form.employeeCount} onChange={(e) => update("employeeCount", e.target.value)} data-testid="input-employee-count" />
                <Input type="number" placeholder="Est. Revenue" value={form.estimatedRevenue} onChange={(e) => update("estimatedRevenue", e.target.value)} data-testid="input-revenue" />
                <Input type="number" placeholder="Est. Valuation" value={form.estimatedValuation} onChange={(e) => update("estimatedValuation", e.target.value)} data-testid="input-valuation" />
                <Input placeholder="Capital Raised" value={form.capitalRaised} onChange={(e) => update("capitalRaised", e.target.value)} data-testid="input-capital" />
                <Input placeholder="M&A Status" value={form.maStatus} onChange={(e) => update("maStatus", e.target.value)} data-testid="input-ma-status" />
              </div>
            </fieldset>

            {/* Taxonomy */}
            <fieldset>
              <legend className="text-sm font-semibold mb-3">Taxonomy</legend>
              <div className="grid grid-cols-2 gap-3">
                <Select value={form.workflowPrimary || "none"} onValueChange={(v) => update("workflowPrimary", v === "none" ? "" : v)}>
                  <SelectTrigger data-testid="input-workflow-primary"><SelectValue placeholder="Workflow Primary" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select workflow</SelectItem>
                    <SelectItem value="Data Capture - Conversational">Data Capture - Conversational</SelectItem>
                    <SelectItem value="Data Capture - Survey">Data Capture - Survey</SelectItem>
                    <SelectItem value="Data Capture - Behavioral & Passive">Data Capture - Behavioral & Passive</SelectItem>
                    <SelectItem value="Analysis & Interpretation">Analysis & Interpretation</SelectItem>
                    <SelectItem value="Recruitment & Sampling">Recruitment & Sampling</SelectItem>
                    <SelectItem value="Insight Orchestration">Insight Orchestration</SelectItem>
                    <SelectItem value="Problem Framing">Problem Framing</SelectItem>
                    <SelectItem value="Reporting & Storytelling">Reporting & Storytelling</SelectItem>
                    <SelectItem value="Data Enrichment">Data Enrichment</SelectItem>
                    <SelectItem value="Consulting">Consulting</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Workflow Secondary" value={form.workflowSecondary} onChange={(e) => update("workflowSecondary", e.target.value)} data-testid="input-workflow-secondary" />
                <Select value={form.dataModalities || "none"} onValueChange={(v) => update("dataModalities", v === "none" ? "" : v)}>
                  <SelectTrigger data-testid="input-data-modalities"><SelectValue placeholder="Data Modalities" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select data type</SelectItem>
                    <SelectItem value="Structured Survey">Structured Survey</SelectItem>
                    <SelectItem value="Text">Text</SelectItem>
                    <SelectItem value="Audio/Voice">Audio/Voice</SelectItem>
                    <SelectItem value="Video/Images">Video/Images</SelectItem>
                    <SelectItem value="Digital/Behavioral">Digital/Behavioral</SelectItem>
                    <SelectItem value="Social/Cultural">Social/Cultural</SelectItem>
                    <SelectItem value="Biometric/Neuro">Biometric/Neuro</SelectItem>
                    <SelectItem value="Transactional/CRM">Transactional/CRM</SelectItem>
                    <SelectItem value="Emotional">Emotional</SelectItem>
                    <SelectItem value="Behavioral">Behavioral</SelectItem>
                    <SelectItem value="Passive">Passive</SelectItem>
                    <SelectItem value="No New Data">No New Data</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="AI Primary" value={form.aiPrimary} onChange={(e) => update("aiPrimary", e.target.value)} data-testid="input-ai-primary" />
                <Input placeholder="AI Secondary" value={form.aiSecondary} onChange={(e) => update("aiSecondary", e.target.value)} data-testid="input-ai-secondary" />
                <Select value={form.businessModel || "none"} onValueChange={(v) => update("businessModel", v === "none" ? "" : v)}>
                  <SelectTrigger data-testid="input-business-model"><SelectValue placeholder="Business Model" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select model</SelectItem>
                    <SelectItem value="Pure/Mostly Tech">Pure/Mostly Tech</SelectItem>
                    <SelectItem value="Tech-Enabled Service">Tech-Enabled Service</SelectItem>
                    <SelectItem value="Agency/Consultancy">Agency/Consultancy</SelectItem>
                    <SelectItem value="Data Infrastructure">Data Infrastructure</SelectItem>
                    <SelectItem value="Marketplace/Network">Marketplace/Network</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Revenue Stage" value={form.revenueStage} onChange={(e) => update("revenueStage", e.target.value)} data-testid="input-revenue-stage" />
                <Input placeholder="JTBD Primary" value={form.jtbdPrimary} onChange={(e) => update("jtbdPrimary", e.target.value)} data-testid="input-jtbd-primary" />
                <Input placeholder="JTBD Secondary" value={form.jtbdSecondary} onChange={(e) => update("jtbdSecondary", e.target.value)} data-testid="input-jtbd-secondary" />
                <Input placeholder="Buyer Primary" value={form.buyerPrimary} onChange={(e) => update("buyerPrimary", e.target.value)} data-testid="input-buyer-primary" />
              </div>
            </fieldset>

            {/* Notes */}
            <fieldset>
              <legend className="text-sm font-semibold mb-3">Notes</legend>
              <div className="space-y-3">
                <Textarea placeholder="Notes" value={form.notes} onChange={(e) => update("notes", e.target.value)} data-testid="input-notes" rows={3} />
                <Input placeholder="Gen2 Relationship" value={form.gen2Relationship} onChange={(e) => update("gen2Relationship", e.target.value)} data-testid="input-gen2" />
                <Input placeholder="Current Status" value={form.currentStatus} onChange={(e) => update("currentStatus", e.target.value)} data-testid="input-current-status" />
              </div>
            </fieldset>
          </div>
        </ScrollArea>
        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel">Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.name} data-testid="button-save-company">
            {mutation.isPending ? "Saving..." : isEdit ? "Update" : "Create Company"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
