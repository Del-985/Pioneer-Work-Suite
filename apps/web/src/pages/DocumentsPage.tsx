// apps/web/src/pages/DocumentsPage.tsx
import React, { useEffect, useState } from "react";
import {
  fetchDocuments,
  createDocument,
  updateDocument,
  deleteDocument,
  Document,
} from "../api/documents";

const DocumentsPage: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const [saving, setSaving] = useState(false);

  // Load docs on mount
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const loaded = await fetchDocuments();
        setDocuments(loaded);

        // v1.1 change: DO NOT auto-select the first document.
        // User must explicitly pick or create a doc to start editing.
      } catch (err) {
        console.error("Error loading documents:", err);
        setError("Unable to load documents.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function handleSelectDoc(doc: Document) {
    setSelectedId(doc.id);
    setTitle(doc.title);
    setContent(doc.content);
    setError(null);
  }

  async function handleNewDocument() {
    setError(null);
    try {
      const created = await createDocument("Untitled document", "");
      setDocuments((prev) => [created, ...prev]);
      setSelectedId(created.id);
      setTitle(created.title);
      setContent(created.content);
    } catch (err) {
      console.error("Error creating document:", err);
      setError("Unable to create document.");
    }
  }

  async function handleDeleteSelected() {
    if (!selectedId) return;
    const toDelete = selectedId;

    // Optimistic UI: remove locally first
    const remaining = documents.filter((d) => d.id !== toDelete);
    setDocuments(remaining);

    // Decide what to show next
    if (remaining.length > 0) {
      const next = remaining[0];
      setSelectedId(next.id);
      setTitle(next.title);
      setContent(next.content);
    } else {
      setSelectedId(null);
      setTitle("");
      setContent("");
    }

    try {
      await deleteDocument(toDelete);
    } catch (err) {
      console.error("Error deleting document:", err);
      setError("Unable to delete document.");
    }
  }

  async function handleSave() {
    if (!selectedId) {
      // No doc selected; in v1.1 we just do nothing here.
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const updated = await updateDocument(selectedId, {
        title,
        content,
      });

      setDocuments((prev) =>
        prev.map((d) => (d.id === updated.id ? updated : d))
      );
    } catch (err) {
      console.error("Error saving document:", err);
      setError("Unable to save document.");
    } finally {
      setSaving(false);
    }
  }

  const selectedDoc = selectedId
    ? documents.find((d) => d.id === selectedId)
    : null;

  return (
    <div style={{ display: "flex", height: "100%", gap: 16 }}>
      {/* Left: documents list */}
      <div
        style={{
          width: 220,
          minWidth: 220,
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.06)",
          background: "#050713",
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600 }}>Documents</span>
          <button
            type="button"
            onClick={handleNewDocument}
            style={{
              border: "none",
              borderRadius: 999,
              padding: "4px 8px",
              cursor: "pointer",
              fontSize: 11,
              background: "linear-gradient(135deg, #3f64ff, #7f3dff)",
              color: "#ffffff",
            }}
          >
            New
          </button>
        </div>

        {loading && (
          <p style={{ fontSize: 12, color: "#9da2c8" }}>Loading…</p>
        )}

        {!loading && documents.length === 0 && (
          <p style={{ fontSize: 12, color: "#9da2c8" }}>
            No documents yet. Create your first one.
          </p>
        )}

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            paddingRight: 4,
          }}
        >
          {documents.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => handleSelectDoc(doc)}
              style={{
                width: "100%",
                textAlign: "left",
                borderRadius: 10,
                border:
                  selectedId === doc.id
                    ? "1px solid rgba(63,100,255,0.9)"
                    : "1px solid rgba(255,255,255,0.06)",
                background:
                  selectedId === doc.id ? "#101531" : "transparent",
                padding: "6px 8px",
                marginBottom: 4,
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: "#f5f5ff",
                  marginBottom: 2,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {doc.title || "Untitled document"}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#9da2c8",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {doc.content || "Empty"}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: editor */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="workspace-placeholder" style={{ marginBottom: 4 }}>
          <h2 style={{ marginBottom: 4 }}>Document editor</h2>
          <p style={{ fontSize: 13 }}>
            For v1, this is a simple text editor. Select a document or create a
            new one to start editing.
          </p>
        </div>

        {error && (
          <p style={{ fontSize: 13, color: "#ff7b88" }}>{error}</p>
        )}

        {/* If no document selected, show a friendly message instead of editor */}
        {!selectedDoc && !loading && documents.length === 0 && (
          <p style={{ fontSize: 13, color: "#9da2c8" }}>
            Create a new document to start writing.
          </p>
        )}

        {!selectedDoc && !loading && documents.length > 0 && (
          <p style={{ fontSize: 13, color: "#9da2c8" }}>
            Select a document from the list on the left to start editing.
          </p>
        )}

        {selectedDoc && (
          <>
            {/* Editor controls */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    border: "none",
                    borderRadius: 999,
                    padding: "6px 12px",
                    cursor: "pointer",
                    fontSize: 12,
                    background:
                      "linear-gradient(135deg, #3f64ff, #7f3dff)",
                    color: "#ffffff",
                  }}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  style={{
                    border: "none",
                    borderRadius: 999,
                    padding: "6px 12px",
                    cursor: "pointer",
                    fontSize: 12,
                    background: "rgba(255,124,124,0.12)",
                    color: "#ff9b9b",
                  }}
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Title + content inputs */}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title"
              style={{
                marginBottom: 6,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "#05070a",
                color: "#f5f5f5",
                fontSize: 14,
              }}
            />
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Start typing..."
              style={{
                flex: 1,
                minHeight: 220,
                resize: "vertical",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "#05070a",
                color: "#f5f5f5",
                fontSize: 13,
                lineHeight: 1.5,
              }}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default DocumentsPage;