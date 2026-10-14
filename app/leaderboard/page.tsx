import type { Metadata } from "next";
import { LeaderboardClient } from "./leaderboard-client";

export const metadata: Metadata = { title: "Leaderboard" };

export default function Page() {
  return <LeaderboardClient />;
}
