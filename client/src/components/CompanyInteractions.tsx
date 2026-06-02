import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ExternalLink, FileText, Plus } from "lucide-react";

interface Props {
  companyId: number;
}

interface Interaction {
  id: number;
  companyId: number;
  date: string;
  type: string;
  notes: string | null;
  transcriptUrl: string | null;
  createdBy: string | null;
  createdAt: string | null;
}

interface DriveFile {
  id: number;
  companyId: number;
  fileName: string;
  driveFileId: string;
  driveUrl: string;
  mimeType: string | null;
  uploadedBy: string | null;
  createdAt: string | null;
}

const INTERACTION_TYPES = [
  { value: "meeting", label: "Meeting" },
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "deck_received", label: "Deck Received" },
  { value: "transcript", label: "Transcript" },
  { value: "other", label: "Other" },
];

function formatType(t: string) {
  const found = INTERACTION_TYPES.find(x => x.value === t);
  return found ? found.label : t.replace(/_/g, " ");
}

export function CompanyInteractions({ companyId }: Props) {
  const { toast } = useToast();

  // ===== Interactions =====
  const [newInteraction, setNewInteraction] = useState({
    date: new Date().toISOString().split("T")[0],
    type: "meeting",
    notes: "",
    transcriptUrl: "",
  });

  const interactionsQuery = useQuery<Interaction[]>({
    queryKey: ["/api/companies", companyId, "interactions"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/companies/${companyId}/interactions`);
      return res.json();
    },
  });

  const createInteractionMutation = useMutation({
    mutationFn: async (payload: typeof newInteraction) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/interactions`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "interactions"] });
      toast({ title: "Interaction logged" });
      setNewInteraction({
        date: new Date().toISOString().split("T")[0],
        type: "meeting",
        notes: "",
        transcriptUrl: "",
      });
    },
    onError: (err: any) => {
      toast({ title: "Failed to log interaction", description: err.message, variant: "destructive" });
    },
  });

  const handleInteractionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInteraction.notes.trim() && !newInteraction.transcriptUrl.trim()) {
      toast({ title: "Add notes or a transcript URL", variant: "destructive" });
      return;
    }
    createInteractionMutation.mutate(newInteraction);
  };

  // ===== Drive Files =====
  const [newFile, setNewFile] = useState({ fileName: "", driveUrl: "" });

  const filesQuery = useQuery<DriveFile[]>({
    queryKey: ["/api/companies", companyId, "files"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/companies/${companyId}/files`);
      return res.json();
    },
  });

  const createFileMutation = useMutation({
    mutationFn: async (payload: typeof newFile) => {
      const res = await apiRequest("POST", `/api/companies/${companyId}/files`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies", companyId, "files"] });
      toast({ title: "Drive file attached" });
      setNewFile({ fileName: "", driveUrl: "" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to attach file", description: err.message, variant: "destructive" });
    },
  });

  const handleFileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFile.fileName.trim() || !newFile.driveUrl.trim()) {
      toast({ title: "Both file name and Drive URL are required", variant: "destructive" });
      return;
    }
    if (!/^https?:\/\//i.test(newFile.driveUrl)) {
      toast({ title: "Drive URL must start with http(s)://", variant: "destructive" });
      return;
    }
    createFileMutation.mutate(newFile);
  };

  const interactions = interactionsQuery.data || [];
  const files = filesQuery.data || [];

  return (
    <div className="space-y-6">
      {/* ===== Log Interaction ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Log New Interaction</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInteractionSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Date</label>
                <Input
                  type="date"
                  value={newInteraction.date}
                  onChange={(e) => setNewInteraction({ ...newInteraction, date: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Type</label>
                <Select
                  value={newInteraction.type}
                  onValueChange={(v) => setNewInteraction({ ...newInteraction, type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERACTION_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Transcript URL (optional)</label>
                <Input
                  placeholder="https://read.ai/..."
                  value={newInteraction.transcriptUrl}
                  onChange={(e) => setNewInteraction({ ...newInteraction, transcriptUrl: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Notes</label>
              <Textarea
                placeholder="Key takeaways, next steps, decisions..."
                value={newInteraction.notes}
                onChange={(e) => setNewInteraction({ ...newInteraction, notes: e.target.value })}
                rows={3}
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={createInteractionMutation.isPending}>
                {createInteractionMutation.isPending ? "Saving..." : "Log Interaction"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ===== Interaction Timeline ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Interaction History ({interactions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {interactions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No interactions logged yet.
            </p>
          ) : (
            <div className="space-y-4">
              {interactions.map((it) => (
                <div key={it.id} className="border-l-2 border-primary pl-4 py-1">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm">
                      {formatType(it.type)} • {(() => {
                        try { return format(new Date(it.date), "MMM d, yyyy"); }
                        catch { return it.date; }
                      })()}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {it.createdBy || "Team"}
                    </div>
                  </div>
                  {it.notes && (
                    <p className="text-sm mt-1 whitespace-pre-wrap">{it.notes}</p>
                  )}
                  {it.transcriptUrl && (
                    <a
                      href={it.transcriptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1"
                    >
                      View Transcript <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== Attach Drive File ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attach Google Drive File</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleFileSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">File name / label</label>
                <Input
                  placeholder="Pitch deck v2 (May 2026)"
                  value={newFile.fileName}
                  onChange={(e) => setNewFile({ ...newFile, fileName: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Drive share URL</label>
                <Input
                  placeholder="https://drive.google.com/file/d/.../view"
                  value={newFile.driveUrl}
                  onChange={(e) => setNewFile({ ...newFile, driveUrl: e.target.value })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Upload the file to Drive, set sharing to "Anyone with the link" (or to your team), then paste the URL here. We extract and store the Drive file ID.
            </p>
            <div className="flex justify-end">
              <Button type="submit" disabled={createFileMutation.isPending}>
                <Plus className="h-4 w-4 mr-1" />
                {createFileMutation.isPending ? "Attaching..." : "Attach File"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ===== Files List ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attached Files ({files.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {files.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No Drive files attached yet.
            </p>
          ) : (
            <div className="space-y-2">
              {files.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-md border bg-card"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{f.fileName}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        ID: {f.driveFileId} • {f.uploadedBy || "Team"}
                      </div>
                    </div>
                  </div>
                  <a
                    href={f.driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline inline-flex items-center gap-1 shrink-0"
                  >
                    Open in Drive <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
