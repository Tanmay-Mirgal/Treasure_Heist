import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { withTransaction } from "../db";
import {
  CheckpointCompletion,
  HintUsage,
  IssueReport,
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
import { hashPassword } from "../auth/password";
import { TX_LABELS, type TxType } from "../game/types";
import { ApiError, conflict, notFound } from "../http";
import { audit, type AdminActor } from "./audit";
import { ready } from "./bootstrap";
import { completeCheckpointTx } from "./game";
import { getSettings, rulesOf } from "./settings";

const oid = (id: string) => {
  if (!Types.ObjectId.isValid(id)) throw notFound("Team not found.");
  return new Types.ObjectId(id);
};

async function loadTeam(id: string): Promise<TeamDoc> {
  await ready();
  const team = await Team.findById(oid(id)).lean<TeamDoc>();
  if (!team) throw notFound("Team not found.");
  return team;
}

/** Data written before the event starts is rehearsal data and is purged on start. */
async function isRehearsal() {
  return (await getSettings()).status === "SETUP";
}

/* ------------------------------------------------------------------ */
/* Listing and CRUD                                                    */
/* ------------------------------------------------------------------ */

export async function listTeams() {
  await ready();
  const [teams, seqs, openIssues] = await Promise.all([
    Team.find({}).sort({ teamNumber: 1 }).lean<TeamDoc[]>(),
    TeamSequence.find({}, { team: 1, entries: 1, version: 1 }).lean(),
    IssueReport.aggregate([{ $match: { status: "OPEN" } }, { $group: { _id: "$team", n: { $sum: 1 } } }]),
  ]);
  const seqBy = new Map(seqs.map((s) => [String(s.team), s]));
  const issuesBy = new Map(openIssues.map((i) => [String(i._id), i.n as number]));
  return teams.map((t) => ({
    id: String(t._id),
    username: t.username,
    name: t.displayName,
    number: t.teamNumber,
    status: t.status,
    score: t.score,
    completed: t.currentPosition,
    total: seqBy.get(String(t._id))?.entries.length ?? 0,
    sequenceVersion: seqBy.get(String(t._id))?.version ?? null,
    hasSequence: seqBy.has(String(t._id)),
    hintsAvailable: t.hints?.available ?? 0,
    awaitingAnswer: Boolean(t.awaitingAnswer),
    finishedAt: t.finishedAt,
    lastActivityAt: t.lastActivityAt,
    lastLoginAt: t.lastLoginAt,
    openIssues: issuesBy.get(String(t._id)) ?? 0,
  }));
}

export async function createTeam(
  actor: AdminActor,
  input: { username: string; displayName: string; teamNumber: number; password: string },
) {
  await ready();
  const clash = await Team.findOne({
    $or: [{ usernameLower: input.username.toLowerCase() }, { teamNumber: input.teamNumber }],
  }).lean();
  if (clash) throw conflict("A team with that username or number already exists.");
  const settings = await getSettings();
  const team = await Team.create({
    username: input.username,
    usernameLower: input.username.toLowerCase(),
    displayName: input.displayName,
    teamNumber: input.teamNumber,
    passwordHash: await hashPassword(input.password),
    hints: { available: rulesOf(settings).hints.initialPerTeam, used: 0 },
  });
  await audit(actor, {
    action: "TEAM_CREATE",
    entityType: "Team",
    entityId: String(team._id),
    after: { username: input.username, displayName: input.displayName, teamNumber: input.teamNumber },
  });
  return { id: String(team._id) };
}

export async function updateTeam(
  actor: AdminActor,
  id: string,
  patch: { displayName?: string; status?: "ACTIVE" | "DISABLED" },
  reason: string | null,
) {
  const team = await loadTeam(id);
  const set: Record<string, unknown> = {};
  if (patch.displayName !== undefined) set.displayName = patch.displayName;
  if (patch.status !== undefined) set.status = patch.status;
  const inc = patch.status === "DISABLED" && team.status !== "DISABLED" ? { sessionVersion: 1 } : undefined;
  await Team.updateOne({ _id: team._id }, { $set: set, ...(inc ? { $inc: inc } : {}) });
  await audit(actor, {
    action: "TEAM_UPDATE",
    entityType: "Team",
    entityId: id,
    before: { displayName: team.displayName, status: team.status },
    after: set,
    reason,
  });
}

export async function resetTeamPassword(actor: AdminActor, id: string, password: string, reason: string) {
  const team = await loadTeam(id);
  await Team.updateOne(
    { _id: team._id },
    { $set: { passwordHash: await hashPassword(password) }, $inc: { sessionVersion: 1 } },
  );
  await audit(actor, { action: "TEAM_PASSWORD_RESET", entityType: "Team", entityId: id, reason, after: { sessionsRevoked: true } });
}

export async function exportTeamsCsv(): Promise<string> {
  const rows = await listTeams();
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["teamNumber", "username", "displayName", "status", "score", "completed", "total", "hintsAvailable", "finishedAt", "lastActivityAt"];
  const lines = rows.map((r) =>
    [r.number, r.username, r.name, r.status, r.score, r.completed, r.total, r.hintsAvailable, r.finishedAt, r.lastActivityAt].map(esc).join(","),
  );
  return [header.join(","), ...lines].join("\n") + "\n";
}

/* ------------------------------------------------------------------ */
/* Detail (private monitoring)                                         */
/* ------------------------------------------------------------------ */

export async function teamDetail(id: string) {
  const team = await loadTeam(id);
  const [seq, completions, txs, powerUps, hints, notifications, scans, issues] = await Promise.all([
    TeamSequence.findOne({ team: team._id }).lean<TeamSequenceDoc>(),
    CheckpointCompletion.find({ team: team._id }).sort({ position: 1, createdAt: 1 }).lean(),
    ScoreTransaction.find({ team: team._id }).sort({ createdAt: -1 }).limit(100).lean(),
    PowerUpActivation.find({ team: team._id }).sort({ grantedAt: -1 }).lean(),
    HintUsage.find({ team: team._id }).sort({ position: 1 }).lean(),
    Notification.find({ team: team._id }).sort({ createdAt: -1 }).limit(30).lean(),
    ScanEvent.find({ team: team._id }).sort({ createdAt: -1 }).limit(60).lean(),
    IssueReport.find({ team: team._id }).sort({ createdAt: -1 }).limit(20).lean(),
  ]);
  const qrs = seq
    ? await QRCheckpoint.find({ _id: { $in: seq.entries.map((e) => e.qr) } }).lean<QRCheckpointDoc[]>()
    : [];
  const qrBy = new Map(qrs.map((q) => [String(q._id), q]));
  const teamNames = new Map(
    (await Team.find({}, { displayName: 1 }).lean()).map((t) => [String(t._id), t.displayName]),
  );
  const ledgerTotal = (await ScoreTransaction.aggregate([{ $match: { team: team._id } }, { $group: { _id: null, s: { $sum: "$delta" } } }]))[0]?.s ?? 0;

  return {
    team: {
      id: String(team._id),
      username: team.username,
      name: team.displayName,
      number: team.teamNumber,
      status: team.status,
      score: team.score,
      ledgerTotal,
      currentPosition: team.currentPosition,
      awaitingAnswer: team.awaitingAnswer,
      hints: team.hints,
      gameStartedAt: team.gameStartedAt,
      finishedAt: team.finishedAt,
      lastActivityAt: team.lastActivityAt,
      lastLoginAt: team.lastLoginAt,
      adminNotes: team.adminNotes ?? [],
    },
    sequence: seq
      ? {
          version: seq.version,
          startingClue: seq.startingClue,
          entries: seq.entries.map((e) => {
            const q = qrBy.get(String(e.qr));
            const done = completions.find((c) => c.position === e.position && !c.voided);
            return {
              position: e.position,
              copyId: e.copyId,
              qrId: e.qrId,
              actionType: q?.actionType ?? "NORMAL",
              mode: q?.mode ?? "LOCATION",
              status: q?.status ?? "MISSING",
              placement: q?.placement ?? null,
              destination: q?.destination ?? null,
              clueText: q?.clueText ?? "",
              completed: Boolean(done),
              completedAt: done?.acceptedAt ?? null,
              completionSource: done?.source ?? null,
              points: done?.points ?? null,
            };
          }),
        }
      : null,
    completions: completions.map((c) => ({ ...c, _id: String(c._id) })),
    transactions: txs.map((t) => ({
      id: String(t._id),
      type: t.type,
      label: TX_LABELS[t.type as TxType] ?? t.type,
      delta: t.delta,
      balanceAfter: t.balanceAfter,
      position: t.position,
      copyId: t.copyId,
      counterparty: t.counterparty ? teamNames.get(String(t.counterparty)) ?? null : null,
      reason: t.reason,
      adminUsername: t.adminUsername,
      isTest: t.isTest,
      at: t.createdAt,
    })),
    powerUps: powerUps.map((p) => ({
      id: String(p._id),
      type: p.type,
      status: p.status,
      copyId: p.copyId,
      position: p.position,
      amount: p.amount,
      target: p.targetTeam ? teamNames.get(String(p.targetTeam)) ?? null : null,
      grantedAt: p.grantedAt,
      activatedAt: p.activatedAt,
    })),
    hints: hints.map((h) => ({ position: h.position, text: h.text, at: h.createdAt })),
    notifications: notifications.map((n) => ({ id: String(n._id), type: n.type, message: n.message, read: n.read, at: n.createdAt })),
    scans: scans.map((s) => ({
      id: String(s._id),
      outcome: s.outcome,
      reason: s.reason,
      copyId: s.copyId,
      position: s.position,
      expectedPosition: s.expectedPosition,
      source: s.source,
      points: s.pointsAwarded,
      isTest: s.isTest,
      at: s.createdAt,
    })),
    issues: issues.map((i) => ({ id: String(i._id), message: i.message, status: i.status, at: i.createdAt })),
  };
}

/* ------------------------------------------------------------------ */
/* Manual recovery                                                     */
/* ------------------------------------------------------------------ */

/** Organizer verifies the team's next checkpoint (e.g. damaged QR). Awards points per the rules. */
export async function verifyNextCheckpoint(actor: AdminActor, id: string, reason: string) {
  const team = await loadTeam(id);
  const settings = await getSettings();
  if (settings.status === "ENDED") throw conflict("The event has ended. Re-open is not supported; adjust scores instead.");
  const seq = await TeamSequence.findOne({ team: team._id }).lean<TeamSequenceDoc>();
  if (!seq) throw conflict("This team has no route configured.");
  if (team.finishedAt) throw conflict("This team has already finished.");
  const entry = seq.entries.find((e) => e.position === team.currentPosition + 1);
  if (!entry) throw conflict("No next checkpoint in this team's route.");
  const qr = await QRCheckpoint.findById(entry.qr).lean<QRCheckpointDoc>();
  if (!qr) throw conflict(`Checkpoint ${entry.copyId} is missing from the database.`);
  const isTest = settings.status === "SETUP";
  const result = await withTransaction(async (session) => {
    const r = await completeCheckpointTx(session, {
      teamId: team._id,
      expectedPosition: entry.position,
      seq,
      qr,
      settings,
      source: "ADMIN",
      isTest,
      adminUsername: actor.username,
      reason,
    });
    await audit(
      actor,
      {
        action: "CHECKPOINT_MANUAL_VERIFY",
        entityType: "Team",
        entityId: id,
        before: { currentPosition: team.currentPosition, score: team.score },
        after: { currentPosition: r.position, score: r.score, copyId: qr.copyId, points: r.points },
        reason,
      },
      session,
    );
    return r;
  });
  return result;
}

export async function adjustScore(actor: AdminActor, id: string, delta: number, reason: string, notify: boolean) {
  const team = await loadTeam(id);
  if (!Number.isInteger(delta) || delta === 0) throw new ApiError(400, "BAD_REQUEST", "Adjustment must be a non-zero whole number.");
  const isTest = await isRehearsal();
  const out = await withTransaction(async (session) => {
    const now = new Date();
    const updated = await Team.findOneAndUpdate(
      { _id: team._id, ...(delta < 0 ? { score: { $gte: -delta } } : {}) },
      { $inc: { score: delta }, $set: { scoreChangedAt: now } },
      { session, returnDocument: "after" },
    ).lean<TeamDoc>();
    if (!updated) throw conflict(`Score cannot go below zero (current score ${team.score}).`);
    await ScoreTransaction.create(
      [
        {
          team: team._id,
          delta,
          balanceAfter: updated.score,
          type: "ADMIN_ADJUSTMENT",
          idempotencyKey: `admin:adjust:${randomUUID()}`,
          reason,
          adminUsername: actor.username,
          isTest,
        },
      ],
      { session },
    );
    if (notify) {
      await Notification.create(
        [{ team: team._id, type: "ORGANIZER", message: `The organizer adjusted your score by ${delta > 0 ? "+" : ""}${delta}. Reason: ${reason}`, isTest }],
        { session },
      );
    }
    await audit(actor, { action: "SCORE_ADJUST", entityType: "Team", entityId: id, before: { score: team.score }, after: { score: updated.score, delta }, reason }, session);
    return { score: updated.score };
  });
  const { notifyRealtime } = await import("@/lib/server/notify");
  void notifyRealtime({ leaderboard: true, teamIds: [id] });
  return out;
}

export async function clearAwaitingAnswer(actor: AdminActor, id: string, reason: string) {
  const team = await loadTeam(id);
  if (!team.awaitingAnswer) throw conflict("This team has no pending scan to reset.");
  await Team.updateOne({ _id: team._id }, { $set: { awaitingAnswer: null } });
  await audit(actor, { action: "SCAN_RESET", entityType: "Team", entityId: id, before: { awaitingAnswer: team.awaitingAnswer }, after: { awaitingAnswer: null }, reason });
}

/**
 * Restore an approved earlier state: void completions after `toPosition`.
 * Voided rows are kept for audit; optionally their points are reversed.
 */
export async function rollbackProgress(actor: AdminActor, id: string, toPosition: number, reason: string, reversePoints: boolean) {
  const team = await loadTeam(id);
  if (!Number.isInteger(toPosition) || toPosition < 0 || toPosition >= team.currentPosition)
    throw new ApiError(400, "BAD_REQUEST", `Choose a position between 0 and ${team.currentPosition - 1}.`);
  const settings = await getSettings();
  const rules = rulesOf(settings);
  const isTest = settings.status === "SETUP";
  const out = await withTransaction(async (session) => {
    const now = new Date();
    const voided = await CheckpointCompletion.find({ team: team._id, voided: false, position: { $gt: toPosition } })
      .session(session)
      .lean();
    await CheckpointCompletion.updateMany(
      { _id: { $in: voided.map((v) => v._id) } },
      { $set: { voided: true, voidedAt: now, voidReason: reason } },
      { session },
    );
    const pu = await PowerUpActivation.updateMany(
      { completion: { $in: voided.map((v) => v._id) }, status: "AVAILABLE" },
      { $set: { status: "VOID" } },
      { session },
    );
    const superShoes = voided.filter((v) => v.actionType === "SUPER_SHOES").length;
    const hintsToRemove = rules.superShoes.mode === "HINT" ? Math.min(team.hints?.available ?? 0, superShoes * rules.superShoes.hintsGranted) : 0;

    let reversal = 0;
    if (reversePoints) reversal = Math.min(team.score, voided.reduce((s, v) => s + (v.points ?? 0), 0));

    const updated = await Team.findOneAndUpdate(
      { _id: team._id, currentPosition: team.currentPosition },
      {
        $set: { currentPosition: toPosition, stagedCheckpoint: null, finishedAt: null, awaitingAnswer: null, lastProgressAt: now, ...(reversal ? { scoreChangedAt: now } : {}) },
        $inc: { score: -reversal, "hints.available": -hintsToRemove },
      },
      { session, returnDocument: "after" },
    ).lean<TeamDoc>();
    if (!updated) throw conflict("Team progress changed while rolling back. Please retry.");
    if (reversal) {
      await ScoreTransaction.create(
        [
          {
            team: team._id,
            delta: -reversal,
            balanceAfter: updated.score,
            type: "ADMIN_REVERSAL",
            idempotencyKey: `admin:rollback:${randomUUID()}`,
            reason,
            adminUsername: actor.username,
            isTest,
          },
        ],
        { session },
      );
    }
    await audit(
      actor,
      {
        action: "PROGRESS_ROLLBACK",
        entityType: "Team",
        entityId: id,
        before: { currentPosition: team.currentPosition, score: team.score, finishedAt: team.finishedAt },
        after: {
          currentPosition: toPosition,
          score: updated.score,
          voidedPositions: voided.map((v) => v.position),
          powerUpsVoided: pu.modifiedCount,
          hintsRemoved: hintsToRemove,
          pointsReversed: reversal,
        },
        reason,
      },
      session,
    );
    return { currentPosition: toPosition, score: updated.score, voided: voided.length, pointsReversed: reversal };
  });
  const { notifyRealtime } = await import("@/lib/server/notify");
  void notifyRealtime({ leaderboard: true, teamIds: [id] });
  return out;
}

export async function addAdminNote(actor: AdminActor, id: string, text: string) {
  const team = await loadTeam(id);
  await Team.updateOne({ _id: team._id }, { $push: { adminNotes: { text, adminUsername: actor.username, at: new Date() } } });
  await audit(actor, { action: "TEAM_NOTE", entityType: "Team", entityId: id, after: { text } });
}

export async function messageTeam(actor: AdminActor, id: string, text: string) {
  const team = await loadTeam(id);
  await Notification.create({ team: team._id, type: "ORGANIZER", message: text, isTest: await isRehearsal() });
  await audit(actor, { action: "TEAM_MESSAGE", entityType: "Team", entityId: id, after: { text } });
}

/** Wipe one team's game data (allowed at any time by the admin). */
export async function resetTeamProgress(actor: AdminActor, id: string, reason: string) {
  const team = await loadTeam(id);
  const settings = await getSettings();
  await clearTeamGameData([team._id], rulesOf(settings).hints.initialPerTeam);
  await audit(actor, {
    action: "TEAM_PROGRESS_RESET",
    entityType: "Team",
    entityId: id,
    before: { currentPosition: team.currentPosition, score: team.score },
    after: { currentPosition: 0, score: 0 },
    reason,
  });
  const { notifyRealtime } = await import("@/lib/server/notify");
  void notifyRealtime({ leaderboard: true, teamIds: [id] });
}

/** Reset a team's score/points to 0 without clearing their clue position. */
export async function resetTeamScore(actor: AdminActor, id: string, reason: string) {
  const team = await loadTeam(id);
  if (team.score === 0) return { score: 0 };
  return adjustScore(actor, id, -team.score, reason || "Score reset to 0 by admin", true);
}

/** Reset all teams' scores to 0 (admin privilege). */
export async function resetAllTeamScores(actor: AdminActor, reason: string) {
  await ready();
  const isTest = await isRehearsal();
  const out = await withTransaction(async (session) => {
    const teams = await Team.find({ score: { $gt: 0 } }).session(session).lean<TeamDoc[]>();
    const now = new Date();
    for (const t of teams) {
      await Team.updateOne({ _id: t._id }, { $set: { score: 0, scoreChangedAt: now } }, { session });
      await ScoreTransaction.create(
        [
          {
            team: t._id,
            delta: -t.score,
            balanceAfter: 0,
            type: "ADMIN_ADJUSTMENT",
            idempotencyKey: `admin:reset-all:${t._id}:${randomUUID()}`,
            reason,
            adminUsername: actor.username,
            isTest,
          },
        ],
        { session },
      );
      await Notification.create(
        [{ team: t._id, type: "ORGANIZER", message: `Your points were reset to 0 by the organizer. Reason: ${reason}`, isTest }],
        { session },
      );
    }
    await audit(
      actor,
      {
        action: "SCORE_ADJUST",
        entityType: "EventSettings",
        entityId: "event",
        before: { affectedTeams: teams.length },
        after: { resetScores: 0 },
        reason,
      },
      session,
    );
    return { teamsReset: teams.length };
  });
  const { notifyRealtime } = await import("@/lib/server/notify");
  void notifyRealtime({ leaderboard: true });
  return out;
}

export async function clearTeamGameData(teamIds: Types.ObjectId[] | "ALL", initialHints: number) {
  const f = teamIds === "ALL" ? {} : { team: { $in: teamIds } };
  await Promise.all([
    CheckpointCompletion.deleteMany(f),
    ScoreTransaction.deleteMany(f),
    PowerUpActivation.deleteMany(f),
    HintUsage.deleteMany(f),
    Notification.deleteMany(f),
    ScanEvent.deleteMany(f),
  ]);
  await Team.updateMany(teamIds === "ALL" ? {} : { _id: { $in: teamIds } }, {
    $set: {
      score: 0,
      currentPosition: 0,
      stagedCheckpoint: null,
      awaitingAnswer: null,
      hints: { available: initialHints, used: 0 },
      gameStartedAt: null,
      finishedAt: null,
      lastProgressAt: null,
      scoreChangedAt: null,
      lastActivityAt: null,
    },
  });
}
