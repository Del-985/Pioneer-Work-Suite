ALTER TABLE "Task"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Document"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Event"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SyncChange" (
    "sequence" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SyncChange_pkey" PRIMARY KEY ("sequence")
);

CREATE INDEX "Task_userId_deletedAt_updatedAt_idx"
  ON "Task"("userId", "deletedAt", "updatedAt");
CREATE INDEX "Document_userId_deletedAt_updatedAt_idx"
  ON "Document"("userId", "deletedAt", "updatedAt");
CREATE INDEX "Event_userId_deletedAt_updatedAt_idx"
  ON "Event"("userId", "deletedAt", "updatedAt");
CREATE UNIQUE INDEX "IdempotencyRecord_userId_scope_key_key"
  ON "IdempotencyRecord"("userId", "scope", "key");
CREATE INDEX "IdempotencyRecord_createdAt_idx"
  ON "IdempotencyRecord"("createdAt");
CREATE INDEX "SyncChange_userId_sequence_idx"
  ON "SyncChange"("userId", "sequence");
CREATE INDEX "SyncChange_changedAt_idx"
  ON "SyncChange"("changedAt");

ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SyncChange" ADD CONSTRAINT "SyncChange_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed the ordered change feed so existing cloud data appears during the first
-- incremental pull after the migration.
INSERT INTO "SyncChange" ("userId", "entityType", "entityId", "operation", "changedAt")
SELECT "userId", 'task', "id", 'upsert', "updatedAt" FROM "Task";
INSERT INTO "SyncChange" ("userId", "entityType", "entityId", "operation", "changedAt")
SELECT "userId", 'document', "id", 'upsert', "updatedAt" FROM "Document";
INSERT INTO "SyncChange" ("userId", "entityType", "entityId", "operation", "changedAt")
SELECT "userId", 'event', "id", 'upsert', "updatedAt" FROM "Event";
