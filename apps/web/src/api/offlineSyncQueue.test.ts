import { describe, expect, it, vi } from "vitest";

import { createOfflineSyncQueue } from "./offlineSyncQueue";
import {
  deleteWithVersionRetry,
  updateWithVersionRetry,
} from "./syncSupport";

interface Payload {
  title: string;
}

interface Patch {
  title?: string;
  description?: string;
}

function createMemoryQueue(initial: unknown[] = []) {
  let stored = [...initial];
  const queue = createOfflineSyncQueue<Payload, Patch>({
    scope: "test",
    migrate: async () => undefined,
    readStored: async () => [...stored],
    writeStored: async (operations) => {
      stored = [...operations];
    },
    normalizePayload: (value) => ({
      title: String((value as Partial<Payload> | null)?.title ?? "Untitled"),
    }),
    normalizePatch: (value) => ({ ...(value as Patch | null) }),
  });
  return { queue, readStored: () => stored };
}

function versionConflict(version: number): unknown {
  return {
    response: {
      status: 409,
      data: {
        code: "VERSION_CONFLICT",
        current: { id: "remote", version },
      },
    },
  };
}

describe("offline sync queue", () => {
  it("normalizes restored operations and reports their pending count", async () => {
    const { queue } = createMemoryQueue([
      {
        kind: "update",
        id: "one",
        patch: { title: "Recovered" },
        baseVersion: 0,
      },
      { kind: "unknown" },
    ]);

    await queue.ensureReady();
    const operations = await queue.read();

    expect(queue.pendingCount()).toBe(1);
    expect(operations).toMatchObject([
      { kind: "update", id: "one", baseVersion: 1 },
    ]);
    expect(operations[0]?.mutationId).toMatch(/^test-update:/);
  });

  it("preserves a create followed by edits and coalesces later edits", async () => {
    const { queue } = createMemoryQueue();
    await queue.enqueueCreate("offline-1", { title: "First" }, "create-1");
    await queue.enqueueUpdate(
      "offline-1",
      { title: "Second" },
      1,
      "update-1"
    );
    await queue.enqueueUpdate(
      "offline-1",
      { description: "Details" },
      1,
      "update-2"
    );

    expect(await queue.read()).toMatchObject([
      { kind: "create", tempId: "offline-1" },
      {
        kind: "update",
        id: "offline-1",
        mutationId: "update-2",
        patch: { title: "Second", description: "Details" },
      },
    ]);
  });

  it("drops obsolete edits when a delete is queued", async () => {
    const { queue } = createMemoryQueue();
    await queue.enqueueUpdate("remote-1", { title: "Edit" }, 4, "update-1");
    await queue.enqueueDelete("remote-1", 4, "delete-1");
    await queue.enqueueUpdate("remote-1", { title: "Ignored" }, 4, "update-2");

    expect(await queue.read()).toMatchObject([
      {
        kind: "delete",
        id: "remote-1",
        baseVersion: 4,
        mutationId: "delete-1",
      },
    ]);
  });
});

describe("version conflict retry", () => {
  it("retries an update once using the server version", async () => {
    const request = vi
      .fn<(version: number) => Promise<{ id: string; version: number }>>()
      .mockRejectedValueOnce(versionConflict(7))
      .mockResolvedValueOnce({ id: "remote", version: 8 });

    const result = await updateWithVersionRetry(
      3,
      request,
      (entity) => entity
    );

    expect(request.mock.calls.map((call) => call[0])).toEqual([3, 7]);
    expect(result.version).toBe(8);
  });

  it("retries a delete once using the server version", async () => {
    const request = vi
      .fn<(version: number) => Promise<void>>()
      .mockRejectedValueOnce(versionConflict(9))
      .mockResolvedValueOnce(undefined);

    await deleteWithVersionRetry(2, request, (entity) => entity);

    expect(request.mock.calls.map((call) => call[0])).toEqual([2, 9]);
  });

  it("does not hide non-conflict failures", async () => {
    const failure = new Error("permission denied");
    const request = vi.fn().mockRejectedValue(failure);

    await expect(
      updateWithVersionRetry(1, request, (entity) => entity)
    ).rejects.toBe(failure);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
