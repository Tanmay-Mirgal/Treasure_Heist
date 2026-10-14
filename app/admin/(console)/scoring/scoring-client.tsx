"use client";

import { useEffect, useState } from "react";
import { Save, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageTitle } from "@/components/heist/bits";
import { ReasonDialog } from "@/components/heist/admin-kit";
import type { AdminSettings } from "@/components/heist/admin-settings";
import { api } from "@/lib/client/api";

type Rules = AdminSettings["rules"];
type Draft = { rules: Rules; rankingRule: AdminSettings["rankingRule"] };

const POINT_FIELDS: { key: keyof Rules["points"]; label: string; help: string }[] = [
  { key: "normal", label: "Normal checkpoint", help: "Awarded once per accepted checkpoint." },
  { key: "bonus", label: "BONUS checkpoint", help: "Total reward (not added to the normal point)." },
  { key: "superShoes", label: "SUPER SHOES checkpoint", help: "Total reward for the checkpoint." },
  { key: "magnetCheckpoint", label: "MAGNET checkpoint (arrival)", help: "Points for reaching the MAGNET checkpoint itself. Default 0: the transfer is the reward." },
  { key: "magnetTransfer", label: "MAGNET transfer (max)", help: "Up to this many existing points move from the target to the activator." },
  { key: "finish", label: "Finish checkpoint", help: "Points for the final vault checkpoint." },
];

export function ScoringClient() {
  const [server, setServer] = useState<AdminSettings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<AdminSettings>("/api/admin/settings", { redirectOn401: "admin" }).then((s) => {
      setServer(s);
      setDraft({ rules: s.rules, rankingRule: s.rankingRule });
    });
  }, []);

  if (!server || !draft) return <Skeleton className="h-96 w-full" />;
  const r = draft.rules;
  const dirty = JSON.stringify(draft) !== JSON.stringify({ rules: server.rules, rankingRule: server.rankingRule });
  const set = <K extends keyof Rules>(k: K, v: Partial<Rules[K]>) => setDraft({ ...draft, rules: { ...r, [k]: { ...r[k], ...v } } });

  return (
    <div className="space-y-6">
      <PageTitle
        title="Scoring configuration"
        subtitle="Authoritative rules applied by the server. Changes apply to future awards only; existing ledger entries are never rewritten."
        actions={
          <>
            <Button variant="outline" disabled={!dirty} onClick={() => setDraft({ rules: server.rules, rankingRule: server.rankingRule })}>
              <Undo2 className="size-4" /> Discard
            </Button>
            <Button disabled={!dirty} onClick={() => setSaving(true)}>
              <Save className="size-4" /> Save changes
            </Button>
          </>
        }
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {POINT_FIELDS.map((f) => (
          <div key={f.key} className="rounded-xl border bg-card/60 p-4">
            <Label htmlFor={`p-${f.key}`}>{f.label}</Label>
            <div className="mt-2 flex items-center gap-2">
              <Input
                id={`p-${f.key}`}
                type="number"
                min={0}
                max={20}
                value={r.points[f.key]}
                onChange={(e) => set("points", { [f.key]: Math.max(0, Math.min(20, Math.trunc(Number(e.target.value) || 0))) })}
                className="w-24"
              />
              <span className="text-xs text-muted-foreground">default {server.defaults.points[f.key]}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{f.help}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 rounded-xl border p-4">
          <h2 className="font-heading text-lg font-semibold">SUPER SHOES</h2>
          <div className="space-y-1.5">
            <Label>Behaviour</Label>
            <Select value={r.superShoes.mode} onValueChange={(v) => set("superShoes", { mode: v as Rules["superShoes"]["mode"] })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="HINT">Points + extra hint (inventory item)</SelectItem>
                <SelectItem value="SCORE_ONLY">Scoring marker only (no hint)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ss-hints">Hints granted</Label>
            <Input id="ss-hints" type="number" min={0} max={5} value={r.superShoes.hintsGranted} onChange={(e) => set("superShoes", { hintsGranted: Math.max(0, Math.min(5, Math.trunc(Number(e.target.value) || 0))) })} className="w-24" disabled={r.superShoes.mode !== "HINT"} />
          </div>
        </div>

        <div className="space-y-3 rounded-xl border p-4">
          <h2 className="font-heading text-lg font-semibold">MAGNET</h2>
          <div className="flex items-start justify-between gap-3">
            <div>
              <Label htmlFor="m-consume">Consume when target has 0 points</Label>
              <p className="text-xs text-muted-foreground">Off: the team must pick a target with points.</p>
            </div>
            <Switch id="m-consume" checked={r.magnet.consumeWhenTargetEmpty} onCheckedChange={(v) => set("magnet", { consumeWhenTargetEmpty: v })} />
          </div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <Label htmlFor="m-reveal">Reveal attacker to target</Label>
              <p className="text-xs text-muted-foreground">Off (default): the target only learns that “another team” used it.</p>
            </div>
            <Switch id="m-reveal" checked={r.magnet.revealAttacker} onCheckedChange={(v) => set("magnet", { revealAttacker: v })} />
          </div>
        </div>

        <div className="space-y-3 rounded-xl border p-4">
          <h2 className="font-heading text-lg font-semibold">Hints & ranking</h2>
          <div className="space-y-1.5">
            <Label htmlFor="h-initial">Initial hints per team</Label>
            <Input id="h-initial" type="number" min={0} max={10} value={r.hints.initialPerTeam} onChange={(e) => set("hints", { initialPerTeam: Math.max(0, Math.min(10, Math.trunc(Number(e.target.value) || 0))) })} className="w-24" />
            <p className="text-xs text-muted-foreground">Applied to new teams and on progress resets.</p>
          </div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <Label htmlFor="h-fallback">Hint falls back to next location</Label>
              <p className="text-xs text-muted-foreground">If a clue has no written hint, reveal where the next QR is placed.</p>
            </div>
            <Switch id="h-fallback" checked={r.hints.fallbackToDestination} onCheckedChange={(v) => set("hints", { fallbackToDestination: v })} />
          </div>
          <div className="space-y-1.5">
            <Label>Tie-break rule</Label>
            <Select value={draft.rankingRule} onValueChange={(v) => setDraft({ ...draft, rankingRule: v as Draft["rankingRule"] })}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="POINTS_THEN_EARLIEST">Points, then earliest to reach the score</SelectItem>
                <SelectItem value="POINTS_THEN_PROGRESS_THEN_EARLIEST">Points, then checkpoints, then earliest</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <ReasonDialog
        open={saving}
        onOpenChange={setSaving}
        title="Save scoring changes?"
        description="New values apply to awards made from now on."
        onConfirm={async (reason) => {
          const next = await api<AdminSettings>("/api/admin/settings", { method: "PATCH", body: { rules: draft.rules, rankingRule: draft.rankingRule, reason } });
          setServer(next);
          setDraft({ rules: next.rules, rankingRule: next.rankingRule });
          toast.success("Scoring rules saved");
        }}
      />
    </div>
  );
}
