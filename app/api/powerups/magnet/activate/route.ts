import { z } from "zod";
import { handle, objectId, ok, readJson } from "@/lib/http";
import { requireTeam } from "@/lib/auth/guards";
import { activateMagnet } from "@/lib/services/powerups";

const Body = z.object({
  activationId: objectId,
  targetTeamId: objectId,
  idempotencyKey: z.string().min(8).max(100),
});

/** Single-use MAGNET transfer. The amount is decided on the server, never by the client. */
export const POST = handle(async (req) => {
  const team = await requireTeam(req);
  const body = await readJson(req, Body);
  const result = await activateMagnet({ teamId: String(team._id), ...body });
  return ok(result);
});
