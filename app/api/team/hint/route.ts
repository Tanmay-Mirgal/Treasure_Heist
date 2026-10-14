import { handle, ok } from "@/lib/http";
import { requireTeam } from "@/lib/auth/guards";
import { spendHint } from "@/lib/services/game";

/** Spend one hint on the current mission (idempotent per mission). */
export const POST = handle(async (req) => {
  const team = await requireTeam(req);
  return ok(await spendHint(String(team._id)));
});
