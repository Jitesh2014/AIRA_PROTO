import mongoose from "mongoose";

import { config } from "../config.js";

export async function connectMongo(): Promise<void> {
  try {
    await mongoose.connect(config.mongodbUri);
    console.log("MongoDB connected");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `MongoDB connection failed (${config.mongodbUri.replace(/\/\/[^:]+:[^@]+@/, "//***:***@")}): ${message}`
    );
  }
}
