// apps/web/src/pages/CalendarPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { fetchTasks, Task } from "../api/tasks";
import {
  fetchEvents,
  createEvent,
  CalendarEvent,
} from "../api/events";

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

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseIsoDateOnly(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
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
  const [creatingEvent, setCreatingEvent] = useState(false);

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
      } finally {
        setLoading(false);
      }
    })();
  }, [monthRange.from, monthRange.to]);

  const tasksByDayKey = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const d = parseIsoDateOnly(String(t.dueDate));
      if (!d) continue;
      const key = dateKey(d);
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
          const key = dateKey(day);
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
        start = new Date();
        if (start < day) start = day;
        end = new Date(start);
        end.setHours(end.getHours() + 1);
      }

      const created = await createEvent({
        title: trimmed,
        description: "",
        start: start.toISOString(),
        end: end.toISOString(),
        allDay: newEventAllDay,
        kind: "event",
      });

      setEvents((prev) => [...prev, created]);
      setNewEventTitle("");
    } catch (err) {
      console.error("Error creating event:", err);
      setError("Unable to create event.");
    } finally {
      setCreatingEvent(false);
    }
  }

  function handleSelectDay(day: Date) {
    setSelectedDay(day);
  }

  function handleToday() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    setCurrentMonth(startOfMonth(now));
    setSelectedDay(now);
  }

  const selectedDayKey = selectedDay ? dateKey(selectedDay) : null;

  return (
    <div>
      <h2>Calendar</h2>
      <p className="workspace-subtitle">
        View your tasks and events on a monthly calendar. Quick-create events
        directly on a specific day.
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
              border: "1px solid rgba(255,255,255,0.24)",
              background: "transparent",
              color: "#f5f5f5",
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
              background: "linear-gradient(135deg, #3f64ff, #7f3dff)",
              color: "#ffffff",
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
              border: "1px solid rgba(255,255,255,0.24)",
              background: "transparent",
              color: "#f5f5f5",
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
            color: "#9da2c8",
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
                background: "#3f64ff",
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
                background: "#7f3dff",
              }}
            />
            Events
          </span>
        </div>
      </div>

      {loading && <p style={{ fontSize: 13 }}>Loading calendar...</p>}
      {error && <p style={{ fontSize: 13, color: "#ff7b88" }}>{error}</p>}

      {selectedDay && (
        <form
          onSubmit={handleCreateEventForSelectedDay}
          style={{
            marginBottom: 16,
            padding: 10,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "#050713",
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
              border: "1px solid rgba(255,255,255,0.24)",
              background: "#050713",
              color: "#f5f5f5",
              fontSize: 13,
            }}
          />
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "#d0d2ff",
            }}
          >
            <input
              type="checkbox"
              checked={newEventAllDay}
              onChange={(e) => setNewEventAllDay(e.target.checked)}
            />
            All-day
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
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.24)",
                background: "transparent",
                color: "#d0d2ff",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creatingEvent || !newEventTitle.trim()}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                border: "none",
                background: "linear-gradient(135deg, #3f64ff, #7f3dff)",
                color: "#ffffff",
                fontSize: 12,
                cursor: creatingEvent ? "default" : "pointer",
                opacity:
                  creatingEvent || !newEventTitle.trim() ? 0.7 : 1,
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
          border: "1px solid rgba(255,255,255,0.12)",
          overflow: "hidden",
          background: "radial-gradient(circle at top, #131731 0, #050713 60%)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
            borderBottom: "1px solid rgba(255,255,255,0.12)",
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
                color: "#9da2c8",
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

            const key = dateKey(day);
            const dayTasks = tasksByDayKey.get(key) || [];
            const dayEvents = eventsByDayKey.get(key) || [];

            const isToday = sameDay(day, today);
            const isSelected =
              selectedDayKey && selectedDayKey === key;

            return (
              <button
                key={key + String(day.getMonth())}
                type="button"
                onClick={() => handleSelectDay(day)}
                style={{
                  all: "unset",
                  boxSizing: "border-box",
                  borderRight: "1px solid rgba(255,255,255,0.06)",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  padding: "6px 6px 8px",
                  minHeight: 64,
                  cursor: "pointer",
                  background: isSelected
                    ? "rgba(63,100,255,0.25)"
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
                        ? "#f5f5f5"
                        : "#6f7598",
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
                        border: "1px solid rgba(255,255,255,0.4)",
                        color: "#f5f5f5",
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
                        color: "#aeb7ff",
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "#3f64ff",
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
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        color: "#d3a8ff",
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "#7f3dff",
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
    </div>
  );
};

export default CalendarPage;