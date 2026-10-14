import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError, handle, ok, readJson } from "@/lib/http";
import { requireTeam } from "@/lib/auth/guards";
import { processScan } from "@/lib/services/game";

const Body = z.object({
  input: z.string().trim().min(1, "Scan a QR code or enter its code.").max(512),
  source: z.enum(["CAMERA", "MANUAL", "LINK"]).default("CAMERA"),
});

/**
 * Validate a scanned QR (camera, deep link or typed code) against the
 * authenticated team's stored route. The team comes from the session only.
 */
export const POST = handle(async (req) => {
  const team = await requireTeam(req);
  const body = await readJson(req, Body);
  const correlationId = req.headers.get("x-request-id")?.slice(0, 64) || randomUUID();
  const result = await processScan({ teamId: String(team._id), raw: body.input, source: body.source, correlationId });
  if (result.outcome === "RATE_LIMITED") throw new ApiError(429, "RATE_LIMITED", result.message, { retryAfterMs: result.retryAfterMs });
  return ok(result);
});
