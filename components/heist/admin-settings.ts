"use client";

export type AdminSettings = {
  eventName: string;
  status: "SETUP" | "RUNNING" | "PAUSED" | "ENDED";
  testMode: boolean;
  startedAt: string | null;
  pausedAt: string | null;
  endedAt: string | null;
  participationEnabled: boolean;
  scoringEnabled: boolean;
  timer: { enabled: boolean; durationMinutes: number };
  rules: {
    points: { normal: number; bonus: number; superShoes: number; magnetCheckpoint: number; magnetTransfer: number; finish: number };
    superShoes: { mode: "HINT" | "SCORE_ONLY"; hintsGranted: number };
    magnet: { enabled: boolean; consumeWhenTargetEmpty: boolean; revealAttacker: boolean };
    hints: { initialPerTeam: number; fallbackToDestination: boolean };
  };
  defaults: AdminSettings["rules"];
  logInvalidScans: boolean;
  logDuplicateScans: boolean;
  rankingRule: "POINTS_THEN_EARLIEST" | "POINTS_THEN_PROGRESS_THEN_EARLIEST";
  leaderboardFrozen: boolean;
  frozenAt: string | null;
  timerState: { enabled: boolean; remainingMs: number | null; elapsedMs: number; expired: boolean; running: boolean };
};
