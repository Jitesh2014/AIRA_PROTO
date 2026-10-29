// server/src/routes/chat.ts

import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../middleware/auth.js";
import { ChatMessage } from "../models/ChatMessage.js";
import { School } from "../models/School.js";
import { getCachedAnswer, setCachedAnswer } from "../services/cache.js";
import { estimateCredits } from "../services/credits.js";
import { normalizeBillingModel } from "../services/llm.js";
import { resolveTeacherQuery } from "../services/queryUnderstanding.js";
import { dedupeSourcesByChapter, queryRag } from "../services/rag.js";
import { stripResponseLabels } from "../services/answerFormatter.js";

export const chatRouter = Router();

const chatSchema = z.object({
    message: z.string().max(8000).optional(),
    query: z.string().max(8000).optional(),
    mode: z.string().optional(),
    school_id: z.string().optional(),
    filters: z
        .object({
            subject: z.string().optional(),
            class: z.string().optional(),
            book_id: z.string().optional(),
            school_id: z.string().optional(),
        })
        .optional(),
});

async function resolveSchoolId(
    user: Express.Request["user"],
    filterSchoolId?: string
): Promise<{ schoolId: string; school: InstanceType<typeof School> } | null> {
    if (user!.role === "teacher") {
        if (!user!.schoolId) return null;
        const school = await School.findById(user!.schoolId);
        if (!school) return null;
        return { schoolId: user!.schoolId, school };
    }

    if (user!.role === "super_admin") {
        if (filterSchoolId) {
            const school = await School.findById(filterSchoolId);
            if (!school || !school.active) return null;
            return { schoolId: school._id.toString(), school };
        }

        const school = await School.findOne({ active: true }).sort({ name: 1 });
        if (!school) return null;
        return { schoolId: school._id.toString(), school };
    }

    return null;
}

chatRouter.post("/api/chat", requireAuth, async (req, res) => {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ detail: "Invalid message" });
        return;
    }

    const effectiveMessage = parsed.data.message || parsed.data.query;
    if (!effectiveMessage) {
        res.status(400).json({ detail: "Either 'message' or 'query' is required" });
        return;
    }

    const user = req.user!;

    if (user.role !== "teacher" && user.role !== "super_admin") {
        res.status(403).json({ detail: "Forbidden" });
        return;
    }

    const schoolContext = await resolveSchoolId(
        user,
        parsed.data.filters?.school_id || parsed.data.school_id
    );

    if (!schoolContext) {
        res.status(400).json({
            detail:
                user.role === "teacher"
                    ? "Teacher account is not assigned to a school"
                    : "No school available — create a school in admin first",
        });
        return;
    }

    const { schoolId: effectiveSchoolId, school } = schoolContext;

    const query = await resolveTeacherQuery(
        effectiveMessage,
        parsed.data.mode
    );

    const filters = {
        subject: parsed.data.filters?.subject,
        class: parsed.data.filters?.class,
        bookId: parsed.data.filters?.book_id,
        chapter: query.chapter,
        mode: parsed.data.mode ?? query.intent,
        theme: query.teacherContextAnchor ?? "",
    };

    const rag = await queryRag({
        question: query.original,
        retrievalQuery: query.retrievalQuery,
        resolutionNote: query.resolutionNote,
        chapterLabel: query.chapterLabel,
        chapterRelated: query.chapterRelated,
        teacherContextAnchor: query.teacherContextAnchor,
        complexityHint: query.complexityHint,
        schoolId: effectiveSchoolId,
        filters,
        mode: query.intent !== "general" ? query.intent : parsed.data.mode,
    });

    const sources = rag.sources.map((s) => ({
        book_title: s.book_title || 'Textbook',
        chapter: s.chapter || 'Unknown',
        pages: s.pages || '',
        snippet: s.snippet || '',
    }));

    // The rag pipeline already formats/synthesizes the answer.
    // We only do a lightweight label-strip pass here to catch any
    // type labels ("Concept Check", etc.) that leaked from the LLM.
    const finalAnswer = stripResponseLabels(rag.answer || '');

    console.log(`[chat.ts] Final answer length: ${finalAnswer.length}`);
    console.log(`[chat.ts] model_used=${rag.model_used} llm_generated=${rag.llm_generated}`);

    const billingModel = normalizeBillingModel(rag.model_used);
    const creditsUsed = rag.llm_generated
        ? estimateCredits(billingModel, effectiveMessage, rag.answer)
        : 0;

    if (rag.llm_generated) {
        await ChatMessage.create({
            schoolId: school._id,
            userId: user.id,
            question: effectiveMessage,
            answer: finalAnswer,
            sources: rag.sources.map((s) => ({
                bookTitle: s.book_title,
                chapter: s.chapter,
                pages: s.pages,
                snippet: s.snippet,
            })),
            modelUsed: billingModel,
            creditsUsed,
            llmGenerated: true,
            cached: false,
            filters,
        });
    }

    if (rag.sources.length > 0 || rag.top_retrieval_score > 0) {
        await setCachedAnswer(
            effectiveSchoolId,
            effectiveMessage,
            school.contentVersion,
            filters,
            {
                answer: finalAnswer,
                sources: rag.sources,
                model_used: rag.model_used,
                content_version: school.contentVersion,
                created_at: new Date().toISOString(),
            }
        );
    }

    res.json({
        reply: finalAnswer,
        sources: dedupeSourcesByChapter(rag.sources, effectiveMessage),
        web_sources: rag.web_sources ?? [],
        web_supplemented: rag.web_supplemented ?? false,
        model_used: rag.model_used,
        cached: false,
        llm_generated: rag.llm_generated,
    });
});

chatRouter.post("/api/test-llm", async (req, res) => {
    try {
        const { message } = req.body;
        console.log(" [TEST] Testing LLM with:", message);
        
        const { generateAnswer } = await import("../services/llm.js");
        const { routeModel } = await import("../services/llmRouter.js");
        
        const model = routeModel(message, {});
        console.log(` [TEST] Model selected: ${model}`);
        
        const result = await generateAnswer({
            model,
            question: message,
            context: "This is a test context about Python programming.",
            sources: [{ book_title: "Test Book", chapter: "1", snippet: "Python is a programming language.", pages: "1" }],
        });
        
        console.log(` [TEST] LLM result: ${result ? 'SUCCESS' : 'FAILED'}`);
        
        res.json({
            success: !!result,
            model_used: model,
            answer: result?.answer || "No answer generated",
        });
    } catch (error: any) {
        console.error(" [TEST] Error:", error);
        res.json({
            success: false,
            error: error.message,
            stack: error.stack,
        });
    }
});