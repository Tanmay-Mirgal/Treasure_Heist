import { handle } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/guards";
import { exportTeamsCsv } from "@/lib/services/admin-teams";

/** CSV export of teams (never includes passwords or hashes). */
export const GET = handle(async (req) => {
  await requireAdmin(req);
  const csv = await exportTeamsCsv();
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="heist-teams-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
