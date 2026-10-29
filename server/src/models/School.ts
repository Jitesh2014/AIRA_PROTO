import mongoose, { Schema, type InferSchemaType } from "mongoose";

const schoolSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    active: { type: Boolean, default: true },
    contentVersion: { type: String, default: "v0" },
  },
  { timestamps: true }
);

export type SchoolDocument = InferSchemaType<typeof schoolSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const School = mongoose.model("School", schoolSchema);
