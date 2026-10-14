import { handle, ok } from "@/lib/http";
import { requireTeam } from "@/lib/auth/guards";
import { spendHint } from "@/lib/services/game";

/** Spend one hint on the current mission (idempotent per mission). */
export const POST = handle(async (req) => {
  const team = await requireTeam(req);
  const result = await spendHint(String(team._id));
  const { notifyRealtime } = await import("@/lib/server/notify");
  void notifyRealtime({ leaderboard: false, teamIds: [String(team._id)] });
  return ok(result);
});
