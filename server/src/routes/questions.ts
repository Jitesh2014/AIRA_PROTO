// server/src/routes/questions.ts

import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";

export const questionsRouter = Router();

// Question type mappings
const QUESTION_TYPE_MAPPINGS: Record<string, string[]> = {
  mcq: [
    "Concept Check",
    "Application Based",
    "Competency Based",
    "Reasoning Based",
    "Output Prediction",
    "Cyber Safety Scenario",
    "AI Prediction"
  ],
  very_short: [
    "Concept Check",
    "Tool/Software Based",
    "Algorithm Thinking",
    "Output Prediction",
    "Coding Based"
  ],
  short: [
    "Application Based",
    "Competency Based",
    "HOTS",
    "Reasoning Based",
    "Troubleshooting Based",
    "Coding Based",
    "Debugging",
    "Activity Based"
  ],
  long: [
    "HOTS",
    "Case Study",
    "Competency Based",
    "Creative Thinking",
    "Data Interpretation",
    "Real-life Scenario"
  ],
  fill_blanks: [
    "Concept Check",
    "Tool/Software Based",
    "Coding Based",
    "Output Prediction"
  ],
  true_false: [
    "Concept Check",
    "Ethics & Safety Based",
    "Cyber Safety Scenario"
  ]
};

// Get available question types
questionsRouter.get("/api/questions/types", requireAuth, (req, res) => {
  res.json({ types: QUESTION_TYPE_MAPPINGS });
});

// Generate question paper
questionsRouter.post("/api/questions/generate", requireAuth, async (req, res) => {
  const schema = z.object({
    chapters: z.array(z.number().min(1).max(11)),
    sections: z.array(
      z.object({
        format: z.enum(["mcq", "very_short", "short", "long", "fill_blanks", "true_false"]),
        count: z.number().min(1).max(20),
        marks: z.number().min(1).max(10),
      })
    ),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ 
      detail: "Invalid configuration", 
      errors: parsed.error.errors 
    });
    return;
  }

  const user = req.user!;
  if (user.role !== "teacher" && user.role !== "super_admin") {
    res.status(403).json({ detail: "Forbidden" });
    return;
  }

  try {
    const { chapters, sections } = parsed.data;
    const result: Record<string, any[]> = {};
    let totalMarks = 0;

    for (const section of sections) {
      const format = section.format;
      const types = QUESTION_TYPE_MAPPINGS[format] || ["Concept Check"];
      const questions: any[] = [];

      for (let i = 0; i < section.count; i++) {
        const type = types[i % types.length];
        const chapter = chapters[i % chapters.length];
        
        questions.push({
          id: `${format}_${chapter}_${i + 1}`,
          chapter: chapter,
          format: format,
          type: type,
          question: `Sample ${type} question about Chapter ${chapter} content (Question ${i + 1})`,
          options: format === "mcq" ? ["Option A", "Option B", "Option C", "Option D"] : undefined,
          correct_answer: format === "mcq" ? "Option A" : "Sample answer",
          marks: section.marks,
          explanation: `This question tests ${type} understanding of Chapter ${chapter}`,
          difficulty: "medium",
        });
        totalMarks += section.marks;
      }

      result[format] = questions;
    }

    res.json({
      success: true,
      question_paper: {
        sections: result,
        total_marks: totalMarks,
      },
      message: `Generated ${Object.values(result).reduce((sum, q) => sum + q.length, 0)} questions`,
    });
  } catch (error: any) {
    console.error("❌ [Questions] Error:", error);
    res.status(500).json({
      detail: "Question generation failed",
      error: error.message,
    });
  }
});