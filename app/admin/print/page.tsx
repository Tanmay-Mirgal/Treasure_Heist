import type { Metadata } from "next";
import { Suspense } from "react";
import { PrintClient } from "./print-client";

export const metadata: Metadata = { title: "Print QR codes" };

/** Outside the console layout so the sheet prints without navigation chrome. */
export default function Page() {
  return (
    <Suspense>
      <PrintClient />
    </Suspense>
  );
}
