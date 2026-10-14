import { appBaseUrl, handle, notFound } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/guards";
import { QRCheckpoint } from "@/lib/models";
import { ready } from "@/lib/services/bootstrap";
import { qrPng, qrSvg, scanUrl } from "@/lib/services/qr";
import { Types } from "mongoose";

/** Download a QR as SVG (default) or PNG: /api/admin/qr/:id/image?format=png&download=1 */
export const GET = handle<RouteContext<"/api/admin/qr/[id]/image">>(async (req, ctx) => {
  await requireAdmin(req);
  const { id } = await ctx.params;
  if (!Types.ObjectId.isValid(id)) throw notFound("QR not found.");
  await ready();
  const q = await QRCheckpoint.findById(id).select("+token").lean<{ token: string; copyId: string }>();
  if (!q) throw notFound("QR not found.");
  const url = scanUrl(appBaseUrl(req), q.token);
  const format = req.nextUrl.searchParams.get("format") === "png" ? "png" : "svg";
  const disposition = req.nextUrl.searchParams.get("download")
    ? `attachment; filename="${q.copyId}.${format}"`
    : `inline; filename="${q.copyId}.${format}"`;
  if (format === "png") {
    const png = await qrPng(url, 800);
    return new Response(new Uint8Array(png), {
      headers: { "Content-Type": "image/png", "Content-Disposition": disposition, "Cache-Control": "no-store" },
    });
  }
  return new Response(await qrSvg(url), {
    headers: { "Content-Type": "image/svg+xml", "Content-Disposition": disposition, "Cache-Control": "no-store" },
  });
});
