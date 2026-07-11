// apps/web/src/api/syncSupport.ts

export const SYNC_STATE_EVENT = "pioneer:sync-state-changed";

interface HttpLikeError {
  response?: {
    status?: unknown;
  };
  isAxiosError?: boolean;
  code?: unknown;
  message?: unknown;
}

export function hasBrowserWindow(): boolean {
  return typeof window !== "undefined";
}

export function isBrowserOffline(): boolean {
  return (
    typeof navigator !== "undefined" &&
    navigator.onLine === false
  );
}

export function notifySyncStateChanged(): void {
  if (hasBrowserWindow()) {
    window.dispatchEvent(new Event(SYNC_STATE_EVENT));
  }
}

/**
 * Returns true only for failures that should be retried through the local
 * offline queue. Authentication failures deliberately return false because
 * the HTTP interceptor handles them by invalidating the cloud session.
 */
export function isRecoverableOfflineError(
  error: unknown
): boolean {
  if (isBrowserOffline()) {
    return true;
  }

  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as HttpLikeError;
  const status = candidate.response?.status;

  if (typeof status === "number") {
    return (
      status === 500 ||
      status === 502 ||
      status === 503 ||
      status === 504
    );
  }

  if (
    candidate.isAxiosError === true &&
    !candidate.response
  ) {
    return true;
  }

  if (
    typeof candidate.code === "string" &&
    (candidate.code === "ERR_NETWORK" ||
      candidate.code === "ECONNABORTED")
  ) {
    return true;
  }

  if (typeof candidate.message === "string") {
    const message =
      candidate.message.toLowerCase();

    return (
      message.includes("network") ||
      message.includes("failed to fetch") ||
      message.includes("timeout") ||
      message.includes("service unavailable")
    );
  }

  return false;
}
