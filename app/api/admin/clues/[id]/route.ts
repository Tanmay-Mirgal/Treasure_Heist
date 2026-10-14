import { handle, ok, readJson } from "@/lib/http";
import { actorOf, requireAdmin } from "@/lib/auth/guards";
import { updateQr } from "@/lib/services/admin-content";
import { QrPatchSchema } from "@/lib/schemas/qr";

/** Alias of PATCH /api/admin/qr/:id for the clue editor. */
export const PATCH = handle<RouteContext<"/api/admin/clues/[id]">>(async (req, ctx) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const { reason, ...patch } = await readJson(req, QrPatchSchema);
  return ok(await updateQr(actorOf(admin), id, patch, reason));
});
