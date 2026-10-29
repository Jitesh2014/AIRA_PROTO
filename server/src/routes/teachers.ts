import { Router } from "express";
import { z } from "zod";

import { requireAuth, requireRole } from "../middleware/auth.js";
import { School } from "../models/School.js";
import { User } from "../models/User.js";
import { hashPassword } from "../services/auth.js";

export const teachersRouter = Router();

const createTeacherSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(128),
  name: z.string().min(1).max(120),
  school_id: z.string().min(1),
});
    
teachersRouter.get(
  "/api/teachers",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const filter =
      typeof req.query.school_id === "string"
        ? { schoolId: req.query.school_id }
        : {};

    const teachers = await User.find({ role: "teacher", ...filter }).sort({
      createdAt: -1,
    });

    const schoolIds = [...new Set(teachers.map((t) => t.schoolId?.toString()).filter(Boolean))];
    const schools = await School.find({ _id: { $in: schoolIds } });
    const schoolMap = new Map(schools.map((s) => [s._id.toString(), s.name]));

    res.json({
      teachers: teachers.map((t) => ({
        id: t._id.toString(),
        email: t.email,
        name: t.name,
        school_id: t.schoolId?.toString() ?? null,
        school_name: t.schoolId ? schoolMap.get(t.schoolId.toString()) ?? null : null,
        active: t.active,
        created_at: t.createdAt,
      })),
    });
  }
);

teachersRouter.post(
  "/api/teachers",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const parsed = createTeacherSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ detail: "Invalid teacher data" });
      return;
    }

    const school = await School.findById(parsed.data.school_id);
    if (!school || !school.active) {
      res.status(400).json({ detail: "School not found" });
      return;
    }

    const existing = await User.findOne({ email: parsed.data.email.toLowerCase() });
    if (existing) {
      res.status(400).json({ detail: "Email already registered" });
      return;
    }

    const teacher = await User.create({
      email: parsed.data.email.toLowerCase(),
      passwordHash: await hashPassword(parsed.data.password),
      name: parsed.data.name,
      role: "teacher",
      schoolId: school._id,
      active: true,
    });

    res.status(201).json({
      id: teacher._id.toString(),
      email: teacher.email,
      name: teacher.name,
      school_id: school._id.toString(),
      school_name: school.name,
      active: teacher.active,
    });
  }
);

teachersRouter.patch(
  "/api/teachers/:id",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const parsed = z
      .object({
        active: z.boolean().optional(),
        name: z.string().min(1).max(120).optional(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ detail: "Invalid update data" });
      return;
    }

    const teacher = await User.findOneAndUpdate(
      { _id: req.params.id, role: "teacher" },
      parsed.data,
      { new: true }
    );

    if (!teacher) {
      res.status(404).json({ detail: "Teacher not found" });
      return;
    }

    res.json({
      id: teacher._id.toString(),
      email: teacher.email,
      name: teacher.name,
      active: teacher.active,
    });
  }
);
