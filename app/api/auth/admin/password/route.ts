import { z } from "zod";
import { getEnv } from "@/lib/env";
import { ApiError, handle, ok, readJson } from "@/lib/http";
import { Admin } from "@/lib/models";
import { requireAdmin, actorOf } from "@/lib/auth/guards";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { ADMIN_COOKIE, sessionCookieOptions, signSession } from "@/lib/auth/session";
import { audit } from "@/lib/services/audit";
import { DEFAULT_ADMIN_PASSWORD } from "@/lib/services/seed";

const Body = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10, "Use at least 10 characters.").max(200),
});

export const POST = handle(async (req) => {
  const admin = await requireAdmin(req, { allowPasswordChange: true });
  const body = await readJson(req, Body);
  const withHash = await Admin.findById(admin._id).select("+passwordHash").lean();
  if (!withHash || !(await verifyPassword(body.currentPassword, withHash.passwordHash)))
    throw new ApiError(400, "INVALID_CURRENT_PASSWORD", "Your current password is incorrect.");
  if (body.newPassword === body.currentPassword || body.newPassword === DEFAULT_ADMIN_PASSWORD)
    throw new ApiError(400, "WEAK_PASSWORD", "Choose a new password that differs from the current and default passwords.");

  const updated = await Admin.findOneAndUpdate(
    { _id: admin._id },
    { $set: { passwordHash: await hashPassword(body.newPassword), mustChangePassword: false, passwordChangedAt: new Date() }, $inc: { sessionVersion: 1 } },
    { returnDocument: "after" },
  ).lean();
  await audit(actorOf(admin), { action: "ADMIN_PASSWORD_CHANGE", entityType: "Admin", entityId: String(admin._id) });

  const env = getEnv();
  const token = await signSession({ sub: String(admin._id), role: "admin", sv: updated!.sessionVersion }, env.SESSION_SECRET, env.SESSION_TTL_HOURS);
  const res = ok({ changed: true });
  res.cookies.set(ADMIN_COOKIE, token, sessionCookieOptions(env.SESSION_TTL_HOURS));
  return res;
});
