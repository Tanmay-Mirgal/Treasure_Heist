import { z } from "zod";
import { reasonField } from "../http";
import { ACTION_TYPES, CHECKPOINT_MODES, QR_STATUSES } from "../game/types";

const Loc = z.object({ code: z.string().trim().max(20), label: z.string().trim().max(200) });

/** Organizer edit of one QR checkpoint / clue. */
export const QrPatchSchema = z.object({
  clueText: z.string().max(4000).optional(),
  challengePrompt: z.string().max(2000).optional(),
  answer: z.string().max(200).optional(),
  hintText: z.string().max(1000).optional(),
  actionType: z.enum(ACTION_TYPES).optional(),
  mode: z.enum(CHECKPOINT_MODES).optional(),
  status: z.enum(QR_STATUSES).optional(),
  rewardOverride: z.number().int().min(0).max(20).nullable().optional(),
  placement: Loc.optional(),
  destination: Loc.optional(),
  organizerNotes: z.string().max(2000).optional(),
  reason: reasonField,
});
