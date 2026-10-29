// server/src/routes/code.ts

import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { 
  executeCodeWithFallback, 
  formatCodeExecutionResult 
} from "../services/codeExecution.js";

export const codeRouter = Router();

const codeSchema = z.object({
  code: z.string().min(1).max(50000),
  language: z.string().default("python"),
  explain: z.boolean().optional(),
  outputOnly: z.boolean().optional(),
  inputs: z.array(z.string()).optional(),
});

codeRouter.post("/api/code/execute", requireAuth, async (req, res) => {
  const parsed = codeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ detail: "Invalid code" });
  }

  const user = req.user;
  if (!user || (user.role !== "teacher" && user.role !== "super_admin")) {
    return res.status(403).json({ detail: "Forbidden" });
  }

  const { code, language, explain, outputOnly, inputs } = parsed.data;

  try {
    // executeCodeWithFallback handles everything including turtle detection
    const result = await executeCodeWithFallback(code, language, inputs);
    
    if (outputOnly) {
      if (result.needsInput) {
        return res.json({ 
          output: "⏳ Program waiting for input...",
          needsInput: true,
          code: code,
          inputPrompt: "",
        });
      }
      
      // If it's turtle graphics with HTML, return the HTML
      if (result.html) {
        return res.json({ 
          output: result.output, 
          html: result.html,
          isTurtle: true,
          isGUI: result.isGUI || false 
        });
      }
      
      if (result.success) {
        return res.json({ 
          output: result.output, 
          isGUI: result.isGUI || false 
        });
      } else {
        return res.json({ 
          output: `Error: ${result.error}`, 
          isGUI: false 
        });
      }
    }

    let response = formatCodeExecutionResult(result, code);

    if (explain && result.success) {
      try {
        const { generateAnswer } = await import("../services/llm.js");
        const prompt = `
You are a friendly Grade 6 Computer Science teacher. Explain this code:

\`\`\`${language}
${code}
\`\`\`

${result.output ? `Output:\n\`\`\`\n${result.output}\n\`\`\`` : ''}

Provide:
1. What it does
2. Key concepts used
3. How to modify it
4. Real-world example
`;
        const explanation = await generateAnswer({
          model: "groq_simple",
          question: `Explain this code`,
          context: prompt,
          sources: [],
          intent: "general",
        });
        if (explanation) response += `\n\n## 📚 Code Explanation\n\n${explanation.answer}`;
      } catch (e) {
        console.warn("⚠️ Explanation failed:", e);
      }
    }

    res.json({ result: response, execution: result });
  } catch (error: any) {
    console.error("❌ [Code] Error:", error);
    res.status(500).json({ detail: error.message });
  }
});