import type { Metadata } from "next";
import { TeamsClient } from "./teams-client";

export const metadata: Metadata = { title: "Teams" };

export default function Page() {
  return <TeamsClient />;
}
