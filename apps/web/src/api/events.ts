// apps/web/src/api/events.ts
import { http } from "./http";

export type EventKind = string; // e.g. "event", "exam", "class", etc.

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  start: string;   // ISO string from backend
  end: string;     // ISO string from backend
  allDay: boolean;
  kind: EventKind;
  createdAt: string;
  updatedAt: string;
}

export interface EventQueryParams {
  from?: string; // ISO string (inclusive)
  to?: string;   // ISO string (exclusive)
}

/**
 * GET /events
 * Optionally pass ?from & ?to for a date range.
 */
export async function fetchEvents(
  params?: EventQueryParams
): Promise<CalendarEvent[]> {
  const { data } = await http.get("/events", { params });

  // Backend currently returns a bare array: Event[]
  if (Array.isArray(data)) {
    return data as CalendarEvent[];
  }

  // Be defensive in case we ever wrap it later
  if (data && Array.isArray((data as any).events)) {
    return (data as any).events as CalendarEvent[];
  }

  return [];
}

/**
 * POST /events
 */
export async function createEvent(
  payload: Pick<
    CalendarEvent,
    "title" | "description" | "start" | "end" | "allDay" | "kind"
  >
): Promise<CalendarEvent> {
  const { data } = await http.post("/events", payload);

  // Backend returns a single event object
  return data as CalendarEvent;
}

/**
 * GET /events/:id
 */
export async function fetchEvent(id: string): Promise<CalendarEvent> {
  const { data } = await http.get(`/events/${id}`);
  return data as CalendarEvent;
}

/**
 * PUT /events/:id
 */
export async function updateEvent(
  id: string,
  updates: Partial<
    Pick<
      CalendarEvent,
      "title" | "description" | "start" | "end" | "allDay" | "kind"
    >
  >
): Promise<CalendarEvent> {
  const { data } = await http.put(`/events/${id}`, updates);
  return data as CalendarEvent;
}

/**
 * DELETE /events/:id
 */
export async function deleteEvent(id: string): Promise<void> {
  await http.delete(`/events/${id}`);
}