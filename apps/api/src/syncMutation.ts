import express from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type TransactionClient = Prisma.TransactionClient;

export interface StoredMutationResult<T> {
  statusCode: number;
  body: T;
  replayed: boolean;
}

export class ApiMutationError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: Record<string, unknown>
  ) {
    super(String(body.error ?? "Mutation failed"));
  }
}

export function readIdempotencyKey(
  req: express.Request
): string | undefined {
  const raw = req.header("idempotency-key")?.trim();
  if (!raw) return undefined;
  if (raw.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(raw)) {
    throw new ApiMutationError(400, {
      error: "Idempotency-Key must contain 1 to 128 safe characters",
    });
  }
  return raw;
}

export function readExpectedVersion(
  req: express.Request
): number | undefined {
  const bodyVersion = req.body?.ifVersion;
  const rawHeader = req.header("if-match")?.trim();
  const headerVersion = rawHeader
    ? rawHeader.replace(/^W\//, "").replace(/^"|"$/g, "")
    : undefined;
  const raw = bodyVersion ?? headerVersion;

  if (raw === undefined || raw === null || raw === "") return undefined;
  const version = Number(raw);
  if (!Number.isInteger(version) || version < 1) {
    throw new ApiMutationError(400, {
      error: "ifVersion/If-Match must be a positive integer",
    });
  }
  return version;
}

export async function recordSyncChange(
  tx: TransactionClient,
  userId: string,
  entityType: "task" | "document" | "event",
  entityId: string,
  operation: "upsert" | "delete"
): Promise<void> {
  await tx.syncChange.create({
    data: { userId, entityType, entityId, operation },
  });
}

export async function runIdempotentMutation<T>(options: {
  userId: string;
  scope: string;
  key?: string;
  work: (tx: TransactionClient) => Promise<{
    statusCode: number;
    body: T;
  }>;
}): Promise<StoredMutationResult<T>> {
  const { userId, scope, key, work } = options;

  const execute = async (tx: TransactionClient) => {
    if (key) {
      const existing = await tx.idempotencyRecord.findUnique({
        where: { userId_scope_key: { userId, scope, key } },
      });
      if (existing) {
        return {
          statusCode: existing.statusCode,
          body: existing.response as T,
          replayed: true,
        };
      }
    }

    const result = await work(tx);
    if (key) {
      await tx.idempotencyRecord.create({
        data: {
          userId,
          scope,
          key,
          statusCode: result.statusCode,
          response: result.body as Prisma.InputJsonValue,
        },
      });
    }

    return { ...result, replayed: false };
  };

  try {
    return await prisma.$transaction(execute);
  } catch (error) {
    if (
      key &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.idempotencyRecord.findUnique({
        where: { userId_scope_key: { userId, scope, key } },
      });
      if (existing) {
        return {
          statusCode: existing.statusCode,
          body: existing.response as T,
          replayed: true,
        };
      }
    }
    throw error;
  }
}

export function sendMutationError(
  error: unknown,
  res: express.Response,
  context: string
): express.Response {
  if (error instanceof ApiMutationError) {
    return res.status(error.statusCode).json(error.body);
  }
  console.error(context, error);
  return res.status(500).json({ error: "Internal server error" });
}
