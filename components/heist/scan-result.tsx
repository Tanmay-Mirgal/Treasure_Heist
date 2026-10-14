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
  ACCEPTED: { icon: CheckCircle2, tone: "text-emerald-300 border-2 border-emerald-400 bg-gradient-to-br from-emerald-500/25 via-slate-900 to-emerald-500/10 shadow-[0_0_35px_rgba(52,211,153,0.35)]", title: "STATION CLEARED! 🛹" },
  AWAITING_ANSWER: { icon: Info, tone: "text-cyan-300 border-2 border-cyan-400 bg-gradient-to-br from-cyan-500/25 via-slate-900 to-cyan-500/10 shadow-[0_0_35px_rgba(34,211,238,0.35)]", title: "CHALLENGE UNLOCKED" },
  DUPLICATE: { icon: Info, tone: "text-cyan-300 border-2 border-cyan-400/50 bg-gradient-to-br from-cyan-500/20 via-slate-900 to-transparent shadow-md", title: "ALREADY CLEARED" },
  REJECTED: { icon: OctagonX, tone: "text-rose-300 border-2 border-rose-500 bg-gradient-to-br from-rose-500/25 via-slate-900 to-rose-500/10 shadow-[0_0_35px_rgba(244,63,94,0.35)]", title: "QR NOT RECOGNISED" },
  INACTIVE_QR: { icon: AlertTriangle, tone: "text-amber-300 border-2 border-amber-400/60 bg-gradient-to-br from-amber-500/20 via-slate-900 to-transparent shadow-md", title: "STATION OFFLINE" },
  EVENT_CLOSED: { icon: Clock, tone: "text-amber-300 border-2 border-amber-400/60 bg-gradient-to-br from-amber-500/20 via-slate-900 to-transparent shadow-md", title: "RAILS SUSPENDED" },
  ALREADY_FINISHED: { icon: Flag, tone: "text-amber-300 border-2 border-amber-400 bg-gradient-to-br from-amber-500/30 via-slate-900 to-amber-500/10 shadow-[0_0_40px_rgba(245,158,11,0.4)]", title: "VAULT ALREADY CRACKED" },
  RATE_LIMITED: { icon: Clock, tone: "text-amber-300 border-2 border-amber-400/60 bg-gradient-to-br from-amber-500/20 via-slate-900 to-transparent shadow-md", title: "COOLDOWN ACTIVE" },
};

export function ScanResultView({ result, onScanAgain }: { result: ScanResultData; onScanAgain?: () => void }) {
  const finished = result.outcome === "ACCEPTED" && result.checkpoint?.isFinal;
  const look = finished ? { icon: Flag, tone: "text-amber-300 border-2 border-amber-400 bg-gradient-to-br from-amber-500/35 via-slate-900 to-amber-500/15 shadow-[0_0_45px_rgba(245,158,11,0.5)]", title: "★ VAULT BREACHED! ★" } : LOOK[result.outcome];
  const cp = result.checkpoint;
  const magnetReady = result.powerUp && (!result.powerUp.status || result.powerUp.status === "AVAILABLE");

  return (
    <div className="space-y-4" aria-live="polite">
      <div className={cn("relative overflow-hidden rounded-3xl p-6 backdrop-blur-xl transition-all", look.tone)}>
        <div className="absolute inset-x-0 top-0 h-1.5 subway-hazard" />
        
        <div className="flex items-start gap-4 pt-1">
          <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-black/50 border border-white/20 shadow-inner">
            <look.icon className="size-8 stroke-[2.5]" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-2xl font-black tracking-wide text-white">{look.title}</h2>
            <p className="mt-1 text-sm font-bold leading-relaxed text-slate-200">{result.message}</p>
          </div>
        </div>

        {cp && result.outcome === "ACCEPTED" && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t-2 border-white/10 pt-4">
            <div className="flex items-center gap-2.5">
              <span className="hud-number rounded-xl border border-yellow-300 bg-yellow-400 px-3 py-1 font-heading text-lg font-black text-slate-950 shadow-[0_2px_12px_rgba(250,204,21,0.6)]">
                +{cp.pointsAwarded} COINS
              </span>
              <span className="text-sm font-black text-white uppercase tracking-wider">{cp.rewardText}</span>
            </div>
            <div className="flex items-center gap-2">
              {cp.actionType !== "NORMAL" && <ActionBadge action={cp.actionType} />}
              {typeof result.score === "number" && (
                <span className="rounded-xl border border-white/20 bg-black/50 px-2.5 py-1 font-mono text-xs font-black text-yellow-300">
                  Total: {result.score} Coins
                </span>
              )}
            </div>
          </div>
        )}

        {!!result.hintsGranted && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-500/20 p-2.5 text-xs font-black text-emerald-300 border border-emerald-400/40">
            <span>👟 +{result.hintsGranted} Mystery Clue added to inventory!</span>
          </div>
        )}
      </div>

      {cp?.clueText && !finished && (
        <MissionCard
          eyebrow={`Unlocked from Station ${cp.position} of ${cp.total}`}
          title={cp.position + 1 === cp.total ? "Final Leg — Discover The Vault" : `Next Up: Station #${cp.position + 1}`}
          text={cp.clueText}
          action={cp.actionType}
          testMode={result.isTest}
        />
      )}

      {finished && cp?.clueText && (
        <MissionCard eyebrow="Vault Breached" title="Mission Complete" text={cp.clueText} action="FINISH" tone="gold" />
      )}

      <div className="grid gap-3">
        {magnetReady && (
          <Link
            href={`/play/magnet?id=${result.powerUp!.id}`}
            className="subway-btn-orange h-14 rounded-2xl flex items-center justify-center gap-2 font-heading text-base font-black tracking-wider uppercase"
          >
            <Magnet className="size-6 mr-1" />
            <span>FIRE COIN MAGNET POWER-UP NOW ⚡</span>
          </Link>
        )}

        {result.outcome === "AWAITING_ANSWER" && (
          <Link
            href="/play/mission"
            className="subway-btn-cyan h-14 rounded-2xl flex items-center justify-center gap-2 font-heading text-base font-black tracking-wider uppercase"
          >
            <span>CRACK THE STATION PASSKEY →</span>
          </Link>
        )}

        {finished ? (
          <Link
            href="/play/complete"
            className="subway-btn-gold h-14 rounded-2xl flex items-center justify-center gap-2 font-heading text-base font-black tracking-wider uppercase"
          >
            <Flag className="size-5 mr-1" />
            <span>VIEW FINISH SCREEN 🏆</span>
          </Link>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {onScanAgain ? (
              <button
                className="subway-btn-cyan h-13 rounded-2xl flex items-center justify-center gap-2 font-heading text-sm font-black uppercase tracking-wider"
                onClick={onScanAgain}
              >
                <ScanLine className="size-5 mr-1" /> Scan Again
              </button>
            ) : (
              <Link
                href="/play/scan"
                className="subway-btn-cyan h-13 rounded-2xl flex items-center justify-center gap-2 font-heading text-sm font-black uppercase tracking-wider"
              >
                <ScanLine className="size-5 mr-1" /> Scan QR
              </Link>
            )}
            <Link
              href="/play/mission"
              className="subway-btn-gold h-13 rounded-2xl flex items-center justify-center gap-2 font-heading text-sm font-black uppercase tracking-wider"
            >
              <span>View Intel →</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
