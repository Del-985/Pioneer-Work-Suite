// apps/api/src/mail.ts
import express from "express";
import nodemailer from "nodemailer";
import { authMiddleware, User as AuthUser } from "./auth";
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

// ---------- SMTP transport (optional, for real email) ----------

const smtpHost = process.env.MAIL_SMTP_HOST || "";
const smtpPortRaw = process.env.MAIL_SMTP_PORT || "";
const smtpUser = process.env.MAIL_SMTP_USER || "";
const smtpPass = process.env.MAIL_SMTP_PASS || "";

const smtpPort = smtpPortRaw ? Number(smtpPortRaw) : 587;
const smtpEnabled = !!(smtpHost && smtpUser && smtpPass);

const transporter = smtpEnabled
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    })
  : null;

// ---------- Mapping helpers ----------

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

// ---------- Account helper ----------

// Loose shape that works for both AuthUser and Prisma.User
type MailUserLike = {
  id: string;
  email: string | null;
  name: string | null;
};

async function ensureAccountForUser(user: MailUserLike) {
  const email = (user.email || "").toLowerCase();
  const displayName = user.name || user.email || "";

  // Try existing account by userId
  const existing = await prisma.mailAccount.findFirst({
    where: { userId: user.id },
  });

  if (existing) {
    // Keep email/display name fresh, but don't touch host/ports/creds
    if (
      existing.emailAddress !== email ||
      existing.displayName !== displayName
    ) {
      return prisma.mailAccount.update({
        where: { id: existing.id },
        data: {
          emailAddress: email,
          displayName,
        },
      });
    }
    return existing;
  }

  // Create a new internal account with placeholder IMAP/SMTP info
  const created = await prisma.mailAccount.create({
    data: {
      userId: user.id,
      provider: "internal",
      emailAddress: email,
      displayName,

      // Minimal placeholders so Prisma is happy; real IMAP/SMTP can be filled later
      imapHost: "",
      imapPort: 0,
      imapUseTLS: true,

      smtpHost: "",
      smtpPort: 0,
      smtpUseTLS: true,

      username: "",
      passwordEnc: "",
    },
  });

  return created;
}

// ---------- Routes ----------

// GET /mail/accounts
router.get("/accounts", async (req, res) => {
  const user = (req as any).user as AuthUser | undefined;
  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  try {
    const account = await ensureAccountForUser({
      id: user.id,
      email: user.email,
      name: user.name,
    });
    return res.json({ accounts: [mapAccount(account)] });
  } catch (err) {
    console.error("Error in GET /mail/accounts:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /mail/messages?folder=inbox|sent|draft|archive
router.get("/messages", async (req, res) => {
  const user = (req as any).user as AuthUser | undefined;
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
    const messages = await prisma.mailMessage.findMany({
      where: {
        userId: user.id,
        folder,
      },
      orderBy: [
        { receivedAt: "desc" },
        { sentAt: "desc" },
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
  const user = (req as any).user as AuthUser | undefined;
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

  const normalizedTo = String(toAddress).trim().toLowerCase();
  const effectiveFolder: MailFolder =
    folder === "draft" ? "draft" : "sent";

  try {
    const senderAccount = await ensureAccountForUser({
      id: user.id,
      email: user.email,
      name: user.name,
    });
    const now = new Date();

    const html = String(bodyHtml || "");
    const text = bodyText
      ? String(bodyText)
      : html.replace(/<[^>]+>/g, " ");

    // 1) Sender's copy: Sent or Draft
    const sentMessage = await prisma.mailMessage.create({
      data: {
        accountId: senderAccount.id,
        userId: user.id,
        folder: effectiveFolder,

        subject: String(subject),
        fromAddress: senderAccount.emailAddress,
        toAddress: normalizedTo,
        ccAddress: null,
        bccAddress: null,

        bodyHtml: html,
        bodyText: text,

        isRead: true,
        isStarred: false,

        sentAt: effectiveFolder === "sent" ? now : null,
        receivedAt: null,

        externalId: null,
        threadKey: null,
        inReplyToId: null,
      },
    });

    // 2) Deliver to any matching internal user inbox(es)
    if (effectiveFolder === "sent") {
      const recipientUsers = await prisma.user.findMany({
        where: { email: normalizedTo },
      });

      if (recipientUsers.length > 0) {
        await Promise.all(
          recipientUsers.map(async (recipientUser) => {
            const recipientAccount = await ensureAccountForUser({
              id: recipientUser.id,
              email: recipientUser.email,
              name: recipientUser.name,
            });

            await prisma.mailMessage.create({
              data: {
                accountId: recipientAccount.id,
                userId: recipientUser.id,
                folder: "inbox",

                subject: String(subject),
                fromAddress: senderAccount.emailAddress,
                toAddress: normalizedTo,
                ccAddress: null,
                bccAddress: null,

                bodyHtml: html,
                bodyText: text,

                isRead: false,
                isStarred: false,

                sentAt: now,
                receivedAt: now,

                externalId: null,
                threadKey: null,
                inReplyToId: sentMessage.id,
              },
            });
          })
        );
      }
    }

    // 3) Fire off real SMTP mail if configured (best-effort)
    if (smtpEnabled && transporter && effectiveFolder === "sent") {
      transporter
        .sendMail({
          from: senderAccount.emailAddress || smtpUser,
          to: normalizedTo,
          subject: String(subject),
          html,
          text,
        })
        .catch((err) => {
          console.error("Error sending SMTP mail:", err);
        });
    }

    return res.status(201).json({ message: mapMessage(sentMessage) });
  } catch (err) {
    console.error("Error in POST /mail/messages:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /mail/messages/:id
router.get("/messages/:id", async (req, res) => {
  const user = (req as any).user as AuthUser | undefined;
  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const { id } = req.params;

  try {
    const msg = await prisma.mailMessage.findFirst({
      where: {
        id,
        userId: user.id,
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
  const user = (req as any).user as AuthUser | undefined;
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
    const existing = await prisma.mailMessage.findFirst({
      where: {
        id,
        userId: user.id,
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
  const user = (req as any).user as AuthUser | undefined;
  if (!user) {
    return res.status(401).json({ error: "Unauthenticated" });
  }

  const { id } = req.params;

  try {
    const existing = await prisma.mailMessage.findFirst({
      where: {
        id,
        userId: user.id,
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