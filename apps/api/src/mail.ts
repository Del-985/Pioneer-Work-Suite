// apps/api/src/mail.ts
import express from "express";
import { authMiddleware, User } from "./auth";
import { prisma } from "./prisma";

const router = express.Router();

// All /mail routes require auth
router.use(authMiddleware);

export type MailFolder = "inbox" | "sent" | "draft" | "archive";

interface MailAccountResponse {
  id: string;
  provider: string;
  emailAddress: string;
  displayName?: string | null;
}

interface MailMessageResponse {
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
    folder: (m.folder as MailFolder) || "inbox",

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

// Ensure the current user has a MailAccount
async function ensureAccountForUser(user: User) {
  const email = (user.email || "").toLowerCase();
  const displayName = user.name || user.email;

  const account = await prisma.mailAccount.upsert({
    where: {
      // assuming you have a unique on (userId)
      userId: user.id,
    },
    update: {
      // keep provider/email/displayName up to date
      emailAddress: email,
      displayName,
    },
    create: {
      userId: user.id,
      provider: "internal",
      emailAddress: email,
      displayName,
    },
  });

  return account;
}

// GET /mail/accounts
router.get("/accounts", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  try {
    const account = await ensureAccountForUser(user);
    return res.json({ accounts: [mapAccount(account)] });
  } catch (err) {
    console.error("Error in GET /mail/accounts:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /mail/messages?folder=inbox|sent|draft|archive
router.get("/messages", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const rawFolder = (req.query.folder as string) || "inbox";
  const folder: MailFolder =
    rawFolder === "sent" ||
    rawFolder === "draft" ||
    rawFolder === "archive"
      ? (rawFolder as MailFolder)
      : "inbox";

  try {
    const account = await ensureAccountForUser(user);

    const messages = await prisma.mailMessage.findMany({
      where: {
        accountId: account.id,
        folder,
      },
      orderBy: [
        { sentAt: "desc" },
        { receivedAt: "desc" },
        { updatedAt: "desc" },
      ],
    });

    return res.json({
      messages: messages.map(mapMessage),
    });
  } catch (err) {
    console.error("Error in GET /mail/messages:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /mail/messages  (compose/send)
router.post("/messages", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const {
    subject,
    toAddress,
    bodyHtml = "",
    bodyText = "",
    folder,
  } = req.body || {};

  if (!subject || !toAddress) {
    return res
      .status(400)
      .json({ error: "Subject and toAddress are required" });
  }

  // Trim + lowercase so we don't lose matches due to spaces or casing
  const normalizedTo = String(toAddress).trim().toLowerCase();
  const effectiveFolder: MailFolder =
    folder === "draft" ? "draft" : "sent";

  try {
    const account = await ensureAccountForUser(user);
    const now = new Date();

    // 1) Create the sender's Sent (or Draft) message
    const sentMessage = await prisma.mailMessage.create({
      data: {
        accountId: account.id,
        folder: effectiveFolder,
        subject: String(subject),
        fromAddress: account.emailAddress,
        toAddress: normalizedTo,
        bodyHtml: String(bodyHtml),
        bodyText: String(bodyText || bodyHtml || ""),
        isRead: true,
        isStarred: false,
        sentAt: effectiveFolder === "sent" ? now : null,
        receivedAt: null,
      },
    });

    // 2) If it's actually sent, deliver a copy into the recipient's inbox
    if (effectiveFolder === "sent") {
      // Find a User with this email (internal mail only)
      const recipientUser = await prisma.user.findUnique({
        where: { email: normalizedTo },
      });

      if (recipientUser) {
        // Make sure they have a MailAccount as well
        const recipientAccount = await prisma.mailAccount.upsert({
          where: {
            // assumes you have a unique constraint on MailAccount.userId
            userId: recipientUser.id,
          },
          update: {
            emailAddress: normalizedTo,
            displayName: recipientUser.name || normalizedTo,
          },
          create: {
            userId: recipientUser.id,
            provider: "internal",
            emailAddress: normalizedTo,
            displayName: recipientUser.name || normalizedTo,
          },
        });

        await prisma.mailMessage.create({
          data: {
            accountId: recipientAccount.id,
            folder: "inbox",
            subject: String(subject),
            fromAddress: account.emailAddress,
            toAddress: normalizedTo,
            bodyHtml: String(bodyHtml),
            bodyText: String(bodyText || bodyHtml || ""),
            isRead: false,
            isStarred: false,
            sentAt: now,
            receivedAt: now,
          },
        });
      } else {
        // Optional: log if recipient email does not correspond to any User
        console.log(
          "[mail] No internal recipient user found for",
          normalizedTo
        );
      }
    }

    return res.status(201).json({ message: mapMessage(sentMessage) });
  } catch (err) {
    console.error("Error in POST /mail/messages:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /mail/messages/:id
router.get("/messages/:id", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const { id } = req.params;

  try {
    const account = await ensureAccountForUser(user);

    const msg = await prisma.mailMessage.findFirst({
      where: {
        id,
        accountId: account.id,
      },
    });

    if (!msg) {
      return res.status(404).json({ error: "Message not found" });
    }

    return res.json({ message: mapMessage(msg) });
  } catch (err) {
    console.error("Error in GET /mail/messages/:id:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /mail/messages/:id  (update flags/folder)
router.patch("/messages/:id", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const { id } = req.params;
  const { isRead, isStarred, folder } = req.body || {};

  const patch: any = {};
  if (typeof isRead === "boolean") patch.isRead = isRead;
  if (typeof isStarred === "boolean") patch.isStarred = isStarred;
  if (
    typeof folder === "string" &&
    (folder === "inbox" ||
      folder === "sent" ||
      folder === "draft" ||
      folder === "archive")
  ) {
    patch.folder = folder;
  }

  try {
    const account = await ensureAccountForUser(user);

    const existing = await prisma.mailMessage.findFirst({
      where: {
        id,
        accountId: account.id,
      },
    });

    if (!existing) {
      return res.status(404).json({ error: "Message not found" });
    }

    const updated = await prisma.mailMessage.update({
      where: { id: existing.id },
      data: patch,
    });

    return res.json({ message: mapMessage(updated) });
  } catch (err) {
    console.error("Error in PATCH /mail/messages/:id:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /mail/messages/:id
router.delete("/messages/:id", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const { id } = req.params;

  try {
    const account = await ensureAccountForUser(user);

    const existing = await prisma.mailMessage.findFirst({
      where: {
        id,
        accountId: account.id,
      },
    });

    if (!existing) {
      // Treat missing as already deleted
      return res.status(204).send();
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