import React from "react";

interface SidebarMessageProps {
  loading: boolean;
  error: string | null;
  empty: string | null;
}

const SidebarMessage: React.FC<SidebarMessageProps> = ({
  loading,
  error,
  empty,
}) => {
  if (loading) {
    return (
      <p className="right-sidebar__message">
        Loading…
      </p>
    );
  }

  if (error) {
    return (
      <p className="right-sidebar__message is-error">
        {error}
      </p>
    );
  }

  return empty
    ? <p className="right-sidebar__message">{empty}</p>
    : null;
};

export default SidebarMessage;

