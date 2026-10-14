import type { Metadata } from "next";
import { ScoringClient } from "./scoring-client";

export const metadata: Metadata = { title: "Scoring configuration" };

export default function Page() {
  return <ScoringClient />;
}
