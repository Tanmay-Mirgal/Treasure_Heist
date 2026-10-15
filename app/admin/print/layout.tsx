import { ensureAdminSession } from "@/lib/auth/server-guard";

export const instant = false;

export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await ensureAdminSession();
  return <>{children}</>;
}
