import { z } from "zod";
import { handle, ok, readJson } from "@/lib/http";
import { actorOf, requireAdmin } from "@/lib/auth/guards";
import { teamDetail, updateTeam } from "@/lib/services/admin-teams";

type Ctx = RouteContext<"/api/admin/teams/[id]">;

export const GET = handle<Ctx>(async (req, ctx) => {
  await requireAdmin(req);
  const { id } = await ctx.params;
  return ok(await teamDetail(id));
});

const Body = z
  .object({
    displayName: z.string().trim().min(2).max(60).optional(),
    status: z.enum(["ACTIVE", "DISABLED"]).optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((b) => b.displayName !== undefined || b.status !== undefined, "Nothing to update.");

export const PATCH = handle<Ctx>(async (req, ctx) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const { reason, ...patch } = await readJson(req, Body);
  await updateTeam(actorOf(admin), id, patch, reason ?? null);
  return ok({ updated: true });
});
