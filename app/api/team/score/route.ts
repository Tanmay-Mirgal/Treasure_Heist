import { handle, notFound, ok } from "@/lib/http";
import { requireTeam } from "@/lib/auth/guards";
import { getScoreSummary } from "@/lib/services/leaderboard";
import { getSettings, rulesOf } from "@/lib/services/settings";
import { publicRules } from "@/lib/services/game";

export const GET = handle(async (req) => {
  const team = await requireTeam(req);
  const [summary, settings] = await Promise.all([getScoreSummary(String(team._id)), getSettings()]);
  if (!summary) throw notFound();
  return ok({ ...summary, rules: publicRules(rulesOf(settings), settings.scoringEnabled) });
});
