import { z } from "zod";
import { handle, ok, readJson } from "@/lib/http";
import { actorOf, requireAdmin } from "@/lib/auth/guards";
import { adminSettingsView, updateSettings } from "@/lib/services/admin-event";
import { getSettings } from "@/lib/services/settings";
import { RANKING_RULES, SUPER_SHOES_MODES } from "@/lib/game/types";

export const GET = handle(async (req) => {
  await requireAdmin(req);
  return ok(adminSettingsView(await getSettings()));
});

const pts = z.number().int().min(0).max(20);
const Body = z.object({
  eventName: z.string().trim().min(1).max(60).optional(),
  participationEnabled: z.boolean().optional(),
  scoringEnabled: z.boolean().optional(),
  timer: z.object({ enabled: z.boolean(), durationMinutes: z.number().int().min(1).max(1440) }).optional(),
  rules: z
    .object({
      points: z
        .object({ normal: pts, bonus: pts, superShoes: pts, magnetCheckpoint: pts, magnetTransfer: pts, finish: pts })
        .partial()
        .optional(),
      superShoes: z.object({ mode: z.enum(SUPER_SHOES_MODES), hintsGranted: z.number().int().min(0).max(5) }).partial().optional(),
      magnet: z.object({ enabled: z.boolean(), consumeWhenTargetEmpty: z.boolean(), revealAttacker: z.boolean() }).partial().optional(),
      hints: z.object({ initialPerTeam: z.number().int().min(0).max(10), fallbackToDestination: z.boolean() }).partial().optional(),
    })
    .optional(),
  logInvalidScans: z.boolean().optional(),
  logDuplicateScans: z.boolean().optional(),
  rankingRule: z.enum(RANKING_RULES).optional(),
  reason: z.string().trim().max(500).optional(),
});

/** Scoring configuration and event toggles (audited with before/after values). */
export const PATCH = handle(async (req) => {
  const admin = await requireAdmin(req);
  const { reason, ...patch } = await readJson(req, Body);
  return ok(await updateSettings(actorOf(admin), patch, reason ?? null));
});
