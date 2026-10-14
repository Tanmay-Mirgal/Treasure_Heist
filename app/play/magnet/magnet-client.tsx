"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Magnet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/heist/bits";
import { useTeamState } from "@/components/heist/team-state";
import { api, ApiClientError, newIdempotencyKey } from "@/lib/client/api";
import { cn } from "@/lib/utils";

type Target = { id: string; name: string; number: number; score: number; transferable: number };
type Result = { status: "USED" | "WASTED"; amount: number; targetName: string; score: number; replayed: boolean };

export function MagnetClient() {
  const { state, refresh } = useTeamState();
  const wanted = useSearchParams().get("id");
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ key: string; target: Target } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    api<{ targets: Target[] }>("/api/powerups/magnet/targets", { signal: ctrl.signal, redirectOn401: "team" })
      .then((d) => setTargets(d.targets))
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setError(e instanceof ApiClientError ? e.message : "Could not load teams.");
      });
    return () => ctrl.abort();
  }, []);

  if (!state) return <Skeleton className="h-72 w-full rounded-2xl" />;
  const available = state.inventory.powerUps.filter((p) => p.type === "MAGNET" && p.status === "AVAILABLE");
  const activation = available.find((p) => p.id === wanted) ?? available[0];
  const max = state.rules.magnet.maxTransfer;

  if (result)
    return (
      <div className="space-y-4">
        <div className={cn("rounded-2xl border p-5", result.status === "USED" ? "border-ok/40 bg-ok/10" : "border-warn/40 bg-warn/10")}>
          <div className="flex items-start gap-3">
            <CheckCircle2 className={cn("size-7", result.status === "USED" ? "text-ok" : "text-warn")} />
            <div>
              <h1 className="font-heading text-xl font-semibold">{result.status === "USED" ? "MAGNET engaged" : "MAGNET came up empty"}</h1>
              <p className="mt-1 text-sm">
                {result.status === "USED"
                  ? `You pulled ${result.amount} point${result.amount === 1 ? "" : "s"} from ${result.targetName}. Your score is now ${result.score}.`
                  : `${result.targetName} had no points to pull, so the MAGNET was used up without a transfer.`}
              </p>
            </div>
          </div>
        </div>
        <Button asChild className="h-12 w-full">
          <Link href="/play">Back to base</Link>
        </Button>
      </div>
    );

  if (!activation)
    return (
      <EmptyState title="No MAGNET available" icon={<Magnet className="size-6" />}>
        Reach a MAGNET checkpoint to earn one. Each MAGNET can be used once.
        <div className="mt-4">
          <Button asChild variant="outline">
            <Link href="/play">Back to base</Link>
          </Button>
        </div>
      </EmptyState>
    );

  const blocked = !state.event.magnetEnabled
    ? "MAGNET is currently disabled by the organizers. It stays in your inventory."
    : !state.rules.scoringEnabled
      ? "Scoring is paused, so MAGNET can't be used right now."
      : state.event.status !== "RUNNING" && !(state.event.status === "SETUP" && state.event.testMode)
        ? "MAGNET can only be used while the heist is running."
        : null;

  async function activate() {
    if (!confirm || !activation) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<Result>("/api/powerups/magnet/activate", {
        method: "POST",
        body: { activationId: activation.id, targetTeamId: confirm.target.id, idempotencyKey: confirm.key },
        redirectOn401: "team",
      });
      setResult(r);
      setConfirm(null);
      void refresh();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "MAGNET failed. Try again.");
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  const selected = targets?.find((t) => t.id === targetId) ?? null;

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl border-2 border-orange-400 bg-gradient-to-br from-orange-500/25 via-slate-900 to-amber-500/15 p-6 shadow-2xl backdrop-blur-xl">
        <div className="absolute inset-x-0 top-0 h-1.5 subway-hazard" />
        <div className="flex items-center gap-3.5 pt-1 text-orange-400">
          <div className="grid size-14 place-items-center rounded-2xl bg-orange-500/30 border-2 border-orange-400 text-orange-200 shadow-[0_0_20px_rgba(251,146,60,0.6)]">
            <Magnet className="size-7 animate-pulse" aria-hidden />
          </div>
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-orange-300">★ SUBWAY POWER-UP ★</span>
            <h1 className="font-heading text-2xl font-black tracking-tight text-white">COIN MAGNET</h1>
          </div>
        </div>
        <p className="mt-3 text-sm font-bold leading-relaxed text-slate-200">
          Lock onto rival runner crews and suck up to <strong className="text-yellow-300 font-black">{max} COINS</strong> right onto your score! Rival crews cannot drop below 0 coins.
        </p>
      </div>

      {blocked && (
        <Alert className="border-2 border-orange-400/60 bg-orange-500/20 font-black text-orange-200">
          <AlertDescription>{blocked}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <fieldset disabled={Boolean(blocked) || busy} className="space-y-2">
        <legend className="mb-2 text-xs font-black uppercase tracking-wider text-slate-400">Select Target Runner Crew</legend>
        {!targets ? (
          <Skeleton className="h-44 w-full rounded-2xl" />
        ) : (
          <div role="radiogroup" className="grid gap-2.5">
            {targets.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={targetId === t.id}
                onClick={() => setTargetId(t.id)}
                className={cn(
                  "group flex items-center justify-between rounded-2xl border-2 p-4 text-left transition-all duration-150 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50",
                  targetId === t.id
                    ? "border-orange-400 bg-orange-500/25 shadow-[0_0_25px_rgba(251,146,60,0.4)] ring-2 ring-orange-400/40"
                    : "border-slate-800 bg-slate-900/90 hover:border-slate-700",
                )}
              >
                <div>
                  <span className="font-heading font-black text-white group-hover:text-orange-200 transition-colors text-base">{t.name}</span>
                  <span className="ml-2 font-mono text-xs font-black text-yellow-300">{t.score} COINS</span>
                </div>
                <span
                  className={cn(
                    "rounded-xl px-3 py-1 text-xs font-black uppercase tracking-wider",
                    t.transferable > 0
                      ? "bg-orange-500 text-slate-950 shadow-md"
                      : "bg-slate-800 text-slate-500",
                  )}
                >
                  {t.transferable > 0 ? `SIPHON ${t.transferable} ⚡` : "0 COINS"}
                </span>
              </button>
            ))}
          </div>
        )}
      </fieldset>

      <button
        disabled={!selected || Boolean(blocked) || busy}
        onClick={() => selected && setConfirm({ key: newIdempotencyKey(), target: selected })}
        className={cn(
          "subway-btn-orange h-14 w-full rounded-2xl font-heading text-base font-black tracking-wider uppercase flex items-center justify-center gap-2",
          (!selected || Boolean(blocked) || busy) && "opacity-50 cursor-not-allowed",
        )}
      >
        <Magnet className="size-6 mr-1" />
        <span>FIRE COIN MAGNET ON {selected?.name ?? "TARGET"} ⚡</span>
      </button>

      <AlertDialog open={Boolean(confirm)} onOpenChange={(o) => !o && !busy && setConfirm(null)}>
        <AlertDialogContent className="rounded-3xl border-2 border-slate-700 bg-slate-950/95 backdrop-blur-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-xl font-black text-white">Engage Magnet on {confirm?.target.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-300 font-medium">
              {confirm && confirm.target.transferable > 0
                ? `${confirm.target.name} loses ${confirm.target.transferable} coin${confirm.target.transferable === 1 ? "" : "s"} and your crew bags them instantly! This cannot be undone.`
                : state.rules.magnet.consumeWhenTargetEmpty
                  ? `${confirm?.target.name} has no coins. Your MAGNET will be consumed without loot.`
                  : `${confirm?.target.name} has no coins to pull. Pick another crew!`}{" "}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} className="rounded-xl font-bold">Cancel</AlertDialogCancel>
            <button onClick={activate} disabled={busy} className="subway-btn-orange rounded-xl px-5 py-2 font-heading font-black uppercase tracking-wider">
              {busy && <Loader2 className="size-4 animate-spin mr-1 inline" />} UNLEASH MAGNET ⚡
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
