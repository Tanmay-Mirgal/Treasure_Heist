import { AdminShell } from "@/components/heist/admin-shell";
import { ensureAdminSession } from "@/lib/auth/server-guard";

export const instant = false;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await ensureAdminSession();
  return <AdminShell>{children}</AdminShell>;
}
