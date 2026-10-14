import type { Metadata } from "next";
import { ScansClient } from "./scans-client";

export const metadata: Metadata = { title: "Scan monitor" };

export default function Page() {
  return <ScansClient />;
}
