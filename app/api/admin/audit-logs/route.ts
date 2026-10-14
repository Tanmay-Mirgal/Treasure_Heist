import { handle, ok } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/guards";
import { listAudit } from "@/lib/services/admin-event";

export const GET = handle(async (req) => {
  await requireAdmin(req);
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(200, Math.max(10, Number(sp.get("pageSize")) || 50));
  return ok(
    await listAudit({ page, pageSize, action: sp.get("action") || undefined, entityType: sp.get("entityType") || undefined }),
  );
});
