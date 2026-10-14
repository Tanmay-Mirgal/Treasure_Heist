"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Lock, RefreshCw, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Wordmark } from "@/components/heist/brand";
import { EmptyState, SignalDot, TrackDivider, formatTime } from "@/components/heist/bits";
import { api } from "@/lib/client/api";
import { usePoll } from "@/hooks/use-poll";
import { cn } from "@/lib/utils";

type Row = {
  rank: number;
  teamId: string;
  name: string;
  number: number;
  score: number;
  completed: number;
  total: number;
  status: "NOT_STARTED" | "IN_PROGRESS" | "FINISHED" | "DISABLED";
  finishedAt: string | null;
  lastActivityAt: string | null;
  isYou: boolean;
};
type Board = { frozen: boolean; frozenAt: string | null; rows: Row[]; eventStatus: string; testMode: boolean };

const STATUS: Record<Row["status"], { label: string; tone: "ok" | "signal" | "muted" | "danger" }> = {
  FINISHED: { label: "Escaped", tone: "ok" },
  IN_PROGRESS: { label: "On route", tone: "signal" },
  NOT_STARTED: { label: "At start", tone: "muted" },
  DISABLED: { label: "Disabled", tone: "danger" },
};

export function LeaderboardClient() {
  const { data, loading, refresh, lastOkAt } = usePoll<Board>((signal) => api<Board>("/api/leaderboard", { signal }), 10_000);
  const [back, setBack] = useState<{ href: string; label: string }>({ href: "/", label: "Home" });

  useEffect(() => {
    api<{ team: unknown; admin: unknown }>("/api/auth/session")
      .then((s) => setBack(s.team ? { href: "/play", label: "Team base" } : s.admin ? { href: "/admin", label: "Control room" } : { href: "/", label: "Home" }))
      .catch(() => {});
  }, []);

  return (
    <div className="relative min-h-screen flex flex-col overflow-x-hidden">
      {/* Top Hazard Accent */}
      <div className="h-2 w-full subway-hazard opacity-90 shadow-md" />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-5">
        <div className="flex items-center justify-between gap-3">
          <Wordmark tagline />
          <Button asChild variant="outline" size="sm" className="rounded-xl border-slate-700 font-bold hover:bg-slate-800">
            <Link href={back.href}>
              <ArrowLeft className="size-4 mr-1" /> {back.label}
            </Link>
          </Button>
        </div>

        <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-yellow-400">
              <span>★ OFFICIAL CAMPUS HIGH SCORES ★</span>
            </div>
            <h1 className="mt-1 flex items-center gap-2.5 font-heading text-3xl font-black text-white">
              <Trophy className="size-8 text-yellow-400 drop-shadow-[0_2px_10px_rgba(250,204,21,0.6)]" /> Top Surfers Board
            </h1>
            <p className="mt-1 flex items-center gap-2 text-sm font-bold text-slate-400" aria-live="polite">
              {data?.frozen ? (
                <>
                  <Lock className="size-3.5 text-amber-400" /> Final results locked at {formatTime(data.frozenAt)}
                </>
              ) : (
                <>
                  <span className="size-2 rounded-full bg-emerald-400 animate-ping" />
                  Live Rails · updated {lastOkAt ? formatTime(new Date(lastOkAt)) : "…"}
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void refresh()}
              className="subway-btn-dark rounded-xl px-3.5 py-1.5 text-xs font-black uppercase tracking-wider flex items-center gap-1.5"
            >
              <RefreshCw className="size-3.5" /> REFRESH
            </button>
          </div>
        </div>
        <TrackDivider />

        {loading && !data ? (
          <div className="space-y-2.5">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-18 rounded-2xl" />
            ))}
          </div>
        ) : !data || data.rows.length === 0 ? (
          <EmptyState title="No runner crews yet" />
        ) : (
          <ol className="space-y-3">
            {data.rows.map((r) => {
              const s = STATUS[r.status];
              const pct = r.total ? Math.round((r.completed / r.total) * 100) : 0;
              const isFirst = r.rank === 1 && r.score > 0;
              const isSecond = r.rank === 2 && r.score > 0;
              const isThird = r.rank === 3 && r.score > 0;

              return (
                <li
                  key={r.teamId}
                  className={cn(
                    "flex items-center gap-2.5 sm:gap-4 rounded-2xl border-2 p-3 sm:p-4.5 backdrop-blur-md transition-all duration-150 hover:scale-[1.01]",
                    isFirst && "border-amber-400 bg-gradient-to-r from-amber-500/25 via-slate-900 to-slate-900 shadow-[0_0_30px_rgba(245,158,11,0.35)]",
                    isSecond && "border-slate-300 bg-gradient-to-r from-slate-400/20 via-slate-900 to-slate-900 shadow-[0_0_20px_rgba(203,213,225,0.2)]",
                    isThird && "border-orange-500 bg-gradient-to-r from-orange-600/20 via-slate-900 to-slate-900 shadow-[0_0_20px_rgba(234,88,12,0.2)]",
                    !isFirst && !isSecond && !isThird && "border-slate-800 bg-slate-900/80",
                    r.isYou && "ring-3 ring-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.4)]",
                  )}
                >
                  <span
                    className={cn(
                      "hud-number grid size-8.5 sm:size-11 shrink-0 place-items-center rounded-xl sm:rounded-2xl font-heading text-xs sm:text-base font-black shadow-lg",
                      isFirst && "subway-btn-gold text-slate-950 text-sm sm:text-lg",
                      isSecond && "subway-btn-cyan text-slate-950 text-xs sm:text-base",
                      isThird && "subway-btn-orange text-white text-xs sm:text-base",
                      !isFirst && !isSecond && !isThird && "bg-slate-800 text-slate-300 border border-slate-700",
                    )}
                    aria-label={`Rank ${r.rank}`}
                  >
                    {isFirst ? "👑" : isSecond ? "🛹" : isThird ? "🎨" : r.rank}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <span className="truncate font-heading text-xs sm:text-base font-black tracking-tight text-white">{r.name}</span>
                      {r.isYou && (
                        <Badge className="bg-cyan-500/30 text-cyan-300 border border-cyan-400/60 font-black uppercase text-[8px] sm:text-[10px] tracking-wider px-1.5 py-0 shrink-0">
                          YOU 🛹
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-slate-400 font-bold">
                      <span className="relative h-2 w-10 sm:w-36 overflow-hidden rounded-full bg-slate-800 shrink-0" aria-hidden>
                        <span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-amber-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="hud-number font-black text-white shrink-0">
                        {r.completed}/{r.total}
                      </span>
                      <span className="hidden xs:inline-flex items-center gap-1 truncate">
                        <SignalDot tone={s.tone} className="size-1.5 shrink-0" /> {s.label}
                      </span>
                      {r.lastActivityAt && <span className="hidden md:inline text-slate-500">· {formatTime(r.lastActivityAt)}</span>}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="hud-number font-heading text-lg sm:text-2xl font-black text-amber-300 drop-shadow-[0_2px_8px_rgba(245,158,11,0.6)]">
                      {r.score}
                    </div>
                    <div className="text-[8px] sm:text-[10px] font-black uppercase tracking-wider text-amber-400">COINS</div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        <p className="mt-5 text-center text-xs font-bold text-slate-500">
          Rankings update live in real-time. Speed + accuracy determine champion standing.
        </p>
      </main>
    </div>
  );
}
