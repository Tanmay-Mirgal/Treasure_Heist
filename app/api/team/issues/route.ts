import { z } from "zod";
import { ApiError, handle, ok, readJson } from "@/lib/http";
import { requireTeam } from "@/lib/auth/guards";
import { IssueReport } from "@/lib/models";
import { getSettings } from "@/lib/services/settings";
import { LIMITS, hitRateLimit } from "@/lib/services/ratelimit";

const Body = z.object({ message: z.string().trim().min(3, "Describe the issue in a few words.").max(1000) });

/** "Report an issue" from the participant help dialog. */
export const POST = handle(async (req) => {
  const team = await requireTeam(req);
  const { message } = await readJson(req, Body);
  const rl = await hitRateLimit(`issue:${team._id}`, LIMITS.issue.limit, LIMITS.issue.windowMs);
  if (!rl.allowed) throw new ApiError(429, "RATE_LIMITED", "You have sent several reports already. An organizer will contact you.");
  const settings = await getSettings();
  await IssueReport.create({ team: team._id, message, isTest: settings.status === "SETUP" });
  return ok({ received: true }, { status: 201 });
});
