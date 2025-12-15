// apps/api/src/mail.ts
import express from "express";
import { authMiddleware, User } from "./auth";
import { prisma } from "./prisma";
import { sendWithAccount, hasSmtpConfig } from "./mailer";

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

/**
 * Ensure the current user has a MailAccount row.
 *
 * - If no account exists, create a basic "internal" account with stubbed IMAP/SMTP.
 * - If an account exists, keep whatever IMAP/SMTP config is already there,
 *   only keeping emailAddress/displayName in sync with the user.
 */
async function ensureAccountForUser(user: User) {
  const email = (user.email || "").toLowerCase();
  const displayName = user.name || user.email;

  let account = await prisma.mailAccount.findFirst({
    where: { userId: user.id },
  });

  if (!account) {
    // Create a minimal "internal" account with stubbed connection fields.
    account = await prisma.mailAccount.create({
      data: {
        userId: user.id,
        provider: "internal",
        emailAddress: email,
        displayName,

        // Stub internal-only values; real external accounts will be
        // configured via PUT /mail/accounts/current.
        imapHost: "internal.local",
        imapPort: 0,
        // imapUseTLS default: true

        smtpHost: "internal.local",
        smtpPort: 0,
        // smtpUseTLS default: true

        username: email,
        passwordEnc: "",
      },
    });

    return account;
  }

  // If we already have an account, don't touch IMAP/SMTP creds.
  // Just keep email + displayName in sync in case the user updates their profile.
  if (
    account.emailAddress !== email ||
    account.displayName !== displayName
  ) {
    account = await prisma.mailAccount.update({
      where: { id: account.id },
      data: {
        emailAddress: email,
        displayName,
      },
    });
  }

  return account;
}

// == Accounts ==

// GET /mail/accounts  – return the (single) account for this user
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

/**
 * PUT /mail/accounts/current
 *
 * Configure or update the external IMAP/SMTP details for the current user's account.
 * This is what makes Option B (per-user real email) possible.
 *
 * Expected body (all strings unless noted):
 * {
 *   provider?: string;        // e.g. "gmail", "zoho", "outlook"
 *   emailAddress?: string;
 *   displayName?: string;
 *   imapHost: string;
 *   imapPort?: number;
 *   imapUseTLS?: boolean;
 *   smtpHost: string;
 *   smtpPort?: number;
 *   smtpUseTLS?: boolean;
 *   username: string;
 *   password: string;         // stored in passwordEnc as-is for now
 * }
 */
router.put("/accounts/current", async (req, res) => {
  const user = (req as any).user as User | undefined;
  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const {
    provider,
    emailAddress,
    displayName,
    imapHost,
    imapPort,
    imapUseTLS,
    smtpHost,
    smtpPort,
    smtpUseTLS,
    username,
    password,
  } = req.body || {};

  // Minimal validation: require host/ports + auth for "real" account
  if (
    !imapHost ||
    !smtpHost ||
    !username ||
    !password
  ) {
    return res.status(400).json({
      error:
        "imapHost, smtpHost, username, and password are required to configure external mail.",
    });
  }

  try {
    let account = await prisma.mailAccount.findFirst({
      where: { userId: user.id },
    });

    const data: any = {
      provider: String(provider || "custom"),
      emailAddress: String(emailAddress || (user.email || "").toLowerCase()),
      displayName: displayName ?? user.name ?? user.email,

      imapHost: String(imapHost),
      imapPort: typeof imapPort === "number" ? imapPort : 993,
      smtpHost: String(smtpHost),
      smtpPort: typeof smtpPort === "number" ? smtpPort : 587,

      username: String(username),
      // NOTE: this is stored as-is. In real prod, you'd encrypt before storing.
      passwordEnc: String(password),
    };

    if (typeof imapUseTLS === "boolean") {
      data.imapUseTLS = imapUseTLS;
    }
    if (typeof smtpUseTLS === "boolean") {
      data.smtpUseTLS = smtpUseTLS;
    }

    if (!account) {
      account = await prisma.mailAccount.create({
        data: {
          userId: user.id,
          ...data,
        },
      });
    } else {
      account = await prisma.mailAccount.update({
        where: { id: account.id },
        data,
      });
    }

    return res.json({ account: mapAccount(account) });
  } catch (err) {
    console.error("Error in PUT /mail/accounts/current:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// == Messages ==

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

  const normalizedTo = String(toAddress).toLowerCase();
  const effectiveFolder: MailFolder = folder === "draft" ? "draft" : "sent";

  try {
    const account = await ensureAccountForUser(user);
    const now = new Date();

    const html = String(bodyHtml || bodyText || "");
    const text = String(bodyText || bodyHtml || "");

    // If this is a real "send" and the account has external SMTP config,
    // fire off a real email.
    if (effectiveFolder === "sent" && hasSmtpConfig(account)) {
      try {
        await sendWithAccount(account, {
          to: normalizedTo,
          subject: String(subject),
          text,
          html,
        });
      } catch (err) {
        console.error("Error sending via SMTP:", err);
        return res
          .status(502)
          .json({ error: "Unable to send external email." });
      }
    }

    // 1) Create the sender's Sent (or Draft) message (internal record)
    const sentMessage = await prisma.mailMessage.create({
      data: {
        userId: user.id,
        accountId: account.id,
        folder: effectiveFolder,
        subject: String(subject),
        fromAddress: account.emailAddress,
        toAddress: normalizedTo,
        bodyHtml: html,
        bodyText: text,
        isRead: true,
        isStarred: false,
        sentAt: effectiveFolder === "sent" ? now : null,
        receivedAt: null,
      },
    });

    // 2) If it's actually being "sent", also deliver a copy into
    //    the recipient's inbox (if that account exists in our system).
    if (effectiveFolder === "sent") {
      const recipientAccount = await prisma.mailAccount.findFirst({
        where: { emailAddress: normalizedTo },
      });

      if (recipientAccount) {
        await prisma.mailMessage.create({
          data: {
            userId: recipientAccount.userId,
            accountId: recipientAccount.id,
            folder: "inbox",
            subject: String(subject),
            fromAddress: account.emailAddress,
            toAddress: normalizedTo,
            bodyHtml: html,
            bodyText: text,
            isRead: false,
            isStarred: false,
            sentAt: now,
            receivedAt: now,
          },
        });
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