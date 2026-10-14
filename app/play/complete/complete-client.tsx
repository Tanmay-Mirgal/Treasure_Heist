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
      <div className="relative overflow-hidden rounded-3xl border-2 border-amber-400 bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950 px-6 py-12 shadow-[0_0_50px_rgba(245,158,11,0.45)] backdrop-blur-2xl">
        <div className="absolute inset-x-0 top-0 h-2 subway-hazard" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(245,158,11,0.35),transparent_70%)]" />
        
        <div className="relative mx-auto mb-3 flex size-24 items-center justify-center rounded-3xl border-2 border-amber-300 bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-300 text-slate-950 shadow-[0_0_35px_rgba(245,158,11,0.7)] animate-hoverboard">
          <Trophy className="size-14 stroke-[2.5] drop-shadow-md" aria-hidden />
        </div>

        <p className="mt-4 font-heading text-xs font-black uppercase tracking-[0.25em] sm:tracking-[0.35em] text-yellow-300">
          ★ NEW HIGH SCORE · RUN COMPLETE! ★
        </p>
        <h1 className="mt-2 font-heading text-2xl sm:text-3xl font-black text-white">Vault Breached, {team.name}!</h1>
        <p className="mt-1 text-xs sm:text-sm font-bold text-slate-300">Report to the Event Desk to register your official victory standing.</p>
        
        <div className="mt-6 flex flex-col items-center justify-center">
          <div className="hud-number font-heading text-5xl sm:text-6xl font-black text-amber-300 drop-shadow-[0_4px_20px_rgba(245,158,11,0.7)]">
            {team.score}
          </div>
          <div className="text-xs font-black uppercase tracking-widest text-amber-400">TOTAL COINS BAG</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5 text-left">
        <StatTile label="Rank" value={rank ? `#${rank}` : "—"} tone="signal" hint={frozen ? "final" : "live"} className="p-2 sm:p-4 [&_.hud-number]:text-sm sm:[&_.hud-number]:text-xl" />
        <StatTile label="Finish" value={formatTime(team.finishedAt)} tone="ok" className="p-2 sm:p-4 [&_.hud-number]:text-[11px] sm:[&_.hud-number]:text-base" />
        <StatTile label="Run Time" value={formatDuration(elapsed)} tone="gold" className="p-2 sm:p-4 [&_.hud-number]:text-[11px] sm:[&_.hud-number]:text-base" />
      </div>

      <Link
        href="/leaderboard"
        className="subway-btn-gold h-14 w-full rounded-2xl flex items-center justify-center gap-2 px-3 font-heading text-sm sm:text-base font-black tracking-wider uppercase text-center"
      >
        <Trophy className="size-5 stroke-[2.5]" />
        <span>VIEW OFFICIAL LEADERBOARD 🏆</span>
      </Link>
    </div>
  );
}
