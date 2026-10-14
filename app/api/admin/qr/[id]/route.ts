import { appBaseUrl, handle, ok, readJson } from "@/lib/http";
import { actorOf, requireAdmin } from "@/lib/auth/guards";
import { getQr, updateQr } from "@/lib/services/admin-content";
import { QrPatchSchema } from "@/lib/schemas/qr";

type Ctx = RouteContext<"/api/admin/qr/[id]">;

export const GET = handle<Ctx>(async (req, ctx) => {
  await requireAdmin(req);
  const { id } = await ctx.params;
  return ok(await getQr(id, appBaseUrl(req)));
});

/** Edit clue / placement / status / mode of one QR checkpoint (audited). */
export const PATCH = handle<Ctx>(async (req, ctx) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const { reason, ...patch } = await readJson(req, QrPatchSchema);
  return ok(await updateQr(actorOf(admin), id, patch, reason));
});
