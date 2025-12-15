// apps/api/src/mailer.ts
import nodemailer from "nodemailer";
import type { MailAccount } from "@prisma/client";

/**
 * Returns true if this account looks like it has real SMTP config.
 * Internal placeholder accounts will fail this check.
 */
export function hasSmtpConfig(account: MailAccount): boolean {
  if (!account.smtpHost || !account.smtpPort) return false;
  if (!account.username || !account.passwordEnc) return false;
  if (account.smtpPort <= 0) return false;
  return true;
}

/**
 * Send an email using the given MailAccount's SMTP settings.
 * Throws if SMTP is not configured or if sending fails.
 */
export async function sendWithAccount(
  account: MailAccount,
  params: {
    to: string;
    subject: string;
    text?: string;
    html?: string;
  }
): Promise<void> {
  if (!hasSmtpConfig(account)) {
    throw new Error("SMTP not configured for this account");
  }

  const transporter = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpUseTLS, // typically true for 465, false for 587
    auth: {
      user: account.username,
      pass: account.passwordEnc, // TODO: decrypt if you later encrypt this
    },
  });

  await transporter.sendMail({
    from: account.emailAddress || account.username,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
  });
}