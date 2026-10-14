"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, FileText, RotateCcw, Save, Search, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ActionBadge, MissionCard, PageTitle } from "@/components/heist/bits";
import { ReasonDialog, SeverityBadge, StatusPill } from "@/components/heist/admin-kit";
import { api } from "@/lib/client/api";
import { usePoll } from "@/hooks/use-poll";
import { ACTION_TYPES, CHECKPOINT_MODES, QR_STATUSES, type ActionType } from "@/lib/game/types";
import { cn } from "@/lib/utils";

type Loc = { code: string; label: string };
type Checkpoint = {
  id: string;
  copyId: string;
  qrId: string;
  teamNumber: number | null;
  actionType: ActionType;
  mode: "LOCATION" | "ANSWER";
  status: "ACTIVE" | "INACTIVE" | "DAMAGED";
  clueText: string;
  challengePrompt: string;
  answer: string;
  hintText: string;
  rewardOverride: number | null;
  placement: Loc;
  destination: Loc;
  organizerNotes: string;
  annotations: string[];
  editedFields: string[];
  source: { sheet: string; row: number; clueText: string; placementRaw: string; destinationRaw: string; nextQrRaw: string } | null;
  references: { teamNumber: number; position: number }[];
};
type Issue = { severity: "ERROR" | "WARNING" | "INFO"; code: string; message: string; copyId?: string | null; suggestions?: string[] };
type Editable = Pick<Checkpoint, "clueText" | "challengePrompt" | "answer" | "hintText" | "rewardOverride" | "actionType" | "mode" | "status" | "placement" | "destination" | "organizerNotes">;

const editableOf = (c: Checkpoint): Editable => ({
  clueText: c.clueText,
  challengePrompt: c.challengePrompt,
  answer: c.answer,
  hintText: c.hintText,
  rewardOverride: c.rewardOverride,
  actionType: c.actionType,
  mode: c.mode,
  status: c.status,
  placement: c.placement,
  destination: c.destination,
  organizerNotes: c.organizerNotes,
});

export function CluesClient() {
  const router = useRouter();
  const selectedId = useSearchParams().get("qr");
  const [q, setQ] = useState("");
  const [team, setTeam] = useState<string>("all");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [draftState, setDraftState] = useState<{ id: string; v: Editable } | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, refresh } = usePoll(async (signal) => {
    const [c, v] = await Promise.all([
      api<{ checkpoints: Checkpoint[] }>("/api/admin/clues", { signal, redirectOn401: "admin" }),
      api<{ issues: Issue[] }>("/api/admin/validation", { signal }),
    ]);
    return { checkpoints: c.checkpoints, issues: v.issues };
  }, 120_000);
  const checkpoints = data?.checkpoints ?? null;
  const issues = useMemo(() => data?.issues ?? [], [data]);

  const issuesBy = useMemo(() => {
    const m = new Map<string, Issue[]>();
    for (const i of issues) if (i.copyId && i.severity !== "INFO") m.set(i.copyId, [...(m.get(i.copyId) ?? []), i]);
    return m;
  }, [issues]);

  const current = checkpoints?.find((c) => c.id === selectedId) ?? null;
  // The draft belongs to one checkpoint; switching checkpoints starts from its saved values.
  const draft: Editable | null = current ? (draftState?.id === current.id ? draftState.v : editableOf(current)) : null;
  const setDraft = (v: Editable) => current && setDraftState({ id: current.id, v });

  if (!checkpoints) return <Skeleton className="h-96 w-full" />;
  const list = checkpoints
    .filter((c) => team === "all" || String(c.teamNumber) === team)
    .filter((c) => !flaggedOnly || issuesBy.has(c.copyId))
    .filter((c) => !q || `${c.copyId} ${c.clueText} ${c.placement.label}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.teamNumber ?? 99) - (b.teamNumber ?? 99) || (a.references[0]?.position ?? 99) - (b.references[0]?.position ?? 99));
  const teams = [...new Set(checkpoints.map((c) => c.teamNumber).filter((n): n is number => n !== null))].sort((a, b) => a - b);
  const changed = current && draft ? (Object.keys(draft) as (keyof Editable)[]).filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(editableOf(current)[k])) : [];
  const cpIssues = current ? issuesBy.get(current.copyId) ?? [] : [];
  const ref = current?.references[0];

  return (
    <div className="space-y-5">
      <PageTitle title="Clue manager" subtitle="Participant-visible clue text is kept separate from organizer-only answers, notes and placements. Edits are audited and survive re-imports." />
      <div className="grid gap-5 lg:grid-cols-[minmax(280px,360px)_1fr]">
        <aside className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input placeholder="Search copy id, text, place" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" aria-label="Search clues" />
          </div>
          <div className="flex items-center gap-3">
            <Select value={team} onValueChange={setTeam}>
              <SelectTrigger className="w-32" aria-label="Team filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All teams</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t} value={String(t)}>
                    Team {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Switch id="flagged" checked={flaggedOnly} onCheckedChange={setFlaggedOnly} />
              <Label htmlFor="flagged" className="text-xs">
                Flagged only
              </Label>
            </div>
          </div>
          <ul className="max-h-[70dvh] space-y-1 overflow-y-auto pr-1">
            {list.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => router.replace(`/admin/clues?qr=${c.id}`, { scroll: false })}
                  className={cn("w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-accent", c.id === selectedId && "border-signal bg-signal/10")}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{c.copyId}</span>
                    {c.references[0] && <span className="text-[10px] text-muted-foreground">#{c.references[0].position}</span>}
                    {c.actionType !== "NORMAL" && <ActionBadge action={c.actionType} className="scale-90" />}
                    {issuesBy.has(c.copyId) && <AlertTriangle className="ml-auto size-3.5 text-warn" aria-label="Has validation issues" />}
                    {c.editedFields.length > 0 && <span className="text-[10px] text-signal">edited</span>}
                  </div>
                  <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{c.clueText}</div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {!current || !draft ? (
          <div className="grid place-items-center rounded-xl border border-dashed p-10 text-sm text-muted-foreground">
            <FileText className="mb-2 size-6" /> Select a checkpoint to edit its clue.
          </div>
        ) : (
          <section className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-heading text-xl font-semibold">{current.copyId}</h2>
                <p className="text-xs text-muted-foreground">
                  {ref ? `Team ${ref.teamNumber}, position ${ref.position}` : "Not in any route"} · source {current.source ? `${current.source.sheet} row ${current.source.row}` : "created in app"}
                  {current.annotations.length > 0 && ` · note: ${current.annotations.join(", ")}`}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" disabled={!changed.length} onClick={() => setDraftState(null)}>
                  Discard
                </Button>
                <Button disabled={!changed.length} onClick={() => setSaving(true)}>
                  <Save className="size-4" /> Save ({changed.length})
                </Button>
              </div>
            </div>

            {cpIssues.length > 0 && (
              <div className="space-y-2 rounded-xl border border-warn/30 bg-warn/5 p-3">
                {cpIssues.map((i, n) => (
                  <div key={n} className="text-sm">
                    <div className="flex gap-2">
                      <SeverityBadge severity={i.severity} /> <span>{i.message}</span>
                    </div>
                    {i.suggestions && i.suggestions.length > 0 && (
                      <div className="mt-2 space-y-1.5 pl-2">
                        <div className="text-xs font-medium text-muted-foreground">Riddles from the workbook that describe the right place:</div>
                        {i.suggestions.map((s, k) => (
                          <div key={k} className="flex items-start gap-2 rounded-lg bg-background/60 p-2">
                            <p className="clue-text flex-1 text-xs">{s}</p>
                            <Button size="sm" variant="outline" onClick={() => setDraft({ ...draft, clueText: s })}>
                              <Wand2 className="size-3.5" /> Use
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="grid gap-5 xl:grid-cols-2">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="clue">Clue text (shown after this QR is accepted)</Label>
                  <Textarea id="clue" rows={7} value={draft.clueText} onChange={(e) => setDraft({ ...draft, clueText: e.target.value })} />
                  {current.source && current.source.clueText !== draft.clueText && (
                    <Button size="sm" variant="ghost" className="-ml-2" onClick={() => setDraft({ ...draft, clueText: current.source!.clueText })}>
                      <RotateCcw className="size-3.5" /> Restore workbook text
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Special action</Label>
                    <Select value={draft.actionType} onValueChange={(v) => setDraft({ ...draft, actionType: v as ActionType })}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACTION_TYPES.map((a) => (
                          <SelectItem key={a} value={a}>
                            {a.replace("_", " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reward">Reward override</Label>
                    <Input
                      id="reward"
                      type="number"
                      min={0}
                      max={20}
                      placeholder="rule default"
                      value={draft.rewardOverride ?? ""}
                      onChange={(e) => setDraft({ ...draft, rewardOverride: e.target.value === "" ? null : Math.max(0, Math.trunc(Number(e.target.value))) })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Checkpoint mode</Label>
                    <Select value={draft.mode} onValueChange={(v) => setDraft({ ...draft, mode: v as Editable["mode"] })}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CHECKPOINT_MODES.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m === "LOCATION" ? "Location clue (scan next QR)" : "Answer-gated"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>QR status</Label>
                    <Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v as Editable["status"] })}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {QR_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {draft.mode === "ANSWER" && (
                  <div className="space-y-3 rounded-xl border border-signal/30 p-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="prompt">Challenge question (participant-visible)</Label>
                      <Textarea id="prompt" rows={3} value={draft.challengePrompt} onChange={(e) => setDraft({ ...draft, challengePrompt: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="answer">Accepted answer(s) — organizer only, separate alternatives with |</Label>
                      <Input id="answer" value={draft.answer} onChange={(e) => setDraft({ ...draft, answer: e.target.value })} />
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="hint">Hint for this clue (optional, shown when a team spends a hint)</Label>
                  <Textarea id="hint" rows={2} value={draft.hintText} onChange={(e) => setDraft({ ...draft, hintText: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {(["placement", "destination"] as const).map((k) => (
                    <div key={k} className="space-y-1.5">
                      <Label>{k === "placement" ? "Physical placement" : "Destination (organizer)"}</Label>
                      <div className="flex gap-1.5">
                        <Input aria-label={`${k} code`} className="w-20" value={draft[k].code} onChange={(e) => setDraft({ ...draft, [k]: { ...draft[k], code: e.target.value } })} />
                        <Input aria-label={`${k} label`} value={draft[k].label} onChange={(e) => setDraft({ ...draft, [k]: { ...draft[k], label: e.target.value } })} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notes">Organizer notes (private)</Label>
                  <Textarea id="notes" rows={2} value={draft.organizerNotes} onChange={(e) => setDraft({ ...draft, organizerNotes: e.target.value })} />
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Participant preview</div>
                <div className="mx-auto max-w-sm rounded-[2rem] border-4 border-secondary bg-background p-3">
                  {draft.mode === "ANSWER" ? (
                    <MissionCard eyebrow="Checkpoint challenge" title={`Challenge — checkpoint ${ref?.position ?? "?"}`} text={draft.challengePrompt || "(no question yet)"} />
                  ) : (
                    <MissionCard
                      eyebrow={`Clue from checkpoint ${ref?.position ?? "?"}`}
                      title={draft.actionType === "FINISH" ? "You cracked it" : `Next: checkpoint ${(ref?.position ?? 0) + 1}`}
                      text={draft.clueText || "(empty)"}
                      action={draft.actionType}
                      tone={draft.actionType === "FINISH" ? "gold" : "signal"}
                    />
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  QR status <StatusPill status={draft.status} />
                </div>
                {current.source && (
                  <div className="rounded-xl border bg-card/50 p-3 text-xs">
                    <div className="font-semibold text-muted-foreground">Workbook source (verbatim)</div>
                    <p className="clue-text mt-1">{current.source.clueText}</p>
                    <p className="mt-2 text-muted-foreground">
                      Placement: {current.source.placementRaw} · Destination: {current.source.destinationRaw} · Next QR: {current.source.nextQrRaw}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </div>

      <ReasonDialog
        open={saving}
        onOpenChange={setSaving}
        title={`Save ${current?.copyId}`}
        description={`Changing: ${changed.join(", ")}`}
        onConfirm={async (reason) => {
          const body: Record<string, unknown> = { reason };
          for (const k of changed) body[k] = draft![k];
          await api(`/api/admin/clues/${current!.id}`, { method: "PATCH", body });
          toast.success("Checkpoint saved");
          await refresh();
        }}
      />
    </div>
  );
}
