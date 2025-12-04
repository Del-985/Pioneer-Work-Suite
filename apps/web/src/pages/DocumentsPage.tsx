// apps/web/src/pages/DocumentsPage.tsx
import React, { useEffect, useState } from "react";
import {
  fetchDocuments,
  createDocument,
  deleteDocument,
  Document,
} from "../api/documents";

// Hardcode the same backend URL used in http.ts
const API_BASE_URL = "https://pioneer-work-suite.onrender.com";

const DocumentsPage: React.FC = () => {
  // List state
  const [documents, setDocuments] = useState<Document[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Currently selected document
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  // Save status
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // New doc / delete loading
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // “Loading…” when switching between docs
  const [switchingDoc, setSwitchingDoc] = useState(false);

  const selectedDoc = selectedId
    ? documents.find((d) => d.id === selectedId) || null
    : null;

  // Load docs on mount
  useEffect(() => {
    (async () => {
      try {
        setListLoading(true);
        setListError(null);
        const docs = await fetchDocuments();
        setDocuments(docs);
      } catch (err) {
        console.error("Error loading documents:", err);
        setListError("Failed to load documents.");
      } finally {
        setListLoading(false);
      }
    })();
  }, []);

  // Auto-select first doc
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

  // Core: force a PUT to the backend for the current doc using fetch
  async function saveCurrentDocument() {
  // DEBUG: prove the handler actually runs
  setSaveError("Save button CLICKED");
  console.log("saveCurrentDocument fired");

  if (!selectedId) {
    setSaveError("No document selected to save.");
    return;
  }

  const token =
    typeof window !== "undefined"
      ? window.localStorage.getItem("token")
      : null;

  if (!token) {
    setSaveError("You are not authenticated.");
    return;
  }

  setIsSaving(true);
  setSaveError(null);



    const targetId = selectedId;
    const currentTitle = editTitle;
    const currentContent = editContent;

    try {
      const res = await fetch(`${API_BASE_URL}/documents/${targetId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: currentTitle,
          content: currentContent,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("Save failed response:", res.status, text);
        setSaveError(`Save failed (${res.status}).`);
        setIsSaving(false);
        return;
      }

      const updated = (await res.json()) as Document;

      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === updated.id ? updated : doc
        )
      );
      setLastSavedAt(updated.updatedAt || updated.createdAt || null);
    } catch (err) {
      console.error("Error saving document via fetch:", err);
      setSaveError("Save failed (network error).");
    } finally {
      setIsSaving(false);
    }
  }

  function handleSelect(id: string) {
    const doc = documents.find((d) => d.id === id);
    setSelectedId(id);
    if (doc) {
      setSwitchingDoc(true);
      setEditTitle(doc.title);
      setEditContent(doc.content);
      setLastSavedAt(doc.updatedAt || doc.createdAt || null);
      setSaveError(null);
      setIsSaving(false);

      window.setTimeout(() => {
        setSwitchingDoc(false);
      }, 200);
    }
  }

  async function handleCreateNew() {
    setCreating(true);
    setSaveError(null);
    try {
      const created = await createDocument("Untitled document", "");
      setDocuments((prev) => [created, ...prev]);
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

  async function handleManualSave() {
    await saveCurrentDocument();
  }

  async function handleDelete(id: string) {
    const doc = documents.find((d) => d.id === id);

    let titleEmpty = true;
    let contentEmpty = true;

    if (id === selectedId) {
      titleEmpty = !editTitle || editTitle.trim().length === 0;
      contentEmpty = !editContent || editContent.trim().length === 0;
    } else if (doc) {
      titleEmpty = !doc.title || doc.title.trim().length === 0;
      contentEmpty = !doc.content || doc.content.trim().length === 0;
    }

    if (!titleEmpty || !contentEmpty) {
      const confirmed = window.confirm(
        "This document has content. Are you sure you want to delete it?"
      );
      if (!confirmed) {
        return;
      }
    }

    setDeletingId(id);
    setSaveError(null);

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
    } catch (err: any) {
      console.error("Error deleting document:", err);
      const status = err?.response?.status;
      if (!status || status !== 404) {
        setDocuments(previousDocs);
        setSaveError("Unable to delete document.");
      }
    } finally {
      setDeletingId(null);
    }
  }

  const hasSelection = selectedId !== null;

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
        flexDirection: "column",
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
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <div>{renderSaveStatus()}</div>
                <button
                  type="button"
                  onClick={handleManualSave}
                  disabled={!selectedId || isSaving}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: "none",
                    fontSize: 11,
                    cursor: !selectedId || isSaving ? "default" : "pointer",
                    background: "rgba(127,61,255,0.2)",
                    color: "#c6b3ff",
                    whiteSpace: "nowrap",
                  }}
                >
                  {isSaving ? "Saving…" : "Save now"}
                </button>
              </div>
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