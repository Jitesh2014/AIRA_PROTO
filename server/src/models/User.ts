import mongoose, { Schema, type InferSchemaType } from "mongoose";

export const USER_ROLES = ["super_admin", "teacher"] as const;
export type UserRole = (typeof USER_ROLES)[number];

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: USER_ROLES, required: true },
    schoolId: { type: Schema.Types.ObjectId, ref: "School", default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export type UserDocument = InferSchemaType<typeof userSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const User = mongoose.model("User", userSchema);
