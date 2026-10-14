import { handle, ok } from "@/lib/http";
import { actorOf, requireAdmin } from "@/lib/auth/guards";
import { resolveIssue } from "@/lib/services/admin-event";

/** Mark a participant-reported issue as resolved. */
export const POST = handle<RouteContext<"/api/admin/issues/[id]">>(async (req, ctx) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  await resolveIssue(actorOf(admin), id);
  return ok({ resolved: true });
});
