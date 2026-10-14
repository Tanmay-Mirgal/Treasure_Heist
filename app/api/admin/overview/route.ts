import { handle, ok } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/guards";
import { overview } from "@/lib/services/admin-event";

export const GET = handle(async (req) => {
  await requireAdmin(req);
  return ok(await overview());
});
