import { handle, ok } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/guards";
import { listSequences } from "@/lib/services/admin-content";

export const GET = handle(async (req) => {
  await requireAdmin(req);
  return ok({ sequences: await listSequences() });
});
