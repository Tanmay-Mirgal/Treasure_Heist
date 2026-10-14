import type { ActionType, EventStatus, GameRules, RankingRule, TxType } from "./types";

/** Points awarded for completing a checkpoint, per the authoritative scoring rules. */
export function checkpointReward(action: ActionType, rules: GameRules, rewardOverride?: number | null): number {
  if (typeof rewardOverride === "number" && Number.isFinite(rewardOverride)) return Math.max(0, Math.trunc(rewardOverride));
  switch (action) {
    case "BONUS":
      return rules.points.bonus;
    case "SUPER_SHOES":
      return rules.points.superShoes;
    case "MAGNET":
      return rules.points.magnetCheckpoint;
    case "FINISH":
      return rules.points.finish;
    default:
      return rules.points.normal;
  }
}

export function checkpointTxType(action: ActionType): TxType {
  switch (action) {
    case "BONUS":
      return "BONUS";
    case "SUPER_SHOES":
      return "SUPER_SHOES";
    case "MAGNET":
      return "MAGNET_CHECKPOINT";
    case "FINISH":
      return "FINISH";
    default:
      return "CHECKPOINT";
  }
}

/** A MAGNET moves up to `max` existing points; it never creates points or a negative score. */
export function magnetTransferAmount(targetScore: number, max: number): number {
  return Math.max(0, Math.min(Math.trunc(targetScore), Math.trunc(max)));
}

export type TimerState = {
  enabled: boolean;
  durationMs: number | null;
  elapsedMs: number;
  remainingMs: number | null;
  expired: boolean;
  running: boolean;
};

export function computeTimer(
  s: {
    status: EventStatus;
    startedAt?: Date | null;
    pausedAt?: Date | null;
    endedAt?: Date | null;
    totalPausedMs?: number;
    timer: { enabled: boolean; durationMinutes: number };
  },
  now: Date,
): TimerState {
  const durationMs = s.timer.enabled ? s.timer.durationMinutes * 60_000 : null;
  if (!s.startedAt) {
    return { enabled: s.timer.enabled, durationMs, elapsedMs: 0, remainingMs: durationMs, expired: false, running: false };
  }
  const end =
    s.status === "ENDED" && s.endedAt
      ? s.endedAt.getTime()
      : s.status === "PAUSED" && s.pausedAt
        ? s.pausedAt.getTime()
        : now.getTime();
  const elapsedMs = Math.max(0, end - s.startedAt.getTime() - (s.totalPausedMs ?? 0));
  const remainingMs = durationMs === null ? null : Math.max(0, durationMs - elapsedMs);
  return {
    enabled: s.timer.enabled,
    durationMs,
    elapsedMs,
    remainingMs,
    expired: durationMs !== null && elapsedMs >= durationMs,
    running: s.status === "RUNNING",
  };
}

export type RankableTeam = {
  id: string;
  teamNumber: number;
  score: number;
  completed: number;
  scoreChangedAt?: Date | null;
  finishedAt?: Date | null;
};

/**
 * Deterministic ranking. Default: points (desc), then whoever reached that
 * score earliest, then most checkpoints, then team number.
 */
export function rankTeams<T extends RankableTeam>(teams: T[], rule: RankingRule): (T & { rank: number })[] {
  const t = (d?: Date | null) => (d ? d.getTime() : Number.MAX_SAFE_INTEGER);
  const sorted = [...teams].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (rule === "POINTS_THEN_PROGRESS_THEN_EARLIEST" && b.completed !== a.completed) return b.completed - a.completed;
    const ta = a.score === 0 ? Number.MAX_SAFE_INTEGER : t(a.scoreChangedAt);
    const tb = b.score === 0 ? Number.MAX_SAFE_INTEGER : t(b.scoreChangedAt);
    if (ta !== tb) return ta - tb;
    if (b.completed !== a.completed) return b.completed - a.completed;
    return a.teamNumber - b.teamNumber;
  });
  // Equal sort keys share a rank only when every tie-break is equal (never, given team number).
  return sorted.map((team, i) => ({ ...team, rank: i + 1 }));
}

/** Normalize a free-text answer for answer-gated checkpoints. */
export function normalizeAnswer(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’“”"'`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function answersMatch(given: string, expected: string): boolean {
  const accepted = expected
    .split("|")
    .map((a) => normalizeAnswer(a))
    .filter(Boolean);
  const g = normalizeAnswer(given);
  return g.length > 0 && accepted.includes(g);
}
