import { z } from "zod";
import { handle, ok, readJson, reasonField } from "@/lib/http";
import { actorOf, requireAdmin } from "@/lib/auth/guards";
import { resetTeamPassword } from "@/lib/services/admin-teams";

const Body = z.object({ password: z.string().min(4, "At least 4 characters.").max(200), reason: reasonField });

/** Reset a team's password; existing sessions for that team are revoked. */
export const POST = handle<RouteContext<"/api/admin/teams/[id]/password">>(async (req, ctx) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const body = await readJson(req, Body);
  await resetTeamPassword(actorOf(admin), id, body.password, body.reason);
  return ok({ reset: true });
});
