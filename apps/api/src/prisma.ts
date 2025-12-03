// apps/api/src/prisma.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
  });

// In dev / non-production, reuse a single client across reloads
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}