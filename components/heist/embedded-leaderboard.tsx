"use client";

import Link from "next/link";
import { Award, CheckCheck, Crown, ExternalLink, Flame, Medal, Trophy, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRealtimeLeaderboard } from "@/hooks/use-realtime-leaderboard";
import { cn } from "@/lib/utils";

export function EmbeddedLeaderboard({ currentTeamNumber }: { currentTeamNumber?: number }) {
  const { data, loading, wsConnected } = useRealtimeLeaderboard(8_000);

  if (loading && !data) {
    return (
      <div className="space-y-3 rounded-3xl border-2 border-slate-800 bg-slate-900/80 p-5 backdrop-blur-xl">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  const rows = data?.rows ?? [];
  const topThree = rows.slice(0, 3);
  const myRow = rows.find((r) => r.number === currentTeamNumber);

  return (
    <div className="relative overflow-hidden rounded-3xl border-2 border-yellow-400/50 bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950 p-5 sm:p-6 shadow-[0_0_35px_rgba(250,204,21,0.25)] backdrop-blur-xl">
      {/* Top Hazard Accent */}
      <div className="absolute inset-x-0 top-0 h-1.5 subway-hazard" />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-yellow-400">
            <Trophy className="size-3.5 text-yellow-400" />
            <span>★ OFFICIAL HEIST LEADERBOARD ★</span>
          </div>
          <h2 className="mt-1 font-heading text-xl sm:text-2xl font-black text-white">
            Final Standings
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider",
              wsConnected
                ? "border border-emerald-400/40 bg-emerald-500/20 text-emerald-300"
                : "border border-cyan-400/30 bg-cyan-500/10 text-cyan-300",
            )}
          >
            <Zap className="size-3" />
            {wsConnected ? "Live" : "Verified"}
          </span>
          <Button asChild size="sm" variant="outline" className="h-8 text-xs font-bold border-slate-700 hover:bg-slate-800">
            <Link href="/leaderboard">
              <span>Full Screen</span>
              <ExternalLink className="size-3 ml-1" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Current Team Standing Callout (if found) */}
      {myRow && (
        <div className="mt-4 rounded-2xl border-2 border-amber-400 bg-gradient-to-r from-amber-500/20 via-yellow-500/15 to-transparent p-3.5 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-400 text-slate-950 font-heading text-lg font-black shadow-md">
                #{myRow.rank}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-300">YOUR CREW</span>
                  <span className="rounded bg-black/40 px-1 text-[9px] font-black text-slate-300">#{myRow.number}</span>
                </div>
                <div className="font-heading text-sm font-black text-white truncate">{myRow.name}</div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="hud-number font-heading text-xl font-black text-amber-300">
                {myRow.score} <span className="text-[10px] text-amber-400 font-bold">COINS</span>
              </div>
              <div className="text-[10px] font-bold text-slate-400">
                {myRow.completed} stations cleared
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top 3 Podium (if >= 2 teams exist) */}
      {topThree.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {topThree.map((r, i) => {
            const isFirst = i === 0;
            const isSecond = i === 1;
            const isThird = i === 2;
            const isMe = r.number === currentTeamNumber;

            return (
              <div
                key={r.number}
                className={cn(
                  "relative flex flex-col items-center justify-between rounded-2xl p-2.5 sm:p-3 text-center border-2 transition-all",
                  isFirst
                    ? "border-yellow-400 bg-gradient-to-b from-yellow-500/25 to-yellow-950/40 shadow-[0_0_20px_rgba(250,204,21,0.3)] order-2 sm:order-2"
                    : isSecond
                      ? "border-slate-400 bg-gradient-to-b from-slate-400/20 to-slate-900/40 order-1 sm:order-1"
                      : "border-amber-700 bg-gradient-to-b from-amber-700/20 to-slate-900/40 order-3 sm:order-3",
                  isMe && "ring-2 ring-yellow-400",
                )}
              >
                <div className="flex items-center justify-center">
                  {isFirst ? (
                    <Crown className="size-6 text-yellow-300 animate-bounce" />
                  ) : isSecond ? (
                    <Medal className="size-5 text-slate-300" />
                  ) : (
                    <Medal className="size-5 text-amber-600" />
                  )}
                </div>

                <div className="mt-1 font-heading text-xs sm:text-sm font-black text-white truncate max-w-full">
                  #{r.rank} {r.name}
                </div>

                <div className="mt-1 font-heading text-sm sm:text-base font-black text-amber-300">
                  {r.score} <span className="text-[9px] text-amber-400">PTS</span>
                </div>

                {isMe && (
                  <span className="mt-1 rounded-full bg-yellow-400 px-1.5 py-0.2 text-[8px] font-black uppercase text-slate-950">
                    YOU
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Full Team List Table */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 shadow-inner">
        <div className="divide-y divide-slate-800/80">
          {rows.map((r) => {
            const isMe = r.number === currentTeamNumber;
            return (
              <div
                key={r.number}
                className={cn(
                  "flex items-center justify-between gap-2 px-3 py-2.5 text-xs transition-colors",
                  isMe ? "bg-amber-400/15 font-bold" : "hover:bg-slate-900/60",
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-lg font-heading text-xs font-black",
                      r.rank === 1
                        ? "bg-yellow-400 text-slate-950 shadow-sm"
                        : r.rank === 2
                          ? "bg-slate-300 text-slate-950"
                          : r.rank === 3
                            ? "bg-amber-700 text-white"
                            : "bg-slate-800 text-slate-300",
                    )}
                  >
                    {r.rank}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={cn("truncate font-heading font-black", isMe ? "text-amber-300" : "text-white")}>
                        {r.name}
                      </span>
                      {isMe && (
                        <span className="rounded bg-yellow-400 px-1 py-0.2 text-[8px] font-black text-slate-950">
                          YOU
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium">Crew #{r.number}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 text-right">
                  <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                    <CheckCheck className="size-3 text-emerald-400" />
                    <span>{r.completed}</span>
                  </div>
                  <div className="font-heading font-black text-amber-300 text-sm w-16 text-right">
                    {r.score} <span className="text-[9px] text-amber-400 font-bold">COINS</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Button to Fullscreen Leaderboard */}
      <div className="mt-4">
        <Button asChild size="lg" className="w-full subway-btn-gold h-12 rounded-2xl font-heading font-black text-xs sm:text-sm tracking-wider uppercase">
          <Link href="/leaderboard">
            <Trophy className="size-4 mr-2" />
            <span>OPEN COMPLETE EXPANDED LEADERBOARD 🏆</span>
          </Link>
        </Button>
      </div>
    </div>
  );
}
