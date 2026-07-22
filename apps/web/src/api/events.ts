// apps/web/src/api/events.ts
import { http } from "./http";
import { hasCloudSession } from "./session";
import {
  hasBrowserWindow,
  isBrowserOffline,
  isRecoverableOfflineError,
  makeSyncMutationId,
  deleteWithVersionRetry,
  updateWithVersionRetry,
} from "./syncSupport";
import {
  createOfflineSyncQueue,
  type OfflineCreateOperation,
  type OfflineDeleteOperation,
  type OfflineSyncOperation,
  type OfflineUpdateOperation,
} from "./offlineSyncQueue";
import {
  migrateLegacyLocalStorage,
  readStoredEventQueue,
  readStoredEvents,
  writeStoredEventQueue,
  writeStoredEvents,
} from "./storage";

export type EventKind = string;
export const EVENTS_CHANGED_EVENT =
  "pioneer:calendar-events-changed";
export type EventUrgency =
  | "critical"
  | "high"
  | "medium"
  | "low";

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  start: string;
  end: string;
  allDay: boolean;
  kind: EventKind;
  urgency: EventUrgency | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface EventQueryParams {
  from?: string;
  to?: string;
}

export type EventPayload = Pick<
  CalendarEvent,
  | "title"
  | "description"
  | "start"
  | "end"
  | "allDay"
  | "kind"
  | "urgency"
>;

export type EventPatch = Partial<EventPayload>;

type CreateEventOp = OfflineCreateOperation<EventPayload>;
type UpdateEventOp = OfflineUpdateOperation<EventPatch>;
type DeleteEventOp = OfflineDeleteOperation;
type EventOp = OfflineSyncOperation<EventPayload, EventPatch>;



function nowIso(): string {
  return new Date().toISOString();
}

function makeOfflineEventId(): string {
  return `offline-event-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function isOfflineEventId(id: string): boolean {
  return id.startsWith("offline-event-");
}

function normalizeEventUrgency(
  value: unknown
): EventUrgency | null {
  return value === "critical" ||
    value === "high" ||
    value === "medium" ||
    value === "low"
    ? value
    : null;
}

function notifyEventsChanged(): void {
  if (hasBrowserWindow()) {
    window.dispatchEvent(new Event(EVENTS_CHANGED_EVENT));
  }
}

function normalizeEvent(raw: any): CalendarEvent {
  const now = nowIso();

  return {
    id: String(raw?.id ?? makeOfflineEventId()),
    title: String(raw?.title ?? "Untitled event"),
    description: String(raw?.description ?? ""),
    start: raw?.start ? String(raw.start) : now,
    end: raw?.end ? String(raw.end) : now,
    allDay: Boolean(raw?.allDay),
    kind: String(raw?.kind ?? "event"),
    urgency: normalizeEventUrgency(raw?.urgency),
    createdAt: raw?.createdAt ? String(raw.createdAt) : now,
    updatedAt: raw?.updatedAt ? String(raw.updatedAt) : now,
    version: Number.isInteger(Number(raw?.version)) && Number(raw.version) > 0
      ? Number(raw.version)
      : 1,
  };
}

function normalizeEventPayload(value: unknown): EventPayload {
  const raw = value && typeof value === "object"
    ? value as Partial<EventPayload>
    : {};
  const now = nowIso();
  return {
    title: String(raw.title ?? "Untitled event"),
    description: String(raw.description ?? ""),
    start: String(raw.start ?? now),
    end: String(raw.end ?? raw.start ?? now),
    allDay: Boolean(raw.allDay),
    kind: String(raw.kind ?? "event"),
    urgency: normalizeEventUrgency(raw.urgency),
  };
}

function normalizeEventPatch(value: unknown): EventPatch {
  if (!value || typeof value !== "object") return {};
  const raw = value as EventPatch;
  const patch: EventPatch = {};
  if (raw.title !== undefined) patch.title = String(raw.title);
  if (raw.description !== undefined) patch.description = String(raw.description);
  if (raw.start !== undefined) patch.start = String(raw.start);
  if (raw.end !== undefined) patch.end = String(raw.end);
  if (raw.allDay !== undefined) patch.allDay = Boolean(raw.allDay);
  if (raw.kind !== undefined) patch.kind = String(raw.kind);
  if (raw.urgency !== undefined) patch.urgency = normalizeEventUrgency(raw.urgency);
  return patch;
}

function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    const aTime = new Date(a.start).getTime();
    const bTime = new Date(b.start).getTime();

    return aTime - bTime;
  });
}

function eventTouchesRange(
  event: CalendarEvent,
  from?: string,
  to?: string
): boolean {
  const eventStart = new Date(event.start);
  const eventEnd = new Date(event.end);

  if (Number.isNaN(eventStart.getTime()) || Number.isNaN(eventEnd.getTime())) {
    return false;
  }

  const rangeStart = from ? new Date(from) : null;
  const rangeEnd = to ? new Date(to) : null;

  if (rangeStart && Number.isNaN(rangeStart.getTime())) {
    return true;
  }

  if (rangeEnd && Number.isNaN(rangeEnd.getTime())) {
    return true;
  }

  if (rangeStart && eventEnd < rangeStart) {
    return false;
  }

  if (rangeEnd && eventStart >= rangeEnd) {
    return false;
  }

  return true;
}

// ---------- IndexedDB cache ----------

async function readEventsCache(): Promise<CalendarEvent[]> {
  await ensureEventStorageReady();

  const events = await readStoredEvents<CalendarEvent>();

  return sortEvents(events.map(normalizeEvent));
}

async function writeEventsCache(events: CalendarEvent[]): Promise<void> {
  await writeStoredEvents(sortEvents(events.map(normalizeEvent)));
}

async function mergeEventIntoCache(event: CalendarEvent): Promise<void> {
  const normalized = normalizeEvent(event);
  const events = await readEventsCache();

  const index = events.findIndex((entry) => entry.id === normalized.id);

  if (index === -1) {
    events.push(normalized);
  } else {
    events[index] = {
      ...events[index],
      ...normalized,
    };
  }

  await writeEventsCache(events);
}

async function removeEventFromCache(id: string): Promise<void> {
  const events = await readEventsCache();

  await writeEventsCache(events.filter((event) => event.id !== id));
}

// ---------- IndexedDB queue ----------

const eventQueue = createOfflineSyncQueue<EventPayload, EventPatch>({
  scope: "event",
  migrate: migrateLegacyLocalStorage,
  readStored: () => readStoredEventQueue<unknown>(),
  writeStored: writeStoredEventQueue,
  normalizePayload: normalizeEventPayload,
  normalizePatch: normalizeEventPatch,
});

const ensureEventStorageReady = eventQueue.ensureReady;
const readQueue = eventQueue.read;
const writeQueue = eventQueue.replace;

export function getPendingEventSyncCount(): number {
  return eventQueue.pendingCount();
}

export async function refreshPendingEventSyncCount(): Promise<number> {
  return eventQueue.refreshPendingCount();
}

async function enqueueCreate(event: CalendarEvent, mutationId: string): Promise<void> {
  await eventQueue.enqueueCreate(
    event.id,
    {
      title: event.title,
      description: event.description,
      start: event.start,
      end: event.end,
      allDay: event.allDay,
      kind: event.kind,
      urgency: event.urgency,
    },
    mutationId
  );
}

async function enqueueUpdate(
  id: string,
  patch: EventPatch,
  baseVersion: number,
  mutationId: string
): Promise<void> {
  await eventQueue.enqueueUpdate(id, patch, baseVersion, mutationId);
}

async function enqueueDelete(
  id: string,
  baseVersion: number,
  mutationId: string
): Promise<void> {
  await eventQueue.enqueueDelete(id, baseVersion, mutationId);
}

// ---------- Cloud-only API ----------

async function fetchEventsOnlineOnly(
  params?: EventQueryParams
): Promise<CalendarEvent[]> {
  const { data } = await http.get("/events", { params });

  const rawEvents = Array.isArray(data)
    ? data
    : data && Array.isArray(data.events)
      ? data.events
      : [];

  return sortEvents(rawEvents.map(normalizeEvent));
}

async function fetchEventOnlineOnly(id: string): Promise<CalendarEvent> {
  const { data } = await http.get(`/events/${id}`);

  return normalizeEvent(data?.event ?? data);
}

async function createEventOnlineOnly(
  payload: EventPayload,
  mutationId: string
): Promise<CalendarEvent> {
  const { data } = await http.post("/events", payload, {
    headers: { "Idempotency-Key": mutationId },
  });

  return normalizeEvent(data?.event ?? data);
}

async function updateEventOnlineOnly(
  id: string,
  patch: EventPatch,
  baseVersion: number,
  mutationId: string
): Promise<CalendarEvent> {
  return updateWithVersionRetry<CalendarEvent>(baseVersion, async (version) => {
    const { data } = await http.put(`/events/${id}`, {
      ...patch,
      ifVersion: version,
    }, { headers: { "Idempotency-Key": mutationId } });
    return normalizeEvent(data?.event ?? data);
  }, normalizeEvent);
}

async function deleteEventOnlineOnly(
  id: string,
  baseVersion: number,
  mutationId: string
): Promise<void> {
  await deleteWithVersionRetry<CalendarEvent>(baseVersion, async (version) => {
    await http.delete(`/events/${id}`, {
      headers: { "Idempotency-Key": mutationId, "If-Match": String(version) },
    });
  }, normalizeEvent);
}

// ---------- Public API ----------

export async function fetchEvents(
  params?: EventQueryParams
): Promise<CalendarEvent[]> {
  await ensureEventStorageReady();

  if (!hasCloudSession() || isBrowserOffline()) {
    const cached = await readEventsCache();

    return cached.filter((event) =>
      eventTouchesRange(event, params?.from, params?.to)
    );
  }

  try {
    const remoteEvents = await fetchEventsOnlineOnly(params);
    const localEvents = await readEventsCache();
    const queue = await readQueue();

    const pendingUpdates = new Set(
      queue
        .filter(
          (operation): operation is UpdateEventOp =>
            operation.kind === "update"
        )
        .map((operation) => operation.id)
    );

    const pendingDeletes = new Set(
      queue
        .filter(
          (operation): operation is DeleteEventOp =>
            operation.kind === "delete"
        )
        .map((operation) => operation.id)
    );

    const merged = new Map<string, CalendarEvent>();

    /*
     * Preserve locally cached events outside the currently requested month.
     * A calendar month fetch should not erase records from other months.
     */
    for (const event of localEvents) {
      if (!eventTouchesRange(event, params?.from, params?.to)) {
        merged.set(event.id, event);
      }
    }

    for (const event of remoteEvents) {
      if (!pendingDeletes.has(event.id)) {
        merged.set(event.id, event);
      }
    }

    for (const event of localEvents) {
      if (
        isOfflineEventId(event.id) ||
        pendingUpdates.has(event.id) ||
        pendingDeletes.has(event.id)
      ) {
        if (!pendingDeletes.has(event.id)) {
          merged.set(event.id, event);
        }
      }
    }

    const allEvents = sortEvents([...merged.values()]);

    await writeEventsCache(allEvents);

    return allEvents.filter((event) =>
      eventTouchesRange(event, params?.from, params?.to)
    );
  } catch (error) {
    if (isRecoverableOfflineError(error)) {
      const cached = await readEventsCache();

      return cached.filter((event) =>
        eventTouchesRange(event, params?.from, params?.to)
      );
    }

    throw error;
  }
}

export async function fetchEvent(id: string): Promise<CalendarEvent> {
  await ensureEventStorageReady();

  const cached = (await readEventsCache()).find((event) => event.id === id);

  if (!hasCloudSession() || isBrowserOffline()) {
    if (cached) {
      return cached;
    }

    throw new Error("This event is not available in local storage.");
  }

  try {
    const event = await fetchEventOnlineOnly(id);

    await mergeEventIntoCache(event);

    return event;
  } catch (error) {
    if (isRecoverableOfflineError(error) && cached) {
      return cached;
    }

    throw error;
  }
}

export async function createEvent(
  payload: EventPayload
): Promise<CalendarEvent> {
  await ensureEventStorageReady();
  const mutationId = makeSyncMutationId("event-create");

  const localEvent: CalendarEvent = {
    id: makeOfflineEventId(),
    title: payload.title.trim() || "Untitled event",
    description: payload.description ?? "",
    start: payload.start,
    end: payload.end,
    allDay: Boolean(payload.allDay),
    kind: payload.kind || "event",
    urgency: normalizeEventUrgency(payload.urgency),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    version: 1,
  };

  if (!hasCloudSession() || isBrowserOffline()) {
    await mergeEventIntoCache(localEvent);
    await enqueueCreate(localEvent, mutationId);
    notifyEventsChanged();

    return localEvent;
  }

  try {
    const created = await createEventOnlineOnly({
      ...payload,
      title: localEvent.title,
      description: localEvent.description,
      kind: localEvent.kind,
      urgency: localEvent.urgency,
    }, mutationId);

    await mergeEventIntoCache(created);
    notifyEventsChanged();

    return created;
  } catch (error) {
    if (!isRecoverableOfflineError(error)) {
      throw error;
    }

    await mergeEventIntoCache(localEvent);
    await enqueueCreate(localEvent, mutationId);
    notifyEventsChanged();

    return localEvent;
  }
}

export async function updateEvent(
  id: string,
  updates: EventPatch
): Promise<CalendarEvent> {
  await ensureEventStorageReady();

  const existing = (await readEventsCache()).find((event) => event.id === id);
  const baseVersion = existing?.version ?? 1;
  const mutationId = makeSyncMutationId("event-update");

  const optimistic = normalizeEvent({
    ...(existing ?? {
      id,
      title: "Untitled event",
      description: "",
      start: nowIso(),
      end: nowIso(),
      allDay: false,
      kind: "event",
      urgency: null,
      createdAt: nowIso(),
      version: baseVersion,
    }),
    ...updates,
    updatedAt: nowIso(),
    version: baseVersion + 1,
  });

  await mergeEventIntoCache(optimistic);
  notifyEventsChanged();

  if (!hasCloudSession() || isBrowserOffline()) {
    await enqueueUpdate(id, updates, baseVersion, mutationId);

    return optimistic;
  }

  try {
    const updated = await updateEventOnlineOnly(
      id,
      updates,
      baseVersion,
      mutationId
    );

    await mergeEventIntoCache(updated);

    return updated;
  } catch (error) {
    if (!isRecoverableOfflineError(error)) {
      throw error;
    }

    await enqueueUpdate(id, updates, baseVersion, mutationId);

    return optimistic;
  }
}

export async function deleteEvent(id: string): Promise<void> {
  await ensureEventStorageReady();
  const existing = (await readEventsCache()).find((event) => event.id === id);
  const baseVersion = existing?.version ?? 1;
  const mutationId = makeSyncMutationId("event-delete");

  await removeEventFromCache(id);
  notifyEventsChanged();

  if (!hasCloudSession() || isBrowserOffline()) {
    await enqueueDelete(id, baseVersion, mutationId);
    return;
  }

  try {
    await deleteEventOnlineOnly(id, baseVersion, mutationId);
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return;
    }

    if (!isRecoverableOfflineError(error)) {
      throw error;
    }

    await enqueueDelete(id, baseVersion, mutationId);
  }
}

// ---------- Queue sync ----------

export async function syncOfflineEventQueue(): Promise<void> {
  await ensureEventStorageReady();

  if (!hasBrowserWindow() || !hasCloudSession() || isBrowserOffline()) {
    return;
  }

  const queue = await readQueue();

  if (queue.length === 0) {
    return;
  }

  const remaining: EventOp[] = [];

  for (let index = 0; index < queue.length; index += 1) {
    const operation = queue[index];

    try {
      if (operation.kind === "create") {
        const created = await createEventOnlineOnly(
          operation.payload,
          operation.mutationId
        );

        const cached = await readEventsCache();
        const cachedIndex = cached.findIndex(
          (event) => event.id === operation.tempId
        );

        if (cachedIndex !== -1) {
          cached[cachedIndex] = created;
          await writeEventsCache(cached);
        } else {
          await mergeEventIntoCache(created);
        }

        for (
          let laterIndex = index + 1;
          laterIndex < queue.length;
          laterIndex += 1
        ) {
          const later = queue[laterIndex];

          if (later.kind === "update" && later.id === operation.tempId) {
            later.id = created.id;
          }

          if (later.kind === "delete" && later.id === operation.tempId) {
            later.id = created.id;
          }
        }

        continue;
      }

      if (operation.kind === "update") {
        if (isOfflineEventId(operation.id)) {
          remaining.push(operation);
          continue;
        }

        const updated = await updateEventOnlineOnly(
          operation.id,
          operation.patch,
          operation.baseVersion,
          operation.mutationId
        );

        await mergeEventIntoCache(updated);
        continue;
      }

      if (operation.kind === "delete") {
        if (isOfflineEventId(operation.id)) {
          await removeEventFromCache(operation.id);
          continue;
        }

        await deleteEventOnlineOnly(
          operation.id,
          operation.baseVersion,
          operation.mutationId
        );
        await removeEventFromCache(operation.id);
      }
    } catch (error) {
      if ((error as any)?.response?.status === 404 && operation.kind === "update") {
        await removeEventFromCache(operation.id);
        continue;
      }
      if (isRecoverableOfflineError(error)) {
        remaining.push(operation, ...queue.slice(index + 1));
        await writeQueue(remaining);
        return;
      }

      console.error("[Event sync] operation failed:", operation, error);
      remaining.push(operation);
    }
  }

  await writeQueue(remaining);

  try {
    await fetchEvents();
  } catch {
    // IndexedDB remains usable until a later successful cloud sync.
  }
}

export async function applyEventCloudChange(
  id: string,
  event: CalendarEvent | null
): Promise<void> {
  await ensureEventStorageReady();
  if (event) await mergeEventIntoCache(normalizeEvent(event));
  else await removeEventFromCache(id);
  notifyEventsChanged();
}

