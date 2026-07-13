import React from "react";

import type {
  CalendarEvent,
} from "../../api/events";
import SidebarMessage from "./SidebarMessage";

interface RightSidebarCalendarPanelProps {
  events: CalendarEvent[];
  loading: boolean;
  error: string | null;
  onOpenCalendar: () => void;
}

function formatEventSchedule(event: CalendarEvent): string {
  const start = new Date(event.start);
  const end = new Date(event.end);

  if (Number.isNaN(start.getTime())) {
    return "Date unavailable";
  }

  const date = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  if (event.allDay) {
    return `${date} · All day`;
  }

  const startTime = start.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  if (
    Number.isNaN(end.getTime()) ||
    end.getTime() <= start.getTime()
  ) {
    return `${date} · ${startTime}`;
  }

  const endTime = end.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return `${date} · ${startTime}–${endTime}`;
}

const RightSidebarCalendarPanel: React.FC<
  RightSidebarCalendarPanelProps
> = ({ events, loading, error, onOpenCalendar }) => {
  return (
    <>
      <SidebarMessage
        loading={loading}
        error={error}
        empty={
          !loading && !error && events.length === 0
            ? "No upcoming events."
            : null
        }
      />

      <ul className="right-sidebar__list right-sidebar__event-list">
        {events.slice(0, 12).map((event) => (
          <li
            key={event.id}
            className={
              event.urgency
                ? `urgency-${event.urgency}`
                : undefined
            }
          >
            <button
              className="right-sidebar__event"
              type="button"
              onClick={onOpenCalendar}
            >
              <span>
                <strong>{event.title || "Untitled event"}</strong>
                {event.urgency && (
                  <small className="right-sidebar__urgency">
                    {event.urgency}
                  </small>
                )}
              </span>
              <small>{formatEventSchedule(event)}</small>
            </button>
          </li>
        ))}
      </ul>

      <button
        className="right-sidebar__open-page"
        type="button"
        onClick={onOpenCalendar}
      >
        Open Calendar
      </button>
    </>
  );
};

export default RightSidebarCalendarPanel;

