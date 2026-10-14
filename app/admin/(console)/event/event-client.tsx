"use client";

import { useState } from "react";
import { FlaskConical, Lock, Pause, Play, RotateCcw, Square, Unlock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageTitle, StatTile, TrackDivider, formatDateTime } from "@/components/heist/bits";
import { ReasonDialog, StatusPill } from "@/components/heist/admin-kit";
import type { AdminSettings } from "@/components/heist/admin-settings";
import { api } from "@/lib/client/api";
import { formatDuration, usePoll, useServerCountdown } from "@/hooks/use-poll";

type Action = { id: string; label: string; icon: typeof Play; description: string; destructive?: boolean; confirmText?: boolean };

const ACTIONS: Record<string, Action> = {
  start: {
    id: "start",
    label: "Start event",
    icon: Play,
    description: "Starts the official heist. All rehearsal/test data is cleared and every team is reset to 0 first. Teams can scan immediately.",
  },
  pause: { id: "pause", label: "Pause", icon: Pause, description: "No scans, scoring or power-ups are accepted while paused. The timer stops." },
  resume: { id: "resume", label: "Resume", icon: Play, description: "Teams can scan again. Paused time is not counted." },
  end: { id: "end", label: "End event", icon: Square, description: "Stops all progression and scoring permanently.", destructive: true },
  freeze: { id: "freeze", label: "Freeze leaderboard", icon: Lock, description: "Takes a snapshot of the current ranking and shows it as the final result." },
  unfreeze: { id: "unfreeze", label: "Unfreeze leaderboard", icon: Unlock, description: "Returns the leaderboard to live scores." },
  "test-mode-on": {
    id: "test-mode-on",
    label: "Enable test mode",
    icon: FlaskConical,
    description: "Lets teams play before the start for rehearsal. Everything is tagged as test data and wiped when test mode is turned off or the event starts.",
  },
  "test-mode-off": { id: "test-mode-off", label: "Disable test mode", icon: FlaskConical, description: "Turns off rehearsal and clears all test data (teams reset to 0)." },
  "reset-scores": {
    id: "reset-scores",
    label: "Reset all team points",
    icon: RotateCcw,
    description: "Sets all team scores to 0 on the live leaderboard and adds an audited ledger adjustment.",
    destructive: true,
  },
  reset: {
    id: "reset",
    label: "Reset event to setup",
    icon: RotateCcw,
    description: "Deletes ALL game data (progress, scores, scans, notifications) and returns the event to SETUP. Routes, QR codes and accounts are kept.",
    destructive: true,
    confirmText: true,
  },
};

export function EventClient() {
  const { data, refresh, setData, lastOkAt } = usePoll<AdminSettings>(
    (signal) => api<AdminSettings>("/api/admin/settings", { signal, redirectOn401: "admin" }),
    5_000,
  );
  const [pending, setPending] = useState<Action | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [timerDraft, setTimerDraft] = useState<{ enabled: boolean; durationMinutes: number } | null>(null);
  const [toggle, setToggle] = useState<{ key: string; label: string; value: boolean } | null>(null);
  const remaining = useServerCountdown(
    data?.timerState.remainingMs ?? null,
    lastOkAt,
    Boolean(data?.timerState.running && data?.timer.enabled),
  );

  if (!data) return <Skeleton className="h-96 w-full" />;
  const s = data;
  const available: string[] = [];
  if (s.status === "SETUP") available.push(s.testMode ? "test-mode-off" : "test-mode-on", "start");
  if (s.status === "RUNNING") available.push("pause", "end");
  if (s.status === "PAUSED") available.push("resume", "end");
  available.push(s.leaderboardFrozen ? "unfreeze" : "freeze");
  available.push("reset-scores");
  if (s.status === "SETUP" || s.status === "ENDED") available.push("reset");

  const timer = timerDraft ?? s.timer;

  async function patch(body: Record<string, unknown>) {
    const next = await api<AdminSettings>("/api/admin/settings", { method: "PATCH", body });
    setData(next);
  }

  const toggles: { key: string; label: string; help: string; value: boolean; body: (v: boolean) => Record<string, unknown> }[] = [
    { key: "participationEnabled", label: "Team participation", help: "When off, teams can log in but cannot scan, answer or use power-ups.", value: s.participationEnabled, body: (v) => ({ participationEnabled: v }) },
    { key: "scoringEnabled", label: "Scoring", help: "When off, checkpoints still advance but award 0 points; MAGNET is blocked.", value: s.scoringEnabled, body: (v) => ({ scoringEnabled: v }) },
    { key: "magnet", label: "MAGNET power-up", help: "When off, earned MAGNETs stay in inventory but cannot be used.", value: s.rules.magnet.enabled, body: (v) => ({ rules: { magnet: { enabled: v } } }) },
    { key: "logInvalidScans", label: "Log invalid scans", help: "Record rejected scans in the scan monitor.", value: s.logInvalidScans, body: (v) => ({ logInvalidScans: v }) },
    { key: "logDuplicateScans", label: "Log duplicate scans", help: "Record repeat scans of completed checkpoints.", value: s.logDuplicateScans, body: (v) => ({ logDuplicateScans: v }) },
  ];

  return (
    <div className="space-y-6">
      <PageTitle title="Event controls" subtitle={<span className="flex items-center gap-2">Current state <StatusPill status={s.status} />{s.testMode && <StatusPill status="TEST MODE" />}{s.leaderboardFrozen && <StatusPill status="FROZEN" />}</span>} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Started" value={formatDateTime(s.startedAt)} className="[&_.hud-number]:text-base" />
        <StatTile label="Ended" value={formatDateTime(s.endedAt)} className="[&_.hud-number]:text-base" />
        <StatTile label="Elapsed (excl. pauses)" value={formatDuration(s.timerState.elapsedMs)} tone="signal" />
        <StatTile label="Remaining" value={s.timer.enabled ? formatDuration(remaining) : "no timer"} tone={s.timerState.expired ? "danger" : "gold"} />
      </div>

      {s.status === "SETUP" && !s.testMode && (
        <Alert>
          <AlertDescription>
            Before the event: enable test mode to rehearse with real QR codes. Starting the event wipes all rehearsal data so nothing that happens before the start counts.
          </AlertDescription>
        </Alert>
      )}

      <section className="flex flex-wrap gap-2">
        {available.map((id) => {
          const a = ACTIONS[id]!;
          return (
            <Button
              key={id}
              variant={a.destructive ? "destructive" : id === "start" ? "default" : "outline"}
              size="lg"
              onClick={() => {
                setConfirmText("");
                setPending(a);
              }}
            >
              <a.icon className="size-4" /> {a.label}
            </Button>
          );
        })}
      </section>

      <TrackDivider />

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl border p-4">
          <h2 className="font-heading text-lg font-semibold">Event timer</h2>
          <p className="text-sm text-muted-foreground">Computed from server timestamps — page refreshes never reset it. When it reaches zero, scans are refused.</p>
          <div className="flex items-center gap-3">
            <Switch id="timer-enabled" checked={timer.enabled} onCheckedChange={(v) => setTimerDraft({ ...timer, enabled: v })} />
            <Label htmlFor="timer-enabled">Timer enabled</Label>
          </div>
          <div className="flex items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="timer-min">Duration (minutes)</Label>
              <Input
                id="timer-min"
                type="number"
                min={1}
                max={1440}
                value={timer.durationMinutes}
                onChange={(e) => setTimerDraft({ ...timer, durationMinutes: Number(e.target.value) })}
                className="w-32"
              />
            </div>
            <Button
              disabled={!timerDraft}
              onClick={() => setToggle({ key: "timer", label: `Timer ${timer.enabled ? "on" : "off"}, ${timer.durationMinutes} minutes`, value: timer.enabled })}
            >
              Save timer
            </Button>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border p-4">
          <h2 className="font-heading text-lg font-semibold">Switches</h2>
          {toggles.map((t) => (
            <div key={t.key} className="flex items-start justify-between gap-4 rounded-lg bg-secondary/40 p-3">
              <div>
                <Label htmlFor={`t-${t.key}`}>{t.label}</Label>
                <p className="text-xs text-muted-foreground">{t.help}</p>
              </div>
              <Switch id={`t-${t.key}`} checked={t.value} onCheckedChange={(v) => setToggle({ key: t.key, label: `${t.label}: ${v ? "ON" : "OFF"}`, value: v })} />
            </div>
          ))}
        </div>
      </section>

      <ReasonDialog
        open={Boolean(pending)}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending?.label ?? ""}
        description={pending?.description}
        destructive={pending?.destructive}
        confirmLabel={pending?.label}
        extraValid={!pending?.confirmText || confirmText === "RESET"}
        onConfirm={async (reason) => {
          const next = await api<AdminSettings>(`/api/admin/event/${pending!.id}`, {
            method: "POST",
            body: { reason, confirm: pending?.confirmText ? confirmText : undefined },
          });
          setData(next);
          toast.success(`${pending!.label}: done`);
        }}
      >
        {pending?.confirmText && (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-reset">Type RESET to confirm</Label>
            <Input id="confirm-reset" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </div>
        )}
      </ReasonDialog>

      <ReasonDialog
        open={Boolean(toggle)}
        onOpenChange={(o) => !o && setToggle(null)}
        title="Change setting"
        description={toggle?.label}
        onConfirm={async (reason) => {
          if (toggle!.key === "timer") {
            await patch({ timer, reason });
            setTimerDraft(null);
          } else {
            const t = toggles.find((x) => x.key === toggle!.key)!;
            await patch({ ...t.body(toggle!.value), reason });
          }
          await refresh();
          toast.success("Setting saved");
        }}
      />
    </div>
  );
}
