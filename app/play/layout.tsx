import { TeamShell } from "@/components/heist/team-shell";
import { ensureTeamSession } from "@/lib/auth/server-guard";

export const instant = false;

export default async function PlayLayout({ children }: LayoutProps<"/play">) {
  await ensureTeamSession();
  return <TeamShell>{children}</TeamShell>;
}
