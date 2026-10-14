import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { MagnetClient } from "./magnet-client";

export const metadata: Metadata = { title: "MAGNET" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full rounded-2xl" />}>
      <MagnetClient />
    </Suspense>
  );
}
