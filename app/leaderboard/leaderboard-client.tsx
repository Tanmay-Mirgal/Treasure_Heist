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
  const { data, loading, refresh, lastOkAt } = usePoll<Board>((signal) => api<Board>("/api/leaderboard", { signal, redirectOn401: "team" }), 10_000);
  const [back, setBack] = useState<{ href: string; label: string }>({ href: "/", label: "Home" });

  useEffect(() => {
    api<{ team: unknown; admin: unknown }>("/api/auth/session")
      .then((s) => setBack(s.team ? { href: "/play", label: "Team base" } : s.admin ? { href: "/admin", label: "Control room" } : { href: "/", label: "Home" }))
      .catch(() => {});
  }, []);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-5">
      <div className="flex items-center justify-between gap-3">
        <Wordmark />
        <Button asChild variant="ghost" size="sm">
          <Link href={back.href}>
            <ArrowLeft className="size-4" /> {back.label}
          </Link>
        </Button>
      </div>
      <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-3xl font-semibold">
            <Trophy className="size-7 text-gold" /> Leaderboard
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
            {data?.frozen ? (
              <>
                <Lock className="size-3.5 text-gold" /> Final results — frozen at {formatTime(data.frozenAt)}
              </>
            ) : (
              <>
                <SignalDot tone="ok" pulse /> Live · updated {lastOkAt ? formatTime(new Date(lastOkAt)) : "…"}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data?.testMode && <Badge className="bg-warn/15 text-warn">TEST MODE</Badge>}
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RefreshCw className="size-4" /> Refresh
          </Button>
        </div>
      </div>
      <TrackDivider />

      {loading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : !data || data.rows.length === 0 ? (
        <EmptyState title="No teams yet" />
      ) : (
        <ol className="space-y-2">
          {data.rows.map((r) => {
            const s = STATUS[r.status];
            const pct = r.total ? Math.round((r.completed / r.total) * 100) : 0;
            return (
              <li
                key={r.teamId}
                className={cn(
                  "flex items-center gap-3 rounded-xl border bg-card/70 p-3 sm:gap-4 sm:p-4",
                  r.rank === 1 && r.score > 0 && "border-gold/40",
                  r.isYou && "ring-2 ring-signal/60",
                )}
              >
                <span
                  className={cn(
                    "hud-number grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-sm font-bold",
                    r.rank === 1 && r.score > 0 && "bg-gold text-primary-foreground",
                  )}
                  aria-label={`Rank ${r.rank}`}
                >
                  {r.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{r.name}</span>
                    {r.isYou && <Badge className="bg-signal/15 text-signal">You</Badge>}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="relative h-1.5 w-20 overflow-hidden rounded-full bg-secondary sm:w-32" aria-hidden>
                      <span className="absolute inset-y-0 left-0 rounded-full bg-ok" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="hud-number">
                      {r.completed}/{r.total}
                    </span>
                    <span className="hidden items-center gap-1 sm:inline-flex">
                      <SignalDot tone={s.tone} className="size-1.5" /> {s.label}
                    </span>
                    {r.lastActivityAt && <span className="hidden md:inline">· {formatTime(r.lastActivityAt)}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="hud-number text-2xl font-semibold text-gold">{r.score}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">pts</div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Ties are broken by who reached the score first. Only aggregate scores are shown — routes stay secret.
      </p>
    </main>
  );
}
