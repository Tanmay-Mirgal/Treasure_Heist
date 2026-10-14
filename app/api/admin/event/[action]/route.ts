import { z } from "zod";
import { ApiError, handle, ok, readJson } from "@/lib/http";
import { actorOf, requireAdmin } from "@/lib/auth/guards";
import { EVENT_ACTIONS, eventAction, type EventAction } from "@/lib/services/admin-event";

const Body = z.object({
  reason: z.string().trim().max(500).optional(),
  /** Required for destructive actions ("reset"): must equal "RESET". */
  confirm: z.string().optional(),
});

/** POST /api/admin/event/{start|pause|resume|end|freeze|unfreeze|test-mode-on|test-mode-off|reset} */
export const POST = handle<RouteContext<"/api/admin/event/[action]">>(async (req, ctx) => {
  const admin = await requireAdmin(req);
  const { action } = await ctx.params;
  if (!EVENT_ACTIONS.includes(action as EventAction)) throw new ApiError(404, "NOT_FOUND", "Unknown event action.");
  const body = await readJson(req, Body);
  if (action === "reset" && body.confirm !== "RESET")
    throw new ApiError(400, "CONFIRMATION_REQUIRED", 'Type RESET to confirm wiping all game data.');
  if ((action === "reset" || action === "end") && !body.reason?.trim())
    throw new ApiError(400, "BAD_REQUEST", "Please give a reason.");
  return ok(await eventAction(actorOf(admin), action as EventAction, body.reason?.trim() || null));
});
