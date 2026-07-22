import React from "react";

import type { Document } from "../../api/documents";
import { formatDocumentDate } from "../../utils/documentText";
import type { DocumentLibraryView } from "./documentUiTypes";

interface DocumentLibraryProps {
  documents: Document[];
  filteredDocuments: Document[];
  selectedId: string | null;
  libraryOpen: boolean;
  librarySearch: string;
  libraryView: DocumentLibraryView;
  documentCounts: Record<DocumentLibraryView, number>;
  listError: string | null;
  listLoading: boolean;
  deletingId: string | null;
  setLibrarySearch(value: string): void;
  setLibraryView(value: DocumentLibraryView): void;
  onSelect(id: string): Promise<void>;
  onTogglePinned(document: Document): Promise<void>;
  onToggleFavorite(document: Document): Promise<void>;
  onDelete(id: string): Promise<void>;
}

const DocumentLibrary: React.FC<DocumentLibraryProps> = ({
  documents,
  filteredDocuments,
  selectedId,
  libraryOpen,
  librarySearch,
  libraryView,
  documentCounts,
  listError,
  listLoading,
  deletingId,
  setLibrarySearch,
  setLibraryView,
  onSelect: handleSelectDocument,
  onTogglePinned: handleTogglePinned,
  onToggleFavorite: handleToggleFavorite,
  onDelete: handleDelete,
}) => (
        <aside
          className={
            libraryOpen
              ? "documents-v2-library"
              : "documents-v2-library is-collapsed"
          }
          aria-label="Document library"
        >
          <div className="documents-v2-library-header">
            <div>
              <h2>Library</h2>
              <span>
                {documents.length} document
                {documents.length === 1
                  ? ""
                  : "s"}
              </span>
            </div>
          </div>

          <div className="documents-v2-library-search">
            <input
              type="search"
              value={librarySearch}
              onChange={(event) =>
                setLibrarySearch(
                  event.target.value
                )
              }
              placeholder="Search documents"
              aria-label="Search document library"
            />
          </div>

          <nav
            className="documents-v2-library-tabs"
            aria-label="Document views"
          >
            {(
              [
                ["all", "All"],
                ["recent", "Recent"],
                ["pinned", "Pinned"],
                ["favorites", "Favorites"],
              ] as Array<
                [DocumentLibraryView, string]
              >
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={
                  libraryView === value
                    ? "is-active"
                    : ""
                }
                onClick={() =>
                  setLibraryView(value)
                }
              >
                <span>{label}</span>
                <small>
                  {documentCounts[value]}
                </small>
              </button>
            ))}
          </nav>

          {listError && (
            <div
              className="documents-v2-library-error"
              role="alert"
            >
              {listError}
            </div>
          )}

          <div className="documents-v2-list">
            {listLoading ? (
              <LibraryLoading />
            ) : filteredDocuments.length ===
              0 ? (
              <p className="documents-v2-empty">
                {librarySearch
                  ? "No documents match your search."
                  : "No documents in this view."}
              </p>
            ) : (
              filteredDocuments.map(
                (document) => (
                  <article
                    key={document.id}
                    className={
                      document.id === selectedId
                        ? "documents-v2-list-item is-active"
                        : "documents-v2-list-item"
                    }
                  >
                    <button
                      className="documents-v2-list-main"
                      type="button"
                      onClick={() =>
                        void handleSelectDocument(
                          document.id
                        )
                      }
                    >
                      <span className="documents-v2-list-title">
                        {document.isPinned && (
                          <span
                            aria-label="Pinned"
                            title="Pinned"
                          >
                            ●
                          </span>
                        )}
                        {document.isFavorite && (
                          <span
                            aria-label="Favorite"
                            title="Favorite"
                          >
                            ★
                          </span>
                        )}
                        <strong>
                          {document.title ||
                            "Untitled document"}
                        </strong>
                      </span>
                      <small>
                        Updated{" "}
                        {formatDocumentDate(
                          document.updatedAt ||
                            document.createdAt
                        )}
                      </small>
                    </button>

                    <div className="documents-v2-list-actions">
                      <button
                        type="button"
                        className={
                          document.isPinned
                            ? "is-active"
                            : ""
                        }
                        onClick={() =>
                          void handleTogglePinned(
                            document
                          )
                        }
                        aria-label={
                          document.isPinned
                            ? `Unpin ${document.title}`
                            : `Pin ${document.title}`
                        }
                        title={
                          document.isPinned
                            ? "Unpin"
                            : "Pin"
                        }
                      >
                        P
                      </button>
                      <button
                        type="button"
                        className={
                          document.isFavorite
                            ? "is-active"
                            : ""
                        }
                        onClick={() =>
                          void handleToggleFavorite(
                            document
                          )
                        }
                        aria-label={
                          document.isFavorite
                            ? `Remove ${document.title} from favorites`
                            : `Add ${document.title} to favorites`
                        }
                        title={
                          document.isFavorite
                            ? "Remove favorite"
                            : "Favorite"
                        }
                      >
                        ★
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void handleDelete(
                            document.id
                          )
                        }
                        disabled={
                          deletingId === document.id
                        }
                        aria-label={`Delete ${document.title}`}
                        title="Delete"
                      >
                        {deletingId ===
                        document.id
                          ? "…"
                          : "×"}
                      </button>
                    </div>
                  </article>
                )
              )
            )}
          </div>
        </aside>
);

const LibraryLoading: React.FC = () => (
  <div className="documents-v2-library-loading" aria-label="Loading documents">
    <span />
    <span />
    <span />
    <span />
  </div>
);

export default DocumentLibrary;
