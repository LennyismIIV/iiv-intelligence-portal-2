import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Company } from "@shared/schema";
import {
  STRATEGIC_POSTURES,
  STRATEGIC_POSTURE_LABELS,
  VALUATION_CATEGORIES,
  VALUATION_CATEGORY_LABELS,
  HUMAN_DATA_SUPPLY_CATEGORIES,
  HUMAN_DATA_SUPPLY_LABELS,
  PLATFORM_STAGES,
  PLATFORM_STAGE_LABELS,
  VC_CONTROL_LAYERS,
  BRAND_TAGS,
  BRAND_TAG_LABELS,
  parseJsonStringArray,
} from "@shared/schema";
import { Save, Compass } from "lucide-react";

function asStringArray(value: unknown): string[] {
  return parseJsonStringArray(value) ?? [];
}

function asCoord(value: unknown): string {
  if (value == null || value === "") return "";
  return String(value);
}

/**
 * Scorecard-minimal Firm fields editor.
 * Writes through PATCH /api/companies/:id so Scorecard Draft can read them back
 * on GET /api/companies/:id. Does not introduce a parallel Firm SoR.
 */
export function ScorecardFieldsPanel({ company }: { company: Company }) {
  const [mapAX, setMapAX] = useState(asCoord(company.mapAX));
  const [mapAY, setMapAY] = useState(asCoord(company.mapAY));
  const [strategicPosture, setStrategicPosture] = useState(company.strategicPosture || "");
  const [valuationCategory, setValuationCategory] = useState(company.valuationCategory || "");
  const [humanDataSupplyCategory, setHumanDataSupplyCategory] = useState(company.humanDataSupplyCategory || "");
  const [platformStage, setPlatformStage] = useState(company.platformStage || "");
  const [vcControlLayers, setVcControlLayers] = useState<string[]>(asStringArray(company.vcControlLayers));
  const [brandTags, setBrandTags] = useState<string[]>(asStringArray(company.brandTags));

  useEffect(() => {
    setMapAX(asCoord(company.mapAX));
    setMapAY(asCoord(company.mapAY));
    setStrategicPosture(company.strategicPosture || "");
    setValuationCategory(company.valuationCategory || "");
    setHumanDataSupplyCategory(company.humanDataSupplyCategory || "");
    setPlatformStage(company.platformStage || "");
    setVcControlLayers(asStringArray(company.vcControlLayers));
    setBrandTags(asStringArray(company.brandTags));
  }, [
    company.id,
    company.mapAX,
    company.mapAY,
    company.strategicPosture,
    company.valuationCategory,
    company.humanDataSupplyCategory,
    company.platformStage,
    company.vcControlLayers,
    company.brandTags,
  ]);

  const qc = useQueryClient();
  const { toast } = useToast();

  const toggleIn = (list: string[], value: string, setter: (next: string[]) => void) => {
    setter(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const save = useMutation({
    mutationFn: async () => {
      const parseCoord = (v: string) => (v === "" ? null : Number(v));
      const body = {
        mapAX: parseCoord(mapAX),
        mapAY: parseCoord(mapAY),
        strategicPosture: strategicPosture || null,
        valuationCategory: valuationCategory || null,
        humanDataSupplyCategory: humanDataSupplyCategory || null,
        platformStage: platformStage || null,
        vcControlLayers,
        brandTags,
      };
      const res = await apiRequest("PATCH", `/api/companies/${company.id}`, body);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/companies", String(company.id)] });
      qc.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "Saved", description: "Scorecard fields updated." });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err?.message || "Unknown error", variant: "destructive" });
    },
  });

  return (
    <Card className="border-blue-200 dark:border-blue-900" data-testid="scorecard-fields-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Compass className="w-4 h-4 text-blue-600" />
          Scorecard fields
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Minimal Firm fields Scorecard Draft reads back from this company. Map A is 0–10 inclusive.
          Leave a field unset if unknown.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="map-a-x">Map A X (0–10)</Label>
            <Input
              id="map-a-x"
              type="number"
              inputMode="decimal"
              min={0}
              max={10}
              step="0.1"
              placeholder="e.g. 6.5"
              value={mapAX}
              onChange={(e) => setMapAX(e.target.value)}
              data-testid="input-map-a-x"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="map-a-y">Map A Y (0–10)</Label>
            <Input
              id="map-a-y"
              type="number"
              inputMode="decimal"
              min={0}
              max={10}
              step="0.1"
              placeholder="e.g. 4.0"
              value={mapAY}
              onChange={(e) => setMapAY(e.target.value)}
              data-testid="input-map-a-y"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="strategic-posture">Strategic posture</Label>
            <Select value={strategicPosture || "unset"} onValueChange={(v) => setStrategicPosture(v === "unset" ? "" : v)}>
              <SelectTrigger id="strategic-posture" data-testid="select-strategic-posture">
                <SelectValue placeholder="Select posture" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">— Unset —</SelectItem>
                {STRATEGIC_POSTURES.map((v) => (
                  <SelectItem key={v} value={v}>{STRATEGIC_POSTURE_LABELS[v]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="valuation-category">Valuation category</Label>
            <Select value={valuationCategory || "unset"} onValueChange={(v) => setValuationCategory(v === "unset" ? "" : v)}>
              <SelectTrigger id="valuation-category" data-testid="select-valuation-category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">— Unset —</SelectItem>
                {VALUATION_CATEGORIES.map((v) => (
                  <SelectItem key={v} value={v}>{VALUATION_CATEGORY_LABELS[v]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="human-data-supply">Human data supply</Label>
            <Select value={humanDataSupplyCategory || "unset"} onValueChange={(v) => setHumanDataSupplyCategory(v === "unset" ? "" : v)}>
              <SelectTrigger id="human-data-supply" data-testid="select-human-data-supply">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">— Unset —</SelectItem>
                {HUMAN_DATA_SUPPLY_CATEGORIES.map((v) => (
                  <SelectItem key={v} value={v}>{HUMAN_DATA_SUPPLY_LABELS[v]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="platform-stage">Platform stage</Label>
            <Select value={platformStage || "unset"} onValueChange={(v) => setPlatformStage(v === "unset" ? "" : v)}>
              <SelectTrigger id="platform-stage" data-testid="select-platform-stage">
                <SelectValue placeholder="Select stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">— Unset —</SelectItem>
                {PLATFORM_STAGES.map((v) => (
                  <SelectItem key={v} value={v}>{PLATFORM_STAGE_LABELS[v]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label>VC control layers</Label>
          <div className="flex flex-wrap gap-4" data-testid="vc-control-layers">
            {VC_CONTROL_LAYERS.map((layer) => (
              <label key={layer} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={vcControlLayers.includes(layer)}
                  onCheckedChange={() => toggleIn(vcControlLayers, layer, setVcControlLayers)}
                  data-testid={`check-vc-${layer}`}
                />
                {layer}
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Brand tags</Label>
          <div className="flex flex-wrap gap-4" data-testid="brand-tags">
            {BRAND_TAGS.map((tag) => (
              <label key={tag} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={brandTags.includes(tag)}
                  onCheckedChange={() => toggleIn(brandTags, tag, setBrandTags)}
                  data-testid={`check-brand-${tag}`}
                />
                {BRAND_TAG_LABELS[tag]}
              </label>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Existing Gen2 relationship is mapped to Gen2 client on first boot when brand tags are empty.
            Greenbook-visible is the ACL flag for a future Greenbook export (none exists yet).
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-scorecard">
            <Save className="w-4 h-4 mr-2" />
            {save.isPending ? "Saving…" : "Save Scorecard fields"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
