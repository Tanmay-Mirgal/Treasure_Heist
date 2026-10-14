"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, FlaskConical, ListOrdered, Pencil, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActionBadge, MissionCard, PageTitle } from "@/components/heist/bits";
import { ReasonDialog, SeverityBadge, StatusPill } from "@/components/heist/admin-kit";
import { api } from "@/lib/client/api";
import { usePoll } from "@/hooks/use-poll";
import type { ActionType } from "@/lib/game/types";
import { cn } from "@/lib/utils";

type Entry = {
  position: number;
  qrRef: string;
  copyId: string;
  isFinish: boolean;
  missing: boolean;
  actionType: ActionType | null;
  mode: string | null;
  status: string | null;
  clueText: string;
  placement: { code: string; label: string } | null;
  destination: { code: string; label: string } | null;
  nextPlacement: { code: string; label: string } | null;
  completed: boolean;
  verdict: "OK" | "DESCRIBES_CURRENT" | "MISMATCH" | "UNKNOWN" | null;
};
type Seq = {
  teamId: string;
  teamNumber: number;
  teamName: string;
  currentPosition: number;
  version: number | null;
  updatedBy: string | null;
  startingClue: { riddle: string; location: string; answer: string; editedFields?: string[] } | null;
  sourceOrder: string[];
  issues: { severity: "ERROR" | "WARNING" | "INFO"; code: string; message: string; position?: number | null }[];
  entries: Entry[];
};
type Sim = { teamName: string; ok: boolean; steps: { step: number; scan: string; at?: string | null; action?: string; shows: string; leadsTo: string | null; ok: boolean; notes: string[] }[] };

export function SequencesClient() {
  const { data, refresh } = usePoll<{ sequences: Seq[] }>((signal) => api("/api/admin/sequences", { signal, redirectOn401: "admin" }), 30_000);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [editRoute, setEditRoute] = useState(false);
  const [routeText, setRouteText] = useState("");
  const [editStart, setEditStart] = useState(false);
  const [startDraft, setStartDraft] = useState({ riddle: "", location: "", answer: "" });
  const [sim, setSim] = useState<Sim | null>(null);
  const [preview, setPreview] = useState<Entry | null>(null);

  if (!data) return <Skeleton className="h-96 w-full" />;
  const seq = data.sequences.find((s) => s.teamId === teamId) ?? data.sequences[0];
  if (!seq) return <p>No teams.</p>;
  const errors = seq.issues.filter((i) => i.severity !== "INFO");

  async function simulate() {
    setSim(await api<Sim>(`/api/admin/sequences/${seq!.teamId}`));
  }

  return (
    <div className="space-y-5">
      <PageTitle
        title="Sequence manager"
        subtitle="Each team's private route, imported from the workbook. The server only accepts the next QR in this order."
        actions={
          <Select value={seq.teamId} onValueChange={setTeamId}>
            <SelectTrigger className="w-48" aria-label="Choose team">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.sequences.map((s) => (
                <SelectItem key={s.teamId} value={s.teamId}>
                  {s.teamName} {s.issues.some((i) => i.severity === "ERROR") ? "⚠" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge className="bg-secondary">version {seq.version ?? "—"}</Badge>
        <Badge className="bg-secondary">last change: {seq.updatedBy ?? "—"}</Badge>
        <Badge className="bg-secondary">progress {seq.currentPosition}/{seq.entries.length}</Badge>
        <span className="text-xs text-muted-foreground">Workbook order: {seq.sourceOrder.join(" → ") || "—"}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={simulate}>
          <FlaskConical className="size-4" /> Test sequence (dry run)
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setRouteText(seq.entries.map((e) => e.copyId).join("\n"));
            setEditRoute(true);
          }}
        >
          <ListOrdered className="size-4" /> Edit route
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setStartDraft({ riddle: seq.startingClue?.riddle ?? "", location: seq.startingClue?.location ?? "", answer: seq.startingClue?.answer ?? "" });
            setEditStart(true);
          }}
        >
          <Pencil className="size-4" /> Edit starting clue
        </Button>
        <Button asChild variant="ghost">
          <Link href="/admin/validation">
            <ScrollText className="size-4" /> Full validation report
          </Link>
        </Button>
      </div>

      {errors.length > 0 && (
        <div className="rounded-xl border border-warn/30 bg-warn/5 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-warn">
            <AlertTriangle className="size-4" /> {errors.length} data issue(s) for this team
          </div>
          <ul className="space-y-1.5 text-xs">
            {errors.map((i, n) => (
              <li key={n} className="flex gap-2">
                <SeverityBadge severity={i.severity} /> {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {seq.startingClue && (
        <div className="rounded-xl border bg-card/60 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Starting clue (shown at login)</div>
          <p className="clue-text mt-2 text-sm">{seq.startingClue.riddle}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Organizer only — location: <span className="text-foreground">{seq.startingClue.location}</span> · answer:{" "}
            <span className="text-foreground">{seq.startingClue.answer || "—"}</span>
          </p>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>QR copy</TableHead>
              <TableHead>Placed at</TableHead>
              <TableHead>Action</TableHead>
              <TableHead className="min-w-72">Clue shown after scan</TableHead>
              <TableHead>Destination (sheet)</TableHead>
              <TableHead>Next QR is at</TableHead>
              <TableHead>Check</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {seq.entries.map((e) => {
              const destMismatch = e.nextPlacement && e.destination && e.destination.code && e.destination.code !== e.nextPlacement.code;
              return (
                <TableRow key={e.position} className={cn(e.completed && "opacity-60")}>
                  <TableCell className="hud-number">{e.position}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {e.copyId}
                    {e.missing && <div className="text-danger">MISSING</div>}
                    {e.status && e.status !== "ACTIVE" && <StatusPill status={e.status} />}
                  </TableCell>
                  <TableCell className="text-xs">{e.placement ? `${e.placement.code} ${e.placement.label}` : "—"}</TableCell>
                  <TableCell>{e.actionType && <ActionBadge action={e.actionType} />}</TableCell>
                  <TableCell>
                    <button type="button" onClick={() => setPreview(e)} className="line-clamp-3 text-left text-xs hover:text-signal" title="Preview as participant">
                      {e.clueText}
                    </button>
                  </TableCell>
                  <TableCell className={cn("text-xs", destMismatch && "text-danger")}>{e.isFinish ? "FINISH" : e.destination ? `${e.destination.code} ${e.destination.label}` : "—"}</TableCell>
                  <TableCell className="text-xs">{e.nextPlacement ? `${e.nextPlacement.code} ${e.nextPlacement.label}` : e.isFinish ? "—" : "?"}</TableCell>
                  <TableCell>
                    {e.verdict === "OK" && !destMismatch && <CheckCircle2 className="size-4 text-ok" aria-label="Looks consistent" />}
                    {(e.verdict === "DESCRIBES_CURRENT" || e.verdict === "MISMATCH" || destMismatch) && (
                      <Link href={`/admin/clues?qr=${e.qrRef}`} className="inline-flex items-center gap-1 text-xs text-warn hover:underline">
                        <AlertTriangle className="size-4" /> review
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ReasonDialog
        open={editRoute}
        onOpenChange={setEditRoute}
        title={`Edit route — ${seq.teamName}`}
        description={
          seq.currentPosition > 0
            ? `Warning: this team has completed ${seq.currentPosition} checkpoint(s). Positions 1–${seq.currentPosition} must stay unchanged.`
            : "One QR copy id per line, in order. The last one should be the finish checkpoint."
        }
        confirmLabel="Save route"
        destructive={seq.currentPosition > 0}
        onConfirm={async (reason) => {
          await api(`/api/admin/sequences/${seq.teamId}`, {
            method: "PATCH",
            body: { copyIds: routeText.split(/\s+/).map((x) => x.trim()).filter(Boolean), reason },
          });
          toast.success("Route saved");
          await refresh();
        }}
      >
        <Textarea rows={12} value={routeText} onChange={(e) => setRouteText(e.target.value)} className="font-mono text-xs" aria-label="Route copy ids" />
      </ReasonDialog>

      <ReasonDialog
        open={editStart}
        onOpenChange={setEditStart}
        title={`Starting clue — ${seq.teamName}`}
        confirmLabel="Save starting clue"
        onConfirm={async (reason) => {
          await api(`/api/admin/sequences/${seq.teamId}`, { method: "PATCH", body: { startingClue: startDraft, reason } });
          toast.success("Starting clue saved");
          await refresh();
        }}
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="sc-riddle">Riddle (participant-visible)</Label>
            <Textarea id="sc-riddle" rows={5} value={startDraft.riddle} onChange={(e) => setStartDraft({ ...startDraft, riddle: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sc-loc">Location (organizer only)</Label>
              <Input id="sc-loc" value={startDraft.location} onChange={(e) => setStartDraft({ ...startDraft, location: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sc-ans">Answer (organizer only)</Label>
              <Input id="sc-ans" value={startDraft.answer} onChange={(e) => setStartDraft({ ...startDraft, answer: e.target.value })} />
            </div>
          </div>
        </div>
      </ReasonDialog>

      <Dialog open={Boolean(sim)} onOpenChange={(o) => !o && setSim(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Dry run — {sim?.teamName} {sim?.ok ? <span className="text-ok">all steps OK</span> : <span className="text-warn">needs review</span>}
            </DialogTitle>
          </DialogHeader>
          <ol className="space-y-2">
            {sim?.steps.map((s) => (
              <li key={s.step} className={cn("rounded-lg border p-3 text-sm", s.ok ? "border-ok/30" : "border-warn/40 bg-warn/5")}>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="hud-number text-foreground">{s.step === 0 ? "START" : `#${s.step}`}</span>
                  <span className="font-mono">{s.scan}</span>
                  {s.at && <span>at {s.at}</span>}
                  {s.action && s.action !== "NORMAL" && <span className="text-warn">{s.action}</span>}
                  <span>→ leads to {s.leadsTo ?? "?"}</span>
                </div>
                <p className="clue-text mt-1 line-clamp-4">{s.shows}</p>
                {s.notes.length > 0 && <p className="mt-1 text-xs text-warn">{s.notes.join(" ")}</p>}
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(preview)} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Participant preview</DialogTitle>
          </DialogHeader>
          {preview && (
            <MissionCard
              eyebrow={`Clue from checkpoint ${preview.position} of ${seq.entries.length}`}
              title={preview.isFinish ? "You cracked it" : `Next: checkpoint ${preview.position + 1}`}
              text={preview.clueText}
              action={preview.actionType}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
