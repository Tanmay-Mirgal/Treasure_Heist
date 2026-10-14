import { z } from "zod";
import { getEnv } from "@/lib/env";
import { ApiError, clientIp, handle, ok, readJson } from "@/lib/http";
import { Team } from "@/lib/models";
import { ready } from "@/lib/services/bootstrap";
import { burnPasswordCheck, verifyPassword } from "@/lib/auth/password";
import { TEAM_COOKIE, sessionCookieOptions, signSession } from "@/lib/auth/session";
import { LIMITS, clearRateLimit, hitRateLimit, peekRateLimit } from "@/lib/services/ratelimit";

const Body = z.object({
  username: z.string().trim().min(1, "Enter your team username.").max(40),
  password: z.string().min(1, "Enter your password.").max(200),
});

export const POST = handle(async (req) => {
  const body = await readJson(req, Body);
  await ready();
  const key = `login:team:${body.username.toLowerCase()}:${clientIp(req)}`;
  const rl = await peekRateLimit(key, LIMITS.login.limit, LIMITS.login.windowMs);
  if (!rl.allowed)
    throw new ApiError(429, "RATE_LIMITED", `Too many failed attempts. Try again in ${Math.ceil(rl.retryAfterMs / 60000)} minute(s).`);

  const team = await Team.findOne({ usernameLower: body.username.toLowerCase() }).select("+passwordHash").lean();
  let valid = false;
  if (team) valid = await verifyPassword(body.password, team.passwordHash);
  else await burnPasswordCheck(body.password);
  if (!team || !valid) {
    await hitRateLimit(key, LIMITS.login.limit, LIMITS.login.windowMs);
    throw new ApiError(401, "INVALID_CREDENTIALS", "Incorrect username or password.");
  }
  if (team.status !== "ACTIVE") throw new ApiError(403, "TEAM_DISABLED", "This team account is disabled. Contact the Event Desk.");

  await clearRateLimit(key);
  await Team.updateOne({ _id: team._id }, { $set: { lastLoginAt: new Date() } });
  const env = getEnv();
  const token = await signSession({ sub: String(team._id), role: "team", sv: team.sessionVersion }, env.SESSION_SECRET, env.SESSION_TTL_HOURS);
  const res = ok({ team: { id: String(team._id), name: team.displayName, username: team.username, number: team.teamNumber } });
  res.cookies.set(TEAM_COOKIE, token, sessionCookieOptions(env.SESSION_TTL_HOURS));
  return res;
});
