import { Notification, PowerUpActivation, ScoreTransaction, Team, TeamSequence, type TeamDoc } from "../models";
import { rankTeams } from "../game/rules";
import { TX_LABELS, type TxType } from "../game/types";
import { ready } from "./bootstrap";
import { getSettings, rulesOf, timerOf } from "./settings";
import { Types } from "mongoose";

export type LeaderboardRow = {
  rank: number;
  teamId: string;
  name: string;
  number: number;
  score: number;
  completed: number;
  total: number;
  status: "NOT_STARTED" | "IN_PROGRESS" | "FINISHED" | "DISABLED";
  finishedAt: string | null;
  lastActivityAt: string | null;
  durationMs: number | null;
  formattedDuration: string | null;
  isYou?: boolean;
};

export function formatDurationMs(ms: number | null): string {
  if (ms === null || ms === undefined || ms < 0) return "—";
  const totalSec = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${hrs}h ${mins.toString().padStart(2, "0")}m ${secs.toString().padStart(2, "0")}s`;
  }
  return `${mins}m ${secs.toString().padStart(2, "0")}s`;
}

let cachedLeaderboard: { rows: LeaderboardRow[]; expiresAt: number } | null = null;

export function invalidateLeaderboardCache() {
  cachedLeaderboard = null;
}

/** Live public leaderboard rows computed from MongoDB (aggregate data only). Buffered with 2s TTL for high concurrency. */
export async function computeLeaderboard(): Promise<LeaderboardRow[]> {
  if (cachedLeaderboard && Date.now() < cachedLeaderboard.expiresAt) {
    return cachedLeaderboard.rows;
  }

  await ready();
  const settings = await getSettings();
  const [teams, seqs] = await Promise.all([
    Team.find({}).lean<TeamDoc[]>(),
    TeamSequence.find({}, { team: 1, entries: 1 }).lean(),
  ]);
  const totals = new Map(seqs.map((s) => [String(s.team), s.entries.length]));
  const now = Date.now();
  const eventStart = settings.startedAt ? new Date(settings.startedAt).getTime() : null;

  const teamsWithDurations = teams.map((t) => {
    let durationMs: number | null = null;
    const start = t.gameStartedAt ? new Date(t.gameStartedAt).getTime() : eventStart;
    if (t.finishedAt && start) {
      durationMs = Math.max(0, new Date(t.finishedAt).getTime() - start);
    } else if (t.currentPosition > 0 && start) {
      const end = t.lastProgressAt ? new Date(t.lastProgressAt).getTime() : (t.lastActivityAt ? new Date(t.lastActivityAt).getTime() : now);
      durationMs = Math.max(0, end - start);
    }

    return {
      id: String(t._id),
      teamNumber: t.teamNumber,
      score: t.score,
      completed: t.currentPosition,
      scoreChangedAt: t.scoreChangedAt,
      finishedAt: t.finishedAt,
      gameStartedAt: t.gameStartedAt,
      durationMs,
      formattedDuration: formatDurationMs(durationMs),
      t,
    };
  });

  const ranked = rankTeams(teamsWithDurations, settings.rankingRule);

  const rows: LeaderboardRow[] = ranked.map((r) => ({
    rank: r.rank,
    teamId: r.id,
    name: r.t.displayName,
    number: r.t.teamNumber,
    score: r.t.score,
    completed: r.t.currentPosition,
    total: totals.get(r.id) ?? 0,
    status: (
      r.t.status === "DISABLED"
        ? "DISABLED"
        : r.t.finishedAt
          ? "FINISHED"
          : r.t.currentPosition > 0
            ? "IN_PROGRESS"
            : "NOT_STARTED"
    ) as LeaderboardRow["status"],
    finishedAt: r.t.finishedAt ? new Date(r.t.finishedAt).toISOString() : null,
    lastActivityAt: r.t.lastActivityAt ? new Date(r.t.lastActivityAt).toISOString() : null,
    durationMs: r.durationMs ?? null,
    formattedDuration: r.formattedDuration ?? null,
  }));

  cachedLeaderboard = { rows, expiresAt: Date.now() + 2000 };
  return rows;
}

export async function getLeaderboard() {
  const settings = await getSettings();
  const now = new Date();
  const t = timerOf(settings, now);
  const timer = {
    enabled: t.enabled,
    durationMs: t.durationMs,
    remainingMs: t.remainingMs,
    elapsedMs: t.elapsedMs,
    running: t.running,
    expired: t.expired,
    serverNow: now.toISOString(),
  };
  if (settings.leaderboardFrozen && settings.frozenSnapshot) {
    return {
      frozen: true,
      frozenAt: settings.frozenAt ? new Date(settings.frozenAt).toISOString() : null,
      rows: settings.frozenSnapshot as LeaderboardRow[],
      eventStatus: settings.status,
      testMode: settings.testMode,
      timer,
    };
  }
  return {
    frozen: false,
    frozenAt: null,
    rows: await computeLeaderboard(),
    eventStatus: settings.status,
    testMode: settings.testMode,
    timer,
  };
}

/* ------------------------------------------------------------------ */
/* My Score                                                            */
/* ------------------------------------------------------------------ */

export async function getScoreSummary(teamIdStr: string) {
  await ready();
  const teamId = new Types.ObjectId(teamIdStr);
  const settings = await getSettings();
  const rules = rulesOf(settings);
  const [team, txs, powerUps, notifications, seq] = await Promise.all([
    Team.findById(teamId).lean<TeamDoc>(),
    ScoreTransaction.find({ team: teamId }).sort({ createdAt: -1 }).lean(),
    PowerUpActivation.find({ team: teamId, status: { $ne: "VOID" } }).sort({ grantedAt: -1 }).lean(),
    Notification.find({ team: teamId }).sort({ createdAt: -1 }).limit(20).lean(),
    TeamSequence.findOne({ team: teamId }, { entries: 1 }).lean(),
  ]);
  if (!team) return null;

  const counterpartIds = [
    ...new Set(txs.filter((t) => t.counterparty && (t.type === "MAGNET_GAIN" || rules.magnet.revealAttacker)).map((t) => String(t.counterparty))),
  ];
  const names = new Map(
    (await Team.find({ _id: { $in: counterpartIds } }, { displayName: 1 }).lean()).map((t) => [String(t._id), t.displayName]),
  );
  const powerUpTargets = new Map(
    (await Team.find({ _id: { $in: powerUps.map((p) => p.targetTeam).filter((x): x is Types.ObjectId => Boolean(x)) } }, { displayName: 1 }).lean()).map((t) => [
      String(t._id),
      t.displayName,
    ]),
  );

  const breakdown: Record<string, { count: number; points: number }> = {};
  for (const tx of txs) {
    const b = (breakdown[tx.type] ??= { count: 0, points: 0 });
    b.count += 1;
    b.points += tx.delta;
  }
  const deductions = txs.filter((t) => t.delta < 0).reduce((s, t) => s + t.delta, 0);
  const ledgerTotal = txs.reduce((s, t) => s + t.delta, 0);
  const total = seq?.entries.length ?? 0;

  return {
    team: { id: String(team._id), name: team.displayName, number: team.teamNumber },
    score: team.score,
    ledgerTotal,
    consistent: ledgerTotal === team.score,
    completed: team.currentPosition,
    total,
    remaining: Math.max(0, total - team.currentPosition),
    finishedAt: team.finishedAt,
    breakdown,
    deductions,
    hints: { available: team.hints?.available ?? 0, used: team.hints?.used ?? 0 },
    powerUps: powerUps.map((p) => ({
      id: String(p._id),
      type: p.type,
      status: p.status,
      amount: p.amount,
      grantedAt: p.grantedAt,
      activatedAt: p.activatedAt,
      targetName: p.targetTeam ? powerUpTargets.get(String(p.targetTeam)) ?? null : null,
    })),
    recent: txs.slice(0, 40).map((t) => ({
      id: String(t._id),
      type: t.type,
      label: TX_LABELS[t.type as TxType] ?? t.type,
      delta: t.delta,
      balanceAfter: t.balanceAfter,
      position: t.position,
      at: t.createdAt,
      reason: t.type === "ADMIN_ADJUSTMENT" || t.type === "ADMIN_REVERSAL" ? t.reason : null,
      counterpartyName: t.counterparty ? names.get(String(t.counterparty)) ?? null : null,
    })),
    notifications: notifications.map((n) => ({ id: String(n._id), type: n.type, message: n.message, read: n.read, createdAt: n.createdAt })),
  };
}

export async function markNotificationsRead(teamIdStr: string, ids: string[] | "all") {
  await ready();
  const filter: Record<string, unknown> = { team: new Types.ObjectId(teamIdStr), read: false };
  if (ids !== "all") filter._id = { $in: ids.filter((i) => Types.ObjectId.isValid(i)).map((i) => new Types.ObjectId(i)) };
  const res = await Notification.updateMany(filter, { $set: { read: true, readAt: new Date() } });
  return res.modifiedCount;
}
