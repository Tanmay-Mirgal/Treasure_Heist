"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, Flag, Info, Magnet, OctagonX, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ActionType, ScanOutcome } from "@/lib/game/types";
import { ActionBadge, MissionCard } from "./bits";

export type ScanResultData = {
  outcome: ScanOutcome;
  message: string;
  scanId?: string | null;
  score?: number;
  isTest?: boolean;
  hintsGranted?: number;
  challengePrompt?: string;
  powerUp?: { id: string; type: "MAGNET"; status?: string } | null;
  checkpoint?: {
    position: number;
    total: number;
    actionType: ActionType;
    isFinal: boolean;
    clueText: string | null;
    pointsAwarded: number;
    rewardText: string;
  };
};

const LOOK: Record<ScanOutcome, { icon: typeof Info; tone: string; title: string }> = {
  ACCEPTED: { icon: CheckCircle2, tone: "text-ok border-ok/40 bg-ok/10", title: "Checkpoint secured" },
  AWAITING_ANSWER: { icon: Info, tone: "text-signal border-signal/40 bg-signal/10", title: "Challenge unlocked" },
  DUPLICATE: { icon: Info, tone: "text-signal border-signal/40 bg-signal/10", title: "Already secured" },
  REJECTED: { icon: OctagonX, tone: "text-danger border-danger/40 bg-danger/10", title: "Scan not recognised" },
  INACTIVE_QR: { icon: AlertTriangle, tone: "text-warn border-warn/40 bg-warn/10", title: "Checkpoint unavailable" },
  EVENT_CLOSED: { icon: Clock, tone: "text-warn border-warn/40 bg-warn/10", title: "Scanning closed" },
  ALREADY_FINISHED: { icon: Flag, tone: "text-gold border-gold/40 bg-gold/10", title: "Vault already opened" },
  RATE_LIMITED: { icon: Clock, tone: "text-warn border-warn/40 bg-warn/10", title: "Slow down" },
};

export function ScanResultView({ result, onScanAgain }: { result: ScanResultData; onScanAgain?: () => void }) {
  const finished = result.outcome === "ACCEPTED" && result.checkpoint?.isFinal;
  const look = finished ? { icon: Flag, tone: "text-gold border-gold/50 bg-gold/10", title: "VAULT OPENED" } : LOOK[result.outcome];
  const cp = result.checkpoint;
  const magnetReady = result.powerUp && (!result.powerUp.status || result.powerUp.status === "AVAILABLE");

  return (
    <div className="space-y-4" aria-live="polite">
      <div className={cn("rounded-2xl border p-5", look.tone)}>
        <div className="flex items-start gap-3">
          <look.icon className="mt-0.5 size-7 shrink-0" aria-hidden />
          <div className="min-w-0">
            <h2 className="font-heading text-xl font-semibold">{look.title}</h2>
            <p className="mt-1 text-sm text-foreground/90">{result.message}</p>
            {result.isTest && <p className="mt-1 text-xs font-semibold text-warn">TEST MODE — not an official score.</p>}
          </div>
        </div>
        {cp && result.outcome === "ACCEPTED" && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-current/20 pt-3 text-sm text-foreground">
            <span className="hud-number rounded-md bg-background/60 px-2 py-0.5 text-gold">+{cp.pointsAwarded}</span>
            <span>{cp.rewardText}</span>
            {cp.actionType !== "NORMAL" && <ActionBadge action={cp.actionType} />}
            {typeof result.score === "number" && <span className="ml-auto text-xs text-muted-foreground">Total: {result.score}</span>}
          </div>
        )}
        {!!result.hintsGranted && <p className="mt-2 text-sm text-ok">+{result.hintsGranted} hint added to your inventory.</p>}
      </div>

      {cp?.clueText && !finished && (
        <MissionCard
          eyebrow={`Clue from checkpoint ${cp.position} of ${cp.total}`}
          title={cp.position + 1 === cp.total ? "Final leg — find the vault" : `Next: checkpoint ${cp.position + 1}`}
          text={cp.clueText}
          action={cp.actionType}
          testMode={result.isTest}
        />
      )}
      {finished && cp?.clueText && (
        <MissionCard eyebrow="Final checkpoint" title="You cracked it" text={cp.clueText} action="FINISH" tone="gold" />
      )}

      <div className="grid gap-2">
        {magnetReady && (
          <Button asChild size="lg" className="h-12 bg-warn text-background hover:bg-warn/90">
            <Link href={`/play/magnet?id=${result.powerUp!.id}`}>
              <Magnet className="size-5" /> Use MAGNET now
            </Link>
          </Button>
        )}
        {result.outcome === "AWAITING_ANSWER" && (
          <Button asChild size="lg" className="h-12">
            <Link href="/play/mission">Answer the challenge</Link>
          </Button>
        )}
        {finished ? (
          <Button asChild size="lg" className="h-12">
            <Link href="/play/complete">
              <Flag className="size-5" /> Finish screen
            </Link>
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {onScanAgain ? (
              <Button size="lg" variant="outline" className="h-12" onClick={onScanAgain}>
                <ScanLine className="size-5" /> Scan again
              </Button>
            ) : (
              <Button asChild size="lg" variant="outline" className="h-12">
                <Link href="/play/scan">
                  <ScanLine className="size-5" /> Scan
                </Link>
              </Button>
            )}
            <Button asChild size="lg" variant="secondary" className="h-12">
              <Link href="/play/mission">Mission</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
