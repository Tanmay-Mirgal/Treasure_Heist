import { z } from "zod";
import { appBaseUrl, handle, ok, readJson, reasonField } from "@/lib/http";
import { actorOf, requireAdmin } from "@/lib/auth/guards";
import { createQr, listQr } from "@/lib/services/admin-content";
import { ACTION_TYPES, CHECKPOINT_MODES } from "@/lib/game/types";

export const GET = handle(async (req) => {
  await requireAdmin(req);
  return ok(await listQr(appBaseUrl(req)));
});

const Loc = z.object({ code: z.string().trim().max(20).default(""), label: z.string().trim().max(200).default("") });
const Body = z.object({
  copyId: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,40}$/, "Letters, digits and dashes only"),
  qrId: z.string().trim().toUpperCase().min(1).max(20),
  teamNumber: z.number().int().min(1).max(999).nullable().default(null),
  actionType: z.enum(ACTION_TYPES).default("NORMAL"),
  mode: z.enum(CHECKPOINT_MODES).default("LOCATION"),
  clueText: z.string().max(4000).default(""),
  placement: Loc,
  destination: Loc,
  reason: reasonField,
});

export const POST = handle(async (req) => {
  const admin = await requireAdmin(req);
  const { reason, ...input } = await readJson(req, Body);
  return ok(await createQr(actorOf(admin), input, reason), { status: 201 });
});
