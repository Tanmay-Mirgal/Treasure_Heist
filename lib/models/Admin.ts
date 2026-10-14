import { Schema, model, models, type InferSchemaType, type Model, Types } from "mongoose";

const AdminSchema = new Schema(
  {
    username: { type: String, required: true, trim: true },
    usernameLower: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["ADMIN"], default: "ADMIN" },
    active: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: false },
    passwordChangedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    sessionVersion: { type: Number, default: 1 },
  },
  { timestamps: true },
);

export type AdminDoc = InferSchemaType<typeof AdminSchema> & { _id: Types.ObjectId };
export const Admin: Model<AdminDoc> = (models.Admin as Model<AdminDoc>) || model<AdminDoc>("Admin", AdminSchema);
