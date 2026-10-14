import { appBaseUrl, handle, ok } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/guards";
import { printData } from "@/lib/services/admin-content";

/** QR SVGs + labels for the print sheet: ?team=3 or ?ids=a,b,c */
export const GET = handle(async (req) => {
  await requireAdmin(req);
  const sp = req.nextUrl.searchParams;
  const team = sp.get("team") ? Number(sp.get("team")) : null;
  const ids = sp.get("ids")?.split(",").filter(Boolean).slice(0, 300);
  return ok({ baseUrl: appBaseUrl(req), items: await printData(appBaseUrl(req), { team: Number.isFinite(team) ? team : null, ids }) });
});
