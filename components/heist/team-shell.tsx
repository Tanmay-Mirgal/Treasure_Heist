"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Home, Map, ScanLine, Trophy, Wallet, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOnline } from "@/hooks/use-poll";
import { HeistMark } from "./brand";
import { CoinScore, SignalDot } from "./bits";
import { TeamStateProvider, useTeamState } from "./team-state";

const NAV = [
  { href: "/play", label: "Lobby", icon: Home },
  { href: "/play/mission", label: "Mission", icon: Map },
  { href: "/play/scan", label: "Scan QR", icon: ScanLine, primary: true },
  { href: "/play/score", label: "Loot", icon: Wallet },
  { href: "/leaderboard", label: "Board", icon: Trophy },
];

function TopBar() {
  const { state, error, lastOkAt } = useTeamState();
  const online = useOnline();
  const stale = Boolean(error) || !online;

  return (
    <header className="sticky top-0 z-30 border-b-2 border-slate-700 bg-slate-950/90 backdrop-blur-2xl shadow-xl">
      {/* Top Hazard Accent */}
      <div className="h-1 w-full subway-hazard opacity-80" />

      <div className="mx-auto flex h-16 max-w-lg items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4">
        <Link href="/play" aria-label="Team base" className="shrink-0 transition-transform hover:scale-105 active:scale-95">
          <div className="relative">
            <HeistMark className="size-8.5 sm:size-9 drop-shadow-[0_2px_10px_rgba(245,158,11,0.5)]" />
            <span className="absolute -bottom-0.5 -right-0.5 flex size-2.5">
              <span className={cn("inline-flex size-full rounded-full opacity-75 motion-safe:animate-ping", stale ? "bg-red-400" : "bg-emerald-400")} />
              <span className={cn("relative inline-flex size-2.5 rounded-full", stale ? "bg-red-500" : "bg-emerald-500")} />
            </span>
          </div>
        </Link>

        <div className="min-w-0 flex-1 px-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-heading text-xs sm:text-sm font-black tracking-wide text-white">
              {state?.team.name ?? "Connecting…"}
            </span>
            {state && (
              <span className="rounded-md border border-yellow-400/50 bg-yellow-400/20 px-1.5 py-0.2 text-[9px] sm:text-[10px] font-black uppercase text-yellow-300 shrink-0">
                #{state.team.number}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold text-slate-400" aria-live="polite">
            {stale ? (
              <span className="flex items-center gap-1 text-red-400 font-bold truncate">
                <WifiOff className="size-3 shrink-0" aria-hidden /> {online ? "Reconnecting…" : "Offline"}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-emerald-400 font-bold truncate">
                <span className="size-1.5 shrink-0 rounded-full bg-emerald-400 animate-ping" />
                Live Grid{lastOkAt ? "" : "…"}
              </span>
            )}
          </div>
        </div>

        {state && <CoinScore score={state.team.score} />}
      </div>
      <EventBanner />
    </header>
  );
}

function EventBanner() {
  const { state } = useTeamState();
  if (!state) return null;
  const e = state.event;
  let msg: string | null = null;
  let tone = "bg-cyan-500/15 text-cyan-300 border-b border-cyan-400/20";
  if (!e.participationEnabled) msg = "Participation is paused by the organizers.";
  else if (e.status === "SETUP") msg = "Stand by — the heist hasn't started yet.";
  else if (e.status === "PAUSED") {
    msg = "The heist is paused. Hold your position.";
    tone = "bg-orange-500/20 text-orange-300 border-b border-orange-400/30";
  } else if (e.status === "ENDED" || e.timer.expired) {
    msg = "The heist is over. Check the final leaderboard.";
    tone = "bg-yellow-500/15 text-yellow-300 border-b border-yellow-400/30";
  }
  if (!msg) return null;
  return <div className={cn("px-4 py-1.5 text-center text-xs font-black tracking-wide uppercase", tone)}>{msg}</div>;
}

function BottomNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Team navigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-slate-700 bg-slate-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl shadow-[0_-10px_35px_rgba(0,0,0,0.8)]"
    >
      {/* Top mini hazard trim on bottom nav */}
      <div className="h-0.5 w-full subway-hazard opacity-60" />

      <ul className="mx-auto grid h-16 max-w-lg grid-cols-5 items-center px-1 sm:px-3">
        {NAV.map((n) => {
          const active = n.href === "/play" ? path === "/play" : path.startsWith(n.href);
          if (n.primary)
            return (
              <li key={n.href} className="flex justify-center">
                <Link
                  href={n.href}
                  aria-label="Scan Station QR"
                  aria-current={active ? "page" : undefined}
                  className="-mt-6 sm:-mt-7 group relative grid size-14 sm:size-16 place-items-center rounded-2xl subway-btn-gold shadow-[0_4px_25px_rgba(245,158,11,0.6)] transition-all duration-150"
                >
                  <n.icon className="size-7 sm:size-8 stroke-[2.8] text-slate-950 drop-shadow transition-transform group-hover:scale-110 group-active:scale-95" />
                </Link>
              </li>
            );
          return (
            <li key={n.href} className="relative flex justify-center">
              <Link
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 sm:gap-1 rounded-xl px-1 sm:px-2 py-1 text-[10px] sm:text-[11px] font-black uppercase tracking-wider transition-all duration-150",
                  active
                    ? "text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.6)] scale-105"
                    : "text-slate-400 hover:text-slate-200 active:scale-95",
                )}
              >
                <n.icon className={cn("size-4.5 sm:size-5 transition-transform", active && "scale-110 stroke-[2.8]")} />
                <span className="truncate max-w-[52px] sm:max-w-none text-center">{n.label}</span>
                {active && (
                  <span className="absolute -bottom-1 h-1 w-5 sm:w-6 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.9)]" />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function TeamShell({ children }: { children: ReactNode }) {
  return (
    <TeamStateProvider>
      <TopBar />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-28 pt-4">{children}</main>
      <Suspense fallback={null}>
        <BottomNav />
      </Suspense>
    </TeamStateProvider>
  );
}
