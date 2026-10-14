import { z } from "zod";
import { handle, ok, readJson } from "@/lib/http";
import { ADMIN_COOKIE, TEAM_COOKIE } from "@/lib/auth/session";

const Body = z.object({ role: z.enum(["team", "admin", "all"]).default("all") });

export const POST = handle(async (req) => {
  const { role } = await readJson(req, Body);
  const res = ok({ loggedOut: true });
  const clear = { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" };
  if (role === "team" || role === "all") res.cookies.set(TEAM_COOKIE, "", clear);
  if (role === "admin" || role === "all") res.cookies.set(ADMIN_COOKIE, "", clear);
  return res;
});
