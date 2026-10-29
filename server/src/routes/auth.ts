import { Router } from "express";
import { z } from "zod";

import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import {
  buildAuthResponse,
  hashPassword,
  verifyPassword,
} from "../services/auth.js";
import { User } from "../models/User.js";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: config.authSkipPassword
    ? z.string().optional()
    : z.string().min(1),
});

authRouter.post("/api/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: "Invalid email or password" });
    return;
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  let user = await User.findOne({ email: normalizedEmail, active: true });

  if (!user && config.authSkipPassword) {
    user = await User.create({
      email: normalizedEmail,
      passwordHash: await hashPassword("dev-skip-password"),
      name: normalizedEmail.split("@")[0] ?? "Dev User",
      role: "super_admin",
      schoolId: null,
      active: true,
    });
    console.warn(`[dev] Auto-created super admin: ${normalizedEmail}`);
  }

  if (!user) {
    res.status(401).json({ detail: "Invalid email or password" });
    return;
  }

  if (
    !config.authSkipPassword &&
    !(await verifyPassword(password ?? "", user.passwordHash))
  ) {
    res.status(401).json({ detail: "Invalid email or password" });
    return;
  }

  if (user.role === "teacher" && !user.schoolId) {
    res.status(403).json({ detail: "Teacher account is not assigned to a school" });
    return;
  }

  const response = await buildAuthResponse(user._id);
  res.json(response);
});

authRouter.get("/api/auth/me", requireAuth, async (req, res) => {
  const response = await buildAuthResponse(req.user!.id);
  res.json(response);
});
