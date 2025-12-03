// apps/api/src/server.ts
import express from "express";
import cors from "cors";
import { authRouter } from "./auth";
import { documentsRouter } from "./documents";
import { tasksRouter } from "./tasks";
import { prisma } from "./prisma"; // 👈 NEW

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "pioneer-api",
    timestamp: new Date().toISOString(),
  });
});

// 🔍 TEMP DEBUG ROUTE: check Task table / Prisma
app.get("/tasks-debug", async (_req, res) => {
  try {
    const tasks = await prisma.task.findMany({
      take: 3,
    });
    return res.json({
      ok: true,
      count: tasks.length,
      sample: tasks,
    });
  } catch (err: any) {
    console.error("Error in /tasks-debug:", err);
    return res.status(500).json({
      ok: false,
      error: String(err),
      // @ts-ignore
      code: err?.code,
    });
  }
});

// Student auth routes (register, login, me)
app.use("/auth", authRouter);

// Student documents (requires auth)
app.use("/documents", documentsRouter);

// Student tasks (requires auth)
app.use("/tasks", tasksRouter);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Pioneer API (student) running on http://localhost:${PORT}`);
});