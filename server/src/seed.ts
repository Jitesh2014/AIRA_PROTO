import fs from "node:fs/promises";

import { config } from "./config.js";
import { connectMongo } from "./db/mongodb.js";
import { User } from "./models/User.js";
import { hashPassword } from "./services/auth.js";

async function seed() {
  await fs.mkdir(config.uploadDir, { recursive: true });
  await connectMongo();

  const existing = await User.findOne({ role: "super_admin" });
  if (existing) {
    console.log("Super admin already exists:", existing.email);
    process.exit(0);
  }

  const passwordHash = await hashPassword(config.superAdminPassword);
  await User.create({
    email: config.superAdminEmail.toLowerCase(),
    passwordHash,
    name: config.superAdminName,
    role: "super_admin",
    schoolId: null,
    active: true,
  });

  console.log("Super admin created:", config.superAdminEmail);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
