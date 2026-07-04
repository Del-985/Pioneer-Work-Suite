// apps/web/src/api/session.ts

export type CloudUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

const LOCAL_WORKSPACE_ENABLED_KEY = "pioneer.localWorkspace.enabled.v1";
const LOCAL_PROFILE_NAME_KEY = "pioneer.localWorkspace.name.v1";

const TOKEN_KEY = "token";
const USER_EMAIL_KEY = "userEmail";
const USER_NAME_KEY = "userName";
const USER_ROLE_KEY = "userRole";

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function cleanName(name: string | null | undefined): string {
  const trimmed = String(name ?? "").trim();
  return trimmed || "Student";
}

/*
 * This is intentionally name-only local access.
 * It is not secure authentication and will later be replaced
 * by a PIN, OS-account binding, encryption, or similar.
 */
export function ensureLocalWorkspace(): void {
  if (!hasWindow()) return;

  if (window.localStorage.getItem(LOCAL_WORKSPACE_ENABLED_KEY) !== "true") {
    window.localStorage.setItem(LOCAL_WORKSPACE_ENABLED_KEY, "true");
  }

  if (!window.localStorage.getItem(LOCAL_PROFILE_NAME_KEY)) {
    window.localStorage.setItem(LOCAL_PROFILE_NAME_KEY, "Student");
  }
}

export function createOrUpdateLocalWorkspace(name: string): void {
  if (!hasWindow()) return;

  window.localStorage.setItem(LOCAL_WORKSPACE_ENABLED_KEY, "true");
  window.localStorage.setItem(LOCAL_PROFILE_NAME_KEY, cleanName(name));
}

export function hasWorkspaceAccess(): boolean {
  if (!hasWindow()) return false;

  ensureLocalWorkspace();

  return window.localStorage.getItem(LOCAL_WORKSPACE_ENABLED_KEY) === "true";
}

export function getLocalWorkspaceName(): string {
  if (!hasWindow()) return "Student";

  ensureLocalWorkspace();

  return cleanName(window.localStorage.getItem(LOCAL_PROFILE_NAME_KEY));
}

export function hasCloudSession(): boolean {
  return hasWindow() && Boolean(window.localStorage.getItem(TOKEN_KEY));
}

export function getWorkspaceName(): string {
  if (!hasWindow()) return "Student";

  return hasCloudSession()
    ? cleanName(window.localStorage.getItem(USER_NAME_KEY))
    : getLocalWorkspaceName();
}

export function connectCloudSession(user: CloudUser, token: string): void {
  if (!hasWindow()) return;

  // Preserve a local identity for use after cloud disconnect.
  createOrUpdateLocalWorkspace(user.name);

  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_EMAIL_KEY, user.email);
  window.localStorage.setItem(USER_NAME_KEY, user.name);
  window.localStorage.setItem(USER_ROLE_KEY, user.role);
}

/*
 * Removes only cloud credentials.
 * Local tasks, documents, queues, and workspace access remain untouched.
 */
export function disconnectCloudSession(): void {
  if (!hasWindow()) return;

  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_EMAIL_KEY);
  window.localStorage.removeItem(USER_NAME_KEY);
  window.localStorage.removeItem(USER_ROLE_KEY);

  ensureLocalWorkspace();
}