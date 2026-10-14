import { handle, ok } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/guards";
import { listScans } from "@/lib/services/admin-event";
import { SCAN_OUTCOMES } from "@/lib/game/types";

export const GET = handle(async (req) => {
  await requireAdmin(req);
  const sp = req.nextUrl.searchParams;
  const outcome = sp.get("outcome");
  return ok({
    scans: await listScans({
      limit: Math.min(500, Math.max(10, Number(sp.get("limit")) || 100)),
      outcome: outcome && (SCAN_OUTCOMES as readonly string[]).includes(outcome) ? outcome : undefined,
      teamId: sp.get("team") || undefined,
    }),
  });
});
