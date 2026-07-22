import crypto from "node:crypto";
import http from "node:http";
import express, { ErrorRequestHandler } from "express";
import cors from "cors";

import { authRouter } from "./auth";
import { config } from "./config";
import { documentsRouter } from "./documents";
import { eventsRouter } from "./events";
import { mailRouter } from "./mail";
import { prisma } from "./prisma";
import { tasksRouter } from "./tasks";
import { syncRouter } from "./sync";

const apiPackage = require("../package.json") as { version: string };

export function createApp(): express.Express {
  const app = express();
  app.disable("x-powered-by");

  app.use((req, res, next) => {
    const requestId = req.header("x-request-id")?.slice(0, 100) || crypto.randomUUID();
    res.setHeader("x-request-id", requestId);
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("x-frame-options", "DENY");
    res.setHeader("referrer-policy", "no-referrer");
    next();
  });

  app.use(cors({
    credentials: false,
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origin is not allowed by CORS"));
    },
  }));
  app.use(express.json({ limit: config.jsonBodyLimit, strict: true }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "pioneer-api", version: apiPackage.version });
  });
  app.get("/health/live", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.get("/health/ready", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return res.json({ status: "ready" });
    } catch (error) {
      console.error("Readiness check failed:", error);
      return res.status(503).json({ error: "Service unavailable" });
    }
  });

  app.use("/auth", authRouter);
  app.use("/documents", documentsRouter);
  app.use("/tasks", tasksRouter);
  app.use("/events", eventsRouter);
  app.use("/mail", mailRouter);
  app.use("/sync", syncRouter);

  app.use((_req, res) => res.status(404).json({ error: "Route not found" }));

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const bodyError = error as { status?: number; type?: string };
    if (bodyError.status === 413 || bodyError.type === "entity.too.large") {
      return res.status(413).json({ error: "Request body is too large" });
    }
    if (error instanceof SyntaxError && bodyError.status === 400) {
      return res.status(400).json({ error: "Request body contains invalid JSON" });
    }
    if (error instanceof Error && error.message === "Origin is not allowed by CORS") {
      return res.status(403).json({ error: "Origin is not allowed" });
    }
    console.error("Unhandled API error:", error);
    return res.status(500).json({ error: "Internal server error" });
  };
  app.use(errorHandler);

  return app;
}

export function startServer(): http.Server {
  const server = createApp().listen(config.port, () => {
    console.log(`Pioneer API listening on port ${config.port}`);
  });
  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received; shutting down Pioneer API`);
    const timeout = setTimeout(() => {
      console.error("Graceful shutdown timed out");
      process.exit(1);
    }, config.shutdownTimeoutMs);
    timeout.unref();
    server.close(async (error) => {
      try {
        await prisma.$disconnect();
      } finally {
        clearTimeout(timeout);
        process.exit(error ? 1 : 0);
      }
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return server;
}

if (require.main === module) startServer();
