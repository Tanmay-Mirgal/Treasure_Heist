"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Trophy, Timer, ArrowRight, ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useRealtimeTimer } from "@/hooks/use-realtime-timer";

export function TimesUpModal({ timerState }: { timerState?: { enabled: boolean; durationMs: number | null; remainingMs: number | null; running: boolean; expired: boolean; status?: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const timer = useRealtimeTimer(timerState);
  const [open, setOpen] = useState(false);
  const [hasShown, setHasShown] = useState(false);

  // Trigger modal simultaneously across all connected applications when timer expires or event ends
  useEffect(() => {
    if (timer.isTimeUp && !hasShown) {
      setOpen(true);
      setHasShown(true);
    }
  }, [timer.isTimeUp, hasShown]);

  function handleOkay() {
    setOpen(false);
    // Directly display the leaderboard as requested
    if (pathname !== "/leaderboard") {
      router.push("/leaderboard");
    }
  }

  if (!timer.isTimeUp && !open) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="max-w-md overflow-hidden rounded-3xl border-3 border-amber-400 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 p-6 sm:p-8 text-center shadow-[0_0_60px_rgba(245,158,11,0.6)] backdrop-blur-2xl"
      >
        {/* Top Animated Hazard Tape */}
        <div className="absolute inset-x-0 top-0 h-2 subway-hazard animate-pulse" />

        <div className="mx-auto mt-2 flex size-18 items-center justify-center rounded-3xl border-2 border-amber-400 bg-amber-400/20 text-amber-300 shadow-[0_0_25px_rgba(250,204,21,0.7)]">
          <Timer className="size-9 animate-bounce" />
        </div>

        <DialogHeader className="pt-2 text-center">
          <div className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-yellow-400/50 bg-yellow-400/15 px-3 py-0.5 text-[10px] font-black uppercase tracking-widest text-yellow-300">
            <span>🛑 HEIST GATES SEALED</span>
          </div>
          <DialogTitle className="mt-2 text-center font-heading text-3xl sm:text-4xl font-black tracking-tight text-amber-300 drop-shadow-[0_2px_16px_rgba(250,204,21,0.9)]">
            TIMES UP!
          </DialogTitle>
          <DialogDescription className="mt-2 text-center text-sm sm:text-base font-bold text-slate-200">
            The event timer has expired and the heist has officially terminated. Checkpoint stations and railway tracks are now closed. No further scans can be done.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6 flex flex-col gap-2.5">
          <Button
            onClick={handleOkay}
            size="lg"
            className="subway-btn-gold h-14 w-full rounded-2xl font-heading text-base font-black uppercase tracking-wider shadow-[0_4px_25px_rgba(250,204,21,0.6)] flex items-center justify-center gap-2"
          >
            <span>OKAY — VIEW LEADERBOARD 🏆</span>
            <ArrowRight className="size-5 stroke-[3]" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
