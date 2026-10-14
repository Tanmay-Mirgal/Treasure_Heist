import { TeamShell } from "@/components/heist/team-shell";

export default function PlayLayout({ children }: LayoutProps<"/play">) {
  return <TeamShell>{children}</TeamShell>;
}
