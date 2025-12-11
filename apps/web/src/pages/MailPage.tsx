// apps/web/src/pages/MailPage.tsx
import React, { useEffect, useState } from "react";
import {
  MailFolder,
  MailAccount,
  MailMessage,
  fetchMailAccounts,
  fetchMailMessages,
  sendMail,
  updateMailMessage,
  deleteMailMessage,
} from "../api/mail";

const FOLDERS: MailFolder[] = ["inbox", "sent", "draft", "archive"];

const prettyFolder = (f: MailFolder) => {
  switch (f) {
    case "inbox":
      return "Inbox";
    case "sent":
      return "Sent";
    case "draft":
      return "Drafts";
    case "archive":
      return "Archive";
    default:
      return f;
  }
};

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

const MailPage: React.FC = () => {
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  const [activeFolder, setActiveFolder] = useState<MailFolder>("inbox");
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [isComposing, setIsComposing] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeError, setComposeError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const selected = selectedId
    ? messages.find((m) => m.id === selectedId) || null
    : null;

  // Load accounts once
  useEffect(() => {
    let cancelled = false;

    async function loadAccounts() {
      setAccountsLoading(true);
      setAccountsError(null);
      try {
        const accs = await fetchMailAccounts();
        if (!cancelled) {
          setAccounts(accs);
        }
      } catch (err) {
        console.error("Error loading mail accounts:", err);
        if (!cancelled) {
          setAccountsError("Unable to load mail accounts.");
        }
      } finally {
        if (!cancelled) {
          setAccountsLoading(false);
        }
      }
    }

    void loadAccounts();

    return () => {
      cancelled = true;
    };
  }, []);

  // Load messages for active folder
  useEffect(() => {
    let cancelled = false;

    async function loadMessages() {
      setMessagesLoading(true);
      setMessagesError(null);
      try {
        const msgs = await fetchMailMessages(activeFolder);
        if (!cancelled) {
          setMessages(msgs);
          // Clear selection if selected message is not in this folder
          if (
            selectedId &&
            !msgs.some((m) => m.id === selectedId)
          ) {
            setSelectedId(null);
          }
        }
      } catch (err) {
        console.error("Error loading mail messages:", err);
        if (!cancelled) {
          setMessagesError("Unable to load messages.");
        }
      } finally {
        if (!cancelled) {
          setMessagesLoading(false);
        }
      }
    }

    void loadMessages();

    return () => {
      cancelled = true;
    };
  }, [activeFolder, selectedId]);

  async function handleFolderClick(folder: MailFolder) {
    setActiveFolder(folder);
    setSelectedId(null);
    setMessagesError(null);
  }

  async function handleSelectMessage(msg: MailMessage) {
    setSelectedId(msg.id);
    setComposeError(null);
    setIsComposing(false);

    if (!msg.isRead) {
      try {
        const updated = await updateMailMessage(msg.id, { isRead: true });
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? updated : m))
        );
      } catch (err) {
        console.error("Error marking message as read:", err);
      }
    }
  }

  async function handleToggleStar(msg: MailMessage) {
    const next = !msg.isStarred;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id ? { ...m, isStarred: next } : m
      )
    );

    try {
      const updated = await updateMailMessage(msg.id, {
        isStarred: next,
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? updated : m
        )
      );
    } catch (err) {
      console.error("Error toggling star:", err);
    }
  }

  async function handleDeleteSelected() {
    if (!selected) return;

    const confirmed = window.confirm(
      "Delete this message? This cannot be undone."
    );
    if (!confirmed) return;

    const id = selected.id;
    setSelectedId(null);
    const prev = messages;
    const remaining = prev.filter((m) => m.id !== id);
    setMessages(remaining);

    try {
      await deleteMailMessage(id);
    } catch (err) {
      console.error("Error deleting message:", err);
      // On failure, restore
      setMessages(prev);
    }
  }

  function startCompose() {
    setIsComposing(true);
    setComposeError(null);

    // If we had a message selected, optionally prefill "to" from that
    // but for now leave blank for manual entry.
  }

  function resetCompose() {
    setIsComposing(false);
    setComposeTo("");
    setComposeSubject("");
    setComposeBody("");
    setComposeError(null);
    setIsSending(false);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!composeTo.trim() || !composeSubject.trim()) {
      setComposeError("Recipient and subject are required.");
      return;
    }

    setIsSending(true);
    setComposeError(null);

    try {
      const message = await sendMail({
        subject: composeSubject.trim(),
        toAddress: composeTo.trim(),
        bodyHtml: composeBody,
        bodyText: composeBody,
        folder: "sent",
      });

      // If we are in Sent folder, append the new message
      if (activeFolder === "sent") {
        setMessages((prev) => [message, ...prev]);
        setSelectedId(message.id);
      } else {
        // Otherwise, switch to Sent so user sees it
        setActiveFolder("sent");
        setSelectedId(message.id);
      }

      resetCompose();
    } catch (err) {
      console.error("Error sending mail:", err);
      setComposeError("Unable to send message.");
      setIsSending(false);
    }
  }

  const currentAccount = accounts[0]; // default internal account

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        height: "100%",
      }}
    >
      <header className="workspace-header">
        <h1>Mail</h1>
        <p className="workspace-subtitle">
          Browse your internal Inbox, Sent, Drafts, and Archive. Mail v1 stores
          messages inside Pioneer Work Suite.
        </p>
      </header>

      <section
        className="workspace-body"
        style={{
          display: "flex",
          gap: 12,
          minHeight: 320,
        }}
      >
        {/* Left column: folders and message list */}
        <div
          style={{
            width: "34%",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "#050713",
            overflow: "hidden",
          }}
        >
          {/* Account + compose header */}
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
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {currentAccount
                  ? currentAccount.displayName || currentAccount.emailAddress
                  : "Mailbox"}
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
                {accountsLoading
                  ? "Loading accounts..."
                  : accountsError || (currentAccount?.emailAddress ?? "")}
              </div>
            </div>
            <button
              type="button"
              onClick={startCompose}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "none",
                cursor: "pointer",
                background:
                  "linear-gradient(135deg, #3f64ff, #7f3dff)",
                color: "#ffffff",
                fontSize: 12,
                fontWeight: 500,
                whiteSpace: "nowrap",
              }}
            >
              Compose
            </button>
          </div>

          {/* Folder tabs */}
          <div
            style={{
              display: "flex",
              gap: 4,
              padding: "6px 8px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              overflowX: "auto",
            }}
          >
            {FOLDERS.map((folder) => {
              const isActive = activeFolder === folder;
              const count =
                folder === "inbox"
                  ? messages.filter((m) => m.folder === "inbox").length
                  : undefined;

              return (
                <button
                  key={folder}
                  type="button"
                  onClick={() => handleFolderClick(folder)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "none",
                    fontSize: 12,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    background: isActive
                      ? "rgba(63,100,255,0.15)"
                      : "transparent",
                    color: isActive ? "#f5f5ff" : "#9da2c8",
                  }}
                >
                  {prettyFolder(folder)}
                  {count !== undefined ? ` (${count})` : ""}
                </button>
              );
            })}
          </div>

          {/* Message list */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
            }}
          >
            {messagesLoading && (
              <p
                style={{
                  padding: "10px 12px",
                  fontSize: 12,
                  color: "#9da2c8",
                }}
              >
                Loading messages...
              </p>
            )}

            {messagesError && !messagesLoading && (
              <p
                style={{
                  padding: "10px 12px",
                  fontSize: 12,
                  color: "#ff7b88",
                }}
              >
                {messagesError}
              </p>
            )}

            {!messagesLoading &&
              !messagesError &&
              messages.length === 0 && (
                <p
                  style={{
                    padding: "10px 12px",
                    fontSize: 12,
                    color: "#9da2c8",
                  }}
                >
                  No messages in {prettyFolder(activeFolder)} yet.
                </p>
              )}

            {messages.map((msg) => {
              const isActive = selected && selected.id === msg.id;
              const isUnread = !msg.isRead;
              return (
                <button
                  key={msg.id}
                  type="button"
                  onClick={() => handleSelectMessage(msg)}
                  style={{
                    width: "100%",
                    border: "none",
                    borderLeft: isActive
                      ? "3px solid #7f3dff"
                      : "3px solid transparent",
                    background: isActive
                      ? "rgba(127,61,255,0.16)"
                      : "transparent",
                    padding: "8px 10px",
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: isUnread ? 600 : 400,
                        color: "#f5f5f5",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {msg.subject || "(no subject)"}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "#6f7598",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatDate(msg.receivedAt || msg.sentAt || msg.createdAt)}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: "#9da2c8",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {activeFolder === "sent"
                        ? `To: ${msg.toAddress}`
                        : `From: ${msg.fromAddress}`}
                    </span>
                    {msg.isStarred && (
                      <span
                        style={{
                          fontSize: 11,
                          color: "#f0c36a",
                        }}
                      >
                        ★
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right column: message detail or compose */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "#05070a",
            padding: 12,
          }}
        >
          {/* Compose view */}
          {isComposing ? (
            <form
              onSubmit={handleSend}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                height: "100%",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize: 16,
                  }}
                >
                  New message
                </h2>
                <button
                  type="button"
                  onClick={resetCompose}
                  disabled={isSending}
                  style={{
                    border: "none",
                    borderRadius: 999,
                    padding: "4px 8px",
                    fontSize: 11,
                    cursor: isSending ? "default" : "pointer",
                    background: "rgba(255,255,255,0.06)",
                    color: "#f5f5f5",
                  }}
                >
                  Cancel
                </button>
              </div>

              {composeError && (
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color: "#ff7b88",
                  }}
                >
                  {composeError}
                </p>
              )}

              <input
                type="email"
                value={composeTo}
                onChange={(e) => setComposeTo(e.target.value)}
                placeholder="To"
                style={{
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "#050713",
                  color: "#f5f5f5",
                  fontSize: 13,
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
                  background: "#050713",
                  color: "#f5f5f5",
                  fontSize: 13,
                }}
              />
              <textarea
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                placeholder="Write your message..."
                style={{
                  flex: 1,
                  minHeight: 140,
                  resize: "vertical",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.16)",
                  background: "#050713",
                  color: "#f5f5f5",
                  fontSize: 13,
                }}
              />
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
                  disabled={isSending}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 999,
                    border: "none",
                    cursor: isSending ? "default" : "pointer",
                    background:
                      "linear-gradient(135deg, #3f64ff, #7f3dff)",
                    color: "#ffffff",
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  {isSending ? "Sending..." : "Send"}
                </button>
              </div>
            </form>
          ) : selected ? (
            // Message detail view
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                height: "100%",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <h2
                  style={{
                    margin: 0,
                    fontSize: 16,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {selected.subject || "(no subject)"}
                </h2>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleToggleStar(selected)}
                    style={{
                      border: "none",
                      borderRadius: 999,
                      padding: "4px 8px",
                      fontSize: 11,
                      cursor: "pointer",
                      background: "rgba(255,255,255,0.06)",
                      color: selected.isStarred ? "#f0c36a" : "#f5f5f5",
                    }}
                  >
                    {selected.isStarred ? "Unstar" : "Star"}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    style={{
                      border: "none",
                      borderRadius: 999,
                      padding: "4px 8px",
                      fontSize: 11,
                      cursor: "pointer",
                      background: "rgba(255,127,136,0.16)",
                      color: "#ff7b88",
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: "#9da2c8",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <span>
                  From:{" "}
                  <strong>{selected.fromAddress}</strong>
                </span>
                <span>
                  To: <strong>{selected.toAddress}</strong>
                </span>
                <span>
                  {formatDate(
                    selected.receivedAt ||
                      selected.sentAt ||
                      selected.createdAt
                  )}
                </span>
              </div>

              <div
                style={{
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: "1px solid rgba(255,255,255,0.1)",
                  flex: 1,
                  overflowY: "auto",
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: "#f5f5f5",
                }}
              >
                {selected.bodyHtml ? (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: selected.bodyHtml,
                    }}
                  />
                ) : (
                  <pre
                    style={{
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      fontFamily: "inherit",
                    }}
                  >
                    {selected.bodyText || ""}
                  </pre>
                )}
              </div>
            </div>
          ) : (
            // Empty state
            <div className="workspace-placeholder">
              <h2>No message selected</h2>
              <p>
                Choose a message from the left, or compose a new one to get
                started.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default MailPage;