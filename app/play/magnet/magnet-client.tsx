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
      <div className="rounded-2xl border border-warn/40 bg-warn/10 p-5">
        <div className="flex items-center gap-2 text-warn">
          <Magnet className="size-6" aria-hidden />
          <h1 className="font-heading text-2xl font-semibold">MAGNET</h1>
        </div>
        <p className="mt-2 text-sm text-foreground/90">
          Choose a rival team. They lose up to <strong>{max}</strong> points and your team gains exactly the same amount. A team can&apos;t
          drop below zero. This MAGNET works once and cannot be undone.
        </p>
      </div>

      {blocked && (
        <Alert>
          <AlertDescription>{blocked}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <fieldset disabled={Boolean(blocked) || busy} className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Select target team</legend>
        {!targets ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : (
          <div role="radiogroup" className="grid gap-2">
            {targets.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={targetId === t.id}
                onClick={() => setTargetId(t.id)}
                className={cn(
                  "flex items-center justify-between rounded-xl border bg-card p-3 text-left transition-colors hover:border-warn/50 disabled:opacity-50",
                  targetId === t.id && "border-warn bg-warn/10",
                )}
              >
                <span>
                  <span className="font-medium">{t.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{t.score} pts</span>
                </span>
                <span className={cn("text-xs font-semibold", t.transferable > 0 ? "text-warn" : "text-muted-foreground")}>
                  {t.transferable > 0 ? `pull ${t.transferable}` : "no points"}
                </span>
              </button>
            ))}
          </div>
        )}
      </fieldset>

      <Button
        size="lg"
        className="h-12 w-full bg-warn text-background hover:bg-warn/90"
        disabled={!selected || Boolean(blocked) || busy}
        onClick={() => selected && setConfirm({ key: newIdempotencyKey(), target: selected })}
      >
        <Magnet className="size-5" /> Review MAGNET
      </Button>

      <AlertDialog open={Boolean(confirm)} onOpenChange={(o) => !o && !busy && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Use MAGNET on {confirm?.target.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && confirm.target.transferable > 0
                ? `${confirm.target.name} loses ${confirm.target.transferable} point${confirm.target.transferable === 1 ? "" : "s"} and your team gains ${confirm.target.transferable}. The final amount is checked by the server at the moment of transfer.`
                : state.rules.magnet.consumeWhenTargetEmpty
                  ? `${confirm?.target.name} has no points. Your MAGNET will be used up with no transfer.`
                  : `${confirm?.target.name} has no points to pull. Choose another team.`}{" "}
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button onClick={activate} disabled={busy} className="bg-warn text-background hover:bg-warn/90">
              {busy && <Loader2 className="size-4 animate-spin" />} Confirm MAGNET
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
