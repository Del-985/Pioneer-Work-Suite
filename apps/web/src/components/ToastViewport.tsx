import React, { useEffect, useRef, useState } from "react";

import { useToasts } from "../hooks/useToasts";
import { runToastAction, toastStore } from "../toasts/toastStore";
import type { ToastMessage } from "../toasts/toastTypes";

import "../styles/toasts.css";

const TONE_LABELS = {
  success: "Success",
  error: "Error",
  warning: "Warning",
  info: "Information",
} as const;

const ToastItem: React.FC<{ message: ToastMessage }> = ({ message }) => {
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(message.duration ?? 4_000);
  const startedAtRef = useRef(Date.now());

  useEffect(() => {
    if (paused) return;

    startedAtRef.current = Date.now();
    const timeout = window.setTimeout(
      () => toastStore.dismiss(message.id),
      remainingRef.current
    );

    return () => {
      window.clearTimeout(timeout);
      remainingRef.current = Math.max(
        0,
        remainingRef.current - (Date.now() - startedAtRef.current)
      );
    };
  }, [message.id, paused]);

  return (
    <article
      className={`pioneer-toast tone-${message.tone}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
    >
      <span className="pioneer-toast__indicator" aria-hidden="true" />
      <div className="pioneer-toast__content">
        <p>{TONE_LABELS[message.tone]}</p>
        <strong>{message.title}</strong>
        {message.description && <span>{message.description}</span>}
        {message.action && (
          <button type="button" onClick={() => void runToastAction(message)}>
            {message.action.label}
          </button>
        )}
      </div>
      <button
        className="pioneer-toast__dismiss"
        type="button"
        onClick={() => toastStore.dismiss(message.id)}
        aria-label={`Dismiss ${message.title} notification`}
      >
        ×
      </button>
    </article>
  );
};

const ToastViewport: React.FC = () => {
  const messages = useToasts();

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && messages.length > 0) {
        toastStore.dismissNewest();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [messages.length]);

  return (
    <aside
      className="pioneer-toast-viewport"
      aria-label="Notifications"
      aria-live="polite"
      aria-relevant="additions"
    >
      {messages.map((message) => (
        <ToastItem key={message.id} message={message} />
      ))}
    </aside>
  );
};

export default ToastViewport;
