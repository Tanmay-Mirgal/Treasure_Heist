import { handle, notFound, ok } from "@/lib/http";
import { requireTeam } from "@/lib/auth/guards";
import { getTeamState } from "@/lib/services/game";

/** Full dashboard state for the logged-in team only (never another team's). */
export const GET = handle(async (req) => {
  const team = await requireTeam(req);
  const state = await getTeamState(String(team._id));
  if (!state) throw notFound();
  return ok(state);
});
