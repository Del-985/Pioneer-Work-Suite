// apps/web/src/pages/MailPage.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchMailMessages,
  sendMail,
  updateMailMessage,
  deleteMailMessage,
  MailMessage,
  MailFolder,
} from "../api/mail";
import { hasCloudSession, SESSION_CHANGED_EVENT } from "../api/session";
import { isRecoverableOfflineError } from "../api/syncSupport";
import { toast } from "../toasts/toastStore";
import { useConfirmation } from "../hooks/useConfirmation";
import { htmlToPlainText } from "../utils/documentText";

import "../styles/mail.css";

type MailView = "list-detail" | "compose";

const folderLabels: Record<MailFolder, string> = {
  inbox: "Inbox",
  sent: "Sent",
  draft: "Drafts",
  archive: "Archive",
};

const MailPage: React.FC = () => {
  const navigate = useNavigate();
  const { confirm, confirmationDialog } = useConfirmation();
  const [cloudConnected, setCloudConnected] = useState(hasCloudSession());
  const [reloadKey, setReloadKey] = useState(0);
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

  // Per-folder unread counts (for badges)
  const [unreadCounts, setUnreadCounts] = useState<Record<MailFolder, number>>({
    inbox: 0,
    sent: 0,
    draft: 0,
    archive: 0,
  });

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

  function recalcUnread(nextMessages: MailMessage[], folder: MailFolder) {
    const unread = nextMessages.filter((m) => !m.isRead).length;
    setUnreadCounts((prev) => ({
      ...prev,
      [folder]: unread,
    }));
  }

  useEffect(() => {
    const updateCloudState = () => setCloudConnected(hasCloudSession());
    window.addEventListener(SESSION_CHANGED_EVENT, updateCloudState);
    return () => window.removeEventListener(SESSION_CHANGED_EVENT, updateCloudState);
  }, []);

  // Load messages when folder changes
  useEffect(() => {
    let cancelled = false;

    if (!cloudConnected) {
      setListLoading(false);
      setListError(null);
      setMessages([]);
      resetSelection();
      return () => {
        cancelled = true;
      };
    }

    async function load() {
      try {
        setListLoading(true);
        setListError(null);
        resetSelection();

        const folderMessages = await fetchMailMessages({
          folder: activeFolder,
          // NOTE: search + starredOnly could be pushed to the backend later.
        });

        if (!cancelled) {
          setMessages(() => {
            const next = folderMessages;
            recalcUnread(next, activeFolder);
            return next;
          });
        }
      } catch (err) {
        console.error("Error loading mail messages:", err);
        if (!cancelled) {
          setListError(
            isRecoverableOfflineError(err)
              ? "Mail service is unavailable right now. Your local workspace remains available."
              : "Unable to load messages."
          );
          setMessages(() => {
            recalcUnread([], activeFolder);
            return [];
          });
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
  }, [activeFolder, cloudConnected, reloadKey]);

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
      // Optimistic update + recalc unread for current folder
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.id === message.id ? { ...m, isRead: read } : m
        );
        recalcUnread(next, activeFolder);
        return next;
      });
      await updateMailMessage(message.id, { isRead: read });
    } catch (err) {
      console.error("Error updating read state:", err);
      // Roll back if needed
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.id === message.id ? { ...m, isRead: message.isRead } : m
        );
        recalcUnread(next, activeFolder);
        return next;
      });
      toast.error("Unable to update message");
    }
  }

  async function toggleStar(message: MailMessage) {
    const newStar = !message.isStarred;
    try {
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.id === message.id ? { ...m, isStarred: newStar } : m
        );
        // Stars don't affect unread, but recalc keeps badges in sync after deletes etc.
        recalcUnread(next, activeFolder);
        return next;
      });
      await updateMailMessage(message.id, { isStarred: newStar });
    } catch (err) {
      console.error("Error updating star state:", err);
      setMessages((prev) => {
        const next = prev.map((m) =>
          m.id === message.id ? { ...m, isStarred: message.isStarred } : m
        );
        recalcUnread(next, activeFolder);
        return next;
      });
      toast.error("Unable to update star");
    }
  }

  async function handleDelete(message: MailMessage) {
    const accepted = await confirm({
      title: "Delete this message?",
      description: "This permanently removes the selected message.",
      confirmLabel: "Delete message",
      dangerous: true,
    });
    if (!accepted) return;

    const previous = messages;
    setMessages((prev) => {
      const next = prev.filter((m) => m.id !== message.id);
      recalcUnread(next, activeFolder);
      return next;
    });
    if (selectedId === message.id) {
      resetSelection();
    }

    try {
      await deleteMailMessage(message.id);
      toast.success("Message deleted");
    } catch (err) {
      console.error("Error deleting mail message:", err);
      // Roll back if it wasn't a 404
      setMessages(() => {
        recalcUnread(previous, activeFolder);
        return previous;
      });
      toast.error("Unable to delete message");
    }
  }

  async function handleArchive(message: MailMessage) {
    // Only move if not already archived
    if (message.folder === "archive") return;

    const previous = messages;

    // Optimistically remove from current list
    setMessages((prev) => {
      const next = prev.filter((m) => m.id !== message.id);
      recalcUnread(next, activeFolder);
      return next;
    });
    if (selectedId === message.id) {
      resetSelection();
    }

    try {
      await updateMailMessage(message.id, { folder: "archive" });
      toast.success("Message archived");
    } catch (err) {
      console.error("Error archiving message:", err);
      // Roll back locally
      setMessages(() => {
        recalcUnread(previous, activeFolder);
        return previous;
      });
      toast.error("Unable to archive message");
    }
  }

  function startReply(message: MailMessage) {
    const baseSubject = message.subject || "";
    const lower = baseSubject.toLowerCase();
    const subject = lower.startsWith("re:")
      ? baseSubject
      : baseSubject
      ? `Re: ${baseSubject}`
      : "Re:";

    const when = formatDate(message.receivedAt || message.sentAt) || "an earlier date";

    const quoted = message.bodyText || "";
    const headerLine = `\n\nOn ${when}, ${message.fromAddress} wrote:\n`;

    setComposeTo(message.fromAddress);
    setComposeSubject(subject);
    setComposeBody(headerLine + quoted);
    setSendError(null);
    setView("compose");
  }

  function startForward(message: MailMessage) {
    const baseSubject = message.subject || "";
    const lower = baseSubject.toLowerCase();
    const subject = lower.startsWith("fwd:")
      ? baseSubject
      : baseSubject
      ? `Fwd: ${baseSubject}`
      : "Fwd:";

    const when = formatDate(message.receivedAt || message.sentAt) || "an earlier date";

    const quoted = message.bodyText || "";
    const headerBlock =
      `\n\n---------- Forwarded message ----------\n` +
      `From: ${message.fromAddress}\n` +
      `To: ${message.toAddress}\n` +
      (message.ccAddress ? `CC: ${message.ccAddress}\n` : "") +
      `Date: ${when}\n` +
      `Subject: ${message.subject || "(No subject)"}\n\n`;

    setComposeTo("");
    setComposeSubject(subject);
    setComposeBody(headerBlock + quoted);
    setSendError(null);
    setView("compose");
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
        setMessages((prev) => {
          const next = [sent, ...prev];
          recalcUnread(next, activeFolder);
          return next;
        });
      }

      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
      setView("list-detail");
      toast.success("Message sent", { description: subject });
    } catch (err) {
      console.error("Error sending mail:", err);
      setSendError("Unable to send message.");
      toast.error("Unable to send message");
    } finally {
      setSending(false);
    }
  }

  // ---- Render helpers ----

  function renderFolderTabs() {
    const folders: MailFolder[] = ["inbox", "sent", "draft", "archive"];

    return (
      <div className="mail-folders" aria-label="Mail folders">
        {folders.map((folder) => {
          const isActive = activeFolder === folder;
          const unread = unreadCounts[folder] ?? 0;

          return (
            <button
              key={folder}
              type="button"
              className={`mail-folder${isActive ? " is-active" : ""}`}
              aria-pressed={isActive}
              onClick={() => {
                setActiveFolder(folder);
                setView("list-detail");
              }}
            >
              <span>{folderLabels[folder]}</span>
              {unread > 0 && (
                <span className="mail-folder__count">
                  {unread}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  function renderToolbar() {
    return (
      <div className="mail-toolbar">
        <div className="mail-toolbar__actions">
          <button
            type="button"
            className="mail-primary-button"
            onClick={() => setView("compose")}
          >
            Compose
          </button>

          <label className="mail-starred-filter">
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
          className="mail-search"
          aria-label="Search mail"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search mail..."
        />
      </div>
    );
  }

  function renderList() {
    if (listLoading) {
      return (
        <p className="mail-list-state" role="status">
          Loading messages…
        </p>
      );
    }

    if (listError) {
      return (
        <div className="mail-list-error" role="alert">
          <p>{listError}</p>
          <button type="button" onClick={() => setReloadKey((value) => value + 1)}>
            Try again
          </button>
        </div>
      );
    }

    if (visibleMessages.length === 0) {
      return (
        <p className="mail-list-state">
          No messages in this view.
        </p>
      );
    }

    return (
      <ul className="mail-message-list">
        {visibleMessages.map((msg) => {
          const isActive = selectedMessage && selectedMessage.id === msg.id;
          return (
            <li
              key={msg.id}
              className={`mail-message${isActive ? " is-active" : ""}${msg.isRead ? "" : " is-unread"}`}
            >
              <button
                type="button"
                className="mail-message__icon-button mail-message__star"
                onClick={(e) => {
                  e.stopPropagation();
                  void toggleStar(msg);
                }}
                aria-label={msg.isStarred ? "Unstar" : "Star"}
              >
                {msg.isStarred ? "★" : "☆"}
              </button>

              <button
                type="button"
                className="mail-message__select"
                onClick={() => handleSelectMessage(msg.id)}
                aria-label={`Open ${msg.subject || "message without a subject"}`}
              >
                <span className="mail-message__heading">
                  <span className="mail-message__subject">
                    {msg.subject || "(No subject)"}
                  </span>
                  <span className="mail-message__date">
                    {formatDate(msg.receivedAt || msg.sentAt)}
                  </span>
                </span>
                <span className="mail-message__sender">
                  {msg.fromAddress}
                </span>
              </button>

              <button
                type="button"
                className="mail-message__icon-button mail-message__delete"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDelete(msg);
                }}
                aria-label={`Delete ${msg.subject || "message without a subject"}`}
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
        <div className="mail-detail mail-detail--empty">
          <span aria-hidden="true">✉</span>
          <strong>Select a message</strong>
          <p>Choose a message from the list to read it here.</p>
        </div>
      );
    }

    const msg = selectedMessage;

    return (
      <article className="mail-detail">
        <header className="mail-detail__header">
          <h2>
            {msg.subject || "(No subject)"}
          </h2>
          <div className="mail-detail__actions">
            <button
              type="button"
              onClick={() => void handleArchive(msg)}
            >
              Archive
            </button>
            <button
              type="button"
              onClick={() => void startReply(msg)}
            >
              Reply
            </button>
            <button
              type="button"
              onClick={() => void startForward(msg)}
            >
              Forward
            </button>
            <button
              type="button"
              onClick={() => void toggleRead(msg, !msg.isRead)}
            >
              {msg.isRead ? "Mark unread" : "Mark read"}
            </button>
          </div>
        </header>

        <div className="mail-detail__meta">
          <span>
            From: <strong>{msg.fromAddress}</strong>
          </span>
          <span>To: {msg.toAddress}</span>
          {msg.ccAddress && <span>CC: {msg.ccAddress}</span>}
          <span>
            {formatDate(msg.receivedAt || msg.sentAt) || "No timestamp"}
          </span>
        </div>

        <div className="mail-detail__body">
          <pre>{msg.bodyText || htmlToPlainText(msg.bodyHtml)}</pre>
        </div>
      </article>
    );
  }

  function renderCompose() {
    return (
      <form
        onSubmit={handleSend}
        className="mail-compose"
      >
        <header className="mail-compose__header">
          <div>
            <p>Compose</p>
            <h2>New message</h2>
          </div>
          <button
            type="button"
            onClick={() => setView("list-detail")}
          >
            Close
          </button>
        </header>

        <label>
          <span>To</span>
          <input
            type="email"
            value={composeTo}
            onChange={(e) => setComposeTo(e.target.value)}
            placeholder="name@example.com"
          />
        </label>
        <label>
          <span>Subject</span>
          <input
            type="text"
            value={composeSubject}
            onChange={(e) => setComposeSubject(e.target.value)}
            placeholder="Message subject"
          />
        </label>
        <label>
          <span>Message</span>
          <textarea
            value={composeBody}
            onChange={(e) => setComposeBody(e.target.value)}
            placeholder="Write your message…"
          />
        </label>

        {sendError && (
          <p className="mail-compose__error" role="alert">
            {sendError}
          </p>
        )}

        <div className="mail-compose__footer">
          <button
            type="submit"
            className="mail-primary-button"
            disabled={sending}
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    );
  }

  // ---- Page layout ----

  return (
    <div className="mail-page">
      <header className="mail-page__header">
        <div>
          <p className="mail-page__eyebrow">Communication</p>
          <h1>Mail</h1>
          <p className="mail-page__description">
            View your messages by folder, search, star important items, and
            compose new mail.
          </p>
        </div>

        {cloudConnected && <span className="mail-page__connection">Cloud connected</span>}
      </header>

      {cloudConnected ? (
        <div className="mail-workspace">
          <section className="mail-list-panel" aria-label={`${folderLabels[activeFolder]} messages`}>
            {renderFolderTabs()}
            {renderToolbar()}
            <div className="mail-list-panel__body">
              <div className="mail-list-panel__heading">
                <h2>{folderLabels[activeFolder]}</h2>
                <span>{visibleMessages.length} {visibleMessages.length === 1 ? "message" : "messages"}</span>
              </div>
              {renderList()}
            </div>
          </section>

          <section className="mail-reading-panel" aria-label={view === "compose" ? "Compose message" : "Message reader"}>
            {view === "compose" ? renderCompose() : renderDetail()}
          </section>
        </div>
      ) : (
        <section className="mail-cloud-state" aria-labelledby="mail-cloud-state-heading">
          <div>
            <p className="mail-cloud-state__eyebrow">Cloud feature</p>
            <h3 id="mail-cloud-state-heading">Connect cloud to use Mail</h3>
            <p>
              Mail requires the Pioneer backend. Tasks, Documents, and Calendar remain available
              locally while cloud services are disconnected.
            </p>
            <button type="button" onClick={() => navigate("/login")}>
              Connect cloud
            </button>
          </div>
        </section>
      )}
      {confirmationDialog}
    </div>
  );
};

export default MailPage;
