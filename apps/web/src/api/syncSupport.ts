// apps/web/src/api/syncSupport.ts

export const SYNC_STATE_EVENT = "pioneer:sync-state-changed";

interface HttpLikeError {
  response?: {
    status?: unknown;
    data?: unknown;
  };
  isAxiosError?: boolean;
  code?: unknown;
  message?: unknown;
}

export function makeSyncMutationId(scope: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${scope}:${random}`;
}

export function readVersionConflictEntity<T>(error: unknown): T | null {
  if (!error || typeof error !== "object") return null;
  const response = (error as HttpLikeError).response;
  if (response?.status !== 409 || !response.data || typeof response.data !== "object") {
    return null;
  }
  const body = response.data as { code?: unknown; current?: unknown };
  return body.code === "VERSION_CONFLICT" && body.current
    ? body.current as T
    : null;
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
