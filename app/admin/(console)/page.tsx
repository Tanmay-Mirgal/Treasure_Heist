import type { Metadata } from "next";
import { OverviewClient } from "./overview-client";

export const metadata: Metadata = { title: "Control room" };

export default function Page() {
  return <OverviewClient />;
}
