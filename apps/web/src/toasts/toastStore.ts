import { developerLogger } from "../developer/logger";
import type {
  ToastMessage,
  ToastOptions,
  ToastTone,
} from "./toastTypes";

type ToastListener = () => void;

const MAX_VISIBLE_TOASTS = 5;
const DEFAULT_DURATION: Record<ToastTone, number> = {
  success: 3_500,
  info: 4_000,
  warning: 6_000,
  error: 8_000,
};

let messages: ToastMessage[] = [];
const listeners = new Set<ToastListener>();

function publish(): void {
  for (const listener of listeners) listener();
}

function createId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function add(
  tone: ToastTone,
  title: string,
  options: ToastOptions = {}
): string {
  const now = Date.now();
  const duplicate = messages.find(
    (message) =>
      message.tone === tone &&
      message.title === title &&
      message.description === options.description &&
      now - message.createdAt < 1_500
  );

  if (duplicate) return duplicate.id;

  const message: ToastMessage = {
    id: createId(),
    tone,
    title,
    description: options.description,
    duration: options.duration ?? DEFAULT_DURATION[tone],
    action: options.action,
    createdAt: now,
  };

  messages = [...messages, message].slice(-MAX_VISIBLE_TOASTS);
  publish();
  return message.id;
}

export const toastStore = {
  getSnapshot(): ToastMessage[] {
    return messages;
  },
  subscribe(listener: ToastListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  dismiss(id: string): void {
    messages = messages.filter((message) => message.id !== id);
    publish();
  },
  dismissNewest(): void {
    const newest = messages[messages.length - 1];
    if (newest) this.dismiss(newest.id);
  },
  clear(): void {
    messages = [];
    publish();
  },
};

export const toast = {
  success(title: string, options?: ToastOptions) {
    return add("success", title, options);
  },
  error(title: string, options?: ToastOptions) {
    return add("error", title, options);
  },
  warning(title: string, options?: ToastOptions) {
    return add("warning", title, options);
  },
  info(title: string, options?: ToastOptions) {
    return add("info", title, options);
  },
};

export async function runToastAction(message: ToastMessage): Promise<void> {
  if (!message.action) return;

  try {
    await message.action.run();
    toastStore.dismiss(message.id);
  } catch (error) {
    developerLogger.error(
      "toast.action",
      `Toast action failed: ${message.action.label}`,
      error
    );
    toast.error("Action failed", {
      description: "The requested action could not be completed.",
    });
  }
}
