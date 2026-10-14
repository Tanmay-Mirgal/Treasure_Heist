import { z } from "zod";
import { handle, ok, readJson } from "@/lib/http";
import { actorOf, requireAdmin } from "@/lib/auth/guards";
import { createTeam, listTeams } from "@/lib/services/admin-teams";

export const GET = handle(async (req) => {
  await requireAdmin(req);
  return ok({ teams: await listTeams() });
});

const Body = z.object({
  username: z.string().trim().regex(/^[A-Za-z0-9_-]{3,40}$/, "3–40 letters, digits, - or _"),
  displayName: z.string().trim().min(2).max(60),
  teamNumber: z.number().int().min(1).max(999),
  password: z.string().min(4, "At least 4 characters.").max(200),
});

export const POST = handle(async (req) => {
  const admin = await requireAdmin(req);
  const body = await readJson(req, Body);
  return ok(await createTeam(actorOf(admin), body), { status: 201 });
});
