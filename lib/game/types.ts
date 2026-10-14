/** Shared game vocabulary. Safe to import from client and server code. */

export const ACTION_TYPES = ["NORMAL", "BONUS", "SUPER_SHOES", "MAGNET", "FINISH"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const CHECKPOINT_MODES = ["LOCATION", "ANSWER"] as const;
export type CheckpointMode = (typeof CHECKPOINT_MODES)[number];

export const QR_STATUSES = ["ACTIVE", "INACTIVE", "DAMAGED"] as const;
export type QRStatus = (typeof QR_STATUSES)[number];

export const EVENT_STATUSES = ["SETUP", "RUNNING", "PAUSED", "ENDED"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const TEAM_STATUSES = ["ACTIVE", "DISABLED"] as const;
export type TeamStatus = (typeof TEAM_STATUSES)[number];

export const TX_TYPES = [
  "CHECKPOINT",
  "BONUS",
  "SUPER_SHOES",
  "FINISH",
  "MAGNET_CHECKPOINT",
  "MAGNET_GAIN",
  "MAGNET_LOSS",
  "ADMIN_ADJUSTMENT",
  "ADMIN_REVERSAL",
] as const;
export type TxType = (typeof TX_TYPES)[number];

export const SCAN_OUTCOMES = [
  "ACCEPTED",
  "AWAITING_ANSWER",
  "DUPLICATE",
  "REJECTED",
  "INACTIVE_QR",
  "EVENT_CLOSED",
  "ALREADY_FINISHED",
  "RATE_LIMITED",
] as const;
export type ScanOutcome = (typeof SCAN_OUTCOMES)[number];

/** Internal-only reason codes for rejected scans (never shown to participants). */
export const REJECT_REASONS = [
  "UNKNOWN_TOKEN",
  "REVOKED_TOKEN",
  "NOT_IN_TEAM_SEQUENCE",
  "OUT_OF_ORDER",
  "AWAITING_ANSWER_ELSEWHERE",
  "MALFORMED",
] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

export const POWERUP_STATUSES = ["AVAILABLE", "USED", "WASTED", "VOID"] as const;
export type PowerUpStatus = (typeof POWERUP_STATUSES)[number];

export const RANKING_RULES = ["POINTS_THEN_EARLIEST", "POINTS_THEN_PROGRESS_THEN_EARLIEST"] as const;
export type RankingRule = (typeof RANKING_RULES)[number];

export const SUPER_SHOES_MODES = ["HINT", "SCORE_ONLY"] as const;
export type SuperShoesMode = (typeof SUPER_SHOES_MODES)[number];

export type GameRules = {
  points: {
    normal: number;
    bonus: number;
    superShoes: number;
    /** Points for the act of reaching a MAGNET checkpoint (the transfer is separate). */
    magnetCheckpoint: number;
    /** Maximum points a MAGNET transfers from the target to the activator. */
    magnetTransfer: number;
    finish: number;
  };
  superShoes: { mode: SuperShoesMode; hintsGranted: number };
  magnet: { enabled: boolean; consumeWhenTargetEmpty: boolean; revealAttacker: boolean };
  hints: { initialPerTeam: number; fallbackToDestination: boolean };
};

export const DEFAULT_RULES: GameRules = {
  points: { normal: 1, bonus: 2, superShoes: 2, magnetCheckpoint: 0, magnetTransfer: 2, finish: 1 },
  superShoes: { mode: "HINT", hintsGranted: 1 },
  magnet: { enabled: true, consumeWhenTargetEmpty: true, revealAttacker: false },
  hints: { initialPerTeam: 0, fallbackToDestination: true },
};

export const ACTION_LABELS: Record<ActionType, string> = {
  NORMAL: "Checkpoint",
  BONUS: "BONUS",
  SUPER_SHOES: "SUPER SHOES",
  MAGNET: "MAGNET",
  FINISH: "Vault",
};

export const TX_LABELS: Record<TxType, string> = {
  CHECKPOINT: "Normal checkpoint",
  BONUS: "BONUS checkpoint",
  SUPER_SHOES: "SUPER SHOES checkpoint",
  FINISH: "Finish checkpoint",
  MAGNET_CHECKPOINT: "MAGNET checkpoint",
  MAGNET_GAIN: "MAGNET transfer (gained)",
  MAGNET_LOSS: "MAGNET transfer (lost)",
  ADMIN_ADJUSTMENT: "Organizer correction",
  ADMIN_REVERSAL: "Organizer reversal",
};

/** Neutral message for any QR that is not the team's next valid checkpoint. */
export const NEUTRAL_REJECT_MESSAGE =
  "No active mission data found for this scan. Follow your verified clue and try again.";

export const MAGNET_TARGET_MESSAGE =
  "Another team used a MAGNET against your team and transferred points. Check your updated score.";
