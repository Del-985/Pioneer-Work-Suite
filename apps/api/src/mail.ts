// apps/api/src/mail.ts
import express from "express";
import { authMiddleware, User } from "./auth";
import { prisma } from "./prisma";

const router = express.Router();

// All /mail routes require authentication
router.use(authMiddleware);

type Folder = "inbox" | "sent" | "draft" | "archive";

interface MailAccountResponse {
  id: string;
  provider: string;
  emailAddress: string;
  displayName?: string | null;
}

interface MailMessageResponse {
  id: string;
  accountId: string;
  folder: Folder;
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

// --- helpers ---

function mapAccount(a: any): MailAccountResponse {
  return {
    id: a.id,
    provider: a.provider,
    emailAddress: a.emailAddress,
    displayName: a.displayName ?? null,
  };
}

function mapMessage(m: any): MailMessageResponse {
  return {
    id: m.id,
    accountId: m.accountId,
    folder: (m.folder as Folder) || "inbox",
    subject: m.subject,
    fromAddress: m.fromAddress,
    toAddress: m.toAddress,
    ccAddress: m.ccAddress ?? null,
    bccAddress: m.bccAddress ?? null,
    bodyHtml: m.bodyHtml ?? "",
    bodyText: m.bodyText ?? "",
    isRead: !!m.isRead,
    isStarred: !!m.isStarred,
    sentAt:
      m.sentAt instanceof Date ? m.sentAt.toISOString() : m.sentAt ?? null,
    receivedAt:
      m.receivedAt instanceof Date
        ? m.receivedAt.toISOString()
        : m.receivedAt ?? null,
    createdAt:
      m.createdAt instanceof Date
        ? m.createdAt.toISOString()
        : String(m.createdAt),
    updatedAt:
      m.updatedAt instanceof Date
        ? m.updatedAt.toISOString()
        : String(m.updatedAt),
  };
}

/**
 * Ensure the user has a default "internal" mail account.
 * We use this for Mail v1 instead of wiring real IMAP/SMTP.
 */
async function ensureDefaultMailAccount(user: User) {
  const existing = await prisma.mailAccount.findFirst({
    where: { userId: user.id },
  });

  if (existing) return existing;

  const emailAddress = user.email;
  const displayName = user.name || "Student";

  // Dummy connection info for now. In a future version this
  // will be real IMAP/SMTP settings or OAuth tokens.
  return prisma.mailAccount.create({
    data: {
      userId: user.id,
      provider: "internal",
      emailAddress,
      displayName,
      imapHost: "internal",
      imapPort: 0,
      imapUseTLS: false,
      smtpHost: "internal",
      smtpPort: 0,
      smtpUseTLS: false,
      username: emailAddress,
      passwordEnc: "internal",
    },
  });
}

// --- Routes ---

// GET /mail/accounts - list accounts for current user
router.get("/accounts", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) return res.status(401).json({ error: "Unauthenticated" });

  try {
    // Make sure at least one default account exists
    await ensureDefaultMailAccount(user);

    const accounts = await prisma.mailAccount.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });

    return res.json({
      accounts: accounts.map(mapAccount),
    });
  } catch (err) {
    console.error("Error in GET /mail/accounts:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /mail/messages?folder=inbox
router.get("/messages", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) return res.status(401).json({ error: "Unauthenticated" });

  const folderParam = String(req.query.folder || "inbox").toLowerCase();
  const folder: Folder =
    folderParam === "sent" ||
    folderParam === "draft" ||
    folderParam === "archive"
      ? folderParam
      : "inbox";

  try {
    const messages = await prisma.mailMessage.findMany({
      where: {
        userId: user.id,
        folder,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.json({
      messages: messages.map(mapMessage),
    });
  } catch (err) {
    console.error("Error in GET /mail/messages:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /mail/messages/:id
router.get("/messages/:id", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) return res.status(401).json({ error: "Unauthenticated" });

  const { id } = req.params;

  try {
    const msg = await prisma.mailMessage.findFirst({
      where: { id, userId: user.id },
    });

    if (!msg) {
      return res.status(404).json({ error: "Message not found" });
    }

    return res.json({
      message: mapMessage(msg),
    });
  } catch (err) {
    console.error("Error in GET /mail/messages/:id:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /mail/messages - compose/send (internal-only for now)
router.post("/messages", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) return res.status(401).json({ error: "Unauthenticated" });

  const { subject, toAddress, bodyHtml, bodyText, folder } = req.body || {};

  if (!subject || !toAddress) {
    return res
      .status(400)
      .json({ error: "Missing subject or toAddress" });
  }

  const resolvedFolder: Folder =
    folder === "draft" || folder === "archive" || folder === "inbox"
      ? folder
      : "sent";

  try {
    const account = await ensureDefaultMailAccount(user);

    const created = await prisma.mailMessage.create({
      data: {
        accountId: account.id,
        userId: user.id,
        folder: resolvedFolder,
        subject: String(subject),
        fromAddress: account.emailAddress,
        toAddress: String(toAddress),
        ccAddress: null,
        bccAddress: null,
        bodyHtml: String(bodyHtml || ""),
        bodyText: String(bodyText || ""),
        isRead: resolvedFolder === "sent", // outbox messages treated as read
        isStarred: false,
        sentAt:
          resolvedFolder === "sent"
            ? new Date()
            : null,
        receivedAt: null,
      },
    });

    return res.status(201).json({
      message: mapMessage(created),
    });
  } catch (err) {
    console.error("Error in POST /mail/messages:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /mail/messages/:id - update flags/folder (read, starred, move)
router.patch("/messages/:id", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) return res.status(401).json({ error: "Unauthenticated" });

  const { id } = req.params;
  const { isRead, isStarred, folder } = req.body || {};

  const data: any = {};

  if (typeof isRead === "boolean") {
    data.isRead = isRead;
  }

  if (typeof isStarred === "boolean") {
    data.isStarred = isStarred;
  }

  if (typeof folder === "string") {
    const lower = folder.toLowerCase();
    if (
      lower === "inbox" ||
      lower === "sent" ||
      lower === "draft" ||
      lower === "archive"
    ) {
      data.folder = lower;
    }
  }

  try {
    const existing = await prisma.mailMessage.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return res.status(404).json({ error: "Message not found" });
    }

    const updated = await prisma.mailMessage.update({
      where: { id: existing.id },
      data,
    });

    return res.json({
      message: mapMessage(updated),
    });
  } catch (err) {
    console.error("Error in PATCH /mail/messages/:id:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /mail/messages/:id
router.delete("/messages/:id", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) return res.status(401).json({ error: "Unauthenticated" });

  const { id } = req.params;

  try {
    const existing = await prisma.mailMessage.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return res.status(404).json({ error: "Message not found" });
    }

    await prisma.mailMessage.delete({
      where: { id: existing.id },
    });

    return res.status(204).send();
  } catch (err) {
    console.error("Error in DELETE /mail/messages/:id:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export { router as mailRouter };