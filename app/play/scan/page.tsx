import type { Metadata } from "next";
import { ScanClient } from "./scan-client";

export const metadata: Metadata = { title: "Scan QR" };

export default function Page() {
  return <ScanClient />;
}
