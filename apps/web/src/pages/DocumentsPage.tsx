// apps/web/src/pages/DocumentsPage.tsx
import React, { useEffect, useState } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import {
  fetchDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
  Document,
} from "../api/documents";

const LAST_DOC_KEY = "suite:lastDocumentId";

const DocumentsPage: React.FC = () => {
  // List
  const [documents, setDocuments] = useState<Document[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Selected doc
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  // Save state
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [hasLocalChanges, setHasLocalChanges] = useState(false);

  // Create / delete
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Word count
  const [wordCount, setWordCount] = useState(0);

  // Quill ref for undo/redo + commands
  const quillRef = React.useRef<any>(null);

  const selectedDoc =
    selectedId != null
      ? documents.find((d) => d.id === selectedId) || null
      : null;
  const hasSelection = !!selectedDoc;

  // ----- Quill config -----
  const quillModules = {
    toolbar: {
      container: [
        [{ header: [1, 2, false] }],
        [{ font: [] }, { size: [] }],
        ["bold", "italic", "underline", "strike"],
        [{ list: "ordered" }, { list: "bullet" }],
        ["link", "image"],
        ["undo", "redo"],
      ],
      handlers: {
        undo: () => {
          const editor = quillRef.current?.getEditor?.();
          if (editor && editor.history) editor.history.undo();
        },
        redo: () => {
          const editor = quillRef.current?.getEditor?.();
          if (editor && editor.history) editor.history.redo();
        },
        image: () => {
          const editor = quillRef.current?.getEditor?.();
          if (!editor || typeof document === "undefined") return;

          const input = document.createElement("input");
          input.setAttribute("type", "file");
          input.setAttribute("accept", "image/*");

          input.onchange = () => {
            const file = input.files && input.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
              const base64 = e.target?.result;
              if (typeof base64 !== "string") return;
              const range = editor.getSelection(true);
              const index = range ? range.index : editor.getLength();
              editor.insertEmbed(index, "image", base64, "user");
              editor.setSelection(index + 1);
            };
            reader.readAsDataURL(file);
          };

          input.click();
        },
      },
    },
    history: {
      delay: 500,
      maxStack: 100,
      userOnly: true,
    },
  };

  const quillFormats = [
    "header",
    "font",
    "size",
    "bold",
    "italic",
    "underline",
    "strike",
    "list",
    "bullet",
    "link",
    "image",
  ];

  // ----- Helpers -----
  function countWordsFromHtml(html: string): number {
    if (!html) return 0;
    if (typeof document === "undefined") return 0;

    const div = document.createElement("div");
    div.innerHTML = html;
    const text = (div.textContent || div.innerText || "").trim();
    if (!text) return 0;
    return text.split(/\s+/).filter(Boolean).length;
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

  function formatShortDate(raw: string | undefined | null): string {
    if (!raw) return "";
    const d = new Date(raw);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function extractPlain(html: string | undefined | null): string {
    if (!html) return "";
    if (typeof document === "undefined") return html;
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;
    return (tempDiv.textContent || tempDiv.innerText || "").trim();
  }

  function rememberLastDoc(id: string | null) {
    if (typeof window === "undefined") return;
    if (!id) {
      window.localStorage.removeItem(LAST_DOC_KEY);
    } else {
      window.localStorage.setItem(LAST_DOC_KEY, id);
    }
  }

  function getRememberedLastDocId(): string | null {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(LAST_DOC_KEY);
    } catch {
      return null;
    }
  }

  // ----- Load documents once, and select last opened if present -----
  useEffect(() => {
    (async () => {
      setListLoading(true);
      setListError(null);
      try {
        const docs = await fetchDocuments();
        setDocuments(docs);

        if (docs.length > 0) {
          const rememberedId = getRememberedLastDocId();
          let initial = docs[0];

          if (rememberedId) {
            const match = docs.find((d) => d.id === rememberedId);
            if (match) {
              initial = match;
            }
          }

          setSelectedId(initial.id);
          setEditTitle(initial.title);
          setEditContent(initial.content || "");
          setLastSavedAt(initial.updatedAt || initial.createdAt || null);
          setHasLocalChanges(false);
          setWordCount(countWordsFromHtml(initial.content || ""));
        }
      } catch (err) {
        console.error("Error loading documents:", err);
        setListError("Failed to load documents.");
      } finally {
        setListLoading(false);
      }
    })();
  }, []);

  // Persist last selected id
  useEffect(() => {
    if (selectedId) {
      rememberLastDoc(selectedId);
    }
  }, [selectedId]);

  // ----- Update word count when editor changes -----
  useEffect(() => {
    if (!hasSelection) {
      setWordCount(0);
      return;
    }
    setWordCount(countWordsFromHtml(editContent));
  }, [editContent, hasSelection]);

  // ----- Save helpers -----
  async function saveCurrentDocument() {
    if (!selectedDoc || !selectedDoc.id) {
      setSaveError("No document selected to save.");
      return;
    }
    setIsSaving(true);
    setSaveError(null);

    const targetId = selectedDoc.id;
    const currentTitle = editTitle;
    const currentContent = editContent;

    try {
      const updated = await updateDocument(targetId, {
        title: currentTitle,
        content: currentContent,
      });

      setDocuments((prev) =>
        prev.map((d) => (d.id === updated.id ? updated : d))
      );
      setLastSavedAt(updated.updatedAt || updated.createdAt || null);
      setHasLocalChanges(false);
    } catch (err) {
      console.error("Error saving document:", err);
      setSaveError("Save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  // Debounced autosave
  useEffect(() => {
    if (!hasSelection) return;
    if (!hasLocalChanges) return;
    if (!selectedDoc || !selectedDoc.id) return;

    const timeout = window.setTimeout(() => {
      void saveCurrentDocument();
    }, 3000);

    return () => window.clearTimeout(timeout);
  }, [editTitle, editContent, hasLocalChanges, hasSelection, selectedDoc?.id]);

  // Keyboard shortcuts: Ctrl/Cmd+S for save, Ctrl/Cmd+Alt+1/2/0 for headings
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (!hasSelection) return;

      const isMac =
        typeof navigator !== "undefined" &&
        navigator.platform.toUpperCase().indexOf("MAC") >= 0;

      const key = e.key.toLowerCase();

      const isSaveCombo =
        ((isMac && e.metaKey) || (!isMac && e.ctrlKey)) &&
        !e.altKey &&
        !e.shiftKey &&
        key === "s";

      if (isSaveCombo) {
        e.preventDefault();
        if (!isSaving) {
          void saveCurrentDocument();
        }
        return;
      }

      const editor = quillRef.current?.getEditor?.();
      if (!editor) return;

      const headingCombo =
        ((isMac && e.metaKey) || (!isMac && e.ctrlKey)) && e.altKey;

      if (headingCombo) {
        if (key === "1") {
          e.preventDefault();
          editor.format("header", 1);
        } else if (key === "2") {
          e.preventDefault();
          editor.format("header", 2);
        } else if (key === "0") {
          e.preventDefault();
          editor.format("header", false);
        }
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [hasSelection, isSaving, selectedDoc, editTitle, editContent]);

  // ----- UI handlers -----
  async function handleSelect(id: string) {
    const doc = documents.find((d) => d.id === id);
    setSelectedId(id);

    if (doc) {
      setEditTitle(doc.title);
      setEditContent(doc.content || "");
      setLastSavedAt(doc.updatedAt || doc.createdAt || null);
      setHasLocalChanges(false);
      setSaveError(null);
      setWordCount(countWordsFromHtml(doc.content || ""));
    } else {
      setEditTitle("");
      setEditContent("");
      setLastSavedAt(null);
      setHasLocalChanges(false);
      setWordCount(0);
    }
  }

  async function handleCreateNew() {
    setCreating(true);
    setSaveError(null);
    try {
      const created = await createDocument("Untitled document", "");
      if (!created || !created.id) {
        setSaveError("Unable to create document.");
        return;
      }

      setDocuments((prev) => [created, ...prev]);
      setSelectedId(created.id);
      setEditTitle(created.title);
      setEditContent(created.content || "");
      setLastSavedAt(created.updatedAt || created.createdAt || null);
      setHasLocalChanges(false);
      setWordCount(0);
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

    if (selectedDoc && selectedDoc.id === id) {
      titleEmpty = !editTitle || editTitle.trim().length === 0;
      contentEmpty = extractPlain(editContent).length === 0;
    } else if (doc) {
      titleEmpty = !doc.title || doc.title.trim().length === 0;
      contentEmpty = extractPlain(doc.content).length === 0;
    }

    if (!titleEmpty || !contentEmpty) {
      const confirmed = window.confirm(
        "This document has content. Are you sure you want to delete it?"
      );
      if (!confirmed) return;
    }

    setDeletingId(id);
    setSaveError(null);

    const previous = documents;
    const remaining = documents.filter((d) => d.id !== id);
    setDocuments(remaining);

    if (selectedDoc && selectedDoc.id === id) {
      if (remaining.length > 0) {
        const first = remaining[0];
        setSelectedId(first.id);
        setEditTitle(first.title);
        setEditContent(first.content || "");
        setLastSavedAt(first.updatedAt || first.createdAt || null);
        setHasLocalChanges(false);
        setWordCount(countWordsFromHtml(first.content || ""));
      } else {
        setSelectedId(null);
        setEditTitle("");
        setEditContent("");
        setLastSavedAt(null);
        setHasLocalChanges(false);
        setWordCount(0);
      }
    }

    try {
      await deleteDocument(id);
    } catch (err: any) {
      console.error("Error deleting document:", err);
      const status = err?.response?.status;
      if (!status || status !== 404) {
        setDocuments(previous);
        setSaveError("Unable to delete document.");
      }
    } finally {
      setDeletingId(null);
    }
  }

  function renderSaveStatus() {
    if (!hasSelection) return null;

    if (isSaving) {
      return (
        <span style={{ fontSize: 12, color: "#9da2c8" }}>Saving…</span>
      );
    }

    if (saveError) {
      return (
        <span style={{ fontSize: 12, color: "#ff7b88" }}>{saveError}</span>
      );
    }

    if (hasLocalChanges) {
      return (
        <span style={{ fontSize: 12, color: "#f0c36a" }}>
          Unsaved changes…
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

  // ----- Render -----
  const createdLabel = selectedDoc
    ? formatShortDate(selectedDoc.createdAt)
    : "";
  const updatedLabel = selectedDoc
    ? formatShortDate(selectedDoc.updatedAt || selectedDoc.createdAt)
    : "";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        height: "100%",
      }}
    >
      {/* Documents list card */}
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
            ) : listError ? (
              <p
                style={{
                  margin: 0,
                  marginTop: 2,
                  fontSize: 11,
                  color: "#ff7b88",
                }}
              >
                {listError}
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
            const isActive = selectedDoc && doc.id === selectedDoc.id;
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
                    Updated {getUpdatedLabel(doc)}
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

      {/* Editor card */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "#05070a",
          padding: 12,
          minHeight: 260,
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
                onChange={(e) => {
                  setEditTitle(e.target.value);
                  setHasLocalChanges(true);
                  setSaveError(null);
                }}
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
                  marginTop: 2,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  <div>{renderSaveStatus()}</div>
                  <span
                    style={{
                      fontSize: 11,
                      color: "#6f7598",
                    }}
                  >
                    {wordCount} word{wordCount === 1 ? "" : "s"}
                  </span>
                  {createdLabel && (
                    <span
                      style={{
                        fontSize: 11,
                        color: "#6f7598",
                      }}
                    >
                      Created {createdLabel}
                      {updatedLabel && updatedLabel !== createdLabel
                        ? ` · Updated ${updatedLabel}`
                        : ""}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleManualSave}
                  disabled={isSaving}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: "none",
                    fontSize: 11,
                    cursor: isSaving ? "default" : "pointer",
                    background: "rgba(127,61,255,0.2)",
                    color: "#c6b3ff",
                    whiteSpace: "nowrap",
                  }}
                >
                  {isSaving ? "Saving…" : "Save now"}
                </button>
              </div>
            </div>

            <div
              className="doc-editor"
              style={{
                flex: 1,
                minHeight: 200,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <ReactQuill
                ref={quillRef}
                value={editContent}
                onChange={(html) => {
                  setEditContent(html);
                  setHasLocalChanges(true);
                  setSaveError(null);
                }}
                placeholder="Start writing your document here..."
                theme="snow"
                modules={quillModules}
                formats={quillFormats}
                style={{
                  flex: 1,
                  minHeight: 180,
                  background: "#050713",
                  color: "#f5f5f5",
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DocumentsPage;