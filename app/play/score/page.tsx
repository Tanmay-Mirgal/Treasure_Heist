import type { Metadata } from "next";
import { ScoreClient } from "./score-client";

export const metadata: Metadata = { title: "My score" };

export default function Page() {
  return <ScoreClient />;
}
