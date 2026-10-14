import type { Metadata } from "next";
import { SequencesClient } from "./sequences-client";

export const metadata: Metadata = { title: "Sequence manager" };

export default function Page() {
  return <SequencesClient />;
}
