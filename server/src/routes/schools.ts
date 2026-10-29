import { Router } from "express";
import { z } from "zod";

import { requireAuth, requireRole } from "../middleware/auth.js";
import { School } from "../models/School.js";

export const schoolsRouter = Router();

const schoolSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(2).max(20),
});

schoolsRouter.get(
  "/api/schools",
  requireAuth,
  requireRole("super_admin"),
  async (_req, res) => {
    const schools = await School.find().sort({ name: 1 });
    res.json({
      schools: schools.map((s) => ({
        id: s._id.toString(),
        name: s.name,
        code: s.code,
        active: s.active,
        content_version: s.contentVersion,
        created_at: s.createdAt,
      })),
    });
  }
);

schoolsRouter.post(
  "/api/schools",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const parsed = schoolSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ detail: "Invalid school data" });
      return;
    }

    try {
      const school = await School.create({
        name: parsed.data.name,
        code: parsed.data.code.toUpperCase(),
      });
      res.status(201).json({
        id: school._id.toString(),
        name: school.name,
        code: school.code,
        active: school.active,
        content_version: school.contentVersion,
      });
    } catch {
      res.status(400).json({ detail: "School code already exists" });
    }
  }
);

schoolsRouter.patch(
  "/api/schools/:id",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const parsed = z
      .object({
        name: z.string().min(1).max(200).optional(),
        active: z.boolean().optional(),
      })
      .safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ detail: "Invalid update data" });
      return;
    }

    const school = await School.findByIdAndUpdate(
      req.params.id,
      parsed.data,
      { new: true }
    );

    if (!school) {
      res.status(404).json({ detail: "School not found" });
      return;
    }

    res.json({
      id: school._id.toString(),
      name: school.name,
      code: school.code,
      active: school.active,
      content_version: school.contentVersion,
    });
  }
);

schoolsRouter.post(
  "/api/schools/clear-cache",
  requireAuth,
  async (req, res) => {
    const user = req.user!;
    let schoolId: string | null = null;
    if (user.role === "teacher") {
      schoolId = user.schoolId ? user.schoolId.toString() : null;
    } else {
      const school = await School.findOne({ active: true }).sort({ name: 1 });
      schoolId = school ? school._id.toString() : null;
    }

    if (!schoolId) {
      res.status(400).json({ detail: "No active school found to clear cache" });
      return;
    }

    const { clearSchoolCache } = await import("../services/cache.js");
    await clearSchoolCache(schoolId);
    res.json({ ok: true, message: `Cache cleared for school ID: ${schoolId}` });
  }
);

schoolsRouter.post(
  "/api/schools/:id/clear-cache",
  requireAuth,
  requireRole("super_admin"),
  async (req, res) => {
    const school = await School.findById(req.params.id);
    if (!school) {
      res.status(404).json({ detail: "School not found" });
      return;
    }

    const { clearSchoolCache } = await import("../services/cache.js");
    await clearSchoolCache(school._id.toString());
    res.json({ ok: true, message: `Cache cleared for school ${school.name}` });
  }
);
