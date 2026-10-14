"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell, CheckCheck, Coins, Flag, Lightbulb, Magnet, Map, ScanLine, Timer, Trophy, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ActionBadge, StatTile, TrackDivider } from "@/components/heist/bits";
import { StationLine } from "@/components/heist/station-line";
import { HelpDialog, LogoutButton } from "@/components/heist/team-actions";
import { useTeamState } from "@/components/heist/team-state";
import { formatDuration, useServerCountdown } from "@/hooks/use-poll";
import { api } from "@/lib/client/api";

export function TeamDashboard() {
  const { state, loading, error, refresh, lastOkAt } = useTeamState();
  const t = state?.event.timer;
  const remaining = useServerCountdown(t?.remainingMs ?? null, lastOkAt, Boolean(t?.running && t.enabled));
  const [marking, setMarking] = useState(false);

  if (loading && !state) return <DashboardSkeleton />;
  if (!state) return <Alert variant="destructive"><AlertDescription>{error?.message ?? "Could not load your mission."}</AlertDescription></Alert>;

  const { team, progress, mission, inventory, notifications, event } = state;
  const magnets = inventory.powerUps.filter((p) => p.type === "MAGNET" && p.status === "AVAILABLE");
  const unread = notifications.items.filter((n) => !n.read);

  async function markAllRead() {
    setMarking(true);
    try {
      await api("/api/team/notifications", { method: "POST", body: { ids: "all" } });
      await refresh();
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">
          {team.username} · Team #{team.number}
        </p>
        <h1 className="font-heading text-2xl font-semibold">{team.name}</h1>
      </div>

      {unread.length > 0 && (
        <Alert className="border-warn/40 bg-warn/10">
          <Bell className="text-warn" />
          <AlertTitle className="text-warn">
            {unread.length} new alert{unread.length > 1 ? "s" : ""}
          </AlertTitle>
          <AlertDescription>
            <ul className="mt-1 space-y-1.5">
              {unread.slice(0, 3).map((n) => (
                <li key={n.id} className="text-foreground/90">
                  {n.message}
                </li>
              ))}
            </ul>
            <Button size="sm" variant="ghost" className="mt-2 -ml-2 text-warn" onClick={markAllRead} disabled={marking}>
              <CheckCheck className="size-4" /> Mark as read
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <section className="rounded-2xl border border-signal/25 bg-card p-5" aria-labelledby="mission-status">
        <div className="flex items-center justify-between gap-2">
          <h2 id="mission-status" className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {progress.finished ? "Mission complete" : `Mission ${progress.currentMission} of ${progress.total}`}
          </h2>
          {mission.lastAction && mission.lastAction !== "NORMAL" && !progress.finished && <ActionBadge action={mission.lastAction} />}
        </div>
        <p className="mt-2 font-heading text-xl font-semibold">
          {progress.finished
            ? "Vault opened. Well played, crew."
            : mission.kind === "ANSWER"
              ? "Challenge waiting — submit your answer."
              : mission.kind === "START"
                ? "Solve your starting riddle and find checkpoint 1."
                : mission.kind === "UNCONFIGURED"
                  ? "Your route isn't configured yet."
                  : "Follow your latest clue to the next checkpoint."}
        </p>
        <div className="mt-4">
          <StationLine completed={progress.completed} total={progress.total} finished={progress.finished} />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          {progress.finished ? (
            <Button asChild size="lg" className="col-span-2 h-12 text-base font-semibold">
              <Link href="/play/complete">
                <Flag className="size-5" /> View finish
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild size="lg" className="h-12 text-base font-semibold">
                <Link href="/play/scan">
                  <ScanLine className="size-5" /> Scan QR
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 text-base">
                <Link href="/play/mission">
                  <Map className="size-5" /> {mission.kind === "ANSWER" ? "Answer" : "View clue"}
                </Link>
              </Button>
            </>
          )}
        </div>
      </section>

      {event.timer.enabled && (
        <div className="flex items-center justify-between rounded-xl border bg-card/70 px-4 py-3">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Timer className="size-4 text-signal" /> {event.status === "SETUP" ? "Mission clock" : "Time remaining"}
          </span>
          <span className={`hud-number text-xl font-semibold ${remaining !== null && remaining < 5 * 60_000 ? "text-danger" : "text-signal"}`}>
            {event.status === "SETUP" ? formatDuration(event.timer.durationMs) : formatDuration(remaining)}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Points" value={team.score} tone="gold" icon={<Coins className="size-3.5" />} />
        <StatTile label="Secured" value={`${progress.completed}/${progress.total}`} tone="ok" icon={<CheckCheck className="size-3.5" />} hint={`${progress.remaining} remaining`} />
        <StatTile label="Hints" value={inventory.hintsAvailable} tone="signal" icon={<Lightbulb className="size-3.5" />} hint={`${inventory.hintsUsed} used`} />
        <StatTile label="Power-ups" value={magnets.length} tone="warn" icon={<Magnet className="size-3.5" />} hint={magnets.length ? "MAGNET ready" : "none ready"} />
      </div>

      {magnets.length > 0 && (
        <Link
          href={`/play/magnet?id=${magnets[0]!.id}`}
          className="flex items-center gap-3 rounded-xl border border-warn/40 bg-warn/10 p-4 transition-colors hover:bg-warn/15"
        >
          <Magnet className="size-6 text-warn" aria-hidden />
          <div className="flex-1">
            <div className="font-semibold text-warn">MAGNET ready</div>
            <div className="text-xs text-foreground/80">Pull up to {state.rules.magnet.maxTransfer} points from a rival team.</div>
          </div>
          <span className="text-sm font-medium text-warn">Use →</span>
        </Link>
      )}

      <TrackDivider />

      <div className="grid grid-cols-2 gap-2">
        <Button asChild variant="secondary" className="h-11">
          <Link href="/play/score">
            <Wallet className="size-4" /> My Score
          </Link>
        </Button>
        <Button asChild variant="secondary" className="h-11">
          <Link href="/leaderboard">
            <Trophy className="size-4" /> Leaderboard
          </Link>
        </Button>
        <HelpDialog className="h-11" />
        <LogoutButton className="h-11" />
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading mission">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-56 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
