"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Coins, Crown, Flag, Footprints, Magnet, ScanLine, Users, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageTitle, StatTile, formatTime } from "@/components/heist/bits";
import { OutcomeText, SeverityBadge, StatusPill, toastError } from "@/components/heist/admin-kit";
import { api } from "@/lib/client/api";
import { usePoll } from "@/hooks/use-poll";

type Overview = {
  scope: "TEST" | "OFFICIAL";
  settings: { status: string; testMode: boolean; leaderboardFrozen: boolean; participationEnabled: boolean; scoringEnabled: boolean };
  stats: {
    totalTeams: number;
    activeTeams: number;
    disabledTeams: number;
    finishedTeams: number;
    leader: { name: string; score: number } | null;
    highestScore: number;
    acceptedScans: number;
    rejectedScans: number;
    magnetActivations: number;
    bonusRewards: number;
    superShoesRewards: number;
  };
  leaderboard: { rank: number; teamId: string; name: string; score: number; completed: number; total: number; status: string; lastActivityAt: string | null }[];
  ledgerMismatches: { team: string; score: number; ledger: number }[];
  validation: { summary: { errors: number; warnings: number; info: number }; top: { severity: "ERROR"; code: string; message: string }[] };
  openIssues: { id: string; team: string; message: string; at: string }[];
  recentScans: { id: string; team: string; outcome: string; reason: string | null; copyId: string | null; position: number | null; expectedPosition: number | null; points: number; source: string; isTest: boolean; at: string }[];
  recentTransactions: { id: string; team: string; type: string; delta: number; counterparty: string | null; reason: string | null; isTest: boolean; at: string }[];
};

export function OverviewClient() {
  const { data, refresh } = usePoll<Overview>((signal) => api<Overview>("/api/admin/overview", { signal, redirectOn401: "admin" }), 10_000);
  if (!data)
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  const s = data.stats;

  async function resolve(id: string) {
    try {
      await api(`/api/admin/issues/${id}`, { method: "POST", body: {} });
      await refresh();
    } catch (e) {
      toastError(e);
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle
        title="Control room"
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            Event <StatusPill status={data.settings.status} />
            {data.settings.testMode && <StatusPill status="TEST MODE" />}
            {data.settings.leaderboardFrozen && <StatusPill status="FROZEN" />}
            {!data.settings.participationEnabled && <StatusPill status="PARTICIPATION OFF" />}
            {!data.settings.scoringEnabled && <StatusPill status="SCORING OFF" />}
            <span className="text-xs">Counting {data.scope === "TEST" ? "rehearsal (test) data" : "official data"} · refreshes every 10 s</span>
          </span>
        }
        actions={
          <Button asChild>
            <Link href="/admin/event">Event controls</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label="Teams" value={s.totalTeams} icon={<Users className="size-3.5" />} hint={`${s.disabledTeams} disabled`} />
        <StatTile label="Active" value={s.activeTeams} tone="signal" icon={<ScanLine className="size-3.5" />} hint="on route" />
        <StatTile label="Finished" value={s.finishedTeams} tone="ok" icon={<Flag className="size-3.5" />} />
        <StatTile label="Leader" value={s.leader?.name ?? "—"} tone="gold" icon={<Crown className="size-3.5" />} hint={s.leader ? `${s.leader.score} pts` : "no points yet"} className="[&_.hud-number]:text-lg" />
        <StatTile label="Top score" value={s.highestScore} tone="gold" icon={<Coins className="size-3.5" />} />
        <StatTile label="Accepted scans" value={s.acceptedScans} tone="ok" icon={<CheckCircle2 className="size-3.5" />} />
        <StatTile label="Rejected scans" value={s.rejectedScans} tone="danger" icon={<XCircle className="size-3.5" />} />
        <StatTile label="MAGNETs used" value={s.magnetActivations} tone="warn" icon={<Magnet className="size-3.5" />} />
        <StatTile label="BONUS" value={s.bonusRewards} tone="gold" icon={<Coins className="size-3.5" />} />
        <StatTile label="SUPER SHOES" value={s.superShoesRewards} tone="ok" icon={<Footprints className="size-3.5" />} />
      </div>

      {data.ledgerMismatches.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Score ≠ ledger for {data.ledgerMismatches.length} team(s)</AlertTitle>
          <AlertDescription>
            {data.ledgerMismatches.map((m) => `${m.team}: score ${m.score}, ledger ${m.ledger}`).join(" · ")}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section>
          <h2 className="mb-2 font-heading text-lg font-semibold">Live monitoring</h2>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead className="text-right">Pts</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.leaderboard.map((r) => (
                  <TableRow key={r.teamId}>
                    <TableCell className="hud-number">{r.rank}</TableCell>
                    <TableCell>
                      <Link href={`/admin/teams/${r.teamId}`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                    </TableCell>
                    <TableCell className="hud-number text-right font-semibold text-gold">{r.score}</TableCell>
                    <TableCell className="hud-number">
                      {r.completed}/{r.total}
                    </TableCell>
                    <TableCell className="text-xs">{r.status.replace("_", " ")}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatTime(r.lastActivityAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg font-semibold">Data validation</h2>
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/validation">Open report</Link>
              </Button>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.validation.summary.errors} errors · {data.validation.summary.warnings} warnings · {data.validation.summary.info} info
            </p>
            <ul className="mt-3 space-y-2">
              {data.validation.top.map((i, n) => (
                <li key={n} className="flex gap-2 text-xs">
                  <SeverityBadge severity={i.severity} />
                  <span>{i.message}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border p-4">
            <h2 className="font-heading text-lg font-semibold">Reported issues</h2>
            {data.openIssues.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">No open reports.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {data.openIssues.map((i) => (
                  <li key={i.id} className="flex items-start gap-2 rounded-lg bg-secondary/50 p-2 text-sm">
                    <div className="flex-1">
                      <div className="font-medium">
                        {i.team} <span className="text-xs text-muted-foreground">· {formatTime(i.at)}</span>
                      </div>
                      <div className="text-foreground/85">{i.message}</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => resolve(i.id)}>
                      Resolve
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section>
          <h2 className="mb-2 font-heading text-lg font-semibold">Recent scans</h2>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>QR</TableHead>
                  <TableHead>Internal reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentScans.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs text-muted-foreground">{formatTime(e.at)}</TableCell>
                    <TableCell>{e.team}</TableCell>
                    <TableCell>
                      <OutcomeText outcome={e.outcome} /> {e.isTest && <span className="text-[10px] text-warn">TEST</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {e.copyId ?? "—"}
                      {e.position ? ` @${e.position}` : ""}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {e.reason ?? ""}
                      {e.expectedPosition && e.outcome === "REJECTED" ? ` (expected #${e.expectedPosition})` : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
        <section>
          <h2 className="mb-2 font-heading text-lg font-semibold">Recent score transactions</h2>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Δ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentTransactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs text-muted-foreground">{formatTime(t.at)}</TableCell>
                    <TableCell>{t.team}</TableCell>
                    <TableCell className="text-xs">
                      {t.type}
                      {t.counterparty ? ` ↔ ${t.counterparty}` : ""}
                      {t.isTest && <span className="ml-1 text-[10px] text-warn">TEST</span>}
                    </TableCell>
                    <TableCell className={`hud-number text-right font-semibold ${t.delta < 0 ? "text-danger" : "text-gold"}`}>
                      {t.delta > 0 ? `+${t.delta}` : t.delta}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </div>
  );
}
