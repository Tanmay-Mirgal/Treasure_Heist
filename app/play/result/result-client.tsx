"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/heist/bits";
import { ScanResultView, type ScanResultData } from "@/components/heist/scan-result";
import { api, ApiClientError } from "@/lib/client/api";

/** Server-stored scan result, so the outcome survives a page refresh. */
export function ResultClient() {
  const id = useSearchParams().get("id");
  const [data, setData] = useState<ScanResultData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const ctrl = new AbortController();
    api<ScanResultData>(`/api/team/scans/${encodeURIComponent(id)}`, { signal: ctrl.signal, redirectOn401: "team" })
      .then(setData)
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setError(e instanceof ApiClientError ? e.message : "Could not load this scan.");
      });
    return () => ctrl.abort();
  }, [id]);

  if (!id || error)
    return (
      <EmptyState title="No scan to show">
        {error ?? "Scan a checkpoint first."}
        <div className="mt-4">
          <Button asChild>
            <Link href="/play/scan">Open scanner</Link>
          </Button>
        </div>
      </EmptyState>
    );
  if (!data) return <Skeleton className="h-64 w-full rounded-2xl" />;
  return <ScanResultView result={data} />;
}
