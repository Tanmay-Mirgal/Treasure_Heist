import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";
import { ACTION_TYPES, CHECKPOINT_MODES, QR_STATUSES } from "../game/types";

const LocationSchema = new Schema(
  { code: { type: String, default: "" }, label: { type: String, default: "" } },
  { _id: false },
);

/**
 * One physical QR copy (e.g. "QR19-T1"). Copies are team-specific in the
 * workbook, so each copy has its own opaque token and manual code.
 */
const QRCheckpointSchema = new Schema(
  {
    /** Human-readable copy identifier from the workbook ("QR19-T1"). */
    copyId: { type: String, required: true, unique: true, trim: true },
    /** Base QR identifier shared across teams ("QR19"). */
    qrId: { type: String, required: true, index: true, trim: true },
    /** Team that owns this physical copy (from the "-T<n>" suffix), if any. */
    teamNumber: { type: Number, default: null, index: true },

    /** Opaque, random, revocable token encoded in the printed QR. */
    token: { type: String, required: true, unique: true, select: false },
    /** Short random fallback code printed under the QR for manual entry. */
    manualCode: { type: String, required: true, unique: true, select: false },
    tokenVersion: { type: Number, default: 1 },
    tokenIssuedAt: { type: Date, default: Date.now },
    revokedTokens: {
      type: [new Schema({ tokenHash: String, codeHash: String, revokedAt: Date, reason: String }, { _id: false })],
      default: [],
      select: false,
    },

    actionType: { type: String, enum: ACTION_TYPES, default: "NORMAL" },
    mode: { type: String, enum: CHECKPOINT_MODES, default: "LOCATION" },
    /** Participant-visible clue shown after this checkpoint is accepted. */
    clueText: { type: String, default: "" },
    /** Participant-visible question for answer-gated checkpoints. */
    challengePrompt: { type: String, default: "" },
    /** Organizer-only accepted answer(s), "|" separated. Never sent to participants. */
    answer: { type: String, default: "", select: false },
    /** Optional organizer-written hint for the clue shown at this checkpoint. */
    hintText: { type: String, default: "" },
    rewardOverride: { type: Number, default: null },

    placement: { type: LocationSchema, default: () => ({}) },
    destination: { type: LocationSchema, default: () => ({}) },
    sourceNextCopyId: { type: String, default: "" },

    status: { type: String, enum: QR_STATUSES, default: "ACTIVE" },
    organizerNotes: { type: String, default: "" },
    annotations: { type: [String], default: [] },
    /** Fields edited by an organizer; re-imports will not overwrite them. */
    editedFields: { type: [String], default: [] },

    /** Verbatim workbook data, preserved for audit and re-import comparison. */
    source: {
      type: new Schema(
        {
          sheet: String,
          row: Number,
          scanLabel: String,
          clueText: String,
          placementRaw: String,
          destinationRaw: String,
          nextQrRaw: String,
          actionType: String,
          importedAt: Date,
        },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true },
);

export type QRCheckpointDoc = InferSchemaType<typeof QRCheckpointSchema> & { _id: Types.ObjectId };
export const QRCheckpoint: Model<QRCheckpointDoc> =
  (models.QRCheckpoint as Model<QRCheckpointDoc>) || model<QRCheckpointDoc>("QRCheckpoint", QRCheckpointSchema);
