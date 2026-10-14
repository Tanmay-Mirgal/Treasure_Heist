"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Lightbulb, Loader2, ScanLine } from "lucide-react";
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
        <form onSubmit={submitAnswer} className="space-y-2 rounded-2xl border bg-card p-4">
          <Label htmlFor="answer" className="flex items-center gap-2">
            <KeyRound className="size-4 text-signal" /> Your answer
          </Label>
          <div className="flex gap-2">
            <Input id="answer" value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={200} className="h-11 text-base" autoComplete="off" />
            <Button type="submit" className="h-11" disabled={answerBusy || !answer.trim()}>
              {answerBusy ? <Loader2 className="size-4 animate-spin" /> : "Submit"}
            </Button>
          </div>
          {answerMsg && <p className="text-sm text-warn" role="status">{answerMsg}</p>}
          <p className="text-xs text-muted-foreground">Answers are checked by the server. Repeated wrong answers are rate-limited.</p>
        </form>
      )}

      {(mission.kind === "START" || mission.kind === "CLUE") && (
        <section className="rounded-2xl border bg-card/70 p-4" aria-labelledby="hint-h">
          <div className="flex items-center justify-between gap-3">
            <h2 id="hint-h" className="flex items-center gap-2 font-medium">
              <Lightbulb className="size-4 text-gold" /> Hint
            </h2>
            <span className="text-xs text-muted-foreground">{inventory.hintsAvailable} available</span>
          </div>
          {mission.hint.used && mission.hint.text ? (
            <p className="clue-text mt-2 rounded-lg bg-gold/10 p-3 text-sm text-gold">{mission.hint.text}</p>
          ) : inventory.hintsAvailable > 0 ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="mt-3 w-full" disabled={hintBusy}>
                  {hintBusy && <Loader2 className="size-4 animate-spin" />} Use a hint for this clue
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Spend a hint?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You have {inventory.hintsAvailable}. Using one reveals extra help for this clue only. If no hint exists for this clue, nothing is spent.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction onClick={spendHintNow}>Use hint</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No hints in your inventory. SUPER SHOES checkpoints may grant one.</p>
          )}
        </section>
      )}

      {!progress.finished ? (
        <Button asChild size="lg" className="h-12 w-full text-base font-semibold">
          <Link href="/play/scan">
            <ScanLine className="size-5" /> Found it? Scan the QR
          </Link>
        </Button>
      ) : (
        <Button asChild size="lg" className="h-12 w-full">
          <Link href="/play/complete">View finish</Link>
        </Button>
      )}
    </div>
  );
}
