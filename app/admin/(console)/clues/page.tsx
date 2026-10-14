import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { CluesClient } from "./clues-client";

export const metadata: Metadata = { title: "Clue manager" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <CluesClient />
    </Suspense>
  );
}
