"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Clock, Lock, RefreshCw, Timer, Trophy, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Wordmark } from "@/components/heist/brand";
import { EmptyState, SignalDot, TrackDivider, formatTime } from "@/components/heist/bits";
import { api } from "@/lib/client/api";
import { useRealtimeLeaderboard } from "@/hooks/use-realtime-leaderboard";
import { useServerCountdown, formatDuration } from "@/hooks/use-poll";
import { cn } from "@/lib/utils";

const STATUS: Record<string, { label: string; tone: "ok" | "signal" | "muted" | "danger" }> = {
  FINISHED: { label: "Vault Breached", tone: "ok" },
  IN_PROGRESS: { label: "On route", tone: "signal" },
  NOT_STARTED: { label: "At start", tone: "muted" },
  DISABLED: { label: "Disabled", tone: "danger" },
};

export function LeaderboardClient() {
  const { data, loading, refresh, lastLiveAt, wsConnected } = useRealtimeLeaderboard(12_000);
  const [back, setBack] = useState<{ href: string; label: string }>({ href: "/", label: "Home" });

  // Server-anchored countdown: anchor to when we got the data from server
  const t = data?.timer;
  const serverReceivedAt = lastLiveAt ? lastLiveAt.getTime() : null;
  const remaining = useServerCountdown(
    t?.remainingMs ?? null,
    serverReceivedAt,
    Boolean(t?.running && t.enabled),
  );

  const isExpired = t?.expired || (remaining !== null && remaining <= 0 && t?.enabled);
  const isRunning = t?.running && t?.enabled && !isExpired;
  const isLowTime = remaining !== null && remaining > 0 && remaining < 5 * 60_000;

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
              <span>★ OFFICIAL FASTEST RUNNER RANKINGS ★</span>
            </div>
            <h1 className="mt-1 flex items-center gap-2.5 font-heading text-3xl font-black text-white">
              <Trophy className="size-8 text-yellow-400 drop-shadow-[0_2px_10px_rgba(250,204,21,0.6)]" /> Top Surfers Board
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs sm:text-sm font-bold text-slate-400" aria-live="polite">
              {data?.frozen ? (
                <span className="flex items-center gap-1.5 text-amber-400">
                  <Lock className="size-3.5" /> Final results locked at {formatTime(data.frozenAt)}
                </span>
              ) : (
                <>
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] sm:text-xs font-black uppercase tracking-wider", wsConnected ? "border border-emerald-400/50 bg-emerald-500/20 text-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.4)]" : "border border-cyan-400/40 bg-cyan-500/10 text-cyan-300")}>
                    <Zap className={cn("size-3", wsConnected && "animate-bounce text-emerald-400")} />
                    {wsConnected ? "WebSocket Real-time Live" : "Polling Active"}
                  </span>
                  <span className="text-slate-400">
                    · updated {lastLiveAt ? formatTime(lastLiveAt) : "…"}
                  </span>
                </>
              )}
            </div>
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

        {/* ─── Event Countdown Banner ─── */}
        {t?.enabled && (
          <div
            className={cn(
              "relative overflow-hidden rounded-2xl border-2 p-4 sm:p-5 flex items-center justify-between gap-3 shadow-2xl backdrop-blur-xl mt-4",
              isExpired || data?.frozen
                ? "border-amber-400 bg-gradient-to-r from-amber-500/20 via-slate-900 to-amber-500/10 shadow-[0_0_40px_rgba(245,158,11,0.5)]"
                : isLowTime
                  ? "border-red-500 bg-gradient-to-r from-red-500/20 via-slate-900 to-red-500/10 shadow-[0_0_40px_rgba(239,68,68,0.5)] animate-pulse"
                  : "border-cyan-400/60 bg-gradient-to-r from-cyan-500/15 via-slate-900 to-slate-950 shadow-[0_0_30px_rgba(34,211,238,0.25)]",
            )}
          >
            <div className="absolute inset-x-0 top-0 h-1 subway-hazard opacity-70" />
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div
                className={cn(
                  "grid size-10 sm:size-12 shrink-0 place-items-center rounded-xl border-2",
                  isExpired || data?.frozen
                    ? "border-amber-400 bg-amber-500/30 text-amber-300"
                    : isLowTime
                      ? "border-red-500 bg-red-500/30 text-red-300 animate-pulse"
                      : "border-cyan-400/60 bg-cyan-500/20 text-cyan-300",
                )}
              >
                {isExpired || data?.frozen ? (
                  <Lock className="size-5 sm:size-6" />
                ) : (
                  <Timer className={cn("size-5 sm:size-6", isLowTime && "animate-bounce")} />
                )}
              </div>
              <div>
                <div
                  className={cn(
                    "text-[9px] sm:text-[10px] font-black uppercase tracking-widest",
                    isExpired || data?.frozen ? "text-amber-400" : isLowTime ? "text-red-400" : "text-cyan-400",
                  )}
                >
                  {isExpired || data?.frozen
                    ? "★ VAULT CLOSED — FINAL RESULTS ★"
                    : isLowTime
                      ? "⚠ TIME IS RUNNING OUT!"
                      : "⏱ TIME REMAINING"}
                </div>
                <div
                  className={cn(
                    "font-heading font-black tracking-tight leading-none mt-0.5",
                    "text-xl sm:text-2xl",
                    isExpired || data?.frozen
                      ? "text-amber-300 drop-shadow-[0_0_15px_rgba(245,158,11,0.8)]"
                      : isLowTime
                        ? "text-red-300 drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]"
                        : "text-white",
                  )}
                >
                  {isExpired || data?.frozen
                    ? "SCORES LOCKED 🏆"
                    : data?.eventStatus === "PAUSED"
                      ? "EVENT PAUSED ⏸"
                      : formatDuration(remaining)}
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div
                className={cn(
                  "text-[9px] sm:text-[10px] font-black uppercase tracking-widest",
                  isExpired || data?.frozen ? "text-amber-400" : "text-slate-400",
                )}
              >
                TOTAL DURATION
              </div>
              <div
                className={cn(
                  "font-heading text-sm sm:text-base font-black",
                  isExpired || data?.frozen ? "text-amber-300" : "text-slate-300",
                )}
              >
                {formatDuration(t.durationMs)}
              </div>
            </div>
          </div>
        )}

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
              const s = STATUS[r.status] ?? STATUS.NOT_STARTED;
              const pct = r.total ? Math.round((r.completed / r.total) * 100) : 0;
              const isFirst = r.rank === 1 && (r.score > 0 || r.completed > 0);
              const isSecond = r.rank === 2 && (r.score > 0 || r.completed > 0);
              const isThird = r.rank === 3 && (r.score > 0 || r.completed > 0);

              return (
                <li
                  key={r.teamId}
                  className={cn(
                    "flex items-center gap-2.5 sm:gap-4 rounded-2xl border-2 p-3 sm:p-4 backdrop-blur-md transition-all duration-150 hover:scale-[1.01]",
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
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className="truncate font-heading text-xs sm:text-base font-black tracking-tight text-white">{r.name}</span>
                      {r.isYou && (
                        <Badge className="bg-cyan-500/30 text-cyan-300 border border-cyan-400/60 font-black uppercase text-[8px] sm:text-[10px] tracking-wider px-1.5 py-0 shrink-0">
                          YOU 🛹
                        </Badge>
                      )}
                      {/* TIME TAKEN BADGE PROMINENTLY VISIBLE */}
                      {r.formattedDuration && r.formattedDuration !== "—" && (
                        <span className={cn(
                          "rounded-lg border px-2 py-0.5 text-[9px] sm:text-[11px] font-mono font-black uppercase tracking-wider shrink-0",
                          r.status === "FINISHED"
                            ? "border-emerald-400/60 bg-emerald-500/25 text-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.5)]"
                            : "border-cyan-400/50 bg-cyan-500/20 text-cyan-300"
                        )}>
                          ⏱️ {r.formattedDuration}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-slate-400 font-bold">
                      <span className="relative h-2 w-10 sm:w-28 overflow-hidden rounded-full bg-slate-800 shrink-0" aria-hidden>
                        <span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-amber-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="hud-number font-black text-white shrink-0">
                        {r.completed}/{r.total} stations
                      </span>
                      <span className="inline-flex items-center gap-1 truncate">
                        <SignalDot tone={s.tone} className="size-1.5 shrink-0" /> {s.label}
                      </span>
                      {r.status === "FINISHED" ? (
                        <span className="font-mono text-emerald-300 font-black text-[10px] sm:text-xs">
                          · Cleared in {r.formattedDuration}
                        </span>
                      ) : r.status === "IN_PROGRESS" && r.formattedDuration && r.formattedDuration !== "—" ? (
                        <span className="font-mono text-cyan-300 font-bold text-[10px] sm:text-xs">
                          · {r.formattedDuration} on tracks
                        </span>
                      ) : null}
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
          Rankings update live in real-time via WebSockets. Least time taken to clear all stations claims 👑 1st Rank!
        </p>
      </main>
    </div>
  );
}
