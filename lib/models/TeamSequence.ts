import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

const EntrySchema = new Schema(
  {
    /** 1-based position in the team's route ("Scan 1" = 1, finish = last). */
    position: { type: Number, required: true, min: 1 },
    qr: { type: Schema.Types.ObjectId, ref: "QRCheckpoint", required: true },
    copyId: { type: String, required: true },
    qrId: { type: String, required: true },
    /** Next entry's copy id ("" for the final entry). Derived from order on save. */
    nextCopyId: { type: String, default: "" },
    isFinish: { type: Boolean, default: false },
    mandatory: { type: Boolean, default: true },
    scanLabel: { type: String, default: "" },
  },
  { _id: false },
);

const StartingClueSchema = new Schema(
  {
    qrId: { type: String, default: "" },
    /** Organizer-only: where the first QR is. */
    location: { type: String, default: "" },
    /** Participant-visible starting riddle. */
    riddle: { type: String, default: "" },
    /** Organizer-only answer from the workbook. */
    answer: { type: String, default: "" },
    sourceRiddle: { type: String, default: "" },
    sourceLocation: { type: String, default: "" },
    sourceAnswer: { type: String, default: "" },
    editedFields: { type: [String], default: [] },
  },
  { _id: false },
);

const TeamSequenceSchema = new Schema(
  {
    team: { type: Schema.Types.ObjectId, ref: "Team", required: true, unique: true },
    teamNumber: { type: Number, required: true, unique: true },
    version: { type: Number, default: 1 },
    entries: { type: [EntrySchema], default: [] },
    startingClue: { type: StartingClueSchema, default: () => ({}) },
    /** Base QR ids as listed in the workbook "sequence sheet" (for comparison). */
    sourceOrder: { type: [String], default: [] },
    updatedBy: { type: String, default: "import" },
  },
  { timestamps: true },
);

TeamSequenceSchema.index({ "entries.qr": 1 });

export type TeamSequenceDoc = InferSchemaType<typeof TeamSequenceSchema> & { _id: Types.ObjectId };
export type SequenceEntry = InferSchemaType<typeof EntrySchema>;
export const TeamSequence: Model<TeamSequenceDoc> =
  (models.TeamSequence as Model<TeamSequenceDoc>) || model<TeamSequenceDoc>("TeamSequence", TeamSequenceSchema);
