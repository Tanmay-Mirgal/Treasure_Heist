import { handle, ok } from "@/lib/http";
import { requireTeamOrAdmin } from "@/lib/auth/guards";
import { getLeaderboard } from "@/lib/services/leaderboard";

/** Public aggregate scores for authenticated teams and organizers. */
export const GET = handle(async (req) => {
  const { team } = await requireTeamOrAdmin(req);
  const board = await getLeaderboard();
  const me = team ? String(team._id) : null;
  return ok({ ...board, rows: board.rows.map((r) => ({ ...r, isYou: r.teamId === me })) });
});
