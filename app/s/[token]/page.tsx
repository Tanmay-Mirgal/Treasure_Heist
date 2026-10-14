import type { Metadata } from "next";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { DeepLinkScan } from "./deep-link-scan";

export const metadata: Metadata = { title: "Checkpoint", robots: { index: false, follow: false } };

/**
 * Printed QR codes encode /s/<token>. Opening one (with the phone camera app
 * or the in-app scanner) submits it through the same validated scan API.
 */
export default function Page({ params }: PageProps<"/s/[token]">) {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6">
      <Suspense
        fallback={
          <div className="grid place-items-center gap-2 py-20 text-sm text-muted-foreground">
            <Loader2 className="size-8 animate-spin text-signal" /> Verifying checkpoint…
          </div>
        }
      >
        <DeepLinkScan params={params} />
      </Suspense>
    </main>
  );
}
