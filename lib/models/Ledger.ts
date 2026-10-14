import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";
import { ACTION_TYPES, POWERUP_STATUSES, TX_TYPES } from "../game/types";

/* ------------------------------------------------------------------ */
/* CheckpointCompletion                                                */
/* ------------------------------------------------------------------ */

const CheckpointCompletionSchema = new Schema(
  {
    team: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    qr: { type: Schema.Types.ObjectId, ref: "QRCheckpoint", required: true },
    copyId: { type: String, required: true },
    position: { type: Number, required: true, min: 1 },
    sequenceVersion: { type: Number, required: true },
    actionType: { type: String, enum: ACTION_TYPES, required: true },
    points: { type: Number, default: 0 },
    acceptedAt: { type: Date, default: Date.now },
    idempotencyKey: { type: String, required: true, unique: true },
    source: { type: String, enum: ["SCAN", "LINK", "MANUAL_CODE", "ADMIN"], required: true },
    rewardTransaction: { type: Schema.Types.ObjectId, ref: "ScoreTransaction", default: null },
    adminUsername: { type: String, default: null },
    isTest: { type: Boolean, default: false },
    voided: { type: Boolean, default: false },
    voidedAt: { type: Date, default: null },
    voidReason: { type: String, default: null },
  },
  { timestamps: true },
);
// A team can complete each sequence position at most once (voided rows excluded).
CheckpointCompletionSchema.index(
  { team: 1, position: 1 },
  { unique: true, partialFilterExpression: { voided: false } },
);

export type CheckpointCompletionDoc = InferSchemaType<typeof CheckpointCompletionSchema> & { _id: Types.ObjectId };
export const CheckpointCompletion: Model<CheckpointCompletionDoc> =
  (models.CheckpointCompletion as Model<CheckpointCompletionDoc>) ||
  model<CheckpointCompletionDoc>("CheckpointCompletion", CheckpointCompletionSchema);

/* ------------------------------------------------------------------ */
/* ScoreTransaction (the scoring ledger)                               */
/* ------------------------------------------------------------------ */

const ScoreTransactionSchema = new Schema(
  {
    team: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    delta: { type: Number, required: true },
    balanceAfter: { type: Number, required: true, min: 0 },
    type: { type: String, enum: TX_TYPES, required: true },
    qr: { type: Schema.Types.ObjectId, ref: "QRCheckpoint", default: null },
    copyId: { type: String, default: null },
    position: { type: Number, default: null },
    powerUp: { type: Schema.Types.ObjectId, ref: "PowerUpActivation", default: null },
    /** The other team in a MAGNET transfer. */
    counterparty: { type: Schema.Types.ObjectId, ref: "Team", default: null },
    /** Shared id linking both legs of a transfer. */
    transferGroup: { type: String, default: null, index: true },
    relatedTransaction: { type: Schema.Types.ObjectId, ref: "ScoreTransaction", default: null },
    idempotencyKey: { type: String, required: true, unique: true },
    reason: { type: String, default: null },
    adminUsername: { type: String, default: null },
    isTest: { type: Boolean, default: false },
  },
  { timestamps: true },
);
ScoreTransactionSchema.index({ team: 1, createdAt: -1 });

export type ScoreTransactionDoc = InferSchemaType<typeof ScoreTransactionSchema> & { _id: Types.ObjectId };
export const ScoreTransaction: Model<ScoreTransactionDoc> =
  (models.ScoreTransaction as Model<ScoreTransactionDoc>) ||
  model<ScoreTransactionDoc>("ScoreTransaction", ScoreTransactionSchema);

/* ------------------------------------------------------------------ */
/* PowerUpActivation                                                   */
/* ------------------------------------------------------------------ */

const PowerUpActivationSchema = new Schema(
  {
    team: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    type: { type: String, enum: ["MAGNET"], required: true },
    qr: { type: Schema.Types.ObjectId, ref: "QRCheckpoint", required: true },
    copyId: { type: String, required: true },
    position: { type: Number, required: true },
    /** The completion that granted this power-up (one grant per completion). */
    completion: { type: Schema.Types.ObjectId, ref: "CheckpointCompletion", required: true, unique: true },
    status: { type: String, enum: POWERUP_STATUSES, default: "AVAILABLE" },
    targetTeam: { type: Schema.Types.ObjectId, ref: "Team", default: null },
    amount: { type: Number, default: 0 },
    idempotencyKey: { type: String, default: null },
    grantedAt: { type: Date, default: Date.now },
    activatedAt: { type: Date, default: null },
    transactions: { type: [Schema.Types.ObjectId], ref: "ScoreTransaction", default: [] },
    isTest: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export type PowerUpActivationDoc = InferSchemaType<typeof PowerUpActivationSchema> & { _id: Types.ObjectId };
export const PowerUpActivation: Model<PowerUpActivationDoc> =
  (models.PowerUpActivation as Model<PowerUpActivationDoc>) ||
  model<PowerUpActivationDoc>("PowerUpActivation", PowerUpActivationSchema);

/* ------------------------------------------------------------------ */
/* HintUsage                                                           */
/* ------------------------------------------------------------------ */

const HintUsageSchema = new Schema(
  {
    team: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    /** Mission position the hint was spent on (next expected checkpoint). */
    position: { type: Number, required: true },
    text: { type: String, required: true },
    isTest: { type: Boolean, default: false },
  },
  { timestamps: true },
);
HintUsageSchema.index({ team: 1, position: 1 }, { unique: true });

export type HintUsageDoc = InferSchemaType<typeof HintUsageSchema> & { _id: Types.ObjectId };
export const HintUsage: Model<HintUsageDoc> =
  (models.HintUsage as Model<HintUsageDoc>) || model<HintUsageDoc>("HintUsage", HintUsageSchema);
