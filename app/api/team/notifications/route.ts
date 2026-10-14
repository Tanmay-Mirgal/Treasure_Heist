import { z } from "zod";
import { handle, ok, readJson } from "@/lib/http";
import { requireTeam } from "@/lib/auth/guards";
import { Notification } from "@/lib/models";
import { markNotificationsRead } from "@/lib/services/leaderboard";

export const GET = handle(async (req) => {
  const team = await requireTeam(req);
  const items = await Notification.find({ team: team._id }).sort({ createdAt: -1 }).limit(50).lean();
  return ok({
    unread: items.filter((n) => !n.read).length,
    items: items.map((n) => ({ id: String(n._id), type: n.type, message: n.message, read: n.read, createdAt: n.createdAt })),
  });
});

const Body = z.object({ ids: z.union([z.literal("all"), z.array(z.string().max(30)).max(100)]) });

export const POST = handle(async (req) => {
  const team = await requireTeam(req);
  const { ids } = await readJson(req, Body);
  const marked = await markNotificationsRead(String(team._id), ids);
  return ok({ marked });
});
