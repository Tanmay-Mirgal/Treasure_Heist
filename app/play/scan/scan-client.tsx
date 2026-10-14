"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Camera, CheckCircle2, Map, OctagonX, RefreshCw, ScanLine, Sparkles } from "lucide-react";
import { QrScanner } from "@/components/heist/qr-scanner";
import type { ScanResultData } from "@/components/heist/scan-result";
import { useTeamState } from "@/components/heist/team-state";
import { api, ApiClientError } from "@/lib/client/api";

export function ScanClient() {
  const { state, refresh } = useTeamState();
  const [busy, setBusy] = useState(false);
  const [scannedResult, setScannedResult] = useState<ScanResultData | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const onDetected = useCallback(
    async (text: string, source: "CAMERA" | "MANUAL") => {
      setBusy(true);
      setScanError(null);
      try {
        const res = await api<ScanResultData>("/api/qr/scan", {
          method: "POST",
          body: { input: text, source },
          redirectOn401: "team",
        });

        await refresh();

        if (res.outcome === "ACCEPTED" || res.outcome === "DUPLICATE") {
          setScannedResult(res);
          setScanError(null);
          if (res.outcome === "ACCEPTED") {
            toast.success("Station verified! Riddle unlocked below.");
          } else {
            toast.info(res.message);
          }
        } else if (res.outcome === "REJECTED") {
          setScanError("WRONG QR! This QR code does not belong to your team or is not your next station.");
          setScannedResult(null);
          toast.error("WRONG QR CODE!");
        } else {
          setScanError(res.message || "WRONG QR! Please check your riddle and try again.");
          setScannedResult(null);
          toast.error(res.message || "Scan rejected.");
        }
      } catch (e) {
        const msg = e instanceof ApiClientError ? e.message : "WRONG QR! Could not verify checkpoint.";
        setScanError(msg.includes("429") || msg.toLowerCase().includes("rate") ? msg : `WRONG QR! ${msg}`);
        setScannedResult(null);
        toast.error(msg);
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const targetStation = state?.progress.nextStation ?? state?.progress.currentMission ?? 1;
  const isVerifying = Boolean(state?.mission.isStaged);

  return (
    <div className="space-y-4">
      {/* Target Station Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-cyan-400">
            <span className="size-2 rounded-full bg-cyan-400 motion-safe:animate-ping" />
            {isVerifying ? "STATION VERIFICATION" : "TARGET ACQUISITION"}
          </div>
          <h1 className="mt-0.5 font-heading text-xl sm:text-2xl font-black tracking-tight text-white">
            {isVerifying ? `Verify Station #${targetStation}` : "Scan Station QR"}
          </h1>
        </div>
        {state && !state.progress.finished && (
          <div className="rounded-xl border border-cyan-400/30 bg-cyan-950/40 px-2.5 sm:px-3 py-1 text-right backdrop-blur-md shrink-0">
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {isVerifying ? "VERIFYING" : "TARGET"}
            </span>
            <div className="font-heading text-xs sm:text-sm font-black text-cyan-300">
              #{targetStation} <span className="text-[10px] font-medium text-muted-foreground">of {state.progress.total}</span>
            </div>
          </div>
        )}
      </div>

      {/* Camera QR Scanner */}
      <QrScanner onDetected={onDetected} busy={busy} showManual={false} />

      {/* 1. WRONG QR ERROR ALERT */}
      {scanError && (
        <div
          role="alert"
          className="relative overflow-hidden rounded-3xl border-2 border-rose-500 bg-gradient-to-b from-rose-500/25 via-slate-900/95 to-slate-950 p-5 shadow-[0_0_30px_rgba(244,63,94,0.4)] backdrop-blur-xl"
        >
          <div className="absolute inset-x-0 top-0 h-1.5 subway-hazard" />
          <div className="flex items-start gap-3 pt-1">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-rose-500/20 border border-rose-400/50">
              <OctagonX className="size-6 text-rose-400 stroke-[2.5]" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-heading text-lg font-black tracking-wide text-rose-300">
                ❌ WRONG QR CODE!
              </h2>
              <p className="mt-1 text-xs sm:text-sm font-bold text-slate-200 leading-relaxed">
                {scanError}
              </p>
              <p className="mt-2 text-[11px] font-medium text-rose-300/80">
                Tip: Follow your active riddle below to find your team&apos;s assigned station QR.
              </p>
            </div>
          </div>
          <button
            onClick={() => setScanError(null)}
            className="subway-btn-dark mt-3.5 h-11 w-full rounded-xl font-heading text-xs font-black uppercase tracking-wider text-slate-200 border border-slate-700 flex items-center justify-center gap-2"
          >
            <RefreshCw className="size-3.5" /> DISMISS & SCAN AGAIN
          </button>
        </div>
      )}

      {/* 2. SUCCESSFUL SCAN: RIDDLE DISPLAYED DIRECTLY BELOW SCANNER */}
      {scannedResult?.checkpoint && (
        <div className="relative overflow-hidden rounded-3xl border-2 border-yellow-400 bg-gradient-to-b from-yellow-500/20 via-slate-900/95 to-slate-950 p-5 shadow-[0_0_35px_rgba(250,204,21,0.35)] backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="absolute inset-x-0 top-0 h-1.5 subway-hazard" />

          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <span className="flex size-2.5 rounded-full bg-yellow-400 motion-safe:animate-ping" />
              <span className="font-heading text-xs font-black uppercase tracking-wider text-yellow-300">
                ★ STATION #{scannedResult.checkpoint.position} SCANNED SUCCESSFULLY ★
              </span>
            </div>
            <span className="rounded-full border border-yellow-400 bg-yellow-400/20 px-2 py-0.5 text-[10px] font-black uppercase text-yellow-300">
              LATEST RIDDLE
            </span>
          </div>

          {/* Reward Notification Banner */}
          {scannedResult.checkpoint.pointsAwarded > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-2xl bg-gradient-to-r from-yellow-400/25 to-amber-500/20 p-3 text-xs font-black text-yellow-200 border-2 border-yellow-400/50 shadow-md">
              <span className="hud-number rounded-lg bg-yellow-400 px-2 py-0.5 text-slate-950 font-black">
                +{scannedResult.checkpoint.pointsAwarded} COINS
              </span>
              <span>Points awarded for previous station! Check your loot.</span>
            </div>
          )}

          {/* UNLOCKED RIDDLE BOX */}
          <div className="mt-3.5 rounded-2xl border-2 border-yellow-400/40 bg-black/60 p-4 shadow-inner">
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-yellow-400">
              <Sparkles className="size-3.5 text-yellow-400" />
              <span>STATION #{scannedResult.checkpoint.position} RIDDLE & INTEL</span>
            </div>
            <p className="clue-text mt-2 text-[15px] sm:text-base font-bold leading-relaxed text-yellow-100">
              {scannedResult.checkpoint.clueText || "No clue text found for this station."}
            </p>
          </div>

          <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
            <CheckCircle2 className="size-3.5 text-emerald-400 shrink-0" />
            <span>This riddle is automatically saved in your Mission (INTEL) tab.</span>
          </div>

          {/* Action CTAs */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Link
              href="/play/mission"
              className="subway-btn-gold h-13 rounded-2xl font-heading text-xs sm:text-sm font-black flex items-center justify-center gap-2 uppercase tracking-wider text-center"
            >
              <Map className="size-4" /> OPEN IN MISSION (INTEL)
            </Link>
            <button
              onClick={() => {
                setScannedResult(null);
                setScanError(null);
              }}
              className="subway-btn-cyan h-13 rounded-2xl font-heading text-xs sm:text-sm font-black flex items-center justify-center gap-2 uppercase tracking-wider text-center"
            >
              <ScanLine className="size-4" /> SCAN NEXT QR 🛹
            </button>
          </div>
        </div>
      )}

      {/* 3. CURRENT ACTIVE RIDDLE (IF IDLE AND NOT CURRENTLY SHOWING A NEW SCAN) */}
      {!scannedResult && !scanError && state && !state.progress.finished && (
        <div className="relative overflow-hidden rounded-3xl border-2 border-slate-700 bg-gradient-to-b from-slate-900/90 to-slate-950 p-4 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400">
            <span className="uppercase tracking-wider font-heading text-yellow-400 flex items-center gap-1.5">
              <Map className="size-3.5 text-yellow-400" /> ACTIVE MISSION RIDDLE
            </span>
            <span className="text-[10px] uppercase font-black text-cyan-300">
              TARGET: STATION #{targetStation}
            </span>
          </div>
          <div className="mt-2 rounded-2xl border border-slate-700/80 bg-black/40 p-3.5">
            <p className="clue-text text-sm font-bold leading-relaxed text-slate-200">
              {state.mission.text}
            </p>
          </div>
          <p className="mt-2 text-[11px] font-semibold text-slate-400 text-center">
            Point your camera at Station #{targetStation} QR to verify and claim coins!
          </p>
        </div>
      )}
    </div>
  );
}
