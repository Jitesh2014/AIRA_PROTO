import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../middleware/auth.js";
import { School } from "../models/School.js";
import { queryRag } from "../services/rag.js";

export const ragRouter = Router();

const codeReviewSchema = z.object({
  code: z.string().min(1).max(20000),
  language: z.string().optional(),
});

ragRouter.post("/api/rag/code-review", requireAuth, async (req, res) => {
  const parsed = codeReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: "Invalid code" });
    return;
  }

  const user = req.user!;

  if (user.role !== "teacher" && user.role !== "super_admin") {
    res.status(403).json({ detail: "Forbidden" });
    return;
  }

  let schoolId: string | null = null;

  if (user.role === "teacher") {
    schoolId = user.schoolId;
  } else {
    const school = await School.findOne({ active: true }).sort({ name: 1 });
    schoolId = school?._id.toString() ?? null;
  }

  if (!schoolId) {
    res.status(400).json({ detail: "No school available for code review" });
    return;
  }

  const rag = await queryRag({
    question: `Review this code (${parsed.data.language ?? "auto"}):\n\n${parsed.data.code}`,
    schoolId,
    mode: "code-review",
  });

  res.json({ result: rag.answer });
});
