import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";
import { SCAN_OUTCOMES } from "../game/types";

/* Notification ------------------------------------------------------- */

const NotificationSchema = new Schema(
  {
    team: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    type: { type: String, enum: ["MAGNET_HIT", "ORGANIZER", "SYSTEM"], required: true },
    message: { type: String, required: true },
    relatedType: { type: String, default: null },
    relatedId: { type: Schema.Types.ObjectId, default: null },
    read: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
    isTest: { type: Boolean, default: false },
  },
  { timestamps: true },
);
NotificationSchema.index({ team: 1, createdAt: -1 });

export type NotificationDoc = InferSchemaType<typeof NotificationSchema> & { _id: Types.ObjectId };
export const Notification: Model<NotificationDoc> =
  (models.Notification as Model<NotificationDoc>) || model<NotificationDoc>("Notification", NotificationSchema);

/* ScanEvent ---------------------------------------------------------- */

const ScanEventSchema = new Schema(
  {
    team: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    qr: { type: Schema.Types.ObjectId, ref: "QRCheckpoint", default: null },
    copyId: { type: String, default: null },
    outcome: { type: String, enum: SCAN_OUTCOMES, required: true },
    /** Internal reason (organizer-only). */
    reason: { type: String, default: null },
    source: { type: String, enum: ["CAMERA", "MANUAL", "LINK"], default: "CAMERA" },
    expectedPosition: { type: Number, default: null },
    position: { type: Number, default: null },
    pointsAwarded: { type: Number, default: 0 },
    correlationId: { type: String, required: true },
    isTest: { type: Boolean, default: false },
  },
  { timestamps: true },
);
ScanEventSchema.index({ team: 1, createdAt: -1 });
ScanEventSchema.index({ outcome: 1, createdAt: -1 });

export type ScanEventDoc = InferSchemaType<typeof ScanEventSchema> & { _id: Types.ObjectId };
export const ScanEvent: Model<ScanEventDoc> =
  (models.ScanEvent as Model<ScanEventDoc>) || model<ScanEventDoc>("ScanEvent", ScanEventSchema);

/* AdminAuditLog ------------------------------------------------------ */

const AdminAuditLogSchema = new Schema(
  {
    admin: { type: Schema.Types.ObjectId, ref: "Admin", default: null },
    adminUsername: { type: String, required: true },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, default: null },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    reason: { type: String, default: null },
  },
  { timestamps: true },
);
AdminAuditLogSchema.index({ createdAt: -1 });
AdminAuditLogSchema.index({ entityType: 1, entityId: 1 });

export type AdminAuditLogDoc = InferSchemaType<typeof AdminAuditLogSchema> & { _id: Types.ObjectId };
export const AdminAuditLog: Model<AdminAuditLogDoc> =
  (models.AdminAuditLog as Model<AdminAuditLogDoc>) || model<AdminAuditLogDoc>("AdminAuditLog", AdminAuditLogSchema);

/* IssueReport (participant "report an issue") ------------------------ */

const IssueReportSchema = new Schema(
  {
    team: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    message: { type: String, required: true, maxlength: 1000 },
    status: { type: String, enum: ["OPEN", "RESOLVED"], default: "OPEN" },
    resolvedBy: { type: String, default: null },
    resolvedAt: { type: Date, default: null },
    isTest: { type: Boolean, default: false },
  },
  { timestamps: true },
);
IssueReportSchema.index({ status: 1, createdAt: -1 });

export type IssueReportDoc = InferSchemaType<typeof IssueReportSchema> & { _id: Types.ObjectId };
export const IssueReport: Model<IssueReportDoc> =
  (models.IssueReport as Model<IssueReportDoc>) || model<IssueReportDoc>("IssueReport", IssueReportSchema);

/* RateLimit (works across serverless instances) ---------------------- */

const RateLimitSchema = new Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  windowStart: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
});
RateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RateLimitDoc = InferSchemaType<typeof RateLimitSchema> & { _id: Types.ObjectId };
export const RateLimit: Model<RateLimitDoc> =
  (models.RateLimit as Model<RateLimitDoc>) || model<RateLimitDoc>("RateLimit", RateLimitSchema);

/* ImportRun (workbook import reports) -------------------------------- */

const ImportIssueSchema = new Schema(
  {
    severity: { type: String, enum: ["ERROR", "WARNING", "INFO"], required: true },
    code: { type: String, required: true },
    message: { type: String, required: true },
    teamNumber: { type: Number, default: null },
    position: { type: Number, default: null },
    copyId: { type: String, default: null },
    sheet: { type: String, default: null },
    cell: { type: String, default: null },
    suggestions: { type: [String], default: [] },
  },
  { _id: false },
);

const ImportRunSchema = new Schema(
  {
    fileName: String,
    sha256: String,
    dryRun: Boolean,
    summary: { type: Schema.Types.Mixed, default: {} },
    applied: { type: Schema.Types.Mixed, default: {} },
    issues: { type: [ImportIssueSchema], default: [] },
  },
  { timestamps: true },
);

export type ImportRunDoc = InferSchemaType<typeof ImportRunSchema> & { _id: Types.ObjectId };
export const ImportRun: Model<ImportRunDoc> =
  (models.ImportRun as Model<ImportRunDoc>) || model<ImportRunDoc>("ImportRun", ImportRunSchema);
