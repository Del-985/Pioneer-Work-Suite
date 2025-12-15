// apps/web/src/pages/MailPage.tsx
import React, { useEffect, useState } from "react";
import {
  fetchMailMessages,
  sendMail,
  updateMailMessage,
  deleteMailMessage,
  MailMessage,
  MailFolder,
} from "../api/mail";

type MailView = "list-detail" | "compose";

const folderLabels: Record<MailFolder, string> = {
  inbox: "Inbox",
  sent: "Sent",
  draft: "Drafts",
  archive: "Archive",
};

const MailPage: React.FC = () => {
  // Folder & view state
  const [activeFolder, setActiveFolder] = useState<MailFolder>("inbox");
  const [view, setView] = useState<MailView>("list-detail");

  // List state
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Selection
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedMessage =
    selectedId != null ? messages.find((m) => m.id === selectedId) || null : null;

  // Filters
  const [searchText, setSearchText] = useState("");
  const [starredOnly, setStarredOnly] = useState(false);

  // Compose state
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // List/selection helper
  function resetSelection() {
    setSelectedId(null);
  }

  // Load messages when folder changes
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setListLoading(true);
        setListError(null);
        resetSelection();

        // 🔧 FIX: pass folder as a string, not an object
        const folderMessages = await fetchMailMessages(activeFolder);

        if (!cancelled) {
          setMessages(folderMessages);
        }
      } catch (err) {
        console.error("Error loading mail messages:", err);
        if (!cancelled) {
          setListError("Unable to load messages.");
          setMessages([]);
        }
      } finally {
        if (!cancelled) {
          setListLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [activeFolder]);

  // Filter messages client-side for now
  const visibleMessages = messages.filter((m) => {
    if (starredOnly && !m.isStarred) return false;

    const q = searchText.trim().toLowerCase();
    if (!q) return true;

    const haystack = [
      m.subject,
      m.fromAddress,
      m.toAddress,
      m.bodyText,
      m.bodyHtml,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(q);
  });

  function formatDate(raw?: string | null): string {
    if (!raw) return "";
    const d = new Date(raw);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // ---- Actions ----

  function handleSelectMessage(id: string) {
    setSelectedId(id);

    // Optimistically mark as read when opened
    const msg = messages.find((m) => m.id === id);
    if (msg && !msg.isRead) {
      void toggleRead(msg, true);
    }
  }

  async function toggleRead(message: MailMessage, read: boolean) {
    try {
      // Optimistic update
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.id ? { ...m, isRead: read } : m
        )
      );
      await updateMailMessage(message.id, { isRead: read });
    } catch (err) {
      console.error("Error updating read state:", err);
      // Roll back
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.id ? { ...m, isRead: message.isRead } : m
        )
      );
    }
  }

  async function toggleStar(message: MailMessage) {
    const newStar = !message.isStarred;
    try {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.id ? { ...m, isStarred: newStar } : m
        )
      );
      await updateMailMessage(message.id, { isStarred: newStar });
    } catch (err) {
      console.error("Error updating star state:", err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === message.id ? { ...m, isStarred: message.isStarred } : m
        )
      );
    }
  }

  async function handleDelete(message: MailMessage) {
    const confirmed = window.confirm("Delete this message?");
    if (!confirmed) return;

    const previous = messages;
    setMessages((prev) => prev.filter((m) => m.id !== message.id));
    if (selectedId === message.id) {
      resetSelection();
    }

    try {
      await deleteMailMessage(message.id);
    } catch (err) {
      console.error("Error deleting mail message:", err);
      // Roll back if it wasn't a 404
      setMessages(previous);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const to = composeTo.trim();
    const subject = composeSubject.trim();
    const body = composeBody.trim();

    if (!to || !subject || !body) {
      setSendError("To, subject, and body are required.");
      return;
    }

    setSending(true);
    setSendError(null);

    try {
      const sent = await sendMail({
        toAddress: to,
        subject,
        bodyText: body,
        bodyHtml: body, // simple mirror for v1
      });

      // If we're currently viewing "sent", inject the new mail at the top
      if (activeFolder === "sent") {
        setMessages((prev) => [sent, ...prev]);
      }

      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
      setView("list-detail");
    } catch (err) {
      console.error("Error sending mail:", err);
      setSendError("Unable to send message.");
    } finally {
      setSending(false);
    }
  }

  // Start a reply to the selected message
  function startReply() {
    if (!selectedMessage) return;

    const original = selectedMessage;

    // To: whoever sent the original
    setComposeTo(original.fromAddress || "");

    // Subject: add "Re:" if needed
    const baseSubject = original.subject || "";
    const subject = /^re:/i.test(baseSubject)
      ? baseSubject
      : `Re: ${baseSubject}`;
    setComposeSubject(subject);

    // Simple quoted body
    const timestamp = formatDate(original.receivedAt || original.sentAt);
    const headerLine = timestamp
      ? `On ${timestamp}, ${original.fromAddress} wrote:\n`
      : `${original.fromAddress} wrote:\n`;

    const quoted =
      (original.bodyText || original.bodyHtml || "")
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n") || "> ";

    setComposeBody(`\n\n${headerLine}${quoted}`);

    setSendError(null);
    setView("compose");
  }

  // ---- Render helpers ----

  function renderFolderTabs() {
    const folders: MailFolder[] = ["inbox", "sent", "draft", "archive"];

    return (
      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        {folders.map((folder) => {
          const isActive = activeFolder === folder;
          return (
            <button
              key={folder}
              type="button"
              onClick={() => {
                setActiveFolder(folder);
                setView("list-detail");
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: isActive
                  ? "1px solid rgba(255,255,255,0.4)"
                  : "1px solid rgba(255,255,255,0.14)",
                background: isActive
                  ? "linear-gradient(135deg, #3f64ff, #7f3dff)"
                  : "rgba(5,7,19,0.9)",
                color: isActive ? "#ffffff" : "#d4d7ff",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {folderLabels[folder]}
            </button>
          );
        })}
      </div>
    );
  }

  function renderToolbar() {
    return (
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => {
              setComposeTo("");
              setComposeSubject("");
              setComposeBody("");
              setSendError(null);
              setView("compose");
            }}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: "none",
              background: "linear-gradient(135deg, #3f64ff, #7f3dff)",
              color: "#ffffff",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Compose
          </button>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              color: "#9da2c8",
            }}
          >
            <input
              type="checkbox"
              checked={starredOnly}
              onChange={(e) => setStarredOnly(e.target.checked)}
            />
            Starred only
          </label>
        </div>

        <input
          type="search"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search mail..."
          style={{
            flex: "0 0 180px",
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "#05070a",
            color: "#f5f5f5",
            fontSize: 12,
          }}
        />
      </div>
    );
  }

  function renderList() {
    if (listLoading) {
      return (
        <p style={{ fontSize: 12, color: "#9da2c8", margin: 0 }}>
          Loading messages…
        </p>
      );
    }

    if (listError) {
      return (
        <p style={{ fontSize: 12, color: "#ff7b88", margin: 0 }}>
          {listError}
        </p>
      );
    }

    if (visibleMessages.length === 0) {
      return (
        <p style={{ fontSize: 12, color: "#9da2c8", margin: 0 }}>
          No messages in this view.
        </p>
      );
    }

    return (
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          maxHeight: 260,
          overflowY: "auto",
        }}
      >
        {visibleMessages.map((msg) => {
          const isActive = selectedMessage && selectedMessage.id === msg.id;
          return (
            <li
              key={msg.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                borderRadius: 8,
                background: isActive
                  ? "rgba(127,61,255,0.2)"
                  : "transparent",
                cursor: "pointer",
              }}
              onClick={() => handleSelectMessage(msg.id)}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void toggleStar(msg);
                }}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  fontSize: 13,
                  width: 18,
                  textAlign: "center",
                }}
                aria-label={msg.isStarred ? "Unstar" : "Star"}
              >
                {msg.isStarred ? "★" : "☆"}
              </button>

              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: msg.isRead ? 400 : 600,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {msg.subject || "(No subject)"}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: "#6f7598",
                      flexShrink: 0,
                    }}
                  >
                    {formatDate(msg.receivedAt || msg.sentAt)}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    color: "#9da2c8",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {msg.fromAddress}
                </span>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDelete(msg);
                }}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  fontSize: 11,
                  opacity: 0.7,
                  padding: "0 4px",
                }}
                aria-label="Delete"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  function renderDetail() {
    if (!selectedMessage) {
      return (
        <div
          style={{
            padding: 12,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "#050713",
            fontSize: 13,
            color: "#9da2c8",
          }}
        >
          Select a message from the list to read it.
        </div>
      );
    }

    const msg = selectedMessage;

    return (
      <div
        style={{
          padding: 12,
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "#050713",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            alignItems: "center",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 500,
            }}
          >
            {msg.subject || "(No subject)"}
          </h3>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
            }}
          >
            <button
              type="button"
              onClick={() => startReply()}
              style={{
                padding: "4px 8px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "transparent",
                color: "#f5f5f5",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              Reply
            </button>
            <button
              type="button"
              onClick={() => void toggleRead(msg, !msg.isRead)}
              style={{
                padding: "4px 8px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "transparent",
                color: "#f5f5f5",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {msg.isRead ? "Mark unread" : "Mark read"}
            </button>
          </div>
        </div>

        <div
          style={{
            fontSize: 11,
            color: "#9da2c8",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <span>
            From: <strong>{msg.fromAddress}</strong>
          </span>
          <span>To: {msg.toAddress}</span>
          {msg.ccAddress && <span>CC: {msg.ccAddress}</span>}
          <span>
            {formatDate(msg.receivedAt || msg.sentAt) || "No timestamp"}
          </span>
        </div>

        <div
          style={{
            marginTop: 8,
            paddingTop: 8,
            borderTop: "1px solid rgba(255,255,255,0.12)",
            fontSize: 13,
            lineHeight: 1.5,
            color: "#f5f5f5",
          }}
        >
          {msg.bodyHtml ? (
            <div
              dangerouslySetInnerHTML={{ __html: msg.bodyHtml }}
            />
          ) : (
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                fontFamily: "inherit",
              }}
            >
              {msg.bodyText}
            </pre>
          )}
        </div>
      </div>
    );
  }

  function renderCompose() {
    return (
      <form
        onSubmit={handleSend}
        style={{
          padding: 12,
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "#050713",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            alignItems: "center",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 500,
            }}
          >
            New message
          </h3>
          <button
            type="button"
            onClick={() => setView("list-detail")}
            style={{
              padding: "4px 8px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "transparent",
              color: "#f5f5f5",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        <input
          type="email"
          value={composeTo}
          onChange={(e) => setComposeTo(e.target.value)}
          placeholder="To"
          style={{
            padding: "6px 8px",
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "#05070a",
            color: "#f5f5f5",
            fontSize: 12,
          }}
        />
        <input
          type="text"
          value={composeSubject}
          onChange={(e) => setComposeSubject(e.target.value)}
          placeholder="Subject"
          style={{
            padding: "6px 8px",
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "#05070a",
            color: "#f5f5f5",
            fontSize: 12,
          }}
        />
        <textarea
          value={composeBody}
          onChange={(e) => setComposeBody(e.target.value)}
          placeholder="Message body"
          style={{
            minHeight: 160,
            padding: "8px 8px",
            borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "#05070a",
            color: "#f5f5f5",
            fontSize: 13,
            resize: "vertical",
          }}
        />

        {sendError && (
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: "#ff7b88",
            }}
          >
            {sendError}
          </p>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 4,
          }}
        >
          <button
            type="submit"
            disabled={sending}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: "none",
              background: sending
                ? "rgba(127,61,255,0.6)"
                : "linear-gradient(135deg, #3f64ff, #7f3dff)",
              color: "#ffffff",
              fontSize: 12,
              cursor: sending ? "default" : "pointer",
            }}
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    );
  }

  // ---- Page layout ----

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        height: "100%",
      }}
    >
      {/* Top controls card */}
      <div
        style={{
          padding: 12,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "#050713",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 500,
            }}
          >
            Mail
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: "#9da2c8",
            }}
          >
            View your messages by folder, search, star important items, and
            compose new mail.
          </p>
        </div>

        {renderFolderTabs()}
        {renderToolbar()}
      </div>

      {/* List + detail / compose */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* List card */}
        <div
          style={{
            padding: 10,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "#050713",
          }}
        >
          {renderList()}
        </div>

        {/* Detail or compose card */}
        {view === "compose" ? renderCompose() : renderDetail()}
      </div>
    </div>
  );
};

export default MailPage;