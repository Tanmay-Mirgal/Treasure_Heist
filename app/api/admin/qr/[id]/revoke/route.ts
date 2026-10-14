import { z } from "zod";
import { handle, ok, readJson, reasonField } from "@/lib/http";
import { actorOf, requireAdmin } from "@/lib/auth/guards";
import { revokeQr } from "@/lib/services/admin-content";

const Body = z.object({ reason: reasonField });

/** Revoke a compromised/damaged QR: the old token and manual code stop working; print the new one. */
export const POST = handle<RouteContext<"/api/admin/qr/[id]/revoke">>(async (req, ctx) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const { reason } = await readJson(req, Body);
  await revokeQr(actorOf(admin), id, reason);
  return ok({ revoked: true });
});
