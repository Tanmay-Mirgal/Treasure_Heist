import { handle, ok } from "@/lib/http";
import { requireTeam } from "@/lib/auth/guards";
import { magnetTargets } from "@/lib/services/powerups";

export const GET = handle(async (req) => {
  const team = await requireTeam(req);
  return ok({ targets: await magnetTargets(String(team._id)) });
});
