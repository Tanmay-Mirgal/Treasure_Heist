import { z } from "zod";
import { handle, ok, readJson, reasonField } from "@/lib/http";
import { actorOf, requireAdmin } from "@/lib/auth/guards";
import {
  addAdminNote,
  adjustScore,
  clearAwaitingAnswer,
  messageTeam,
  resetTeamProgress,
  resetTeamScore,
  rollbackProgress,
  verifyNextCheckpoint,
} from "@/lib/services/admin-teams";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("verify-next"), reason: reasonField }),
  z.object({
    action: z.literal("adjust-score"),
    delta: z.number().int().min(-100).max(100).refine((d) => d !== 0, "Must not be zero."),
    reason: reasonField,
    notify: z.boolean().default(true),
  }),
  z.object({ action: z.literal("reset-score"), reason: reasonField }),
  z.object({ action: z.literal("reset-scan"), reason: reasonField }),
  z.object({ action: z.literal("rollback"), toPosition: z.number().int().min(0), reversePoints: z.boolean().default(true), reason: reasonField }),
  z.object({ action: z.literal("note"), text: z.string().trim().min(1).max(1000) }),
  z.object({ action: z.literal("message"), text: z.string().trim().min(1).max(500) }),
  z.object({ action: z.literal("reset-progress"), reason: reasonField }),
]);

/** Organizer interventions. Every one that changes progress or score requires a reason and is audited. */
export const POST = handle<RouteContext<"/api/admin/teams/[id]/recovery">>(async (req, ctx) => {
  const admin = await requireAdmin(req);
  const actor = actorOf(admin);
  const { id } = await ctx.params;
  const body = await readJson(req, Body);
  switch (body.action) {
    case "verify-next":
      return ok(await verifyNextCheckpoint(actor, id, body.reason));
    case "adjust-score":
      return ok(await adjustScore(actor, id, body.delta, body.reason, body.notify));
    case "reset-score":
      return ok(await resetTeamScore(actor, id, body.reason));
    case "reset-scan":
      await clearAwaitingAnswer(actor, id, body.reason);
      return ok({ reset: true });
    case "rollback":
      return ok(await rollbackProgress(actor, id, body.toPosition, body.reason, body.reversePoints));
    case "note":
      await addAdminNote(actor, id, body.text);
      return ok({ added: true });
    case "message":
      await messageTeam(actor, id, body.text);
      return ok({ sent: true });
    case "reset-progress":
      await resetTeamProgress(actor, id, body.reason);
      return ok({ reset: true });
  }
});
