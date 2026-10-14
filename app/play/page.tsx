import type { Metadata } from "next";
import { TeamDashboard } from "./team-dashboard";

export const metadata: Metadata = { title: "Team base" };

export default function Page() {
  return <TeamDashboard />;
}
