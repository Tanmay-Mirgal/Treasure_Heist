"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Flag, KeyRound, Lightbulb, Loader2, ScanLine } from "lucide-react";
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
import type { ScanResultData } from "@/components/heist/scan-result";
import { api, ApiClientError } from "@/lib/client/api";

export function MissionClient() {
  const { state, refresh } = useTeamState();
  const router = useRouter();
  const [hintBusy, setHintBusy] = useState(false);
  const [answer, setAnswer] = useState("");
  const [answerBusy, setAnswerBusy] = useState(false);
  const [answerMsg, setAnswerMsg] = useState<string | null>(null);

  if (!state) return <Skeleton className="h-72 w-full rounded-2xl" />;
  const { mission, progress, inventory, event } = state;

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

  const eyebrow =
    mission.kind === "START"
      ? "Starting clue"
      : mission.kind === "ANSWER"
        ? "Checkpoint challenge"
        : mission.kind === "FINISHED"
          ? "Mission complete"
          : `Clue from checkpoint ${progress.completed}`;

  return (
    <div className="space-y-4">
      <MissionCard
        eyebrow={eyebrow}
        title={mission.title}
        text={mission.text}
        action={mission.kind === "CLUE" ? mission.lastAction : null}
        testMode={event.testMode}
        tone={mission.kind === "FINISHED" ? "gold" : "signal"}
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

      {(mission.kind === "START" || mission.kind === "CLUE") && (
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

      {!progress.finished ? (
        <Link
          href="/play/scan"
          className="subway-btn-gold h-14 w-full rounded-2xl flex items-center justify-center gap-2 px-3 font-heading text-xs sm:text-base font-black tracking-wider uppercase text-center"
        >
          <ScanLine className="size-5 sm:size-6 stroke-[3] shrink-0" />
          <span className="truncate">FOUND THE STATION? SCAN QR 🛹</span>
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
