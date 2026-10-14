import { z } from "zod";
import { handle, ok, readJson, reasonField } from "@/lib/http";
import { actorOf, requireAdmin } from "@/lib/auth/guards";
import { simulateSequence, updateSequence } from "@/lib/services/admin-content";

type Ctx = RouteContext<"/api/admin/sequences/[id]">;

/** Dry-run simulation of a team's route (id = team id). */
export const GET = handle<Ctx>(async (req, ctx) => {
  await requireAdmin(req);
  const { id } = await ctx.params;
  return ok(await simulateSequence(id));
});

const Body = z
  .object({
    copyIds: z.array(z.string().trim().min(1).max(40)).min(1).max(100).optional(),
    startingClue: z
      .object({
        riddle: z.string().max(4000).optional(),
        location: z.string().max(200).optional(),
        answer: z.string().max(200).optional(),
      })
      .optional(),
    reason: reasonField,
  })
  .refine((b) => b.copyIds || b.startingClue, "Nothing to update.");

/** Edit a team's route and/or starting clue (id = team id). Completed positions are protected. */
export const PATCH = handle<Ctx>(async (req, ctx) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const { reason, ...input } = await readJson(req, Body);
  return ok(await updateSequence(actorOf(admin), id, input, reason));
});
