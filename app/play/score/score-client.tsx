"use client";

import { Bell, Coins, Footprints, Lightbulb, Magnet, MapPin, ShieldAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState, StatTile, TrackDivider, formatTime } from "@/components/heist/bits";
import { api } from "@/lib/client/api";
import { usePoll } from "@/hooks/use-poll";
import { cn } from "@/lib/utils";

type Score = {
  team: { name: string; number: number };
  score: number;
  consistent: boolean;
  completed: number;
  total: number;
  remaining: number;
  finishedAt: string | null;
  breakdown: Record<string, { count: number; points: number }>;
  deductions: number;
  hints: { available: number; used: number };
  powerUps: { id: string; type: string; status: string; amount: number; grantedAt: string; activatedAt: string | null; targetName: string | null }[];
  recent: { id: string; type: string; label: string; delta: number; balanceAfter: number; position: number | null; at: string; reason: string | null; counterpartyName: string | null }[];
  notifications: { id: string; type: string; message: string; read: boolean; createdAt: string }[];
  rules: {
    scoringEnabled: boolean;
    points: { normal: number; bonus: number; superShoes: number; magnetCheckpoint: number; magnetTransfer: number; finish: number };
    superShoes: { mode: "HINT" | "SCORE_ONLY"; hintsGranted: number };
    magnet: { enabled: boolean; maxTransfer: number };
  };
};

const ROWS: { key: string; label: string; icon: typeof Coins }[] = [
  { key: "CHECKPOINT", label: "Normal checkpoints", icon: MapPin },
  { key: "BONUS", label: "BONUS rewards", icon: Coins },
  { key: "SUPER_SHOES", label: "SUPER SHOES rewards", icon: Footprints },
  { key: "MAGNET_CHECKPOINT", label: "MAGNET checkpoints", icon: Magnet },
  { key: "MAGNET_GAIN", label: "MAGNET transfers (gained)", icon: Magnet },
  { key: "MAGNET_LOSS", label: "MAGNET transfers (lost)", icon: ShieldAlert },
  { key: "FINISH", label: "Finish checkpoint", icon: MapPin },
  { key: "ADMIN_ADJUSTMENT", label: "Organizer corrections", icon: ShieldAlert },
  { key: "ADMIN_REVERSAL", label: "Organizer reversals", icon: ShieldAlert },
];

const sign = (n: number) => (n > 0 ? `+${n}` : String(n));

export function ScoreClient() {
  const { data, loading } = usePoll<Score>((signal) => api<Score>("/api/team/score", { signal, redirectOn401: "team" }), 15_000);
  if (loading && !data) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (!data) return <EmptyState title="Score unavailable">Check your connection and try again.</EmptyState>;
  const r = data.rules;

  return (
    <div className="space-y-5">
      {/* Team Loot Header */}
      <div className="relative overflow-hidden rounded-3xl border-2 border-amber-400 bg-gradient-to-b from-slate-900/95 via-slate-900/85 to-slate-950 p-6 shadow-2xl backdrop-blur-xl">
        <div className="absolute inset-x-0 top-0 h-1.5 subway-hazard" />
        <div className="flex items-center justify-between gap-3 pt-1">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-400">
              <Coins className="size-3.5 text-amber-400 drop-shadow" />
              ★ RUNNER&apos;S LOOT VAULT ★
            </div>
            <h1 className="mt-1 font-heading text-2xl font-black tracking-tight text-white">{data.team.name}</h1>
          </div>
          <div className="rounded-2xl border-2 border-amber-400/60 bg-gradient-to-b from-amber-400/20 to-amber-500/10 px-5 py-2.5 text-right shadow-[0_2px_18px_rgba(245,158,11,0.35)]">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-300">TOTAL COINS</span>
            <div className="hud-number font-heading text-3xl font-black text-amber-300 drop-shadow-[0_2px_10px_rgba(245,158,11,0.6)]">
              {data.score}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <StatTile label="Stations Cleared" value={`${data.completed}/${data.total}`} tone="ok" hint={`${data.remaining} to finish line`} />
        <StatTile label="Deductions" value={data.deductions} tone={data.deductions < 0 ? "danger" : "muted"} hint="Penalties or rival siphons" />
      </div>

      <section aria-labelledby="breakdown">
        <h2 id="breakdown" className="mb-2 font-heading text-lg font-semibold">Score breakdown</h2>
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Activity</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">Points</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROWS.filter((row) => data.breakdown[row.key] || ["CHECKPOINT", "BONUS", "SUPER_SHOES", "MAGNET_GAIN", "MAGNET_LOSS"].includes(row.key)).map((row) => {
                const b = data.breakdown[row.key] ?? { count: 0, points: 0 };
                return (
                  <TableRow key={row.key}>
                    <TableCell className="flex items-center gap-2">
                      <row.icon className="size-3.5 text-muted-foreground" /> {row.label}
                    </TableCell>
                    <TableCell className="hud-number text-right">{b.count}</TableCell>
                    <TableCell className={cn("hud-number text-right font-semibold", b.points < 0 ? "text-danger" : b.points > 0 ? "text-gold" : "")}>
                      {sign(b.points)}
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow>
                <TableCell className="font-semibold">Total</TableCell>
                <TableCell />
                <TableCell className="hud-number text-right font-bold text-gold">{data.score}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </section>

      <section aria-labelledby="rules">
        <h2 id="rules" className="mb-2 font-heading text-lg font-semibold">Scoring rules</h2>
        {!r.scoringEnabled && (
          <Alert className="mb-2">
            <AlertDescription>Scoring is currently paused by the organizers.</AlertDescription>
          </Alert>
        )}
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableBody>
              <TableRow>
                <TableCell>Normal checkpoint</TableCell>
                <TableCell className="hud-number text-right">{sign(r.points.normal)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>BONUS checkpoint</TableCell>
                <TableCell className="hud-number text-right">{sign(r.points.bonus)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  SUPER SHOES checkpoint
                  {r.superShoes.mode === "HINT" && r.superShoes.hintsGranted > 0 && (
                    <span className="block text-xs text-muted-foreground">+ {r.superShoes.hintsGranted} extra hint</span>
                  )}
                </TableCell>
                <TableCell className="hud-number text-right">{sign(r.points.superShoes)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  MAGNET transfer
                  <span className="block text-xs text-muted-foreground">to activator, taken from the target (never below 0)</span>
                </TableCell>
                <TableCell className="hud-number text-right">
                  +{r.magnet.maxTransfer} / −{r.magnet.maxTransfer}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Finish checkpoint</TableCell>
                <TableCell className="hud-number text-right">{sign(r.points.finish)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </section>

      <section aria-labelledby="inventory" className="grid grid-cols-2 gap-2">
        <h2 id="inventory" className="sr-only">Inventory</h2>
        <StatTile label="Hints available" value={data.hints.available} tone="signal" icon={<Lightbulb className="size-3.5" />} hint={`${data.hints.used} used`} />
        <StatTile
          label="MAGNETs"
          value={data.powerUps.filter((p) => p.status === "AVAILABLE").length}
          tone="warn"
          icon={<Magnet className="size-3.5" />}
          hint={`${data.powerUps.filter((p) => p.status !== "AVAILABLE").length} used`}
        />
      </section>
      {data.powerUps.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {data.powerUps.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-lg border bg-card/60 px-3 py-2">
              <span className="flex items-center gap-2">
                <Magnet className="size-4 text-warn" /> MAGNET
              </span>
              <span className="text-xs text-muted-foreground">
                {p.status === "AVAILABLE"
                  ? "Ready to use"
                  : p.status === "USED"
                    ? `Pulled ${p.amount} from ${p.targetName ?? "a rival"}`
                    : p.status === "WASTED"
                      ? `Used on ${p.targetName ?? "a rival"} — no points to pull`
                      : "Voided by organizer"}
              </span>
            </li>
          ))}
        </ul>
      )}

      <TrackDivider />

      <section aria-labelledby="activity">
        <h2 id="activity" className="mb-2 font-heading text-lg font-semibold">Recent activity</h2>
        {data.recent.length === 0 ? (
          <EmptyState title="No points yet">Secure your first checkpoint to get on the board.</EmptyState>
        ) : (
          <ul className="divide-y rounded-xl border">
            {data.recent.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <span className={cn("hud-number w-10 text-right font-semibold", t.delta < 0 ? "text-danger" : "text-gold")}>{sign(t.delta)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {t.label}
                    {t.position ? ` · checkpoint ${t.position}` : ""}
                    {t.counterpartyName ? ` · ${t.type === "MAGNET_GAIN" ? "from" : "by"} ${t.counterpartyName}` : ""}
                  </span>
                  {t.reason && <span className="block truncate text-xs text-muted-foreground">{t.reason}</span>}
                </span>
                <span className="text-xs text-muted-foreground">{formatTime(t.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="notes">
        <h2 id="notes" className="mb-2 flex items-center gap-2 font-heading text-lg font-semibold">
          <Bell className="size-4" /> Notifications
        </h2>
        {data.notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notifications.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.notifications.map((n) => (
              <li key={n.id} className={cn("rounded-lg border px-3 py-2 text-sm", n.type === "MAGNET_HIT" && "border-warn/40 bg-warn/5")}>
                <div>{n.message}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{formatTime(n.createdAt)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
