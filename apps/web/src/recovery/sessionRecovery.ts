import { developerLogger } from "../developer/logger";

const SESSION_RECOVERY_KEY = "pioneer.session-recovery.v1";

interface SessionRecoveryRecord {
  schemaVersion: 1;
  path: string;
  updatedAt: string;
  cleanExit: boolean;
}

export interface SessionRecoveryStart {
  recoveredPath: string | null;
  previousSessionInterrupted: boolean;
}

let currentRecord: SessionRecoveryRecord | null = null;
let startResult: SessionRecoveryStart | null = null;
let storageFailureReported = false;

function isRecoverablePath(path: string): boolean {
  return (
    path.startsWith("/") &&
    path.length <= 500 &&
    path !== "/" &&
    !path.startsWith("/login") &&
    !path.startsWith("/register")
  );
}

function reportStorageFailure(message: string, error: unknown): void {
  if (storageFailureReported) return;
  storageFailureReported = true;
  developerLogger.error("recovery.session", message, error);
}

function readRecord(): SessionRecoveryRecord | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(SESSION_RECOVERY_KEY);
    if (!raw) return null;

    const value = JSON.parse(raw) as Partial<SessionRecoveryRecord>;
    if (
      value.schemaVersion !== 1 ||
      typeof value.path !== "string" ||
      typeof value.updatedAt !== "string" ||
      typeof value.cleanExit !== "boolean"
    ) {
      developerLogger.warning(
        "recovery.session",
        "Ignoring malformed previous-session metadata"
      );
      return null;
    }

    return value as SessionRecoveryRecord;
  } catch (error) {
    reportStorageFailure(
      "Unable to read previous-session recovery metadata",
      error
    );
    return null;
  }
}

function writeRecord(record: SessionRecoveryRecord): void {
  currentRecord = record;
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      SESSION_RECOVERY_KEY,
      JSON.stringify(record)
    );
  } catch (error) {
    reportStorageFailure(
      "Unable to write previous-session recovery metadata",
      error
    );
  }
}

export function beginSessionRecovery(): SessionRecoveryStart {
  if (startResult) return startResult;

  const previous = readRecord();
  const interrupted = Boolean(previous && !previous.cleanExit);
  const recoveredPath =
    interrupted && previous && isRecoverablePath(previous.path)
      ? previous.path
      : null;

  startResult = {
    recoveredPath,
    previousSessionInterrupted: interrupted,
  };

  writeRecord({
    schemaVersion: 1,
    path: previous?.path ?? "/",
    updatedAt: new Date().toISOString(),
    cleanExit: false,
  });

  if (recoveredPath) {
    developerLogger.info(
      "recovery.session",
      "Restoring the page from an interrupted session",
      { path: recoveredPath }
    );
  }

  return startResult;
}

export function updateSessionRecoveryPath(path: string): void {
  if (!isRecoverablePath(path)) return;

  writeRecord({
    schemaVersion: 1,
    path,
    updatedAt: new Date().toISOString(),
    cleanExit: false,
  });
}

export function markSessionRecoveryCleanExit(): void {
  const record = currentRecord ?? readRecord();
  if (!record) return;

  writeRecord({
    ...record,
    updatedAt: new Date().toISOString(),
    cleanExit: true,
  });
}
