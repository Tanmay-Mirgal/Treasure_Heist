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
import { useRealtimeTimer } from "@/hooks/use-realtime-timer";
import { api } from "@/lib/client/api";

import { EmbeddedLeaderboard } from "@/components/heist/embedded-leaderboard";

export function TeamDashboard() {
  const { state, loading, error, refresh, lastOkAt } = useTeamState();
  const t = state?.event.timer;
  const timer = useRealtimeTimer(t ? { ...t, status: state?.event.status } : undefined);
  const [marking, setMarking] = useState(false);

  if (loading && !state) return <DashboardSkeleton />;
  if (!state) return <Alert variant="destructive"><AlertDescription>{error?.message ?? "Could not load your mission."}</AlertDescription></Alert>;

  const { team, progress, mission, inventory, notifications, event } = state;
  const isTimeUp = timer.isTimeUp || event.status === "ENDED" || Boolean(event.timer.enabled && event.timer.expired);
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
      {/* Team Profile & Identity Header */}
      <div className="relative overflow-hidden rounded-3xl border-2 border-slate-700 bg-gradient-to-r from-slate-900/95 via-slate-900/85 to-slate-900/95 p-5 shadow-xl backdrop-blur-xl">
        <div className="absolute inset-x-0 top-0 h-1.5 subway-hazard opacity-80" />
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-yellow-400/50 bg-yellow-400/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-yellow-300">
                SURFER CREW #{team.number}
              </span>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{team.username}</span>
            </div>
            <h1 className="mt-1 font-heading text-2xl font-black tracking-tight text-white">{team.name}</h1>
          </div>
          <div className="shrink-0 text-right">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">COINS BAG</span>
            <div className="hud-number font-heading text-2xl font-black text-amber-300 drop-shadow-[0_2px_8px_rgba(245,158,11,0.6)]">
              {team.score} <span className="text-xs font-bold text-amber-400">COINS</span>
            </div>
          </div>
        </div>
      </div>

      {/* PROMINENT TIME'S UP BANNER */}
      {isTimeUp && (
        <div className="relative overflow-hidden rounded-3xl border-3 border-amber-400 bg-gradient-to-b from-amber-500/30 via-slate-900/95 to-slate-950 p-6 text-center shadow-[0_0_50px_rgba(245,158,11,0.5)]">
          <div className="absolute inset-x-0 top-0 h-2 subway-hazard animate-pulse" />
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border-2 border-amber-400 bg-amber-400/20 text-amber-300 shadow-[0_0_20px_rgba(250,204,21,0.6)]">
            <Timer className="size-7 animate-bounce" />
          </div>
          <h2 className="mt-3 font-heading text-3xl sm:text-4xl font-black tracking-tight text-amber-300 drop-shadow-[0_2px_14px_rgba(250,204,21,0.9)]">
            TIME&apos;S UP!
          </h2>
          <p className="mt-2 text-sm sm:text-base font-bold text-slate-200 max-w-md mx-auto">
            The event timer has expired and the heist has officially terminated. All railway tracks are closed and no further scans can be done.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-yellow-400/50 bg-yellow-400/15 px-4 py-1 text-xs font-black uppercase tracking-wider text-yellow-300">
            <span>🏁 FINAL VERIFIED STANDINGS DISPLAYED BELOW</span>
          </div>
        </div>
      )}

      {unread.length > 0 && !isTimeUp && (
        <Alert className="border-2 border-orange-400/60 bg-gradient-to-r from-orange-500/20 via-orange-500/10 to-transparent shadow-xl backdrop-blur-md">
          <Bell className="size-5 text-orange-400 animate-bounce" />
          <AlertTitle className="font-heading font-black text-orange-300 flex items-center justify-between">
            <span>{unread.length} NEW SUBWAY DISPATCH{unread.length > 1 ? "ES" : ""}</span>
          </AlertTitle>
          <AlertDescription>
            <ul className="mt-1.5 space-y-1.5">
              {unread.slice(0, 3).map((n) => (
                <li key={n.id} className="text-sm font-bold text-slate-100">
                  {n.message}
                </li>
              ))}
            </ul>
            <Button size="sm" variant="ghost" className="mt-2.5 -ml-2 text-xs font-bold text-orange-300 hover:bg-orange-500/20" onClick={markAllRead} disabled={marking}>
              <CheckCheck className="size-4 mr-1" /> Clear dispatches
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Main Mission Control Card */}
      <section className="relative overflow-hidden rounded-3xl border-2 border-cyan-400/40 bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950 p-6 shadow-2xl backdrop-blur-xl" aria-labelledby="mission-status">
        <div className="absolute inset-x-0 top-0 h-1.5 subway-hazard" />
        
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.2em] text-cyan-400">
            <span className="size-2 rounded-full bg-cyan-400 motion-safe:animate-ping" />
            <span id="mission-status">
              {isTimeUp
                ? "★ EVENT TERMINATED · FINAL RESULTS ★"
                : progress.finished
                  ? "★ ALL STATIONS CLEARED ★"
                  : `RAILWAY TRACK ${progress.currentMission} OF ${progress.total}`}
            </span>
          </div>
          {mission.lastAction && mission.lastAction !== "NORMAL" && !progress.finished && !isTimeUp && <ActionBadge action={mission.lastAction} />}
        </div>

        <p className="mt-3 font-heading text-xl font-black leading-snug text-white">
          {isTimeUp
            ? "Subway Heist Ended — All Checkpoints Locked"
            : progress.finished
              ? "Vault Breached! Victory is yours, runners!"
              : mission.kind === "ANSWER"
                ? "Station challenge unlocked — crack the passkey."
                : mission.kind === "START"
                  ? "Scan Station #1 QR code to receive your first mission intel."
                  : mission.kind === "UNCONFIGURED"
                    ? "Awaiting railway schedule from control room."
                    : "Follow active route clues to the next railway station."}
        </p>

        {/* Railway Line with ties & hoverboard */}
        <div className="mt-5 rounded-2xl border-2 border-slate-800 bg-slate-950/80 p-3.5 shadow-inner">
          <StationLine completed={progress.completed} total={progress.total} finished={progress.finished} />
        </div>

        {/* Chunky 3D Arcade Action Buttons */}
        <div className="mt-6 grid grid-cols-2 gap-2.5 sm:gap-3">
          {isTimeUp ? (
            <Link
              href="/leaderboard"
              className="col-span-2 subway-btn-gold h-14 rounded-2xl flex items-center justify-center gap-2.5 px-4 font-heading text-sm sm:text-base font-black tracking-wider uppercase text-center shadow-[0_0_25px_rgba(250,204,21,0.5)]"
            >
              <Trophy className="size-5 stroke-[2.5]" />
              <span>VIEW COMPLETE LEADERBOARD 🏆</span>
            </Link>
          ) : progress.finished ? (
            <Link
              href="/play/complete"
              className="col-span-2 subway-btn-gold h-14 rounded-2xl flex items-center justify-center gap-2 px-3 font-heading text-sm sm:text-base font-black tracking-wider uppercase text-center"
            >
              <Flag className="size-5 stroke-[2.5]" />
              <span>VIEW VICTORY VAULT</span>
            </Link>
          ) : (
            <>
              <Link
                href="/play/scan"
                className="subway-btn-gold h-14 rounded-2xl flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 font-heading text-xs sm:text-base font-black tracking-wider uppercase text-center"
              >
                <ScanLine className="size-4.5 sm:size-5 stroke-[3] shrink-0" />
                <span>SCAN QR 🛹</span>
              </Link>

              <Link
                href={mission.kind === "START" ? "/play/scan" : "/play/mission"}
                className="subway-btn-cyan h-14 rounded-2xl flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 font-heading text-xs sm:text-base font-black tracking-wider uppercase text-center"
              >
                <Map className="size-4.5 sm:size-5 stroke-[2.5] shrink-0" />
                <span className="truncate">{mission.kind === "ANSWER" ? "ENTER CODE" : mission.kind === "START" ? "SCAN QR #1 🛹" : "READ INTEL"}</span>
              </Link>
            </>
          )}
        </div>
      </section>

      {/* EMBEDDED REALTIME FINAL LEADERBOARD WHEN TIME IS UP */}
      {isTimeUp && (
        <EmbeddedLeaderboard currentTeamNumber={team.number} />
      )}

      {/* Mission Clock / Countdown — full HUD card */}
      {event.timer.enabled && (() => {
        const expired = timer.isTimeUp;
        const lowTime = timer.isLowTime;
        const isSetup = event.status === "SETUP";
        return (
          <div
            className={`relative overflow-hidden rounded-2xl border-2 p-4 shadow-2xl backdrop-blur-xl ${
              expired
                ? "border-amber-400 bg-gradient-to-r from-amber-500/20 via-slate-900 to-amber-500/10 shadow-[0_0_40px_rgba(245,158,11,0.5)]"
                : lowTime
                  ? "border-red-500 bg-gradient-to-r from-red-500/20 via-slate-900 to-red-500/10 shadow-[0_0_40px_rgba(239,68,68,0.5)] animate-pulse"
                  : "border-cyan-400/50 bg-gradient-to-r from-cyan-500/10 via-slate-900 to-slate-950 shadow-[0_0_25px_rgba(34,211,238,0.2)]"
            }`}
          >
            <div className="absolute inset-x-0 top-0 h-1 subway-hazard opacity-70" />
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`grid size-11 shrink-0 place-items-center rounded-xl border-2 ${
                    expired
                      ? "border-amber-400 bg-amber-500/30 text-amber-300"
                      : lowTime
                        ? "border-red-500 bg-red-500/30 text-red-300"
                        : "border-cyan-400/60 bg-cyan-500/20 text-cyan-300"
                  }`}
                >
                  <Timer className={`size-5 ${lowTime ? "animate-bounce" : ""}`} />
                </div>
                <div>
                  <div
                    className={`text-[9px] font-black uppercase tracking-widest ${
                      expired ? "text-amber-400" : lowTime ? "text-red-400" : "text-cyan-400"
                    }`}
                  >
                    {expired ? "★ VAULT CLOSED ★" : lowTime ? "⚠ TIME RUNNING OUT!" : "⏱ TIME TO VAULT CLOSE"}
                  </div>
                  <div
                    className={`hud-number font-heading text-3xl font-black leading-none mt-0.5 ${
                      expired
                        ? "text-amber-300 drop-shadow-[0_0_15px_rgba(245,158,11,0.9)]"
                        : lowTime
                          ? "text-red-300 drop-shadow-[0_0_15px_rgba(239,68,68,0.9)]"
                          : "text-cyan-200 drop-shadow-[0_0_12px_rgba(34,211,238,0.6)]"
                    }`}
                  >
                    {expired
                      ? "TIME'S UP!"
                      : isSetup
                        ? formatDuration(event.timer.durationMs)
                        : timer.formatted}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-500">TOTAL</div>
                <div className="font-heading text-sm font-black text-slate-400">{formatDuration(event.timer.durationMs)}</div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Gamified HUD Stat Tiles */}
      <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
        <StatTile label="Coins Loot" value={team.score} tone="gold" icon={<Coins className="size-4" />} />
        <StatTile label="Stations Cleared" value={`${progress.completed}/${progress.total}`} tone="ok" icon={<CheckCheck className="size-4" />} hint={`${progress.remaining} to finish line`} />
        <StatTile label="Mystery Clues" value={inventory.hintsAvailable} tone="signal" icon={<Lightbulb className="size-4" />} hint={`${inventory.hintsUsed} deployed`} />
        <StatTile label="Power-ups" value={magnets.length} tone="warn" icon={<Magnet className="size-4" />} hint={magnets.length ? "MAGNET ready" : "empty"} />
      </div>

      {/* MAGNET Tactical Weapon Card */}
      {!isTimeUp && magnets.length > 0 && (
        <Link
          href={`/play/magnet?id=${magnets[0]!.id}`}
          className="group relative flex items-center gap-2.5 sm:gap-4 overflow-hidden rounded-2xl border-2 border-orange-400 bg-gradient-to-r from-orange-500/25 via-amber-500/20 to-orange-500/15 p-3.5 sm:p-4 shadow-[0_0_25px_rgba(251,146,60,0.4)] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
        >
          <div className="pointer-events-none absolute -right-4 -top-4 size-20 rounded-full bg-orange-500/30 blur-xl group-hover:scale-150 transition-transform" />
          <div className="grid size-11 sm:size-12 shrink-0 place-items-center rounded-xl bg-orange-500/30 border-2 border-orange-400 text-orange-300 shadow-[0_0_15px_rgba(251,146,60,0.6)]">
            <Magnet className="size-5 sm:size-6 group-hover:rotate-12 transition-transform" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-heading font-black text-orange-300 tracking-wide text-xs sm:text-sm truncate">COIN MAGNET READY!</span>
              <span className="rounded-full bg-orange-400/30 px-1.5 py-0.2 text-[8px] sm:text-[9px] font-black uppercase text-orange-200 border border-orange-300 shrink-0">ACTIVE</span>
            </div>
            <div className="text-[11px] sm:text-xs text-slate-200 font-bold mt-0.5 line-clamp-1">Snatch up to {state.rules.magnet.maxTransfer} coins from rivals!</div>
          </div>
          <span className="subway-btn-orange rounded-xl px-2.5 sm:px-3.5 py-1.5 text-[11px] sm:text-xs font-black uppercase tracking-wider shrink-0">
            FIRE ⚡
          </span>
        </Link>
      )}

      <TrackDivider />

      {/* Quick Access Grid */}
      <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
        <Button asChild variant="secondary" className="h-12 text-xs sm:text-sm font-bold hover:scale-[1.02] active:scale-[0.98] transition-all border border-border/50 px-2 sm:px-4">
          <Link href="/play/score" className="truncate">
            <Wallet className="size-3.5 sm:size-4 text-amber-400 mr-1 sm:mr-1.5 shrink-0" /> Loot History
          </Link>
        </Button>
        <Button asChild variant="secondary" className="h-12 text-xs sm:text-sm font-bold hover:scale-[1.02] active:scale-[0.98] transition-all border border-border/50 px-2 sm:px-4">
          <Link href="/leaderboard" className="truncate">
            <Trophy className="size-3.5 sm:size-4 text-amber-400 mr-1 sm:mr-1.5 shrink-0" /> Live Board
          </Link>
        </Button>
        <HelpDialog className="h-12 text-xs sm:text-sm font-bold hover:scale-[1.02] active:scale-[0.98] transition-all border border-border/50 px-2 sm:px-4" />
        <LogoutButton className="h-12 text-xs sm:text-sm font-bold hover:scale-[1.02] active:scale-[0.98] transition-all border border-border/50 px-2 sm:px-4" />
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
