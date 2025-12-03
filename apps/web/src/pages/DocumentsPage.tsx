// apps/web/src/pages/DocumentsPage.tsx
import React, { useEffect, useState, useRef } from "react";
import {
  fetchDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
  Document,
} from "../api/documents";

const AUTOSAVE_DELAY_MS = 1500; // wait 1.5s after last change

const DocumentsPage: React.FC = () => {
  // List state
  const [documents, setDocuments] = useState<Document[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Currently selected document
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  // Autosave status
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // New doc / delete loading
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // “Loading…” when switching between docs (purely UI)
  const [switchingDoc, setSwitchingDoc] = useState(false);

  // Autosave timer ref
  const autosaveTimeoutRef = useRef<number | null>(null);

  // Find the currently selected document object (may briefly be null)
  const selectedDoc = selectedId
    ? documents.find((d) => d.id === selectedId) || null
    : null;

  // Helper: clear any pending autosave timer
  function clearAutosaveTimer() {
    if (autosaveTimeoutRef.current !== null) {
      window.clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }
  }

  // Load all documents on mount (but don't auto-select here)
  useEffect(() => {
    (async () => {
      try {
        setListLoading(true);
        setListError(null);
        const docs = await fetchDocuments();

        // Don't clobber existing docs if a new one was created while fetch was in flight
        setDocuments((prev) => (prev.length > 0 ? prev : docs));
      } catch (err) {
        console.error("Error loading documents:", err);
        setListError("Failed to load documents.");
      } finally {
        setListLoading(false);
      }
    })();
  }, []);

  // Separate effect: auto-select first doc *only* if nothing is selected yet
  useEffect(() => {
    if (!selectedId && documents.length > 0) {
      const first = documents[0];
      setSelectedId(first.id);
      setSwitchingDoc(true);
      setEditTitle(first.title);
      setEditContent(first.content);
      setLastSavedAt(first.updatedAt || first.createdAt || null);
      window.setTimeout(() => {
        setSwitchingDoc(false);
      }, 200);
    }
  }, [documents, selectedId]);

  // When you click a doc in the list
  function handleSelect(id: string) {
    clearAutosaveTimer(); // don’t autosave while switching
    const doc = documents.find((d) => d.id === id);
    setSelectedId(id);
    if (doc) {
      setSwitchingDoc(true);
      setEditTitle(doc.title);
      setEditContent(doc.content);
      setLastSavedAt(doc.updatedAt || doc.createdAt || null);
      setSaveError(null);
      setIsSaving(false);

      // Tiny visual “loading” delay (pure UX)
      window.setTimeout(() => {
        setSwitchingDoc(false);
      }, 200);
    }
  }

  // Create a new document and select it
  async function handleCreateNew() {
    clearAutosaveTimer();
    setCreating(true);
    setSaveError(null);
    try {
      const created = await createDocument("Untitled document", "");
      // Prepend to list
      setDocuments((prev) => [created, ...prev]);
      // Focus editor on it
      setSelectedId(created.id);
      setSwitchingDoc(true);
      setEditTitle(created.title);
      setEditContent(created.content || "");
      setLastSavedAt(created.updatedAt || created.createdAt || null);
      window.setTimeout(() => {
        setSwitchingDoc(false);
      }, 200);
    } catch (err) {
      console.error("Error creating document:", err);
      setSaveError("Unable to create document.");
    } finally {
      setCreating(false);
    }
  }

  // Delete a document (with confirmation if not empty), using live editor content
  async function handleDelete(id: string) {
    const doc = documents.find((d) => d.id === id);

    // Decide emptiness based on CURRENT editor state if this is the selected doc.
    let titleEmpty = true;
    let contentEmpty = true;

    if (id === selectedId) {
      // Use the live editor values
      titleEmpty = !editTitle || editTitle.trim().length === 0;
      contentEmpty = !editContent || editContent.trim().length === 0;
    } else if (doc) {
      // Fallback for non-selected docs: use stored values
      titleEmpty = !doc.title || doc.title.trim().length === 0;
      contentEmpty = !doc.content || doc.content.trim().length === 0;
    }

    // Only ask for confirmation if the doc isn't empty (including unsaved edits)
    if (!titleEmpty || !contentEmpty) {
      const confirmed = window.confirm(
        "This document has content. Are you sure you want to delete it?"
      );
      if (!confirmed) {
        return;
      }
    }

    if (id === selectedId) {
      clearAutosaveTimer();
    }

    setDeletingId(id);
    setSaveError(null);

    // Optimistic UI update
    const previousDocs = documents;
    const remaining = documents.filter((d) => d.id !== id);
    setDocuments(remaining);

    if (selectedId === id) {
      if (remaining.length > 0) {
        const first = remaining[0];
        setSelectedId(first.id);
        setSwitchingDoc(true);
        setEditTitle(first.title);
        setEditContent(first.content);
        setLastSavedAt(first.updatedAt || first.createdAt || null);
        window.setTimeout(() => {
          setSwitchingDoc(false);
        }, 200);
      } else {
        setSelectedId(null);
        setEditTitle("");
        setEditContent("");
        setLastSavedAt(null);
        setSwitchingDoc(false);
      }
    }

    try {
      await deleteDocument(id);
      // If backend says 404, we treat it as "already gone" and keep UI as-is.
    } catch (err: any) {
      console.error("Error deleting document:", err);
      const status = err?.response?.status;
      if (!status || status !== 404) {
        // Serious error → rollback and show message
        setDocuments(previousDocs);
        setSaveError("Unable to delete document.");
      }
    } finally {
      setDeletingId(null);
    }
  }

  // AUTOSAVE:
  // - If there is a selected doc whose DB content is "" and editor content just changed,
  //   we do an IMMEDIATE save (no debounce) – this is the “force DB to accept new doc” piece.
  // - Otherwise, we do a debounced save.
  useEffect(() => {
    if (!selectedId) {
      clearAutosaveTimer();
      return;
    }

    // If we don't even have a doc object yet (very tiny window), just do debounced save.
    const baseTitle = selectedDoc?.title ?? "";
    const baseContent = selectedDoc?.content ?? "";

    // Clear any previous timer
    clearAutosaveTimer();

    const changed =
      editTitle !== baseTitle || editContent !== baseContent;

    // Nothing changed vs last known version → no save
    if (!changed) {
      return;
    }

    const targetId = selectedId;
    const currentTitle = editTitle;
    const currentContent = editContent;

    // Is this the first change from empty content?
    const isFirstChangeFromEmpty =
      selectedDoc &&
      selectedDoc.content === "" &&
      currentContent !== selectedDoc.content;

    //Immediate save for first change from empty → non-empty
    if (isFirstChangeFromEmpty) {
      (async () => {
        try {
          setIsSaving(true);
          setSaveError(null);
          const updated = await updateDocument(targetId, {
            title: currentTitle,
            content: currentContent,
          });

          setDocuments((prev) =>
            prev.map((doc) =>
              doc.id === updated.id ? updated : doc
            )
          );
          setLastSavedAt(updated.updatedAt || updated.createdAt || null);
        } catch (err) {
          console.error("Error autosaving document (immediate):", err);
          setSaveError("Autosave failed.");
        } finally {
          setIsSaving(false);
        }
      })();

      return; // skip debounce in this special case
    }

    // 🕒 Normal debounced autosave for all other changes
    const timeoutId = window.setTimeout(async () => {
      try {
        setIsSaving(true);
        setSaveError(null);
        const updated = await updateDocument(targetId, {
          title: currentTitle,
          content: currentContent,
        });

        setDocuments((prev) =>
          prev.map((doc) =>
            doc.id === updated.id ? updated : doc
          )
        );
        setLastSavedAt(updated.updatedAt || updated.createdAt || null);
      } catch (err) {
        console.error("Error autosaving document:", err);
        setSaveError("Autosave failed.");
      } finally {
        setIsSaving(false);
        autosaveTimeoutRef.current = null;
      }
    }, AUTOSAVE_DELAY_MS);

    autosaveTimeoutRef.current = timeoutId;

    return () => {
      clearAutosaveTimer();
    };
  }, [editTitle, editContent, selectedId, selectedDoc]);

  // Derived UI bits
  const hasSelection = selectedId !== null; // trust the selection id

  function renderSaveStatus() {
    if (!hasSelection) return null;

    if (switchingDoc) {
      return (
        <span style={{ fontSize: 12, color: "#9da2c8" }}>
          Loading document…
        </span>
      );
    }

    if (isSaving) {
      return (
        <span style={{ fontSize: 12, color: "#9da2c8" }}>
          Saving…
        </span>
      );
    }

    if (saveError) {
      return (
        <span style={{ fontSize: 12, color: "#ff7b88" }}>
          {saveError}
        </span>
      );
    }

    if (lastSavedAt) {
      const d = new Date(lastSavedAt);
      if (!isNaN(d.getTime())) {
        return (
          <span style={{ fontSize: 12, color: "#6f7598" }}>
            Saved at{" "}
            {d.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        );
      }
    }

    return null;
  }

  // Helper: safe label for "Updated X"
  function getUpdatedLabel(doc: Document): string {
    const raw = doc.updatedAt || doc.createdAt;
    if (!raw) return "Just now";

    const d = new Date(raw);
    if (isNaN(d.getTime())) return "Just now";

    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column", // stacked for mobile
        gap: 16,
        height: "100%",
      }}
    >
      {/* Document list */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "#050713",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Documents
            </h2>
            {listLoading ? (
              <p
                style={{
                  margin: 0,
                  marginTop: 2,
                  fontSize: 11,
                  color: "#9da2c8",
                }}
              >
                Loading…
              </p>
            ) : (
              <p
                style={{
                  margin: 0,
                  marginTop: 2,
                  fontSize: 11,
                  color: "#6f7598",
                }}
              >
                {documents.length} total
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleCreateNew}
            disabled={creating}
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: "none",
              cursor: creating ? "default" : "pointer",
              background: creating
                ? "rgba(127,61,255,0.6)"
                : "linear-gradient(135deg, #3f64ff, #7f3dff)",
              color: "#ffffff",
              fontSize: 12,
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            {creating ? "Creating…" : "New"}
          </button>
        </div>

        {listError && (
          <div
            style={{
              padding: "8px 12px",
              fontSize: 12,
              color: "#ff7b88",
            }}
          >
            {listError}
          </div>
        )}

        <div
          style={{
            maxHeight: 260,
            overflowY: "auto",
            padding: "6px 0",
          }}
        >
          {documents.length === 0 && !listLoading && !listError && (
            <p
              style={{
                padding: "8px 12px",
                fontSize: 12,
                color: "#9da2c8",
              }}
            >
              No documents yet. Create your first one above.
            </p>
          )}

          {documents.map((doc) => {
            const isActive = doc.id === selectedId;
            const updatedLabel = getUpdatedLabel(doc);
            const isDeleting = deletingId === doc.id;

            return (
              <div
                key={doc.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingRight: 8,
                }}
              >
                <button
                  type="button"
                  onClick={() => handleSelect(doc.id)}
                  style={{
                    flex: 1,
                    textAlign: "left",
                    padding: "8px 12px",
                    border: "none",
                    borderLeft: isActive
                      ? "3px solid #7f3dff"
                      : "3px solid transparent",
                    background: isActive
                      ? "rgba(127,61,255,0.15)"
                      : "transparent",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: isActive ? 500 : 400,
                      color: "#f5f5f5",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {doc.title || "Untitled document"}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: "#6f7598",
                    }}
                  >
                    Updated {updatedLabel}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(doc.id)}
                  disabled={isDeleting}
                  style={{
                    all: "unset",
                    cursor: isDeleting ? "default" : "pointer",
                    fontSize: 11,
                    opacity: 0.75,
                    padding: "0 4px",
                  }}
                  aria-label="Delete document"
                >
                  {isDeleting ? "…" : "✕"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Editor */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "#05070a",
          padding: 12,
          minHeight: 160,
        }}
      >
        {!hasSelection ? (
          <div className="workspace-placeholder">
            <h2>Select or create a document</h2>
            <p>
              Pick a document from the list above, or create a new one to start
              writing.
            </p>
          </div>
        ) : (
          <>
            <div
              style={{
                marginBottom: 8,
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Document title"
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "#050713",
                  color: "#f5f5f5",
                  fontSize: 14,
                  fontWeight: 500,
                }}
              />
              <div>{renderSaveStatus()}</div>
            </div>

            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Start writing your document here..."
              style={{
                minHeight: 160,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "#050713",
                color: "#f5f5f5",
                padding: 10,
                fontSize: 13,
                lineHeight: 1.5,
                fontFamily:
                  '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
                resize: "vertical",
              }}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default DocumentsPage;