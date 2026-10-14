import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ResultClient } from "./result-client";

export const metadata: Metadata = { title: "Scan result" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
      <ResultClient />
    </Suspense>
  );
}
