import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";
import { DEFAULT_RULES, EVENT_STATUSES, RANKING_RULES, SUPER_SHOES_MODES } from "../game/types";

const RulesSchema = new Schema(
  {
    points: {
      normal: { type: Number, default: DEFAULT_RULES.points.normal, min: 0 },
      bonus: { type: Number, default: DEFAULT_RULES.points.bonus, min: 0 },
      superShoes: { type: Number, default: DEFAULT_RULES.points.superShoes, min: 0 },
      magnetCheckpoint: { type: Number, default: DEFAULT_RULES.points.magnetCheckpoint, min: 0 },
      magnetTransfer: { type: Number, default: DEFAULT_RULES.points.magnetTransfer, min: 0 },
      finish: { type: Number, default: DEFAULT_RULES.points.finish, min: 0 },
    },
    superShoes: {
      mode: { type: String, enum: SUPER_SHOES_MODES, default: DEFAULT_RULES.superShoes.mode },
      hintsGranted: { type: Number, default: DEFAULT_RULES.superShoes.hintsGranted, min: 0 },
    },
    magnet: {
      enabled: { type: Boolean, default: DEFAULT_RULES.magnet.enabled },
      consumeWhenTargetEmpty: { type: Boolean, default: DEFAULT_RULES.magnet.consumeWhenTargetEmpty },
      revealAttacker: { type: Boolean, default: DEFAULT_RULES.magnet.revealAttacker },
    },
    hints: {
      initialPerTeam: { type: Number, default: DEFAULT_RULES.hints.initialPerTeam, min: 0 },
      fallbackToDestination: { type: Boolean, default: DEFAULT_RULES.hints.fallbackToDestination },
    },
  },
  { _id: false },
);

/** Singleton document (key = "event") holding event state and configuration. */
const EventSettingsSchema = new Schema(
  {
    key: { type: String, default: "event", unique: true },
    eventName: { type: String, default: "THE HEIST" },
    status: { type: String, enum: EVENT_STATUSES, default: "SETUP" },
    testMode: { type: Boolean, default: false },
    startedAt: { type: Date, default: null },
    pausedAt: { type: Date, default: null },
    totalPausedMs: { type: Number, default: 0 },
    endedAt: { type: Date, default: null },
    participationEnabled: { type: Boolean, default: true },
    scoringEnabled: { type: Boolean, default: true },
    timer: {
      enabled: { type: Boolean, default: false },
      durationMinutes: { type: Number, default: 90, min: 1, max: 24 * 60 },
    },
    rules: { type: RulesSchema, default: () => ({}) },
    logInvalidScans: { type: Boolean, default: true },
    logDuplicateScans: { type: Boolean, default: true },
    rankingRule: { type: String, enum: RANKING_RULES, default: "POINTS_THEN_EARLIEST" },
    leaderboardFrozen: { type: Boolean, default: false },
    frozenAt: { type: Date, default: null },
    frozenSnapshot: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

export type EventSettingsDoc = InferSchemaType<typeof EventSettingsSchema> & { _id: Types.ObjectId };
export const EventSettings: Model<EventSettingsDoc> =
  (models.EventSettings as Model<EventSettingsDoc>) || model<EventSettingsDoc>("EventSettings", EventSettingsSchema);
