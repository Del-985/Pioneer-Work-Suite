// apps/api/src/server.ts
import express from "express";
import cors from "cors";
import { authRouter } from "./auth";
import { documentsRouter } from "./documents";
import { tasksRouter } from "./tasks";

const app = express();

// Middleware
app.use(
  cors({
    origin: "*", // you can tighten this later if you want
  })
);

// IMPORTANT: increase body size limits so Quill's base64 images don't 413
app.use(
  express.json({
    limit: "5mb", // adjust higher/lower if needed
  })
);
app.use(
  express.urlencoded({
    extended: true,
    limit: "5mb",
  })
);

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "pioneer-api",
    timestamp: new Date().toISOString(),
  });
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