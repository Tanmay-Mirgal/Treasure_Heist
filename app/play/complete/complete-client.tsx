"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Flag, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, StatTile, formatTime } from "@/components/heist/bits";
import { useTeamState } from "@/components/heist/team-state";
import { formatDuration } from "@/hooks/use-poll";
import { api } from "@/lib/client/api";

type Board = { frozen: boolean; rows: { rank: number; isYou: boolean }[] };

export function CompleteClient() {
  const { state } = useTeamState();
  const [rank, setRank] = useState<number | null>(null);
  const [frozen, setFrozen] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    api<Board>("/api/leaderboard", { signal: ctrl.signal })
      .then((b) => {
        setRank(b.rows.find((r) => r.isYou)?.rank ?? null);
        setFrozen(b.frozen);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [state?.team.score]);

  if (!state) return <Skeleton className="h-80 w-full rounded-2xl" />;
  const { team, progress } = state;

  if (!progress.finished)
    return (
      <EmptyState title="The vault is still locked" icon={<Flag className="size-6" />}>
        You have secured {progress.completed} of {progress.total} checkpoints. Keep going!
        <div className="mt-4">
          <Button asChild>
            <Link href="/play/mission">Back to mission</Link>
          </Button>
        </div>
      </EmptyState>
    );

  const elapsed =
    team.finishedAt && team.gameStartedAt ? new Date(team.finishedAt).getTime() - new Date(team.gameStartedAt).getTime() : null;

  return (
    <div className="space-y-5 text-center">
      <div className="relative overflow-hidden rounded-3xl border border-gold/40 bg-card px-6 py-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(400px_200px_at_50%_0%,oklch(0.86_0.17_92/0.18),transparent)]" />
        <Trophy className="mx-auto size-14 text-gold motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-500" aria-hidden />
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.35em] text-gold">Vault opened</p>
        <h1 className="mt-2 font-heading text-3xl font-bold">You escaped, {team.name}!</h1>
        <p className="mt-2 text-sm text-muted-foreground">Report your finish to the Event Desk.</p>
        <div className="mt-6 hud-number text-6xl font-bold text-gold">{team.score}</div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">final points</div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-left">
        <StatTile label="Rank" value={rank ? `#${rank}` : "—"} tone="signal" hint={frozen ? "final" : "live"} />
        <StatTile label="Finished" value={formatTime(team.finishedAt)} tone="ok" className="[&_.hud-number]:text-base" />
        <StatTile label="Route time" value={formatDuration(elapsed)} tone="gold" className="[&_.hud-number]:text-base" />
      </div>
      <Button asChild size="lg" className="h-12 w-full">
        <Link href="/leaderboard">
          <Trophy className="size-5" /> View leaderboard
        </Link>
      </Button>
    </div>
  );
}
