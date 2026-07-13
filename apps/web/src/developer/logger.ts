import type {
  DeveloperLogEntry,
  DeveloperLogLevel,
} from "./logTypes";

const MAX_LOG_ENTRIES = 500;
const MAX_TEXT_LENGTH = 4_000;
const PERSISTENCE_KEY = "pioneer.developer-logs.persist";
const STORAGE_KEY = "pioneer.developer-logs.v1";

const sensitiveKeyPattern =
  /authorization|password|token|cookie|secret|credential|bodyhtml|bodytext|content/i;
const bearerPattern = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

const nativeConsoleError = console.error.bind(console);
const nativeConsoleWarn = console.warn.bind(console);
const nativeConsoleInfo = console.info.bind(console);

type LogListener = () => void;

let installed = false;
let entries: DeveloperLogEntry[] = [];
const listeners = new Set<LogListener>();
let publishScheduled = false;

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function truncate(value: string): string {
  return value.length > MAX_TEXT_LENGTH
    ? `${value.slice(0, MAX_TEXT_LENGTH)}…`
    : value;
}

function redactText(value: string): string {
  return truncate(value)
    .replace(bearerPattern, "Bearer [REDACTED]")
    .replace(emailPattern, "[REDACTED EMAIL]");
}

function sanitizeValue(
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactText(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return `[Function ${value.name}]`;
  if (depth >= 4) return "[Max depth]";

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactText(value.message),
      stack: value.stack ? redactText(value.stack) : null,
    };
  }

  if (typeof value !== "object") return redactText(String(value));
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .slice(0, 25)
      .map((item) => sanitizeValue(item, seen, depth + 1));
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(value).slice(0, 40)) {
    sanitized[key] = sensitiveKeyPattern.test(key)
      ? "[REDACTED]"
      : sanitizeValue(item, seen, depth + 1);
  }

  return sanitized;
}

function stringify(value: unknown): string {
  if (typeof value === "string") return redactText(value);

  try {
    return truncate(JSON.stringify(sanitizeValue(value), null, 2));
  } catch {
    return "[Unable to serialize diagnostic value]";
  }
}

function readPersistenceEnabled(): boolean {
  if (!hasWindow()) return false;

  try {
    return window.localStorage.getItem(PERSISTENCE_KEY) === "true";
  } catch {
    return false;
  }
}

function loadPersistedEntries(): DeveloperLogEntry[] {
  if (!readPersistenceEnabled()) return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.slice(0, MAX_LOG_ENTRIES)
      : [];
  } catch {
    return [];
  }
}

function persistEntries(): void {
  if (!hasWindow() || !readPersistenceEnabled()) return;

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(entries)
    );
  } catch {
    // Logging must never fail the application or recursively log itself.
  }
}

function publish(): void {
  persistEntries();

  if (publishScheduled) return;
  publishScheduled = true;

  queueMicrotask(() => {
    publishScheduled = false;
    for (const listener of listeners) listener();
  });
}

function makeId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `log-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function record(
  level: DeveloperLogLevel,
  source: string,
  message: unknown,
  details?: unknown
): DeveloperLogEntry {
  const error =
    message instanceof Error
      ? message
      : details instanceof Error
        ? details
        : null;
  const entry: DeveloperLogEntry = {
    id: makeId(),
    timestamp: new Date().toISOString(),
    level,
    source: redactText(source || "application"),
    message: stringify(message),
    details:
      details === undefined || details === message
        ? null
        : stringify(details),
    stack: error?.stack ? redactText(error.stack) : null,
  };

  entries = [entry, ...entries].slice(0, MAX_LOG_ENTRIES);
  publish();
  return entry;
}

export const developerLogger = {
  error(source: string, message: unknown, details?: unknown) {
    const entry = record("error", source, message, details);
    nativeConsoleError(`[${entry.source}]`, message, details ?? "");
    return entry;
  },
  warning(source: string, message: unknown, details?: unknown) {
    const entry = record("warning", source, message, details);
    nativeConsoleWarn(`[${entry.source}]`, message, details ?? "");
    return entry;
  },
  info(source: string, message: unknown, details?: unknown) {
    const entry = record("info", source, message, details);
    nativeConsoleInfo(`[${entry.source}]`, message, details ?? "");
    return entry;
  },
};

export function getDeveloperLogs(): DeveloperLogEntry[] {
  return entries;
}

export function subscribeToDeveloperLogs(
  listener: LogListener
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearDeveloperLogs(): void {
  entries = [];

  if (hasWindow()) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Clearing diagnostics should remain best-effort.
    }
  }

  publish();
}

export function isDeveloperLogPersistenceEnabled(): boolean {
  return readPersistenceEnabled();
}

export function setDeveloperLogPersistenceEnabled(
  enabled: boolean
): void {
  if (!hasWindow()) return;

  try {
    window.localStorage.setItem(PERSISTENCE_KEY, String(enabled));
    if (enabled) {
      persistEntries();
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Persistence remains optional when localStorage is unavailable.
  }

  publish();
}

export function formatDeveloperLogEntry(
  entry: DeveloperLogEntry
): string {
  return [
    `${entry.timestamp} [${entry.level.toUpperCase()}] [${entry.source}]`,
    entry.message,
    entry.details,
    entry.stack,
  ]
    .filter(Boolean)
    .join("\n");
}

export function installDeveloperLogging(): void {
  if (installed || !hasWindow()) return;
  installed = true;
  entries = loadPersistedEntries();

  console.error = (...args: unknown[]) => {
    nativeConsoleError(...args);
    record("error", "console", args[0] ?? "Console error", args.slice(1));
  };

  console.warn = (...args: unknown[]) => {
    nativeConsoleWarn(...args);
    record(
      "warning",
      "console",
      args[0] ?? "Console warning",
      args.slice(1)
    );
  };

  window.addEventListener("error", (event) => {
    record(
      "error",
      "runtime",
      event.message || "Uncaught application error",
      event.error
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    record(
      "error",
      "promise",
      "Unhandled promise rejection",
      event.reason
    );
  });

  record("info", "application", "Developer logging initialized");
}

