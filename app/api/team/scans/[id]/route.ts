import { handle, notFound, ok } from "@/lib/http";
import { requireTeam } from "@/lib/auth/guards";
import { getScanResult } from "@/lib/services/game";

/** A scan result belonging to the logged-in team (other teams' scans are not found). */
export const GET = handle<RouteContext<"/api/team/scans/[id]">>(async (req, ctx) => {
  const team = await requireTeam(req);
  const { id } = await ctx.params;
  const result = await getScanResult(String(team._id), id);
  if (!result) throw notFound("Scan not found.");
  return ok(result);
});
