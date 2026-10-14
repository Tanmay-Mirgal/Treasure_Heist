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
      <div>
        <h1 className="font-heading text-2xl font-semibold">Scan checkpoint</h1>
        <p className="text-sm text-muted-foreground">
          {state && !state.progress.finished
            ? `Looking for checkpoint ${state.progress.currentMission} of ${state.progress.total}.`
            : "Point your camera at a checkpoint QR."}
        </p>
      </div>
      <QrScanner onDetected={onDetected} busy={busy} />
    </div>
  );
}
