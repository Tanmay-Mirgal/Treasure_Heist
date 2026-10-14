import { z } from "zod";
import { getEnv } from "@/lib/env";
import { ApiError, clientIp, handle, ok, readJson } from "@/lib/http";
import { Admin } from "@/lib/models";
import { ready } from "@/lib/services/bootstrap";
import { burnPasswordCheck, verifyPassword } from "@/lib/auth/password";
import { ADMIN_COOKIE, sessionCookieOptions, signSession } from "@/lib/auth/session";
import { LIMITS, clearRateLimit, hitRateLimit, peekRateLimit } from "@/lib/services/ratelimit";

const Body = z.object({
  username: z.string().trim().min(1, "Enter your username.").max(40),
  password: z.string().min(1, "Enter your password.").max(200),
});

export const POST = handle(async (req) => {
  const body = await readJson(req, Body);
  await ready();
  const key = `login:admin:${body.username.toLowerCase()}:${clientIp(req)}`;
  const rl = await peekRateLimit(key, LIMITS.login.limit, LIMITS.login.windowMs);
  if (!rl.allowed)
    throw new ApiError(429, "RATE_LIMITED", `Too many failed attempts. Try again in ${Math.ceil(rl.retryAfterMs / 60000)} minute(s).`);

  const admin = await Admin.findOne({ usernameLower: body.username.toLowerCase() }).select("+passwordHash").lean();
  let valid = false;
  if (admin) valid = await verifyPassword(body.password, admin.passwordHash);
  else await burnPasswordCheck(body.password);
  if (!admin || !valid || !admin.active) {
    await hitRateLimit(key, LIMITS.login.limit, LIMITS.login.windowMs);
    throw new ApiError(401, "INVALID_CREDENTIALS", "Incorrect username or password.");
  }

  await clearRateLimit(key);
  await Admin.updateOne({ _id: admin._id }, { $set: { lastLoginAt: new Date() } });
  const env = getEnv();
  const token = await signSession({ sub: String(admin._id), role: "admin", sv: admin.sessionVersion }, env.SESSION_SECRET, env.SESSION_TTL_HOURS);
  const res = ok({ admin: { username: admin.username, mustChangePassword: admin.mustChangePassword } });
  res.cookies.set(ADMIN_COOKIE, token, sessionCookieOptions(env.SESSION_TTL_HOURS));
  return res;
});
