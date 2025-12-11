// apps/web/src/api/mail.ts
import { http } from "./http";

export type MailFolder = "inbox" | "sent" | "draft" | "archive";

export interface MailAccount {
  id: string;
  provider: string;
  emailAddress: string;
  displayName?: string | null;
}

export interface MailMessage {
  id: string;
  accountId: string;
  folder: MailFolder;

  subject: string;
  fromAddress: string;
  toAddress: string;
  ccAddress?: string | null;
  bccAddress?: string | null;

  bodyHtml: string;
  bodyText: string;

  isRead: boolean;
  isStarred: boolean;

  sentAt?: string | null;
  receivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// Optional metadata we *might* get back later (forward-compatible)
export interface MailListResponse {
  messages: MailMessage[];
  nextCursor?: string | null;
  totalCount?: number;
}

// ---- Accounts ----

export async function fetchMailAccounts(): Promise<MailAccount[]> {
  const { data } = await http.get<{ accounts: MailAccount[] }>(
    "/mail/accounts"
  );

  if (data && Array.isArray(data.accounts)) {
    return data.accounts;
  }

  // Fallback if backend ever returns a bare array
  if (Array.isArray(data)) {
    return data as MailAccount[];
  }

  return [];
}

// ---- Messages ----

// Query options for listing messages (Mail v1+)
export interface MailMessageListParams {
  folder?: MailFolder;    // default: "inbox"
  accountId?: string;     // optional multi-account filter
  search?: string;        // free-text search (backend: q=...)
  starredOnly?: boolean;  // filter to starred messages
  page?: number;          // simple pagination
  pageSize?: number;      // simple pagination
}

/**
 * Flexible list API:
 *
 * - fetchMailMessages()                -> inbox
 * - fetchMailMessages("sent")          -> folder sent
 * - fetchMailMessages({ folder: ... }) -> advanced filters
 */
export async function fetchMailMessages(
  params?: MailFolder | MailMessageListParams
): Promise<MailMessage[]> {
  let folder: MailFolder = "inbox";
  let accountId: string | undefined;
  let search: string | undefined;
  let starredOnly: boolean | undefined;
  let page: number | undefined;
  let pageSize: number | undefined;

  if (typeof params === "string") {
    // Backwards compat: fetchMailMessages("inbox")
    folder = params;
  } else if (params && typeof params === "object") {
    folder = params.folder ?? "inbox";
    accountId = params.accountId;
    search = params.search;
    starredOnly = params.starredOnly;
    page = params.page;
    pageSize = params.pageSize;
  }

  const { data } = await http.get<MailListResponse | MailMessage[]>(
    "/mail/messages",
    {
      params: {
        folder,
        accountId,
        q: search,
        starred: starredOnly,
        page,
        pageSize,
      },
    }
  );

  if ((data as MailListResponse).messages && Array.isArray((data as MailListResponse).messages)) {
    return (data as MailListResponse).messages;
  }

  if (Array.isArray(data)) {
    return data as MailMessage[];
  }

  return [];
}

export async function fetchMailMessage(id: string): Promise<MailMessage> {
  const { data } = await http.get<{ message: MailMessage }>(
    `/mail/messages/${id}`
  );

  if (data && data.message) {
    return data.message;
  }

  return data as unknown as MailMessage;
}

export interface SendMailInput {
  subject: string;
  toAddress: string;
  bodyHtml?: string;
  bodyText?: string;
  folder?: MailFolder; // default "sent" on backend
  accountId?: string;  // which account to send from (multi-account support)
}

// Compose / send a message (Mail v1: internal only)
export async function sendMail(input: SendMailInput): Promise<MailMessage> {
  const { data } = await http.post<{ message: MailMessage }>(
    "/mail/messages",
    input
  );

  if (data && data.message) {
    return data.message;
  }

  return data as unknown as MailMessage;
}

export interface UpdateMailPatch {
  isRead?: boolean;
  isStarred?: boolean;
  folder?: MailFolder;
}

export async function updateMailMessage(
  id: string,
  patch: UpdateMailPatch
): Promise<MailMessage> {
  const { data } = await http.patch<{ message: MailMessage }>(
    `/mail/messages/${id}`,
    patch
  );

  if (data && data.message) {
    return data.message;
  }

  return data as unknown as MailMessage;
}

export async function deleteMailMessage(id: string): Promise<void> {
  await http.delete(`/mail/messages/${id}`);
}

// ---- Convenience helpers (optional, but nice for UI wiring) ----

export async function starMailMessage(id: string, starred: boolean) {
  return updateMailMessage(id, { isStarred: starred });
}

export async function markMailRead(id: string, read: boolean) {
  return updateMailMessage(id, { isRead: read });
}

export async function moveMailToFolder(id: string, folder: MailFolder) {
  return updateMailMessage(id, { folder });
}