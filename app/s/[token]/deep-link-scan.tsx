"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/heist/brand";
import { ScanResultView, type ScanResultData } from "@/components/heist/scan-result";
import { api, ApiClientError } from "@/lib/client/api";

export function DeepLinkScan({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const sent = useRef(false);
  const [result, setResult] = useState<ScanResultData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sent.current) return; // submit exactly once (React dev mode runs effects twice)
    sent.current = true;
    api<ScanResultData>("/api/qr/scan", { method: "POST", body: { input: token, source: "LINK" }, redirectOn401: "team" })
      .then((r) => {
        if (r.scanId) router.replace(`/play/result?id=${r.scanId}`);
        else setResult(r);
      })
      .catch((e) => {
        if (e instanceof ApiClientError && e.status === 401) return; // redirecting to login
        setError(e instanceof ApiClientError ? e.message : "Could not verify this checkpoint.");
      });
  }, [token, router]);

  return (
    <div className="space-y-6">
      <Wordmark />
      {result ? (
        <ScanResultView result={result} />
      ) : error ? (
        <div className="space-y-3 rounded-2xl border border-danger/40 bg-danger/10 p-5">
          <p className="text-sm">{error}</p>
          <Button asChild variant="outline">
            <Link href="/play">Back to base</Link>
          </Button>
        </div>
      ) : (
        <div className="grid place-items-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-signal" /> Verifying checkpoint…
        </div>
      )}
    </div>
  );
}
