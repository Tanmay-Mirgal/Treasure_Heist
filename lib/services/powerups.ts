import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { withTransaction } from "../db";
import { Notification, PowerUpActivation, ScoreTransaction, Team, type TeamDoc } from "../models";
import { magnetTransferAmount } from "../game/rules";
import { MAGNET_TARGET_MESSAGE } from "../game/types";
import { ready } from "./bootstrap";
import { gameGate, getSettings, rulesOf } from "./settings";
import { GameError } from "./game";

export type MagnetResult = {
  status: "USED" | "WASTED";
  amount: number;
  targetName: string;
  score: number;
  replayed: boolean;
};

/** Opposing teams a MAGNET may target, with the exact transferable amount. */
export async function magnetTargets(teamIdStr: string) {
  await ready();
  const settings = await getSettings();
  const max = rulesOf(settings).points.magnetTransfer;
  const teams = await Team.find({ _id: { $ne: new Types.ObjectId(teamIdStr) }, status: "ACTIVE" })
    .sort({ teamNumber: 1 })
    .lean<TeamDoc[]>();
  return teams.map((t) => ({
    id: String(t._id),
    name: t.displayName,
    number: t.teamNumber,
    score: t.score,
    transferable: magnetTransferAmount(t.score, max),
  }));
}

/**
 * Use a MAGNET: atomically move up to N points from the target to the
 * activating team. The activation row is the single-use lock; the
 * idempotency key makes client retries return the original result.
 */
export async function activateMagnet(args: {
  teamId: string;
  activationId: string;
  targetTeamId: string;
  idempotencyKey: string;
}): Promise<MagnetResult> {
  await ready();
  const teamId = new Types.ObjectId(args.teamId);
  if (!Types.ObjectId.isValid(args.activationId) || !Types.ObjectId.isValid(args.targetTeamId)) {
    throw new GameError("Invalid MAGNET request.", "INVALID");
  }
  const activationId = new Types.ObjectId(args.activationId);
  const targetId = new Types.ObjectId(args.targetTeamId);
  if (targetId.equals(teamId)) throw new GameError("You cannot use a MAGNET on your own team.", "SELF_TARGET");

  const settings = await getSettings();
  const rules = rulesOf(settings);
  const gate = gameGate(settings);

  // Idempotent replay: same key for an already-processed activation returns the stored result.
  const existing = await PowerUpActivation.findOne({ _id: activationId, team: teamId }).lean();
  if (!existing) throw new GameError("MAGNET not found.", "NOT_FOUND");
  if (existing.status !== "AVAILABLE") {
    if (existing.idempotencyKey && existing.idempotencyKey === args.idempotencyKey) {
      const [me, target] = await Promise.all([
        Team.findById(teamId).lean<TeamDoc>(),
        Team.findById(existing.targetTeam).lean<TeamDoc>(),
      ]);
      return {
        status: existing.status === "WASTED" ? "WASTED" : "USED",
        amount: existing.amount,
        targetName: target?.displayName ?? "",
        score: me?.score ?? 0,
        replayed: true,
      };
    }
    throw new GameError("This MAGNET has already been used.", "ALREADY_USED");
  }

  if (!gate.open) throw new GameError(gate.message, "EVENT_CLOSED");
  if (!rules.magnet.enabled) throw new GameError("MAGNET is currently disabled by the organizer.", "MAGNET_DISABLED");
  if (!settings.scoringEnabled) throw new GameError("Scoring is paused, so MAGNET cannot be used right now.", "SCORING_DISABLED");
  if (existing.isTest !== gate.isTest) throw new GameError("This MAGNET belongs to a different game session.", "SESSION_MISMATCH");

  return withTransaction(async (session) => {
    const target = await Team.findOne({ _id: targetId, status: "ACTIVE" }).session(session).lean<TeamDoc>();
    if (!target) throw new GameError("Choose a valid opposing team.", "INVALID_TARGET");

    const amount = magnetTransferAmount(target.score, rules.points.magnetTransfer);
    const now = new Date();

    if (amount === 0) {
      if (!rules.magnet.consumeWhenTargetEmpty) {
        throw new GameError(`${target.displayName} has no points to pull. Choose another team.`, "TARGET_EMPTY");
      }
      const res = await PowerUpActivation.updateOne(
        { _id: activationId, team: teamId, status: "AVAILABLE" },
        { $set: { status: "WASTED", targetTeam: targetId, amount: 0, idempotencyKey: args.idempotencyKey, activatedAt: now } },
        { session },
      );
      if (res.modifiedCount !== 1) throw new GameError("This MAGNET has already been used.", "ALREADY_USED");
      const me = await Team.findById(teamId).session(session).lean<TeamDoc>();
      return { status: "WASTED", amount: 0, targetName: target.displayName, score: me?.score ?? 0, replayed: false };
    }

    // Claim the single-use activation first; concurrent requests lose here.
    const claim = await PowerUpActivation.updateOne(
      { _id: activationId, team: teamId, status: "AVAILABLE" },
      { $set: { status: "USED", targetTeam: targetId, amount, idempotencyKey: args.idempotencyKey, activatedAt: now } },
      { session },
    );
    if (claim.modifiedCount !== 1) throw new GameError("This MAGNET has already been used.", "ALREADY_USED");

    const loser = await Team.findOneAndUpdate(
      { _id: targetId, score: { $gte: amount } },
      { $inc: { score: -amount }, $set: { scoreChangedAt: now } },
      { session, returnDocument: "after" },
    ).lean<TeamDoc>();
    if (!loser) throw new GameError("The target's score changed. Please try again.", "RETRY");

    const winner = await Team.findOneAndUpdate(
      { _id: teamId },
      { $inc: { score: amount }, $set: { scoreChangedAt: now, lastActivityAt: now } },
      { session, returnDocument: "after" },
    ).lean<TeamDoc>();
    if (!winner) throw new GameError("Team not found.", "NOT_FOUND");

    const group = randomUUID();
    const gainId = new Types.ObjectId();
    const lossId = new Types.ObjectId();
    await ScoreTransaction.create(
      [
        {
          _id: gainId,
          team: teamId,
          delta: amount,
          balanceAfter: winner.score,
          type: "MAGNET_GAIN",
          powerUp: activationId,
          qr: existing.qr,
          copyId: existing.copyId,
          position: existing.position,
          counterparty: targetId,
          transferGroup: group,
          relatedTransaction: lossId,
          idempotencyKey: `magnet:${activationId}:gain`,
          isTest: existing.isTest,
        },
        {
          _id: lossId,
          team: targetId,
          delta: -amount,
          balanceAfter: loser.score,
          type: "MAGNET_LOSS",
          powerUp: activationId,
          counterparty: teamId,
          transferGroup: group,
          relatedTransaction: gainId,
          idempotencyKey: `magnet:${activationId}:loss`,
          isTest: existing.isTest,
        },
      ],
      { session, ordered: true },
    );
    await PowerUpActivation.updateOne({ _id: activationId }, { $set: { transactions: [gainId, lossId] } }, { session });

    const message = rules.magnet.revealAttacker
      ? `${winner.displayName} used a MAGNET against your team and transferred ${amount} point${amount === 1 ? "" : "s"}. Check your updated score.`
      : MAGNET_TARGET_MESSAGE;
    await Notification.create(
      [{ team: targetId, type: "MAGNET_HIT", message, relatedType: "PowerUpActivation", relatedId: activationId, isTest: existing.isTest }],
      { session },
    );

    return { status: "USED", amount, targetName: target.displayName, score: winner.score, replayed: false };
  });
}
