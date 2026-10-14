import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamDetailClient } from "./team-detail-client";

export const metadata: Metadata = { title: "Team detail" };

export default function Page({ params }: PageProps<"/admin/teams/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <TeamDetailClient params={params} />
    </Suspense>
  );
}
