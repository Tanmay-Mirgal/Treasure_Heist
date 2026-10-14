import { z } from "zod";
import { handle, ok, readJson } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/guards";
import { verifyScanInput } from "@/lib/services/admin-content";

const Body = z.object({ input: z.string().trim().min(1).max(512) });

/** Test-mode QR verification for organizers. Never changes game state. */
export const POST = handle(async (req) => {
  await requireAdmin(req);
  const { input } = await readJson(req, Body);
  return ok(await verifyScanInput(input));
});
