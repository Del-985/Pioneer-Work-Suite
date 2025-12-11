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

// ---- Accounts ----

export async function fetchMailAccounts(): Promise<MailAccount[]> {
  const { data } = await http.get<{ accounts: MailAccount[] }>("/mail/accounts");

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

export async function fetchMailMessages(
  folder: MailFolder = "inbox"
): Promise<MailMessage[]> {
  const { data } = await http.get<{ messages: MailMessage[] }>("/mail/messages", {
    params: { folder },
  });

  if (data && Array.isArray(data.messages)) {
    return data.messages;
  }

  if (Array.isArray(data)) {
    return data as MailMessage[];
  }

  return [];
}

export async function fetchMailMessage(id: string): Promise<MailMessage> {
  const { data } = await http.get<{ message: MailMessage }>(`/mail/messages/${id}`);

  if (data && data.message) {
    return data.message;
  }

  return data as unknown as MailMessage;
}

interface SendMailInput {
  subject: string;
  toAddress: string;
  bodyHtml?: string;
  bodyText?: string;
  folder?: MailFolder; // default "sent" on backend
}

// Compose / send a message (Mail v1: internal only)
export async function sendMail(input: SendMailInput): Promise<MailMessage> {
  const { data } = await http.post<{ message: MailMessage }>("/mail/messages", input);

  if (data && data.message) {
    return data.message;
  }

  return data as unknown as MailMessage;
}

interface UpdateMailPatch {
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