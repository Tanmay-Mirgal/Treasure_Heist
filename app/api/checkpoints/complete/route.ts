import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError, handle, ok, readJson } from "@/lib/http";
import { requireTeam } from "@/lib/auth/guards";
import { submitAnswer } from "@/lib/services/game";

const Body = z.object({ answer: z.string().trim().min(1, "Enter an answer.").max(200) });

/** Answer-gated checkpoints: the answer is checked on the server only. */
export const POST = handle(async (req) => {
  const team = await requireTeam(req);
  const { answer } = await readJson(req, Body);
  const result = await submitAnswer({ teamId: String(team._id), answer, correlationId: randomUUID() });
  if (result.outcome === "RATE_LIMITED") throw new ApiError(429, "RATE_LIMITED", result.message, { retryAfterMs: result.retryAfterMs });
  if (result.outcome === "ACCEPTED" || result.correct) {
    const { notifyRealtime } = await import("@/lib/server/notify");
    void notifyRealtime({ leaderboard: true, teamIds: [String(team._id)] });
  }
  return ok(result);
});
