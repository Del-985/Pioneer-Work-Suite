import React from "react";

import type {
  Document,
} from "../../api/documents";
import {
  formatDocumentDate,
} from "../../utils/documentText";
import SidebarMessage from "./SidebarMessage";

interface RightSidebarDocumentsPanelProps {
  documents: Document[];
  loading: boolean;
  error: string | null;
  onOpenDocument: (id: string) => void;
  onOpenDocuments: () => void;
}

const RightSidebarDocumentsPanel: React.FC<
  RightSidebarDocumentsPanelProps
> = ({
  documents,
  loading,
  error,
  onOpenDocument,
  onOpenDocuments,
}) => {
  return (
    <>
      <SidebarMessage
        loading={loading}
        error={error}
        empty={
          !loading && !error && documents.length === 0
            ? "No documents yet."
            : null
        }
      />

      <ul className="right-sidebar__list right-sidebar__document-list">
        {documents.slice(0, 10).map((document) => (
          <li key={document.id}>
            <button
              className="right-sidebar__document"
              type="button"
              onClick={() => onOpenDocument(document.id)}
            >
              <span>
                {document.isPinned && (
                  <span
                    className="right-sidebar__pin"
                    aria-label="Pinned"
                  >
                    ●
                  </span>
                )}
                <strong>
                  {document.title || "Untitled document"}
                </strong>
              </span>
              <small>
                Updated{" "}
                {formatDocumentDate(
                  document.updatedAt || document.createdAt
                )}
              </small>
            </button>
          </li>
        ))}
      </ul>

      <button
        className="right-sidebar__open-page"
        type="button"
        onClick={onOpenDocuments}
      >
        Open Documents
      </button>
    </>
  );
};

export default RightSidebarDocumentsPanel;

