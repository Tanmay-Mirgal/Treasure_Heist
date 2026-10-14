import { Types } from "mongoose";
import {
  AdminAuditLog,
  CheckpointCompletion,
  EventSettings,
  IssueReport,
  PowerUpActivation,
  ScanEvent,
  ScoreTransaction,
  Team,
  type TeamDoc,
} from "../models";
import { DEFAULT_RULES, type EventStatus, type GameRules, type RankingRule } from "../game/types";
import { ApiError, conflict, notFound } from "../http";
import { audit, type AdminActor } from "./audit";
import { ready } from "./bootstrap";
import { clearTeamGameData, resetAllTeamScores } from "./admin-teams";
import { liveValidation } from "./admin-content";
import { computeLeaderboard } from "./leaderboard";
import { getSettings, publicEventView, rulesOf, timerOf, type Settings } from "./settings";

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export function adminSettingsView(s: Settings) {
  return {
    eventName: s.eventName,
    status: s.status,
    testMode: s.testMode,
    startedAt: s.startedAt,
    pausedAt: s.pausedAt,
    endedAt: s.endedAt,
    totalPausedMs: s.totalPausedMs,
    participationEnabled: s.participationEnabled,
    scoringEnabled: s.scoringEnabled,
    timer: { enabled: Boolean(s.timer?.enabled), durationMinutes: s.timer?.durationMinutes ?? 90 },
    rules: rulesOf(s),
    defaults: DEFAULT_RULES,
    logInvalidScans: s.logInvalidScans,
    logDuplicateScans: s.logDuplicateScans,
    rankingRule: s.rankingRule,
    leaderboardFrozen: s.leaderboardFrozen,
    frozenAt: s.frozenAt,
    clock: publicEventView(s),
    timerState: timerOf(s),
  };
}

export type SettingsPatch = Partial<{
  eventName: string;
  participationEnabled: boolean;
  scoringEnabled: boolean;
  timer: { enabled: boolean; durationMinutes: number };
  rules: Partial<{
    points: Partial<GameRules["points"]>;
    superShoes: Partial<GameRules["superShoes"]>;
    magnet: Partial<GameRules["magnet"]>;
    hints: Partial<GameRules["hints"]>;
  }>;
  logInvalidScans: boolean;
  logDuplicateScans: boolean;
  rankingRule: RankingRule;
}>;

function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) Object.assign(out, flatten(v as Record<string, unknown>, key));
    else if (v !== undefined) out[key] = v;
  }
  return out;
}

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

export async function updateSettings(actor: AdminActor, patch: SettingsPatch, reason: string | null) {
  const s = await getSettings();
  const flat = flatten(patch as Record<string, unknown>);
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) {
    const prev = k.startsWith("rules.") ? getPath({ rules: rulesOf(s) }, k) : getPath(s, k);
    if (JSON.stringify(prev) === JSON.stringify(v)) continue;
    before[k] = prev;
    after[k] = v;
  }
  await EventSettings.updateOne({ key: "event" }, { $set: after });
  await audit(actor, { action: "SETTINGS_UPDATE", entityType: "EventSettings", entityId: "event", before, after, reason });
  const { notifyRealtime } = await import("@/lib/server/notify");
  void notifyRealtime({ leaderboard: true });
  return adminSettingsView(await getSettings());
}

/* ------------------------------------------------------------------ */
/* Event controls                                                      */
/* ------------------------------------------------------------------ */

export const EVENT_ACTIONS = ["start", "pause", "resume", "end", "freeze", "unfreeze", "test-mode-on", "test-mode-off", "reset", "reset-scores"] as const;
export type EventAction = (typeof EVENT_ACTIONS)[number];

async function purgeRehearsalData(initialHints: number) {
  await Promise.all([IssueReport.deleteMany({})]);
  await clearTeamGameData("ALL", initialHints);
}

export async function eventAction(actor: AdminActor, action: EventAction, reason: string | null) {
  const s = await getSettings();
  const now = new Date();
  const set: Record<string, unknown> = {};
  const need = (...allowed: EventStatus[]) => {
    if (!allowed.includes(s.status)) throw conflict(`Cannot ${action.replace(/-/g, " ")} while the event is ${s.status}.`);
  };
  const initialHints = rulesOf(s).hints.initialPerTeam;
  let note: string | null = null;

  switch (action) {
    case "start":
      need("SETUP");
      // Nothing that happened before the start counts: wipe rehearsal data.
      await purgeRehearsalData(initialHints);
      Object.assign(set, {
        status: "RUNNING",
        testMode: false,
        startedAt: now,
        pausedAt: null,
        endedAt: null,
        totalPausedMs: 0,
        leaderboardFrozen: false,
        frozenAt: null,
        frozenSnapshot: null,
      });
      note = "Rehearsal/test data cleared; all teams reset to 0.";
      break;
    case "pause":
      need("RUNNING");
      Object.assign(set, { status: "PAUSED", pausedAt: now });
      break;
    case "resume":
      need("PAUSED");
      Object.assign(set, {
        status: "RUNNING",
        pausedAt: null,
        totalPausedMs: (s.totalPausedMs ?? 0) + (s.pausedAt ? now.getTime() - new Date(s.pausedAt).getTime() : 0),
      });
      break;
    case "end":
      need("RUNNING", "PAUSED");
      Object.assign(set, {
        status: "ENDED",
        endedAt: now,
        pausedAt: null,
        totalPausedMs: (s.totalPausedMs ?? 0) + (s.status === "PAUSED" && s.pausedAt ? now.getTime() - new Date(s.pausedAt).getTime() : 0),
      });
      break;
    case "freeze":
      if (s.leaderboardFrozen) throw conflict("The leaderboard is already frozen.");
      Object.assign(set, { leaderboardFrozen: true, frozenAt: now, frozenSnapshot: await computeLeaderboard() });
      break;
    case "unfreeze":
      if (!s.leaderboardFrozen) throw conflict("The leaderboard is not frozen.");
      Object.assign(set, { leaderboardFrozen: false, frozenAt: null, frozenSnapshot: null });
      break;
    case "test-mode-on":
      need("SETUP");
      set.testMode = true;
      break;
    case "test-mode-off":
      need("SETUP");
      await purgeRehearsalData(initialHints);
      set.testMode = false;
      note = "Test data cleared; all teams reset to 0.";
      break;
    case "reset-scores":
      await resetAllTeamScores(actor, reason || "All team scores reset to 0 by admin");
      note = "All team scores were reset to 0.";
      break;
    case "reset":
      need("SETUP", "ENDED");
      await purgeRehearsalData(initialHints);
      Object.assign(set, {
        status: "SETUP",
        testMode: false,
        startedAt: null,
        pausedAt: null,
        endedAt: null,
        totalPausedMs: 0,
        leaderboardFrozen: false,
        frozenAt: null,
        frozenSnapshot: null,
      });
      note = "All game data cleared; event returned to SETUP.";
      break;
    default:
      throw new ApiError(400, "BAD_REQUEST", "Unknown event action.");
  }

  await EventSettings.updateOne({ key: "event" }, { $set: set });
  await audit(actor, {
    action: `EVENT_${action.toUpperCase().replace(/-/g, "_")}`,
    entityType: "EventSettings",
    entityId: "event",
    before: { status: s.status, testMode: s.testMode, leaderboardFrozen: s.leaderboardFrozen },
    after: { status: set.status ?? s.status, testMode: set.testMode ?? s.testMode, leaderboardFrozen: set.leaderboardFrozen ?? s.leaderboardFrozen, note },
    reason,
  });
  const { notifyRealtime } = await import("@/lib/server/notify");
  void notifyRealtime({ leaderboard: true });
  return adminSettingsView(await getSettings());
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

export async function overview() {
  await ready();
  const s = await getSettings();
  const testScope = s.status === "SETUP";
  const scope = { isTest: testScope };
  const [teams, board, accepted, rejected, magnets, bonus, shoes, recentScans, recentTx, openIssues, ledger, validation] =
    await Promise.all([
      Team.find({}).lean<TeamDoc[]>(),
      computeLeaderboard(),
      ScanEvent.countDocuments({ ...scope, outcome: "ACCEPTED" }),
      ScanEvent.countDocuments({ ...scope, outcome: "REJECTED" }),
      PowerUpActivation.countDocuments({ ...scope, status: { $in: ["USED", "WASTED"] } }),
      CheckpointCompletion.countDocuments({ ...scope, voided: false, actionType: "BONUS" }),
      CheckpointCompletion.countDocuments({ ...scope, voided: false, actionType: "SUPER_SHOES" }),
      ScanEvent.find({}).sort({ createdAt: -1 }).limit(25).lean(),
      ScoreTransaction.find({}).sort({ createdAt: -1 }).limit(15).lean(),
      IssueReport.find({ status: "OPEN" }).sort({ createdAt: -1 }).limit(20).lean(),
      ScoreTransaction.aggregate([{ $group: { _id: "$team", s: { $sum: "$delta" } } }]),
      liveValidation(),
    ]);
  const name = new Map(teams.map((t) => [String(t._id), t.displayName]));
  const ledgerBy = new Map(ledger.map((l) => [String(l._id), l.s as number]));
  const mismatched = teams
    .filter((t) => (ledgerBy.get(String(t._id)) ?? 0) !== t.score)
    .map((t) => ({ team: t.displayName, score: t.score, ledger: ledgerBy.get(String(t._id)) ?? 0 }));
  const leader = board[0] && board[0].score > 0 ? board[0] : null;

  return {
    settings: adminSettingsView(s),
    scope: testScope ? "TEST" : "OFFICIAL",
    stats: {
      totalTeams: teams.length,
      activeTeams: teams.filter((t) => t.status === "ACTIVE" && t.currentPosition > 0 && !t.finishedAt).length,
      disabledTeams: teams.filter((t) => t.status === "DISABLED").length,
      finishedTeams: teams.filter((t) => t.finishedAt).length,
      leader: leader ? { name: leader.name, score: leader.score } : null,
      highestScore: board.reduce((m, r) => Math.max(m, r.score), 0),
      acceptedScans: accepted,
      rejectedScans: rejected,
      magnetActivations: magnets,
      bonusRewards: bonus,
      superShoesRewards: shoes,
    },
    leaderboard: board,
    ledgerMismatches: mismatched,
    validation: { summary: validation.summary, top: validation.issues.filter((i) => i.severity === "ERROR").slice(0, 8) },
    openIssues: openIssues.map((i) => ({ id: String(i._id), team: name.get(String(i.team)) ?? "?", message: i.message, at: i.createdAt })),
    recentScans: recentScans.map((e) => ({
      id: String(e._id),
      team: name.get(String(e.team)) ?? "?",
      outcome: e.outcome,
      reason: e.reason,
      copyId: e.copyId,
      position: e.position,
      expectedPosition: e.expectedPosition,
      points: e.pointsAwarded,
      source: e.source,
      isTest: e.isTest,
      at: e.createdAt,
    })),
    recentTransactions: recentTx.map((t) => ({
      id: String(t._id),
      team: name.get(String(t.team)) ?? "?",
      type: t.type,
      delta: t.delta,
      counterparty: t.counterparty ? name.get(String(t.counterparty)) ?? null : null,
      reason: t.reason,
      isTest: t.isTest,
      at: t.createdAt,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Audit, scans, issues                                                */
/* ------------------------------------------------------------------ */

export async function listAudit(opts: { page: number; pageSize: number; action?: string; entityType?: string }) {
  await ready();
  const q: Record<string, unknown> = {};
  if (opts.action) q.action = opts.action;
  if (opts.entityType) q.entityType = opts.entityType;
  const [items, total, actions] = await Promise.all([
    AdminAuditLog.find(q)
      .sort({ createdAt: -1 })
      .skip((opts.page - 1) * opts.pageSize)
      .limit(opts.pageSize)
      .lean(),
    AdminAuditLog.countDocuments(q),
    AdminAuditLog.distinct("action"),
  ]);
  return {
    total,
    page: opts.page,
    pageSize: opts.pageSize,
    actions: actions.sort(),
    items: items.map((a) => ({
      id: String(a._id),
      at: a.createdAt,
      admin: a.adminUsername,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      before: a.before,
      after: a.after,
      reason: a.reason,
    })),
  };
}

export async function listScans(opts: { limit: number; outcome?: string; teamId?: string }) {
  await ready();
  const q: Record<string, unknown> = {};
  if (opts.outcome) q.outcome = opts.outcome;
  if (opts.teamId && Types.ObjectId.isValid(opts.teamId)) q.team = new Types.ObjectId(opts.teamId);
  const [scans, teams] = await Promise.all([
    ScanEvent.find(q).sort({ createdAt: -1 }).limit(opts.limit).lean(),
    Team.find({}, { displayName: 1 }).lean(),
  ]);
  const name = new Map(teams.map((t) => [String(t._id), t.displayName]));
  return scans.map((e) => ({
    id: String(e._id),
    team: name.get(String(e.team)) ?? "?",
    outcome: e.outcome,
    reason: e.reason,
    copyId: e.copyId,
    position: e.position,
    expectedPosition: e.expectedPosition,
    source: e.source,
    points: e.pointsAwarded,
    correlationId: e.correlationId,
    isTest: e.isTest,
    at: e.createdAt,
  }));
}

export async function resolveIssue(actor: AdminActor, id: string) {
  await ready();
  if (!Types.ObjectId.isValid(id)) throw notFound("Issue not found.");
  const res = await IssueReport.updateOne({ _id: id, status: "OPEN" }, { $set: { status: "RESOLVED", resolvedBy: actor.username, resolvedAt: new Date() } });
  if (res.modifiedCount !== 1) throw notFound("Open issue not found.");
  await audit(actor, { action: "ISSUE_RESOLVE", entityType: "IssueReport", entityId: id });
}

