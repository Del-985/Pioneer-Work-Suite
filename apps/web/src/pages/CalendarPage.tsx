// apps/web/src/pages/CalendarPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchTasks, Task } from "../api/tasks";
import {
  deleteEvent,
  fetchEvents,
  createEvent,
  CalendarEvent,
} from "../api/events";
import type {
  EventUrgency,
} from "../api/events";
import {
  getDueDateKey,
  getLocalDateKey,
} from "../utils/taskDates";
import {
  TASK_PRIORITY_RANK,
} from "../utils/taskPriority";
import { toast } from "../toasts/toastStore";
import { useConfirmation } from "../hooks/useConfirmation";

import "../styles/calendar.css";

const EVENT_URGENCIES: EventUrgency[] = [
  "critical",
  "high",
  "medium",
  "low",
];

function urgencyLabel(urgency: EventUrgency): string {
  return urgency.charAt(0).toUpperCase() + urgency.slice(1);
}

function highestEventUrgency(
  events: CalendarEvent[]
): EventUrgency | null {
  const rank: Record<EventUrgency, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  return events.reduce<EventUrgency | null>((current, event) => {
    if (!event.urgency) return current;
    if (!current || rank[event.urgency] < rank[current]) {
      return event.urgency;
    }
    return current;
  }, null);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, delta: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + delta);
  return d;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
  });
}

function formatEventTime(event: CalendarEvent): string {
  if (event.allDay) return "All day";

  const start = new Date(event.start);
  const end = new Date(event.end);

  if (Number.isNaN(start.getTime())) return "Time unavailable";

  const startLabel = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  if (
    Number.isNaN(end.getTime()) ||
    end.getTime() <= start.getTime()
  ) {
    return startLabel;
  }

  return `${startLabel}–${end.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

function dayHasEventOnDate(day: Date, ev: CalendarEvent): boolean {
  // Basic overlap check: any event that touches this day is counted
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const evStart = new Date(ev.start);
  const evEnd = new Date(ev.end);

  return evStart < dayEnd && evEnd >= dayStart;
}

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CalendarPage: React.FC = () => {
  const { confirm, confirmationDialog } = useConfirmation();
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState<Date>(() =>
    startOfMonth(new Date())
  );

  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventAllDay, setNewEventAllDay] = useState(true);
  const [newEventTime, setNewEventTime] = useState("09:00");
  const [newEventEndTime, setNewEventEndTime] =
    useState("10:00");
  const [newEventUrgency, setNewEventUrgency] =
    useState<EventUrgency | "">("");
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [deletingEventIds, setDeletingEventIds] =
    useState<Set<string>>(() => new Set());

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const monthRange = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const monthStart = new Date(start);
    monthStart.setHours(0, 0, 0, 0);

    const nextMonth = addMonths(start, 1);
    const monthEnd = new Date(nextMonth);
    monthEnd.setHours(0, 0, 0, 0);

    return { from: monthStart, to: monthEnd };
  }, [currentMonth]);

  const calendarCells = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const gridStart = startOfWeek(monthStart);

    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      cells.push(addDays(gridStart, i));
    }
    return cells;
  }, [currentMonth]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const [loadedTasks, loadedEvents] = await Promise.all([
          fetchTasks(),
          fetchEvents({
            from: monthRange.from.toISOString(),
            to: monthRange.to.toISOString(),
          }),
        ]);

        setTasks(loadedTasks);
        setEvents(loadedEvents);
      } catch (err) {
        console.error("Error loading calendar data:", err);
        setError("Unable to load calendar data.");
        toast.error("Calendar unavailable", {
          description: "Pioneer could not load tasks and scheduled events.",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [monthRange.from, monthRange.to]);

  const tasksByDayKey = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const key = getDueDateKey(t.dueDate);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [tasks]);

  const eventsByDayKey = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      // Walk each day the event touches inside this month range
      const evStart = new Date(ev.start);
      const evEnd = new Date(ev.end);

      const day = new Date(evStart);
      day.setHours(0, 0, 0, 0);

      const limit = new Date(monthRange.to);
      limit.setDate(limit.getDate() + 1);

      while (day <= evEnd && day < limit) {
        if (dayHasEventOnDate(day, ev)) {
          const key = getLocalDateKey(day);
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(ev);
        }
        day.setDate(day.getDate() + 1);
      }
    }
    return map;
  }, [events, monthRange.to]);

  async function handleCreateEventForSelectedDay(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDay) return;
    const trimmed = newEventTitle.trim();
    if (!trimmed) return;

    try {
      setCreatingEvent(true);
      setError(null);

      const day = new Date(selectedDay);
      day.setHours(0, 0, 0, 0);

      let start = new Date(day);
      let end = new Date(day);

      if (newEventAllDay) {
        end.setDate(end.getDate() + 1);
      } else {
        const [hours, minutes] = newEventTime
          .split(":")
          .map(Number);
        const [endHours, endMinutes] = newEventEndTime
          .split(":")
          .map(Number);

        if (
          !Number.isInteger(hours) ||
          !Number.isInteger(minutes) ||
          !Number.isInteger(endHours) ||
          !Number.isInteger(endMinutes) ||
          hours < 0 ||
          hours > 23 ||
          minutes < 0 ||
          minutes > 59 ||
          endHours < 0 ||
          endHours > 23 ||
          endMinutes < 0 ||
          endMinutes > 59
        ) {
          setError("Choose valid start and end times.");
          return;
        }

        start.setHours(hours, minutes, 0, 0);
        end = new Date(day);
        end.setHours(endHours, endMinutes, 0, 0);

        if (end <= start) {
          setError("Event end time must be later than its start time.");
          return;
        }
      }

      const created = await createEvent({
        title: trimmed,
        description: "",
        start: start.toISOString(),
        end: end.toISOString(),
        allDay: newEventAllDay,
        kind: "event",
        urgency: newEventUrgency || null,
      });

      setEvents((prev) => [...prev, created]);
      setNewEventTitle("");
      setNewEventUrgency("");
      toast.success("Event scheduled", {
        description: created.title,
      });
    } catch (err) {
      console.error("Error creating event:", err);
      setError("Unable to create event.");
      toast.error("Unable to create event", {
        description: "The event details remain in the form.",
      });
    } finally {
      setCreatingEvent(false);
    }
  }

  function handleSelectDay(day: Date) {
    if (
      day.getFullYear() !== currentMonth.getFullYear() ||
      day.getMonth() !== currentMonth.getMonth()
    ) {
      setCurrentMonth(startOfMonth(day));
    }

    setSelectedDay(day);
  }

  function handleToday() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    setCurrentMonth(startOfMonth(now));
    setSelectedDay(now);
  }

  async function handleDeleteEvent(
    event: CalendarEvent
  ): Promise<void> {
    const accepted = await confirm({
      title: `Delete "${event.title}"?`,
      description: "This permanently removes the calendar event.",
      confirmLabel: "Delete event",
      dangerous: true,
    });
    if (!accepted) {
      return;
    }

    setDeletingEventIds((current) => {
      const next = new Set(current);
      next.add(event.id);
      return next;
    });
    setError(null);

    try {
      await deleteEvent(event.id);
      setEvents((current) =>
        current.filter((entry) => entry.id !== event.id)
      );
      toast.success("Event deleted", {
        description: event.title,
      });
    } catch (deleteError) {
      console.error("Error deleting event:", deleteError);
      setError("Unable to delete event.");
      toast.error("Unable to delete event");
    } finally {
      setDeletingEventIds((current) => {
        const next = new Set(current);
        next.delete(event.id);
        return next;
      });
    }
  }

  const selectedDayKey = selectedDay
    ? getLocalDateKey(selectedDay)
    : null;
  const selectedDayTasks = useMemo(
    () =>
      selectedDayKey
        ? [...(tasksByDayKey.get(selectedDayKey) || [])].sort(
            (left, right) =>
              TASK_PRIORITY_RANK[left.priority] -
              TASK_PRIORITY_RANK[right.priority]
          )
        : [],
    [selectedDayKey, tasksByDayKey]
  );
  const selectedDayEvents = useMemo(
    () =>
      selectedDayKey
        ? [...(eventsByDayKey.get(selectedDayKey) || [])].sort(
            (left, right) =>
              new Date(left.start).getTime() -
              new Date(right.start).getTime()
          )
        : [],
    [eventsByDayKey, selectedDayKey]
  );

  return (
    <div>
      <h2>Calendar</h2>
      <p className="workspace-subtitle">
        Select a day to review its tasks and events, delete events, or quickly
        schedule something new.
      </p>

      <div
        style={{
          marginTop: 16,
          marginBottom: 16,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 12,
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={() => setCurrentMonth((m) => addMonths(m, -1))}
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid var(--border-strong)",
              background: "transparent",
              color: "var(--text)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Prev
          </button>
          <button
            type="button"
            onClick={handleToday}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: "none",
              background: "var(--accent-gradient)",
              color: "var(--text-on-accent)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid var(--border-strong)",
              background: "transparent",
              color: "var(--text)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Next
          </button>
        </div>

        <div style={{ fontSize: 15, fontWeight: 600 }}>
          {formatMonthYear(currentMonth)}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 11,
            color: "var(--text-muted)",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--accent)",
              }}
            />
            Tasks due
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--accent-2)",
              }}
            />
            Events
          </span>
        </div>
      </div>

      {loading && <p style={{ fontSize: 13 }}>Loading calendar...</p>}
      {error && <p style={{ fontSize: 13, color: "var(--danger)" }}>{error}</p>}

      {selectedDay && (
        <section
          className="calendar-day-agenda"
          aria-labelledby="calendar-day-agenda-title"
        >
          <header>
            <div>
              <p>Selected day</p>
              <h3 id="calendar-day-agenda-title">
                {selectedDay.toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDay(null)}
              aria-label="Close selected day details"
            >
              ×
            </button>
          </header>

          <div className="calendar-day-agenda__grid">
            <article>
              <h4>Tasks ({selectedDayTasks.length})</h4>
              {selectedDayTasks.length === 0 ? (
                <p className="calendar-day-agenda__empty">
                  No tasks are due this day.
                </p>
              ) : (
                <ul>
                  {selectedDayTasks.map((task) => (
                    <li
                      key={task.id}
                      className={`priority-${task.priority}`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          navigate(
                            `/tasks?task=${encodeURIComponent(task.id)}`
                          )
                        }
                      >
                        <strong>{task.title}</strong>
                        <small>
                          {task.priority} · {task.status.replace("_", " ")}
                        </small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article>
              <h4>Events ({selectedDayEvents.length})</h4>
              {selectedDayEvents.length === 0 ? (
                <p className="calendar-day-agenda__empty">
                  No events are scheduled this day.
                </p>
              ) : (
                <ul>
                  {selectedDayEvents.map((event) => {
                    const deleting = deletingEventIds.has(event.id);

                    return (
                      <li
                        key={event.id}
                        className={
                          event.urgency
                            ? `urgency-${event.urgency}`
                            : undefined
                        }
                      >
                        <div>
                          <strong>{event.title}</strong>
                          <small>
                            {formatEventTime(event)}
                            {event.urgency
                              ? ` · ${urgencyLabel(event.urgency)}`
                              : ""}
                          </small>
                        </div>
                        <button
                          className="calendar-day-agenda__delete"
                          type="button"
                          onClick={() => void handleDeleteEvent(event)}
                          disabled={deleting}
                          aria-label={`Delete ${event.title}`}
                        >
                          {deleting ? "Deleting…" : "Delete"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </article>
          </div>
        </section>
      )}

      {selectedDay && (
        <form
          onSubmit={handleCreateEventForSelectedDay}
          style={{
            marginBottom: 16,
            padding: 10,
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--surface-1)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            fontSize: 13,
          }}
        >
          <div>
            Quick event on{" "}
            {selectedDay.toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </div>
          <input
            type="text"
            value={newEventTitle}
            onChange={(e) => setNewEventTitle(e.target.value)}
            placeholder="Event title..."
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--border-strong)",
              background: "var(--surface-1)",
              color: "var(--text)",
              fontSize: 13,
            }}
          />
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "var(--accent-text)",
            }}
          >
            <input
              type="checkbox"
              checked={newEventAllDay}
              onChange={(e) => setNewEventAllDay(e.target.checked)}
            />
            All-day
          </label>
          {!newEventAllDay && (
            <div className="calendar-event-time-fields">
              <label className="calendar-event-time-field">
                <span>Start time</span>
                <input
                  type="time"
                  value={newEventTime}
                  onChange={(event) =>
                    setNewEventTime(event.target.value)
                  }
                  required
                />
              </label>
              <label className="calendar-event-time-field">
                <span>End time</span>
                <input
                  type="time"
                  value={newEventEndTime}
                  onChange={(event) =>
                    setNewEventEndTime(event.target.value)
                  }
                  required
                />
              </label>
            </div>
          )}
          <label className="calendar-event-urgency-field">
            <span>Urgency</span>
            <select
              value={newEventUrgency}
              onChange={(event) =>
                setNewEventUrgency(
                  event.target.value as EventUrgency | ""
                )
              }
            >
              <option value="">None</option>
              {EVENT_URGENCIES.map((urgency) => (
                <option key={urgency} value={urgency}>
                  {urgencyLabel(urgency)}
                </option>
              ))}
            </select>
          </label>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setSelectedDay(null);
                setNewEventTitle("");
                setNewEventUrgency("");
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid var(--border-strong)",
                background: "transparent",
                color: "var(--accent-text)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                creatingEvent ||
                !newEventTitle.trim() ||
                (!newEventAllDay &&
                  (!newEventTime || !newEventEndTime))
              }
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: "none",
                background: "var(--accent-gradient)",
                color: "var(--text-on-accent)",
                fontSize: 12,
                cursor: creatingEvent ? "default" : "pointer",
                opacity:
                  creatingEvent ||
                  !newEventTitle.trim() ||
                  (!newEventAllDay &&
                    (!newEventTime || !newEventEndTime))
                    ? 0.7
                    : 1,
              }}
            >
              {creatingEvent ? "Saving..." : "Add event"}
            </button>
          </div>
        </form>
      )}

      <div
        style={{
          borderRadius: 12,
          border: "1px solid var(--border)",
          overflow: "hidden",
          background: "var(--panel-gradient)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
            borderBottom: "1px solid var(--border)",
          }}
        >
          {weekdayLabels.map((label) => (
            <div
              key={label}
              style={{
                padding: "6px 4px",
                textAlign: "center",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-muted)",
              }}
            >
              {label}
            </div>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
          }}
        >
          {calendarCells.map((day) => {
            const inCurrentMonth =
              day.getMonth() === currentMonth.getMonth();

            const key = getLocalDateKey(day);
            const dayTasks = tasksByDayKey.get(key) || [];
            const dayEvents = eventsByDayKey.get(key) || [];
            const eventUrgency = highestEventUrgency(dayEvents);

            const isToday = sameDay(day, today);
            const isSelected =
              selectedDayKey && selectedDayKey === key;

            return (
              <button
                key={key + String(day.getMonth())}
                type="button"
                onClick={() => handleSelectDay(day)}
                aria-pressed={Boolean(isSelected)}
                aria-label={`${day.toLocaleDateString()}: ${dayTasks.length} tasks, ${dayEvents.length} events`}
                style={{
                  all: "unset",
                  boxSizing: "border-box",
                  borderRight: "1px solid var(--border-subtle)",
                  borderBottom: "1px solid var(--border-subtle)",
                  padding: "6px 6px 8px",
                  minHeight: 64,
                  cursor: "pointer",
                  background: isSelected
                    ? "var(--accent-soft)"
                    : "transparent",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: isToday ? 700 : 500,
                      color: inCurrentMonth
                        ? "var(--text)"
                        : "var(--text-faint)",
                    }}
                  >
                    {day.getDate()}
                  </span>
                  {isToday && (
                    <span
                      style={{
                        fontSize: 9,
                        padding: "2px 6px",
                        borderRadius: 999,
                        border: "1px solid var(--border-strong)",
                        color: "var(--text)",
                      }}
                    >
                      Today
                    </span>
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    fontSize: 10,
                  }}
                >
                  {dayTasks.length > 0 && (
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        color: "var(--accent-text)",
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "var(--accent)",
                        }}
                      />
                      <span>
                        {dayTasks.length} task
                        {dayTasks.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  )}
                  {dayEvents.length > 0 && (
                    <div
                      className={
                        "calendar-event-count " +
                        (eventUrgency
                          ? `urgency-${eventUrgency}`
                          : "urgency-none")
                      }
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                        }}
                      />
                      <span>
                        {dayEvents.length} event
                        {dayEvents.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      {confirmationDialog}
    </div>
  );
};

export default CalendarPage;

