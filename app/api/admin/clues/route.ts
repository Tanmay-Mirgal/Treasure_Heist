import { appBaseUrl, handle, ok } from "@/lib/http";
import { requireAdmin } from "@/lib/auth/guards";
import { listQr, listSequences } from "@/lib/services/admin-content";

/** Clue manager data: every checkpoint's clue + every team's starting clue (organizer-only fields included). */
export const GET = handle(async (req) => {
  await requireAdmin(req);
  const [qr, seqs] = await Promise.all([listQr(appBaseUrl(req)), listSequences()]);
  return ok({
    checkpoints: qr.items.map((item) => ({ ...item, scanUrl: null })),
    startingClues: seqs.map((s) => ({ teamId: s.teamId, teamNumber: s.teamNumber, teamName: s.teamName, startingClue: s.startingClue })),
  });
});
