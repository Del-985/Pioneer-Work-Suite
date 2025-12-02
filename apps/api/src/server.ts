// apps/api/src/server.ts
import express from "express";
import cors from "cors";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Simple health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "pioneer-api",
    timestamp: new Date().toISOString(),
  });
});

// TODO: later we'll add auth routes here, e.g.
// app.use("/auth", authRouter);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Pioneer API (student) running on http://localhost:${PORT}`);
});