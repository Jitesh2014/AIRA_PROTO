import cors from "cors";
import express from "express";
import fs from "node:fs/promises";

import { config } from "./config.js";
import { connectMongo } from "./db/mongodb.js";
import { connectRedis } from "./db/redis.js";
import { analyticsRouter } from "./routes/analytics.js";
import { authRouter } from "./routes/auth.js";
import { booksRouter } from "./routes/books.js";
import { chatRouter } from "./routes/chat.js";
import { healthRouter } from "./routes/health.js";
import { libraryRouter } from "./routes/library.js";
import { ragRouter } from "./routes/rag.js";
import { schoolsRouter } from "./routes/schools.js";
import { teachersRouter } from "./routes/teachers.js";
import { questionsRouter } from "./routes/questions.js";
import { codeRouter } from "./routes/code.js";
import { hashPassword, verifyPassword } from "./services/auth.js";
import { startIndexingWorker } from "./services/indexing.js";
import { User } from "./models/User.js";


async function ensureSuperAdmin(): Promise<void> {
  const existing = await User.findOne({ role: "super_admin" });
  if (existing) return;

  await User.create({
    email: config.superAdminEmail.toLowerCase(),
    passwordHash: await hashPassword(config.superAdminPassword),
    name: config.superAdminName,
    role: "super_admin",
    schoolId: null,
    active: true,
  });

  console.log(`Super admin seeded: ${config.superAdminEmail}`);
}

function requireProductionConfig(): void {
  if (process.env.NODE_ENV !== "production") return;

  const missing: string[] = [];
  if (!process.env.MONGODB_URI?.trim()) missing.push("MONGODB_URI");
  if (!process.env.JWT_SECRET?.trim()) missing.push("JWT_SECRET");
  if (!process.env.REDIS_URL?.trim()) missing.push("REDIS_URL");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. Add them in the Render dashboard and redeploy.`
    );
  }
}

async function main() {
  requireProductionConfig();

  await fs.mkdir(config.uploadDir, { recursive: true });
  await connectMongo();
  await ensureSuperAdmin();
  await connectRedis();
  startIndexingWorker();

  const app = express();

  const corsOptions: cors.CorsOptions = {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalized = origin.replace(/\/$/, "");
      const listed = config.corsOrigins.includes(normalized);
      const vercelApp =
        normalized.startsWith("https://") && normalized.endsWith(".vercel.app");

      if (listed || vercelApp) {
        callback(null, true);
        return;
      }

      console.warn(`CORS rejected origin: ${origin}`);
      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  };

  app.use(cors(corsOptions));
  app.options("*", cors(corsOptions));
  app.use(express.json({ limit: "2mb" }));

  app.use(healthRouter);
  app.use(authRouter);
  app.use(schoolsRouter);
  app.use(teachersRouter);
  app.use(booksRouter);
  app.use(libraryRouter);
  app.use(chatRouter);
  app.use(ragRouter);
  app.use(analyticsRouter);
  app.use(questionsRouter); // 
  app.use(codeRouter);

  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error(err);
      res.status(500).json({ detail: err.message || "Internal server error" });
    }
  );

  app.listen(config.port, "0.0.0.0", () => {
    console.log(`AIRA server running on port ${config.port}`);
    console.log(`CORS origins: ${config.corsOrigins.join(", ") || "(none)"}`);
    console.log("CORS also allows https://*.vercel.app");
    if (config.authSkipPassword) {
      console.warn("AUTH_SKIP_PASSWORD is enabled — login does not verify passwords");
    }
  });
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
});

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
