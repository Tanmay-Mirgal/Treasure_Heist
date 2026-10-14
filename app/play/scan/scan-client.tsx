"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { QrScanner } from "@/components/heist/qr-scanner";
import { ScanResultView, type ScanResultData } from "@/components/heist/scan-result";
import { useTeamState } from "@/components/heist/team-state";
import { api, ApiClientError } from "@/lib/client/api";

export function ScanClient() {
  const router = useRouter();
  const { state, refresh } = useTeamState();
  const [busy, setBusy] = useState(false);
  const [inline, setInline] = useState<ScanResultData | null>(null);

  const onDetected = useCallback(
    async (text: string, source: "CAMERA" | "MANUAL") => {
      setBusy(true);
      try {
        const res = await api<ScanResultData>("/api/qr/scan", { method: "POST", body: { input: text, source }, redirectOn401: "team" });
        void refresh();
        if (res.scanId) router.push(`/play/result?id=${res.scanId}`);
        else setInline(res);
      } catch (e) {
        const msg = e instanceof ApiClientError ? e.message : "Scan failed. Try again.";
        if (e instanceof ApiClientError && e.status === 429) setInline({ outcome: "RATE_LIMITED", message: msg });
        else toast.error(msg);
      } finally {
        setBusy(false);
      }
    },
    [refresh, router],
  );

  if (inline) return <ScanResultView result={inline} onScanAgain={() => setInline(null)} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-cyan-400">
            <span className="size-2 rounded-full bg-cyan-400 motion-safe:animate-ping" />
            TARGET ACQUISITION
          </div>
          <h1 className="mt-0.5 font-heading text-xl sm:text-2xl font-black tracking-tight text-white">Scan Checkpoint</h1>
        </div>
        {state && !state.progress.finished && (
          <div className="rounded-xl border border-cyan-400/30 bg-cyan-950/40 px-2.5 sm:px-3 py-1 text-right backdrop-blur-md shrink-0">
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-muted-foreground">TARGET</span>
            <div className="font-heading text-xs sm:text-sm font-black text-cyan-300">
              #{state.progress.currentMission} <span className="text-[10px] font-medium text-muted-foreground">of {state.progress.total}</span>
            </div>
          </div>
        )}
      </div>
      <QrScanner onDetected={onDetected} busy={busy} />
    </div>
  );
}
