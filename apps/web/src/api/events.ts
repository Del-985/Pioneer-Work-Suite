// apps/web/src/api/events.ts
import { http } from "./http";
import { hasCloudSession } from "./session";
import {
  hasBrowserWindow,
  isBrowserOffline,
  isRecoverableOfflineError,
  notifySyncStateChanged,
} from "./syncSupport";
import {
  migrateLegacyLocalStorage,
  readStoredEventQueue,
  readStoredEvents,
  writeStoredEventQueue,
  writeStoredEvents,
} from "./storage";

export type EventKind = string;

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  start: string;
  end: string;
  allDay: boolean;
  kind: EventKind;
  createdAt: string;
  updatedAt: string;
}

export interface EventQueryParams {
  from?: string;
  to?: string;
}

export type EventPayload = Pick<
  CalendarEvent,
  "title" | "description" | "start" | "end" | "allDay" | "kind"
>;

export type EventPatch = Partial<EventPayload>;

interface CreateEventOp {
  kind: "create";
  tempId: string;
  payload: EventPayload;
  timestamp: number;
}

interface UpdateEventOp {
  kind: "update";
  id: string;
  patch: EventPatch;
  timestamp: number;
}

interface DeleteEventOp {
  kind: "delete";
  id: string;
  timestamp: number;
}

type EventOp = CreateEventOp | UpdateEventOp | DeleteEventOp;

let storageInitialization: Promise<void> | null = null;
let pendingEventSyncCount = 0;



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
    createdAt: raw?.createdAt ? String(raw.createdAt) : now,
    updatedAt: raw?.updatedAt ? String(raw.updatedAt) : now,
  };
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

async function ensureEventStorageReady(): Promise<void> {
  if (!storageInitialization) {
    storageInitialization = (async () => {
      await migrateLegacyLocalStorage();
      await refreshPendingEventSyncCount();
    })();
  }

  await storageInitialization;
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

export async function getCachedEvents(): Promise<CalendarEvent[]> {
  return readEventsCache();
}

// ---------- IndexedDB queue ----------

async function readQueue(): Promise<EventOp[]> {
  await ensureEventStorageReady();

  const queue = await readStoredEventQueue<EventOp>();

  return queue.filter((operation) => {
    return (
      operation &&
      typeof operation === "object" &&
      (operation.kind === "create" ||
        operation.kind === "update" ||
        operation.kind === "delete")
    );
  });
}

async function writeQueue(queue: EventOp[]): Promise<void> {
  await writeStoredEventQueue(queue);

  pendingEventSyncCount = queue.length;
  notifySyncStateChanged();
}

export function getPendingEventSyncCount(): number {
  return pendingEventSyncCount;
}

export async function refreshPendingEventSyncCount(): Promise<number> {
  const queue = await readStoredEventQueue<EventOp>();

  pendingEventSyncCount = queue.length;

  return pendingEventSyncCount;
}

async function enqueueCreate(event: CalendarEvent): Promise<void> {
  const queue = await readQueue();

  queue.push({
    kind: "create",
    tempId: event.id,
    payload: {
      title: event.title,
      description: event.description,
      start: event.start,
      end: event.end,
      allDay: event.allDay,
      kind: event.kind,
    },
    timestamp: Date.now(),
  });

  await writeQueue(queue);
}

async function enqueueUpdate(id: string, patch: EventPatch): Promise<void> {
  const queue = await readQueue();

  const createIndex = queue.findIndex(
    (operation) => operation.kind === "create" && operation.tempId === id
  );

  if (createIndex !== -1) {
    const create = queue[createIndex] as CreateEventOp;

    queue[createIndex] = {
      ...create,
      payload: {
        ...create.payload,
        ...patch,
      },
      timestamp: Date.now(),
    };

    await writeQueue(queue);
    return;
  }

  if (
    queue.some(
      (operation) => operation.kind === "delete" && operation.id === id
    )
  ) {
    return;
  }

  const updateIndex = queue.findIndex(
    (operation) => operation.kind === "update" && operation.id === id
  );

  if (updateIndex !== -1) {
    const existing = queue[updateIndex] as UpdateEventOp;

    queue[updateIndex] = {
      ...existing,
      patch: {
        ...existing.patch,
        ...patch,
      },
      timestamp: Date.now(),
    };
  } else {
    queue.push({
      kind: "update",
      id,
      patch,
      timestamp: Date.now(),
    });
  }

  await writeQueue(queue);
}

async function enqueueDelete(id: string): Promise<void> {
  const queue = (await readQueue()).filter((operation) => {
    if (operation.kind === "create" && operation.tempId === id) {
      return false;
    }

    if (operation.kind === "update" && operation.id === id) {
      return false;
    }

    if (operation.kind === "delete" && operation.id === id) {
      return false;
    }

    return true;
  });

  if (!isOfflineEventId(id)) {
    queue.push({
      kind: "delete",
      id,
      timestamp: Date.now(),
    });
  }

  await writeQueue(queue);
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
  payload: EventPayload
): Promise<CalendarEvent> {
  const { data } = await http.post("/events", payload);

  return normalizeEvent(data?.event ?? data);
}

async function updateEventOnlineOnly(
  id: string,
  patch: EventPatch
): Promise<CalendarEvent> {
  const { data } = await http.put(`/events/${id}`, patch);

  return normalizeEvent(data?.event ?? data);
}

async function deleteEventOnlineOnly(id: string): Promise<void> {
  await http.delete(`/events/${id}`);
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

  const localEvent: CalendarEvent = {
    id: makeOfflineEventId(),
    title: payload.title.trim() || "Untitled event",
    description: payload.description ?? "",
    start: payload.start,
    end: payload.end,
    allDay: Boolean(payload.allDay),
    kind: payload.kind || "event",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  if (!hasCloudSession() || isBrowserOffline()) {
    await mergeEventIntoCache(localEvent);
    await enqueueCreate(localEvent);

    return localEvent;
  }

  try {
    const created = await createEventOnlineOnly({
      ...payload,
      title: localEvent.title,
      description: localEvent.description,
      kind: localEvent.kind,
    });

    await mergeEventIntoCache(created);

    return created;
  } catch (error) {
    if (!isRecoverableOfflineError(error)) {
      throw error;
    }

    await mergeEventIntoCache(localEvent);
    await enqueueCreate(localEvent);

    return localEvent;
  }
}

export async function updateEvent(
  id: string,
  updates: EventPatch
): Promise<CalendarEvent> {
  await ensureEventStorageReady();

  const existing = (await readEventsCache()).find((event) => event.id === id);

  const optimistic = normalizeEvent({
    ...(existing ?? {
      id,
      title: "Untitled event",
      description: "",
      start: nowIso(),
      end: nowIso(),
      allDay: false,
      kind: "event",
      createdAt: nowIso(),
    }),
    ...updates,
    updatedAt: nowIso(),
  });

  await mergeEventIntoCache(optimistic);

  if (!hasCloudSession() || isBrowserOffline()) {
    await enqueueUpdate(id, updates);

    return optimistic;
  }

  try {
    const updated = await updateEventOnlineOnly(id, updates);

    await mergeEventIntoCache(updated);

    return updated;
  } catch (error) {
    if (!isRecoverableOfflineError(error)) {
      throw error;
    }

    await enqueueUpdate(id, updates);

    return optimistic;
  }
}

export async function deleteEvent(id: string): Promise<void> {
  await ensureEventStorageReady();

  await removeEventFromCache(id);

  if (!hasCloudSession() || isBrowserOffline()) {
    await enqueueDelete(id);
    return;
  }

  try {
    await deleteEventOnlineOnly(id);
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return;
    }

    if (!isRecoverableOfflineError(error)) {
      throw error;
    }

    await enqueueDelete(id);
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
        const created = await createEventOnlineOnly(operation.payload);

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
          operation.patch
        );

        await mergeEventIntoCache(updated);
        continue;
      }

      if (operation.kind === "delete") {
        if (isOfflineEventId(operation.id)) {
          await removeEventFromCache(operation.id);
          continue;
        }

        await deleteEventOnlineOnly(operation.id);
        await removeEventFromCache(operation.id);
      }
    } catch (error) {
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
