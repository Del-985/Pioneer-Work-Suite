// apps/api/src/server.ts
import express from "express";
import cors from "cors";
import { authRouter } from "./auth";
import { documentsRouter } from "./documents";

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

// Student auth routes (register, login, me)
app.use("/auth", authRouter);

// Student documents (requires auth)
app.use("/documents", documentsRouter);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Pioneer API (student) running on http://localhost:${PORT}`);
});