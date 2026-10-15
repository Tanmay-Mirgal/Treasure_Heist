"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Flag, KeyRound, Lightbulb, Loader2, ScanLine, Timer, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { MissionCard } from "@/components/heist/bits";
import { useTeamState } from "@/components/heist/team-state";
import { useRealtimeTimer } from "@/hooks/use-realtime-timer";
import type { ScanResultData } from "@/components/heist/scan-result";
import { api, ApiClientError } from "@/lib/client/api";

export function MissionClient() {
  const { state, refresh } = useTeamState();
  const timer = useRealtimeTimer(state?.event.timer ? { ...state.event.timer, status: state.event.status } : undefined);
  const router = useRouter();
  const [hintBusy, setHintBusy] = useState(false);
  const [answer, setAnswer] = useState("");
  const [answerBusy, setAnswerBusy] = useState(false);
  const [answerMsg, setAnswerMsg] = useState<string | null>(null);

  if (!state) return <Skeleton className="h-72 w-full rounded-2xl" />;
  const { mission, progress, inventory, event } = state;
  const isTimeUp = timer.isTimeUp || event.status === "ENDED" || Boolean(event.timer.enabled && event.timer.expired);

  async function spendHintNow() {
    setHintBusy(true);
    try {
      await api("/api/team/hint", { method: "POST" });
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "Could not use a hint.");
    } finally {
      setHintBusy(false);
    }
  }

  async function submitAnswer(e: FormEvent) {
    e.preventDefault();
    setAnswerBusy(true);
    setAnswerMsg(null);
    try {
      const res = await api<ScanResultData & { correct: boolean }>("/api/checkpoints/complete", { method: "POST", body: { answer } });
      if (res.correct && res.scanId) {
        await refresh();
        router.push(`/play/result?id=${res.scanId}`);
        return;
      }
      setAnswerMsg(res.message);
      if (res.correct) await refresh();
    } catch (err) {
      setAnswerMsg(err instanceof ApiClientError ? err.message : "Could not submit the answer.");
    } finally {
      setAnswerBusy(false);
    }
  }

  const nextStationNum = mission.nextStationNumber ?? progress.nextStation ?? (progress.completed + 1);
  const currentStationNum = mission.stationNumber ?? (mission.isStaged ? progress.activeStation : progress.completed);

  const eyebrow =
    mission.kind === "START"
      ? "Starting Clue"
      : mission.kind === "ANSWER"
        ? "Checkpoint Challenge"
        : mission.kind === "FINISHED"
          ? "Mission Complete"
          : mission.isStaged
            ? `Active Question — Station ${currentStationNum ?? 1}`
            : `Clue from checkpoint ${progress.completed}`;

  return (
    <div className="space-y-4">
      {/* TIME'S UP BANNER */}
      {isTimeUp && (
        <div className="relative overflow-hidden rounded-3xl border-3 border-amber-400 bg-gradient-to-b from-amber-500/30 via-slate-900/95 to-slate-950 p-6 text-center shadow-[0_0_40px_rgba(245,158,11,0.5)]">
          <div className="absolute inset-x-0 top-0 h-2 subway-hazard animate-pulse" />
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border-2 border-amber-400 bg-amber-400/20 text-amber-300 shadow-[0_0_20px_rgba(250,204,21,0.6)]">
            <Timer className="size-7 animate-bounce" />
          </div>
          <h2 className="mt-3 font-heading text-3xl sm:text-4xl font-black tracking-tight text-amber-300 drop-shadow-[0_2px_12px_rgba(250,204,21,0.8)]">
            TIME&apos;S UP!
          </h2>
          <p className="mt-2 text-sm sm:text-base font-bold text-slate-200 max-w-md mx-auto">
            The event timer has expired and the heist has officially terminated. Station checkpoints are closed and no further challenge answers or scans are accepted.
          </p>
          <div className="mt-5 flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" className="subway-btn-gold h-14 rounded-2xl px-6 font-heading font-black text-sm uppercase">
              <Link href="/leaderboard">
                <Trophy className="size-5 mr-2" /> View Final Leaderboard 🏆
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-14 rounded-2xl px-6 font-heading font-bold text-sm uppercase border-slate-700 hover:bg-slate-800">
              <Link href="/play">
                Return to Team Base
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* Active Question Intel Banner */}
      {mission.isStaged && !isTimeUp && (
        <div className="relative overflow-hidden rounded-3xl border-2 border-yellow-400/80 bg-gradient-to-r from-yellow-500/20 via-slate-900 to-amber-500/20 p-4 shadow-[0_0_25px_rgba(250,204,21,0.3)] backdrop-blur-xl">
          <div className="absolute inset-x-0 top-0 h-1 subway-hazard" />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex size-2.5 rounded-full bg-yellow-400 motion-safe:animate-ping" />
              <span className="font-heading text-xs font-black uppercase tracking-wider text-yellow-300">
                ★ ACTIVE STATION QUESTION ★
              </span>
            </div>
            <span className="rounded-full border border-yellow-400/60 bg-yellow-400/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-yellow-300">
              UNSOLVED
            </span>
          </div>

          <div className="mt-2.5 rounded-2xl border border-yellow-400/30 bg-black/40 p-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs font-bold text-slate-300">
              <span className="text-white">
                🎯 Target: <span className="font-black text-cyan-400">Station #{nextStationNum}</span>
              </span>
              <span className="text-yellow-300 font-black">
                💰 Bounty: +{mission.pendingPoints ?? 1} Coins on verification
              </span>
            </div>
            <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-400">
              Solve the riddle below to find Station #{nextStationNum}. Points for Station #{currentStationNum} will be unlocked only when Station #{nextStationNum} is verified!
            </p>
          </div>
        </div>
      )}

      {mission.kind === "START" && (
        <div className="relative overflow-hidden rounded-3xl border-2 border-yellow-400/80 bg-gradient-to-r from-yellow-500/20 via-slate-900 to-amber-500/10 p-4 shadow-[0_0_25px_rgba(250,204,21,0.3)] backdrop-blur-xl">
          <div className="absolute inset-x-0 top-0 h-1 subway-hazard" />
          <div className="flex items-center justify-between gap-2">
            <span className="font-heading text-xs font-black uppercase tracking-wider text-yellow-300">
              ⚡ MISSION BRIEFING
            </span>
            <span className="rounded-full border border-yellow-400/60 bg-yellow-400/20 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-yellow-300">
              AWAITING SCAN
            </span>
          </div>
          <p className="mt-1 text-xs font-bold text-slate-300">
            Your mission intel is locked. Locate and scan <span className="text-yellow-300 font-black">Station #1 QR code</span> to receive your first riddle!
          </p>
        </div>
      )}

      <MissionCard
        eyebrow={eyebrow}
        title={mission.title}
        text={mission.text}
        action={mission.kind === "CLUE" ? mission.lastAction : null}
        testMode={event.testMode}
        tone={mission.kind === "FINISHED" ? "gold" : mission.isStaged ? "gold" : "signal"}
      />

      {mission.kind === "ANSWER" && (
        <form onSubmit={submitAnswer} className="relative overflow-hidden space-y-3 rounded-3xl border-2 border-cyan-400 bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-slate-950 p-5 shadow-2xl backdrop-blur-xl">
          <div className="absolute inset-x-0 top-0 h-1.5 subway-hazard" />
          <Label htmlFor="answer" className="pt-1 flex items-center gap-2 font-heading text-sm font-black tracking-wide text-cyan-300">
            <KeyRound className="size-4 text-cyan-400" /> ENTER STATION PASSKEY
          </Label>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <Input
              id="answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              maxLength={200}
              placeholder="Type your answer here…"
              className="h-13 border-2 border-slate-700 bg-slate-950/80 font-mono text-base font-bold tracking-wider focus-visible:ring-cyan-400 text-white flex-1"
              autoComplete="off"
            />
            <button
              type="submit"
              className="subway-btn-cyan h-13 px-6 w-full sm:w-auto rounded-2xl font-heading font-black tracking-wider uppercase transition-all"
              disabled={answerBusy || !answer.trim()}
            >
              {answerBusy ? <Loader2 className="size-5 animate-spin" /> : "SUBMIT PASSKEY"}
            </button>
          </div>
          {answerMsg && (
            <p className="rounded-xl border border-orange-400/50 bg-orange-500/20 p-2.5 text-sm font-black text-orange-200" role="status">
              {answerMsg}
            </p>
          )}
          <p className="text-xs font-semibold text-slate-400">Server authoritative verification. Multiple wrong guesses trigger rate-limiting.</p>
        </form>
      )}

      {/* Hint section — only show once a clue is actually active (not on empty START) */}
      {(mission.kind === "CLUE") && (
        <section className="relative overflow-hidden rounded-3xl border-2 border-amber-400/50 bg-gradient-to-b from-slate-900/95 via-slate-900/85 to-slate-950 p-5 shadow-xl backdrop-blur-xl" aria-labelledby="hint-h">
          <div className="flex items-center justify-between gap-3">
            <h2 id="hint-h" className="flex items-center gap-2 font-heading text-sm font-black uppercase tracking-wider text-amber-300">
              <span className="text-base">📦</span> Mystery Box Intel & Hints
            </h2>
            <span className="rounded-full border border-amber-400/50 bg-amber-400/20 px-2.5 py-0.5 text-xs font-black text-amber-300">
              {inventory.hintsAvailable} READY
            </span>
          </div>

          {mission.hint.used && mission.hint.text ? (
            <div className="mt-3.5 rounded-2xl border-2 border-amber-400/50 bg-amber-500/15 p-4 shadow-[0_0_20px_rgba(245,158,11,0.25)]">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-300">
                <span>★ INTEL DECRYPTED ★</span>
              </div>
              <p className="clue-text text-[15px] font-bold leading-relaxed text-amber-100">{mission.hint.text}</p>
            </div>
          ) : inventory.hintsAvailable > 0 ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="subway-btn-dark mt-3.5 h-12 w-full rounded-2xl font-heading text-sm font-black text-amber-300 border border-amber-400/40 uppercase tracking-wider flex items-center justify-center gap-2" disabled={hintBusy}>
                  {hintBusy && <Loader2 className="size-4 animate-spin mr-1" />}
                  <span>📦 OPEN MYSTERY BOX (USE 1 HINT)</span>
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-3xl border-2 border-slate-700 bg-slate-950/95 backdrop-blur-xl">
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-heading text-xl font-black text-white">Deploy 1 Mystery Hint?</AlertDialogTitle>
                  <AlertDialogDescription className="text-slate-300 font-medium">
                    You have <span className="font-black text-amber-400">{inventory.hintsAvailable}</span> mystery hints in inventory. Unlocking one reveals strategic coordinates for this station clue.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-xl font-bold">Save for later</AlertDialogCancel>
                  <AlertDialogAction onClick={spendHintNow} className="subway-btn-gold rounded-xl font-black tracking-wider uppercase">
                    UNLOCK NOW 📦
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <p className="mt-3 text-xs font-bold text-slate-400">Out of hints. Collect SUPER SNEAKERS at bonus stations to grab more hints!</p>
          )}
        </section>
      )}

      {isTimeUp ? (
        <Link
          href="/leaderboard"
          className="subway-btn-gold h-15 w-full rounded-2xl flex items-center justify-center gap-2.5 px-3 font-heading text-xs sm:text-base font-black tracking-wider uppercase text-center shadow-[0_4px_25px_rgba(245,158,11,0.6)]"
        >
          <Trophy className="size-5 sm:size-6 stroke-[2.5] shrink-0" />
          <span>VIEW FINAL LEADERBOARD 🏆</span>
        </Link>
      ) : !progress.finished ? (
        <Link
          href="/play/scan"
          className="subway-btn-gold h-15 w-full rounded-2xl flex items-center justify-center gap-2.5 px-3 font-heading text-xs sm:text-base font-black tracking-wider uppercase text-center shadow-[0_4px_25px_rgba(245,158,11,0.6)] transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <ScanLine className="size-5 sm:size-6 stroke-[3] shrink-0" />
          <span className="truncate">
            {mission.isStaged
              ? `FOUND STATION #${nextStationNum}? SCAN QR TO VERIFY 🛹`
              : `SCAN STATION #${nextStationNum} QR 🛹`}
          </span>
        </Link>
      ) : (
        <Link
          href="/play/complete"
          className="subway-btn-gold h-14 w-full rounded-2xl flex items-center justify-center gap-2 px-3 font-heading text-sm sm:text-base font-black tracking-wider uppercase text-center"
        >
          <Flag className="size-5 stroke-[2.5]" />
          <span>VIEW FINISH SCREEN</span>
        </Link>
      )}
    </div>
  );
}
