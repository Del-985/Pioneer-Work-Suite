import React from "react";

import SidebarMessage from "./SidebarMessage";

interface RightSidebarStatisticsPanelProps {
  statistics: {
    activeTasks: number;
    completedTasks: number;
    totalDocuments: number;
    pinnedDocuments: number;
    upcomingEvents: number;
  };
  loading: boolean;
  error: string | null;
}

const RightSidebarStatisticsPanel: React.FC<
  RightSidebarStatisticsPanelProps
> = ({ statistics, loading, error }) => {
  const items = [
    ["Active tasks", statistics.activeTasks],
    ["Completed tasks", statistics.completedTasks],
    ["Documents", statistics.totalDocuments],
    ["Pinned documents", statistics.pinnedDocuments],
    ["Upcoming events", statistics.upcomingEvents],
  ] as const;

  return (
    <>
      <SidebarMessage
        loading={false}
        error={error}
        empty={null}
      />
      <div
        className="right-sidebar__statistics"
        aria-busy={loading}
      >
        {items.map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{loading ? "—" : value}</strong>
          </article>
        ))}
      </div>
    </>
  );
};

export default RightSidebarStatisticsPanel;

