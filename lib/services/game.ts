import { Types, type ClientSession } from "mongoose";
import { isDuplicateKeyError, withTransaction } from "../db";
import {
  CheckpointCompletion,
  HintUsage,
  Notification,
  PowerUpActivation,
  QRCheckpoint,
  ScanEvent,
  ScoreTransaction,
  Team,
  TeamSequence,
  type QRCheckpointDoc,
  type TeamDoc,
  type TeamSequenceDoc,
} from "../models";
import { answersMatch, checkpointReward, checkpointTxType } from "../game/rules";
import {
  NEUTRAL_REJECT_MESSAGE,
  type ActionType,
  type GameRules,
  type RejectReason,
  type ScanOutcome,
} from "../game/types";
import { ready } from "./bootstrap";
import { gameGate, getSettings, publicEventView, rulesOf, type Settings } from "./settings";
import { LIMITS, hitRateLimit, peekRateLimit } from "./ratelimit";
import { parseScanInput, sha256 } from "./qr";

export type ScanSource = "CAMERA" | "MANUAL" | "LINK";

export type CheckpointView = {
  position: number;
  total: number;
  actionType: ActionType;
  isFinal: boolean;
  clueText: string | null;
  pointsAwarded: number;
  /** Authoritative reward description (independent of legacy clue wording). */
  rewardText: string;
};

export type ScanResult = {
  outcome: ScanOutcome;
  scanId: string | null;
  message: string;
  checkpoint?: CheckpointView;
  challengePrompt?: string;
  score?: number;
  powerUp?: { id: string; type: "MAGNET" } | null;
  hintsGranted?: number;
  retryAfterMs?: number;
  isTest?: boolean;
};

class ProgressConflict extends Error {}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function rewardText(action: ActionType, points: number, rules: GameRules, scoringEnabled: boolean): string {
  if (!scoringEnabled) return "Scoring is currently paused by the organizer — progress still counts.";
  const p = (n: number) => `${n >= 0 ? "+" : ""}${n} point${Math.abs(n) === 1 ? "" : "s"}`;
  switch (action) {
    case "BONUS":
      return `BONUS: ${p(points)}.`;
    case "SUPER_SHOES":
      return rules.superShoes.mode === "HINT" && rules.superShoes.hintsGranted > 0
        ? `SUPER SHOES: ${p(points)} and ${rules.superShoes.hintsGranted} extra hint${rules.superShoes.hintsGranted === 1 ? "" : "s"}.`
        : `SUPER SHOES: ${p(points)}.`;
    case "MAGNET":
      return `MAGNET acquired${points ? ` (${p(points)})` : ""}: pull up to ${rules.points.magnetTransfer} points from a rival team.`;
    case "FINISH":
      return `Vault opened: ${p(points)}.`;
    default:
      return `Checkpoint secured: ${p(points)}.`;
  }
}

async function logScan(
  doc: {
    team: Types.ObjectId;
    outcome: ScanOutcome;
    source: ScanSource;
    correlationId: string;
    qr?: QRCheckpointDoc | null;
    reason?: string | null;
    expectedPosition?: number | null;
    position?: number | null;
    pointsAwarded?: number;
    isTest?: boolean;
  },
  session?: ClientSession,
): Promise<string> {
  const [ev] = await ScanEvent.create(
    [
      {
        team: doc.team,
        qr: doc.qr?._id ?? null,
        copyId: doc.qr?.copyId ?? null,
        outcome: doc.outcome,
        reason: doc.reason ?? null,
        source: doc.source,
        expectedPosition: doc.expectedPosition ?? null,
        position: doc.position ?? null,
        pointsAwarded: doc.pointsAwarded ?? 0,
        correlationId: doc.correlationId,
        isTest: doc.isTest ?? false,
      },
    ],
    session ? { session } : undefined,
  );
  return String(ev!._id);
}

/* ------------------------------------------------------------------ */
/* Checkpoint completion (shared by scans, answers and admin verify)   */
/* ------------------------------------------------------------------ */

export type CompletionOutcome = {
  completionId: string;
  position: number;
  points: number;
  score: number;
  isFinal: boolean;
  powerUpId: string | null;
  hintsGranted: number;
};

/**
 * Atomically complete the team's next expected checkpoint. Must run inside a
 * transaction. Throws ProgressConflict if the team's progress moved (e.g. a
 * concurrent duplicate scan already completed this position).
 */
export async function completeCheckpointTx(
  session: ClientSession,
  args: {
    teamId: Types.ObjectId;
    expectedPosition: number;
    seq: Pick<TeamSequenceDoc, "entries" | "version">;
    qr: Pick<QRCheckpointDoc, "_id" | "copyId" | "actionType" | "rewardOverride">;
    settings: Settings;
    source: "SCAN" | "LINK" | "MANUAL_CODE" | "ADMIN";
    isTest: boolean;
    adminUsername?: string | null;
    reason?: string | null;
  },
): Promise<CompletionOutcome> {
  const { teamId, expectedPosition: pos, seq, qr, settings, isTest } = args;
  const rules = rulesOf(settings);
  const now = new Date();
  const total = seq.entries.length;
  const isFinal = pos === total;
  const points = settings.scoringEnabled ? checkpointReward(qr.actionType as ActionType, rules, qr.rewardOverride) : 0;
  const hintsGranted =
    qr.actionType === "SUPER_SHOES" && rules.superShoes.mode === "HINT" ? Math.max(0, rules.superShoes.hintsGranted) : 0;

  const completionId = new Types.ObjectId();
  await CheckpointCompletion.create(
    [
      {
        _id: completionId,
        team: teamId,
        qr: qr._id,
        copyId: qr.copyId,
        position: pos,
        sequenceVersion: seq.version,
        actionType: qr.actionType,
        points,
        acceptedAt: now,
        idempotencyKey: `checkpoint:${teamId}:${pos}:${completionId}`,
        source: args.source,
        adminUsername: args.adminUsername ?? null,
        isTest,
      },
    ],
    { session },
  );

  const inc: Record<string, number> = { score: points };
  if (hintsGranted) inc["hints.available"] = hintsGranted;
  const set: Record<string, unknown> = {
    currentPosition: pos,
    lastProgressAt: now,
    lastActivityAt: now,
    awaitingAnswer: null,
  };
  if (points !== 0) set.scoreChangedAt = now;
  if (isFinal) set.finishedAt = now;

  const team = await Team.findOneAndUpdate(
    { _id: teamId, currentPosition: pos - 1, finishedAt: null },
    { $inc: inc, $set: set },
    { session, returnDocument: "after" },
  ).lean<TeamDoc>();
  if (!team) throw new ProgressConflict("Team progress changed concurrently.");
  if (!team.gameStartedAt) {
    await Team.updateOne({ _id: teamId, gameStartedAt: null }, { $set: { gameStartedAt: now } }, { session });
  }

  if (points !== 0) {
    const [tx] = await ScoreTransaction.create(
      [
        {
          team: teamId,
          delta: points,
          balanceAfter: team.score,
          type: checkpointTxType(qr.actionType as ActionType),
          qr: qr._id,
          copyId: qr.copyId,
          position: pos,
          idempotencyKey: `checkpoint:${completionId}`,
          reason: args.reason ?? null,
          adminUsername: args.adminUsername ?? null,
          isTest,
        },
      ],
      { session },
    );
    await CheckpointCompletion.updateOne({ _id: completionId }, { $set: { rewardTransaction: tx!._id } }, { session });
  }

  let powerUpId: string | null = null;
  if (qr.actionType === "MAGNET") {
    const [pu] = await PowerUpActivation.create(
      [
        {
          team: teamId,
          type: "MAGNET",
          qr: qr._id,
          copyId: qr.copyId,
          position: pos,
          completion: completionId,
          isTest,
        },
      ],
      { session },
    );
    powerUpId = String(pu!._id);
  }

  return { completionId: String(completionId), position: pos, points, score: team.score, isFinal, powerUpId, hintsGranted };
}

/* ------------------------------------------------------------------ */
/* Scanning                                                            */
/* ------------------------------------------------------------------ */

export async function processScan(args: {
  teamId: string;
  raw: string;
  source: ScanSource;
  correlationId: string;
}): Promise<ScanResult> {
  await ready();
  const teamId = new Types.ObjectId(args.teamId);
  const settings = await getSettings();
  const rules = rulesOf(settings);
  const gate = gameGate(settings);
  const isTest = gate.open ? gate.isTest : false;
  const rlKey = `scan-invalid:${args.teamId}`;

  const rl = await peekRateLimit(rlKey, LIMITS.invalidScan.limit, LIMITS.invalidScan.windowMs);
  if (!rl.allowed) {
    const scanId = await logScan({ team: teamId, outcome: "RATE_LIMITED", source: args.source, correlationId: args.correlationId, isTest });
    return {
      outcome: "RATE_LIMITED",
      scanId,
      retryAfterMs: rl.retryAfterMs,
      message: `Too many unrecognised scans. Scanning is paused for ${Math.ceil(rl.retryAfterMs / 1000)} seconds.`,
    };
  }

  if (!gate.open) {
    const scanId = await logScan({ team: teamId, outcome: "EVENT_CLOSED", source: args.source, correlationId: args.correlationId, reason: gate.code });
    return { outcome: "EVENT_CLOSED", scanId, message: gate.message };
  }

  const reject = async (reason: RejectReason, qr?: QRCheckpointDoc | null, expectedPosition?: number) => {
    await hitRateLimit(rlKey, LIMITS.invalidScan.limit, LIMITS.invalidScan.windowMs);
    const scanId = settings.logInvalidScans
      ? await logScan({ team: teamId, outcome: "REJECTED", source: args.source, correlationId: args.correlationId, qr, reason, expectedPosition, isTest })
      : null;
    return { outcome: "REJECTED" as const, scanId, message: NEUTRAL_REJECT_MESSAGE };
  };

  const parsed = parseScanInput(args.raw);
  if (!parsed) return reject("MALFORMED");

  const qr = await QRCheckpoint.findOne(parsed.kind === "token" ? { token: parsed.value } : { manualCode: parsed.value }).lean<QRCheckpointDoc>();
  if (!qr) {
    const h = sha256(parsed.value);
    const revoked = await QRCheckpoint.exists({
      $or: [{ "revokedTokens.tokenHash": h }, { "revokedTokens.codeHash": h }],
    });
    return reject(revoked ? "REVOKED_TOKEN" : "UNKNOWN_TOKEN");
  }

  const [team, seq] = await Promise.all([
    Team.findById(teamId).lean<TeamDoc>(),
    TeamSequence.findOne({ team: teamId }).lean<TeamSequenceDoc>(),
  ]);
  if (!team) return reject("NOT_IN_TEAM_SEQUENCE", qr);
  const expected = team.currentPosition + 1;
  if (!seq || seq.entries.length === 0) return reject("NOT_IN_TEAM_SEQUENCE", qr, expected);

  const entry = seq.entries.find((e) => String(e.qr) === String(qr._id));
  if (!entry) return reject("NOT_IN_TEAM_SEQUENCE", qr, expected);

  const total = seq.entries.length;
  const sourceOf = args.source === "MANUAL" ? "MANUAL_CODE" : args.source === "LINK" ? "LINK" : "SCAN";

  if (team.finishedAt) {
    const scanId = settings.logDuplicateScans
      ? await logScan({ team: teamId, outcome: "ALREADY_FINISHED", source: args.source, correlationId: args.correlationId, qr, position: entry.position, isTest })
      : null;
    return { outcome: "ALREADY_FINISHED", scanId, message: "Your team has already opened the vault. Check the leaderboard!", score: team.score };
  }

  if (entry.position <= team.currentPosition) {
    const scanId = settings.logDuplicateScans
      ? await logScan({ team: teamId, outcome: "DUPLICATE", source: args.source, correlationId: args.correlationId, qr, position: entry.position, expectedPosition: expected, isTest })
      : null;
    const isCurrentClue = entry.position === team.currentPosition;
    return {
      outcome: "DUPLICATE",
      scanId,
      message: isCurrentClue
        ? "Checkpoint already secured — no extra points. Your current clue is shown below."
        : "Checkpoint already secured — no extra points. Follow your current clue on the mission screen.",
      score: team.score,
      checkpoint: isCurrentClue
        ? {
            position: entry.position,
            total,
            actionType: qr.actionType as ActionType,
            isFinal: entry.position === total,
            clueText: qr.clueText,
            pointsAwarded: 0,
            rewardText: "No points for repeat scans.",
          }
        : undefined,
    };
  }

  if (team.awaitingAnswer) {
    if (team.awaitingAnswer.position === entry.position) {
      return {
        outcome: "AWAITING_ANSWER",
        scanId: null,
        message: "Answer the checkpoint challenge to unlock your next clue.",
        challengePrompt: qr.challengePrompt || "Enter the answer for this checkpoint.",
        score: team.score,
      };
    }
    return reject("AWAITING_ANSWER_ELSEWHERE", qr, expected);
  }

  if (entry.position !== expected) return reject("OUT_OF_ORDER", qr, expected);

  if (qr.status !== "ACTIVE") {
    const scanId = await logScan({ team: teamId, outcome: "INACTIVE_QR", source: args.source, correlationId: args.correlationId, qr, reason: qr.status, position: entry.position, isTest });
    return {
      outcome: "INACTIVE_QR",
      scanId,
      message: "This checkpoint is temporarily unavailable. Please contact the Event Desk.",
    };
  }

  if (qr.mode === "ANSWER") {
    const res = await Team.updateOne(
      { _id: teamId, currentPosition: entry.position - 1, awaitingAnswer: null, finishedAt: null },
      { $set: { awaitingAnswer: { position: entry.position, qr: qr._id, since: new Date(), attempts: 0 }, lastActivityAt: new Date() } },
    );
    if (res.modifiedCount !== 1) return reject("OUT_OF_ORDER", qr, expected);
    const scanId = await logScan({ team: teamId, outcome: "AWAITING_ANSWER", source: args.source, correlationId: args.correlationId, qr, position: entry.position, isTest });
    return {
      outcome: "AWAITING_ANSWER",
      scanId,
      message: "Checkpoint located! Solve the challenge to unlock your next clue.",
      challengePrompt: qr.challengePrompt || "Enter the answer for this checkpoint.",
      score: team.score,
    };
  }

  try {
    const result = await withTransaction(async (session) => {
      const outcome = await completeCheckpointTx(session, {
        teamId,
        expectedPosition: entry.position,
        seq,
        qr,
        settings,
        source: sourceOf,
        isTest,
      });
      const scanId = await logScan(
        {
          team: teamId,
          outcome: "ACCEPTED",
          source: args.source,
          correlationId: args.correlationId,
          qr,
          position: entry.position,
          pointsAwarded: outcome.points,
          isTest,
        },
        session,
      );
      return { outcome, scanId };
    });
    return acceptedResult(result.scanId, result.outcome, qr, total, rules, settings, isTest);
  } catch (err) {
    if (err instanceof ProgressConflict || isDuplicateKeyError(err)) {
      const fresh = await Team.findById(teamId).lean<TeamDoc>();
      return {
        outcome: "DUPLICATE",
        scanId: null,
        message: "Checkpoint already secured — no extra points.",
        score: fresh?.score,
      };
    }
    throw err;
  }
}

function acceptedResult(
  scanId: string,
  o: CompletionOutcome,
  qr: Pick<QRCheckpointDoc, "actionType" | "clueText">,
  total: number,
  rules: GameRules,
  settings: Settings,
  isTest: boolean,
): ScanResult {
  const action = qr.actionType as ActionType;
  return {
    outcome: "ACCEPTED",
    scanId,
    message: o.isFinal ? "VAULT OPENED!" : "Checkpoint secured!",
    score: o.score,
    hintsGranted: o.hintsGranted,
    powerUp: o.powerUpId ? { id: o.powerUpId, type: "MAGNET" } : null,
    isTest,
    checkpoint: {
      position: o.position,
      total,
      actionType: action,
      isFinal: o.isFinal,
      clueText: qr.clueText,
      pointsAwarded: o.points,
      rewardText: rewardText(action, o.points, rules, settings.scoringEnabled),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Answer-gated checkpoints                                            */
/* ------------------------------------------------------------------ */

export async function submitAnswer(args: { teamId: string; answer: string; correlationId: string }): Promise<
  ScanResult & { correct: boolean }
> {
  await ready();
  const teamId = new Types.ObjectId(args.teamId);
  const settings = await getSettings();
  const gate = gameGate(settings);
  if (!gate.open) return { correct: false, outcome: "EVENT_CLOSED", scanId: null, message: gate.message };

  const team = await Team.findById(teamId).lean<TeamDoc>();
  if (!team?.awaitingAnswer) {
    return { correct: false, outcome: "REJECTED", scanId: null, message: "There is no challenge waiting for an answer." };
  }
  const rl = await hitRateLimit(`answer:${args.teamId}`, LIMITS.answer.limit, LIMITS.answer.windowMs);
  if (!rl.allowed) {
    return {
      correct: false,
      outcome: "RATE_LIMITED",
      scanId: null,
      retryAfterMs: rl.retryAfterMs,
      message: `Too many attempts. Try again in ${Math.ceil(rl.retryAfterMs / 1000)} seconds.`,
    };
  }

  const qr = await QRCheckpoint.findById(team.awaitingAnswer.qr).select("+answer").lean<QRCheckpointDoc>();
  const seq = await TeamSequence.findOne({ team: teamId }).lean<TeamSequenceDoc>();
  if (!qr || !seq) return { correct: false, outcome: "REJECTED", scanId: null, message: NEUTRAL_REJECT_MESSAGE };

  if (!qr.answer || !answersMatch(args.answer, qr.answer)) {
    await Team.updateOne({ _id: teamId }, { $inc: { "awaitingAnswer.attempts": 1 }, $set: { lastActivityAt: new Date() } });
    return { correct: false, outcome: "AWAITING_ANSWER", scanId: null, message: "Not quite. Check your reasoning and try again.", challengePrompt: qr.challengePrompt };
  }

  const position = team.awaitingAnswer.position!;
  const isTest = gate.isTest;
  try {
    const result = await withTransaction(async (session) => {
      const outcome = await completeCheckpointTx(session, {
        teamId,
        expectedPosition: position,
        seq,
        qr,
        settings,
        source: "SCAN",
        isTest,
      });
      const scanId = await logScan(
        { team: teamId, outcome: "ACCEPTED", source: "MANUAL", correlationId: args.correlationId, qr, position, pointsAwarded: outcome.points, reason: "ANSWER_ACCEPTED", isTest },
        session,
      );
      return { outcome, scanId };
    });
    return { correct: true, ...acceptedResult(result.scanId, result.outcome, qr, seq.entries.length, rulesOf(settings), settings, isTest) };
  } catch (err) {
    if (err instanceof ProgressConflict || isDuplicateKeyError(err)) {
      return { correct: true, outcome: "DUPLICATE", scanId: null, message: "Checkpoint already secured." };
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Hints                                                               */
/* ------------------------------------------------------------------ */

/** Hint text for the mission the team is currently solving (next expected position). */
async function hintTextFor(team: TeamDoc, seq: TeamSequenceDoc, rules: GameRules): Promise<string | null> {
  const next = seq.entries.find((e) => e.position === team.currentPosition + 1);
  if (!next) return null;
  if (team.currentPosition === 0) {
    if (!rules.hints.fallbackToDestination) return null;
    const firstQr = await QRCheckpoint.findById(next.qr).lean<QRCheckpointDoc>();
    const where = firstQr?.placement?.label || seq.startingClue?.location;
    return where ? `Head to: ${where}.` : null;
  }
  const current = seq.entries.find((e) => e.position === team.currentPosition);
  const [clueQr, nextQr] = await Promise.all([
    current ? QRCheckpoint.findById(current.qr).lean<QRCheckpointDoc>() : null,
    QRCheckpoint.findById(next.qr).lean<QRCheckpointDoc>(),
  ]);
  if (clueQr?.hintText?.trim()) return clueQr.hintText.trim();
  if (rules.hints.fallbackToDestination && nextQr?.placement?.label) return `Head to: ${nextQr.placement.label}.`;
  return null;
}

export async function spendHint(teamIdStr: string): Promise<{ text: string; hintsAvailable: number; alreadyUsed: boolean }> {
  await ready();
  const teamId = new Types.ObjectId(teamIdStr);
  const settings = await getSettings();
  const gate = gameGate(settings);
  if (!gate.open) throw new GameError(gate.message, "EVENT_CLOSED");

  const [team, seq] = await Promise.all([
    Team.findById(teamId).lean<TeamDoc>(),
    TeamSequence.findOne({ team: teamId }).lean<TeamSequenceDoc>(),
  ]);
  if (!team || !seq) throw new GameError("Your route is not configured yet. Contact the Event Desk.", "NO_ROUTE");
  if (team.finishedAt) throw new GameError("Your team has already finished.", "FINISHED");
  if (team.awaitingAnswer) throw new GameError("Hints are for location clues. Solve the current challenge first.", "AWAITING_ANSWER");

  const position = team.currentPosition + 1;
  const existing = await HintUsage.findOne({ team: teamId, position }).lean();
  if (existing) return { text: existing.text, hintsAvailable: team.hints?.available ?? 0, alreadyUsed: true };

  const text = await hintTextFor(team, seq, rulesOf(settings));
  if (!text) throw new GameError("No hint is available for this clue. Your hint was not used.", "NO_HINT");

  try {
    return await withTransaction(async (session) => {
      const updated = await Team.findOneAndUpdate(
        { _id: teamId, currentPosition: team.currentPosition, "hints.available": { $gt: 0 } },
        { $inc: { "hints.available": -1, "hints.used": 1 }, $set: { lastActivityAt: new Date() } },
        { session, returnDocument: "after" },
      ).lean<TeamDoc>();
      if (!updated) throw new GameError("You have no hints available.", "NO_HINTS_LEFT");
      await HintUsage.create([{ team: teamId, position, text, isTest: gate.isTest }], { session });
      return { text, hintsAvailable: updated.hints?.available ?? 0, alreadyUsed: false };
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      const again = await HintUsage.findOne({ team: teamId, position }).lean();
      const fresh = await Team.findById(teamId).lean<TeamDoc>();
      return { text: again?.text ?? text, hintsAvailable: fresh?.hints?.available ?? 0, alreadyUsed: true };
    }
    throw err;
  }
}

export class GameError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "GameError";
  }
}

/* ------------------------------------------------------------------ */
/* Team state (dashboard)                                              */
/* ------------------------------------------------------------------ */

export async function getTeamState(teamIdStr: string) {
  await ready();
  const teamId = new Types.ObjectId(teamIdStr);
  const now = new Date();
  const [team, seq, settings, powerUps, notifications, unread] = await Promise.all([
    Team.findById(teamId).lean<TeamDoc>(),
    TeamSequence.findOne({ team: teamId }).lean<TeamSequenceDoc>(),
    getSettings(),
    PowerUpActivation.find({ team: teamId, status: { $ne: "VOID" } }).sort({ grantedAt: -1 }).lean(),
    Notification.find({ team: teamId }).sort({ createdAt: -1 }).limit(10).lean(),
    Notification.countDocuments({ team: teamId, read: false }),
  ]);
  if (!team) return null;
  const hint = await HintUsage.findOne({ team: teamId, position: team.currentPosition + 1 }).lean();
  const rules = rulesOf(settings);
  const total = seq?.entries.length ?? 0;
  const completed = team.currentPosition;
  const finished = Boolean(team.finishedAt);

  type Mission = {
    kind: "START" | "CLUE" | "ANSWER" | "FINISHED" | "UNCONFIGURED";
    title: string;
    text: string;
    lastAction: ActionType | null;
    challengePrompt?: string;
    hint: { used: boolean; text: string | null };
  };
  const currentHint = hint?.text ?? null;
  let mission: Mission;
  if (!seq || total === 0) {
    mission = { kind: "UNCONFIGURED", title: "Route not configured", text: "Your team's route has not been configured yet. Contact the Event Desk.", lastAction: null, hint: { used: false, text: null } };
  } else if (team.awaitingAnswer) {
    const q = await QRCheckpoint.findById(team.awaitingAnswer.qr).lean<QRCheckpointDoc>();
    mission = {
      kind: "ANSWER",
      title: `Challenge — checkpoint ${team.awaitingAnswer.position}`,
      text: q?.challengePrompt || "Enter the answer for this checkpoint.",
      challengePrompt: q?.challengePrompt || "Enter the answer for this checkpoint.",
      lastAction: null,
      hint: { used: false, text: null },
    };
  } else if (completed === 0) {
    mission = {
      kind: "START",
      title: "Mission 1 — Starting clue",
      text: seq.startingClue?.riddle || "Your starting clue has not been configured. Contact the Event Desk.",
      lastAction: null,
      hint: { used: Boolean(currentHint), text: currentHint },
    };
  } else {
    const last = seq.entries.find((e) => e.position === completed);
    const q = last ? await QRCheckpoint.findById(last.qr).lean<QRCheckpointDoc>() : null;
    mission = finished
      ? { kind: "FINISHED", title: "Vault opened", text: q?.clueText || "You have completed THE HEIST.", lastAction: "FINISH", hint: { used: false, text: null } }
      : {
          kind: "CLUE",
          title: `Mission ${completed + 1} of ${total}`,
          text: q?.clueText ?? "",
          lastAction: (q?.actionType as ActionType) ?? null,
          hint: { used: Boolean(currentHint), text: currentHint },
        };
  }

  return {
    team: {
      id: String(team._id),
      name: team.displayName,
      username: team.username,
      number: team.teamNumber,
      status: team.status,
      score: team.score,
      gameStartedAt: team.gameStartedAt,
      finishedAt: team.finishedAt,
    },
    progress: {
      completed,
      total,
      remaining: Math.max(0, total - completed),
      currentMission: finished ? total : Math.min(completed + 1, total),
      finished,
    },
    mission,
    inventory: {
      hintsAvailable: team.hints?.available ?? 0,
      hintsUsed: team.hints?.used ?? 0,
      powerUps: powerUps.map((p) => ({
        id: String(p._id),
        type: p.type,
        status: p.status,
        amount: p.amount,
        grantedAt: p.grantedAt,
        activatedAt: p.activatedAt,
      })),
    },
    notifications: {
      unread,
      items: notifications.map((n) => ({ id: String(n._id), type: n.type, message: n.message, read: n.read, createdAt: n.createdAt })),
    },
    event: publicEventView(settings, now),
    rules: publicRules(rules, settings.scoringEnabled),
  };
}

export function publicRules(rules: GameRules, scoringEnabled: boolean) {
  return {
    scoringEnabled,
    points: rules.points,
    superShoes: rules.superShoes,
    magnet: { enabled: rules.magnet.enabled, consumeWhenTargetEmpty: rules.magnet.consumeWhenTargetEmpty, maxTransfer: rules.points.magnetTransfer },
  };
}

/* ------------------------------------------------------------------ */
/* Scan result lookup (result page)                                    */
/* ------------------------------------------------------------------ */

export async function getScanResult(teamIdStr: string, scanId: string) {
  await ready();
  if (!Types.ObjectId.isValid(scanId)) return null;
  const ev = await ScanEvent.findOne({ _id: scanId, team: teamIdStr }).lean();
  if (!ev) return null;
  const [team, seq, settings] = await Promise.all([
    Team.findById(teamIdStr).lean<TeamDoc>(),
    TeamSequence.findOne({ team: teamIdStr }).lean<TeamSequenceDoc>(),
    getSettings(),
  ]);
  const rules = rulesOf(settings);
  const total = seq?.entries.length ?? 0;
  const base = { scanId: String(ev._id), outcome: ev.outcome as ScanOutcome, at: ev.createdAt, score: team?.score ?? 0, isTest: ev.isTest };
  const qr = ev.qr ? await QRCheckpoint.findById(ev.qr).lean<QRCheckpointDoc>() : null;

  if (ev.outcome === "ACCEPTED" && qr && ev.position) {
    const pu = qr.actionType === "MAGNET"
      ? await PowerUpActivation.findOne({ team: teamIdStr, qr: qr._id }).sort({ createdAt: -1 }).lean()
      : null;
    return {
      ...base,
      message: ev.position === total ? "VAULT OPENED!" : "Checkpoint secured!",
      powerUp: pu ? { id: String(pu._id), type: "MAGNET" as const, status: pu.status } : null,
      checkpoint: {
        position: ev.position,
        total,
        actionType: qr.actionType as ActionType,
        isFinal: ev.position === total,
        clueText: qr.clueText,
        pointsAwarded: ev.pointsAwarded,
        rewardText: rewardText(qr.actionType as ActionType, ev.pointsAwarded, rules, settings.scoringEnabled),
      },
    };
  }
  if (ev.outcome === "DUPLICATE" && qr && ev.position && team && ev.position === team.currentPosition) {
    return {
      ...base,
      message: "Checkpoint already secured — no extra points.",
      checkpoint: { position: ev.position, total, actionType: qr.actionType as ActionType, isFinal: ev.position === total, clueText: qr.clueText, pointsAwarded: 0, rewardText: "No points for repeat scans." },
    };
  }
  const messages: Partial<Record<ScanOutcome, string>> = {
    DUPLICATE: "Checkpoint already secured — no extra points. Follow your current clue on the mission screen.",
    REJECTED: NEUTRAL_REJECT_MESSAGE,
    INACTIVE_QR: "This checkpoint is temporarily unavailable. Please contact the Event Desk.",
    EVENT_CLOSED: "The event is not accepting scans right now.",
    ALREADY_FINISHED: "Your team has already opened the vault.",
    RATE_LIMITED: "Too many unrecognised scans. Please wait a moment.",
    AWAITING_ANSWER: "Checkpoint located! Solve the challenge to unlock your next clue.",
  };
  return { ...base, message: messages[ev.outcome as ScanOutcome] ?? NEUTRAL_REJECT_MESSAGE };
}
