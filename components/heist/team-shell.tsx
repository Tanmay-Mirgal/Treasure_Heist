"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Home, Map, ScanLine, Trophy, Wallet, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOnline } from "@/hooks/use-poll";
import { HeistMark } from "./brand";
import { CoinScore, SignalDot } from "./bits";
import { TeamStateProvider, useTeamState } from "./team-state";

const NAV = [
  { href: "/play", label: "Base", icon: Home },
  { href: "/play/mission", label: "Mission", icon: Map },
  { href: "/play/scan", label: "Scan", icon: ScanLine, primary: true },
  { href: "/play/score", label: "Score", icon: Wallet },
  { href: "/leaderboard", label: "Board", icon: Trophy },
];

function TopBar() {
  const { state, error, lastOkAt } = useTeamState();
  const online = useOnline();
  const stale = Boolean(error) || !online;
  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-lg items-center gap-3 px-4">
        <Link href="/play" aria-label="Team base" className="shrink-0">
          <HeistMark className="size-8" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="truncate font-heading text-sm font-semibold tracking-wide">{state?.team.name ?? "Loading…"}</div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground" aria-live="polite">
            {stale ? (
              <>
                <WifiOff className="size-3 text-danger" aria-hidden /> {online ? "Reconnecting…" : "Offline"}
              </>
            ) : (
              <>
                <SignalDot tone="ok" className="size-1.5" /> Live{lastOkAt ? "" : "…"}
              </>
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
  let tone = "bg-signal/10 text-signal";
  if (!e.participationEnabled) msg = "Participation is paused by the organizers.";
  else if (e.status === "SETUP" && e.testMode) {
    msg = "TEST MODE — rehearsal only, scores will be reset before the real start.";
    tone = "bg-warn/15 text-warn";
  } else if (e.status === "SETUP") msg = "Stand by — the heist hasn't started yet.";
  else if (e.status === "PAUSED") {
    msg = "The heist is paused. Hold your position.";
    tone = "bg-warn/15 text-warn";
  } else if (e.status === "ENDED" || e.timer.expired) {
    msg = "The heist is over. Check the final leaderboard.";
    tone = "bg-gold/10 text-gold";
  }
  if (!msg) return null;
  return <div className={cn("px-4 py-1.5 text-center text-xs font-medium", tone)}>{msg}</div>;
}

function BottomNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Team navigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid h-16 max-w-lg grid-cols-5 items-center px-2">
        {NAV.map((n) => {
          const active = n.href === "/play" ? path === "/play" : path.startsWith(n.href);
          if (n.primary)
            return (
              <li key={n.href} className="flex justify-center">
                <Link
                  href={n.href}
                  aria-label="Scan QR"
                  aria-current={active ? "page" : undefined}
                  className="-mt-7 grid size-16 place-items-center rounded-full border-4 border-background bg-primary text-primary-foreground shadow-[0_0_24px_oklch(0.86_0.17_92/0.35)] transition-transform active:scale-95"
                >
                  <n.icon className="size-7" />
                </Link>
              </li>
            );
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground",
                  active && "text-signal",
                )}
              >
                <n.icon className="size-5" />
                {n.label}
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
      <BottomNav />
    </TeamStateProvider>
  );
}
