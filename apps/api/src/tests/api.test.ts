import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import jwt from "jsonwebtoken";
import { AddressInfo } from "node:net";
import { createApp } from "../server";
import { config } from "../config";
import { prisma } from "../prisma";

const db = prisma as any;
const original = {
  transaction: db.$transaction,
  userFindUnique: db.user.findUnique,
  taskCreate: db.task.create,
  taskFindFirst: db.task.findFirst,
  taskFindMany: db.task.findMany,
  taskFindUniqueOrThrow: db.task.findUniqueOrThrow,
  taskUpdateMany: db.task.updateMany,
  idempotencyFindUnique: db.idempotencyRecord.findUnique,
  idempotencyCreate: db.idempotencyRecord.create,
  syncChangeCreate: db.syncChange.create,
  syncChangeFindMany: db.syncChange.findMany,
};

const user = {
  id: "user-1",
  email: "owner@example.com",
  name: "Owner",
  role: "student",
};
const otherUser = {
  id: "user-2",
  email: "other@example.com",
  name: "Other",
  role: "student",
};
let task: any = null;
let taskCreates = 0;
const idempotency = new Map<string, any>();
const syncChanges: any[] = [];
let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let baseUrl = "";

function tokenFor(userId: string): string {
  return jwt.sign({ sub: userId, role: "student" }, config.jwtSecret, {
    expiresIn: "5m",
  });
}

function authHeaders(userId = user.id): Record<string, string> {
  return {
    authorization: `Bearer ${tokenFor(userId)}`,
    "content-type": "application/json",
  };
}

before(async () => {
  db.user.findUnique = async ({ where }: any) => {
    if (where.id === user.id) return user;
    if (where.id === otherUser.id) return otherUser;
    return null;
  };
  db.$transaction = async (work: any) => work(db);
  db.idempotencyRecord.findUnique = async ({ where }: any) => {
    const value = where.userId_scope_key;
    return idempotency.get(`${value.userId}:${value.scope}:${value.key}`) ?? null;
  };
  db.idempotencyRecord.create = async ({ data }: any) => {
    const value = { id: `idem-${idempotency.size + 1}`, ...data };
    idempotency.set(`${data.userId}:${data.scope}:${data.key}`, value);
    return value;
  };
  db.syncChange.create = async ({ data }: any) => {
    const change = {
      sequence: BigInt(syncChanges.length + 1),
      changedAt: new Date(),
      ...data,
    };
    syncChanges.push(change);
    return change;
  };
  db.syncChange.findMany = async ({ where, take }: any) =>
    syncChanges
      .filter((change) => change.userId === where.userId && change.sequence > where.sequence.gt)
      .slice(0, take);
  db.task.create = async ({ data }: any) => {
    taskCreates += 1;
    const now = new Date();
    task = {
      id: `task-${taskCreates}`,
      ...data,
      version: 1,
      deletedAt: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    return task;
  };
  db.task.findFirst = async ({ where }: any) => {
    if (!task || task.id !== where.id || task.userId !== where.userId) return null;
    if (where.deletedAt === null && task.deletedAt) return null;
    return task;
  };
  db.task.findMany = async ({ where }: any) => {
    if (!task || task.userId !== where.userId || (where.deletedAt === null && task.deletedAt)) {
      return [];
    }
    return [task];
  };
  db.task.updateMany = async ({ where, data }: any) => {
    if (
      !task ||
      task.id !== where.id ||
      task.userId !== where.userId ||
      task.version !== where.version ||
      (where.deletedAt === null && task.deletedAt)
    ) {
      return { count: 0 };
    }
    task = {
      ...task,
      ...data,
      version: task.version + Number(data.version?.increment ?? 0),
      updatedAt: new Date(),
    };
    return { count: 1 };
  };
  db.task.findUniqueOrThrow = async ({ where }: any) => {
    if (!task || task.id !== where.id) throw new Error("Task not found");
    return task;
  };

  const app = createApp();
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve())
  );
  db.$transaction = original.transaction;
  db.user.findUnique = original.userFindUnique;
  db.task.create = original.taskCreate;
  db.task.findFirst = original.taskFindFirst;
  db.task.findMany = original.taskFindMany;
  db.task.findUniqueOrThrow = original.taskFindUniqueOrThrow;
  db.task.updateMany = original.taskUpdateMany;
  db.idempotencyRecord.findUnique = original.idempotencyFindUnique;
  db.idempotencyRecord.create = original.idempotencyCreate;
  db.syncChange.create = original.syncChangeCreate;
  db.syncChange.findMany = original.syncChangeFindMany;
  await prisma.$disconnect();
});

test("health and HTTP safety boundaries respond predictably", async () => {
  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json() as any).version, "0.1.18");
  assert.ok(health.headers.get("x-request-id"));

  const unauthenticated = await fetch(`${baseUrl}/tasks`);
  assert.equal(unauthenticated.status, 401);

  const invalidJson = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
  assert.equal(invalidJson.status, 400);

  const blockedOrigin = await fetch(`${baseUrl}/health`, {
    headers: { origin: "https://untrusted.example" },
  });
  assert.equal(blockedOrigin.status, 403);
});

test("task creates are idempotent across response retries", async () => {
  const body = JSON.stringify({ title: "Reliable sync" });
  const headers = { ...authHeaders(), "idempotency-key": "task-create:test-1" };
  const first = await fetch(`${baseUrl}/tasks`, { method: "POST", headers, body });
  const second = await fetch(`${baseUrl}/tasks`, { method: "POST", headers, body });

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(taskCreates, 1);
  assert.equal(second.headers.get("idempotency-replayed"), "true");
  assert.deepEqual(await second.json(), await first.json());
});

test("version conflicts are explicit and a successful update is replayable", async () => {
  const conflict = await fetch(`${baseUrl}/tasks/${task.id}`, {
    method: "PUT",
    headers: { ...authHeaders(), "idempotency-key": "task-update:conflict" },
    body: JSON.stringify({ title: "Stale edit", ifVersion: 99 }),
  });
  assert.equal(conflict.status, 409);
  const conflictBody = await conflict.json() as any;
  assert.equal(conflictBody.code, "VERSION_CONFLICT");
  assert.equal(conflictBody.current.version, 1);

  const headers = { ...authHeaders(), "idempotency-key": "task-update:test-1" };
  const body = JSON.stringify({ title: "Updated safely", ifVersion: 1 });
  const updated = await fetch(`${baseUrl}/tasks/${task.id}`, { method: "PUT", headers, body });
  const replayed = await fetch(`${baseUrl}/tasks/${task.id}`, { method: "PUT", headers, body });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json() as any).version, 2);
  assert.equal(replayed.status, 200);
  assert.equal(replayed.headers.get("idempotency-replayed"), "true");
  assert.equal((await replayed.json() as any).version, 2);
});

test("incremental sync returns an ordered, user-scoped cursor", async () => {
  const response = await fetch(`${baseUrl}/sync/changes?cursor=0&limit=1`, {
    headers: authHeaders(),
  });
  assert.equal(response.status, 200);
  const firstPage = await response.json() as any;
  assert.equal(firstPage.changes.length, 1);
  assert.equal(firstPage.changes[0].entityType, "task");
  assert.equal(firstPage.changes[0].operation, "upsert");
  assert.equal(firstPage.hasMore, true);

  const next = await fetch(
    `${baseUrl}/sync/changes?cursor=${firstPage.nextCursor}&limit=10`,
    { headers: authHeaders() }
  );
  const secondPage = await next.json() as any;
  assert.equal(secondPage.changes.length, 1);
  assert.equal(secondPage.hasMore, false);

  const isolated = await fetch(`${baseUrl}/sync/changes?cursor=0`, {
    headers: authHeaders(otherUser.id),
  });
  assert.deepEqual((await isolated.json() as any).changes, []);
});

test("ownership filters and tombstone deletes prevent cross-account access", async () => {
  const hidden = await fetch(`${baseUrl}/tasks`, { headers: authHeaders(otherUser.id) });
  assert.deepEqual(await hidden.json(), []);

  const deleted = await fetch(`${baseUrl}/tasks/${task.id}`, {
    method: "DELETE",
    headers: {
      ...authHeaders(),
      "idempotency-key": "task-delete:test-1",
      "if-match": "2",
    },
  });
  assert.equal(deleted.status, 204);
  assert.ok(task.deletedAt instanceof Date);

  const list = await fetch(`${baseUrl}/tasks`, { headers: authHeaders() });
  assert.deepEqual(await list.json(), []);
});
