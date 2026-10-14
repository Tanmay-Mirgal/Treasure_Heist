import type { Metadata } from "next";
import { CompleteClient } from "./complete-client";

export const metadata: Metadata = { title: "Vault opened" };

export default function Page() {
  return <CompleteClient />;
}
