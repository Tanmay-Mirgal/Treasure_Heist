import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";
import { TEAM_STATUSES } from "../game/types";

const TeamSchema = new Schema(
  {
    username: { type: String, required: true, trim: true, maxlength: 40 },
    usernameLower: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    displayName: { type: String, required: true, trim: true, maxlength: 60 },
    teamNumber: { type: Number, required: true, unique: true, min: 1 },
    status: { type: String, enum: TEAM_STATUSES, default: "ACTIVE" },
    score: { type: Number, default: 0, min: 0 },
    /** Number of completed checkpoints in the team's sequence (0 = not started). */
    currentPosition: { type: Number, default: 0, min: 0 },
    /** Station that has been scanned whose question is currently active in INTEL awaiting next QR verification. */
    stagedCheckpoint: {
      type: new Schema(
        {
          position: { type: Number, required: true },
          qr: { type: Schema.Types.ObjectId, ref: "QRCheckpoint", required: true },
          copyId: { type: String, required: true },
          actionType: { type: String, default: "NORMAL" },
          clueText: { type: String, default: "" },
          points: { type: Number, default: 0 },
          rewardText: { type: String, default: "" },
          scannedAt: { type: Date, default: Date.now },
        },
        { _id: false },
      ),
      default: null,
    },
    /** Set when the team reached an answer-gated checkpoint and still owes the answer. */
    awaitingAnswer: {
      type: new Schema(
        { position: Number, qr: { type: Schema.Types.ObjectId, ref: "QRCheckpoint" }, since: Date, attempts: { type: Number, default: 0 } },
        { _id: false },
      ),
      default: null,
    },
    hints: {
      available: { type: Number, default: 0, min: 0 },
      used: { type: Number, default: 0, min: 0 },
    },
    gameStartedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    lastProgressAt: { type: Date, default: null },
    scoreChangedAt: { type: Date, default: null },
    lastActivityAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    /** Incremented on password reset / disable to invalidate existing sessions. */
    sessionVersion: { type: Number, default: 1 },
    adminNotes: [
      new Schema({ text: String, adminUsername: String, at: { type: Date, default: Date.now } }, { _id: true }),
    ],
  },
  { timestamps: true },
);

TeamSchema.index({ score: -1, scoreChangedAt: 1 });

export type TeamDoc = InferSchemaType<typeof TeamSchema> & { _id: Types.ObjectId };
export const Team: Model<TeamDoc> = (models.Team as Model<TeamDoc>) || model<TeamDoc>("Team", TeamSchema);
