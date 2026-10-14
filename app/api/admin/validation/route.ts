import { handle, ok } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/guards";
import { liveValidation } from "@/lib/services/admin-content";

/** Data-validation report: live checks against MongoDB + the latest workbook import report. */
export const GET = handle(async (req) => {
  await requireAdmin(req);
  return ok(await liveValidation());
});
