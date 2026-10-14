import type { Metadata } from "next";
import { MissionClient } from "./mission-client";

export const metadata: Metadata = { title: "Current mission" };

export default function Page() {
  return <MissionClient />;
}
