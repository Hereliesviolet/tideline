// src/lib/email.ts
// E-Mail-Versand mit Nodemailer (SMTP)

import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || "noreply@example.com";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn(
      "[email] SMTP not configured (SMTP_HOST, SMTP_USER, SMTP_PASS missing) - emails will not be sent"
    );
    // Fallback: Mock-Transporter für Development
    transporter = nodemailer.createTransport({
      host: "localhost",
      port: 1025,
      secure: false,
      ignoreTLS: true,
    });
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true für Port 465, false für Port 587
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
    // Modern TLS settings (Office 365 and most providers require them)
    tls: {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true,
    },
    // Debug-Logging aktivieren
    debug: process.env.NODE_ENV === 'development',
    logger: process.env.NODE_ENV === 'development',
  });

  return transporter;
}

/**
 * Baut den vollständigen E-Mail-HTML-String mit dem gemeinsamen Layout.
 * `headline` und `description` landen im Card-Header, `body` im Card-Body.
 */
function buildEmailHtml(
  opts: { headline: string; description: string; body: string; title: string }
): string {
  const inner = `
    <!-- Card-Header -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
      style="border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:0;">
      <tr>
        <td style="padding:36px 36px 24px;">
          <p style="margin:0 0 20px;color:#fafafa;font-size:13px;font-weight:600;letter-spacing:0.4px;text-transform:uppercase;">
            Capacity Timeline
          </p>
          <h1 style="margin:0 0 8px;color:#fafafa;font-size:22px;font-weight:600;letter-spacing:-0.3px;line-height:1.3;">
            ${opts.headline}
          </h1>
          <p style="margin:0;color:#a1a1aa;font-size:14px;line-height:1.6;">
            ${opts.description}
          </p>
        </td>
      </tr>
    </table>

    <!-- Card-Body -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:28px 36px 24px;">
          ${opts.body}
        </td>
      </tr>
    </table>

    <!-- Footer -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="border-top:1px solid rgba(255,255,255,0.06);padding:14px 36px;text-align:center;background-color:rgba(0,0,0,0.25);">
          <p style="margin:0;color:#3f3f46;font-size:11px;line-height:1.5;">
            Capacity Timeline &nbsp;·&nbsp; Diese E-Mail wurde automatisch generiert. Bitte nicht antworten.
          </p>
        </td>
      </tr>
    </table>`;

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${opts.title}</title>
  <style>
    :root { color-scheme: light !important; }
    body { background-color: #0a0a0f !important; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:rgba(0,0,0,0.45);min-height:100vh;">
    <tr>
      <td align="center" style="padding:48px 16px;">

        <table width="100%" cellpadding="0" cellspacing="0" border="0"
          style="max-width:460px;border-radius:20px;overflow:hidden;border:1px solid rgba(255,255,255,0.1);box-shadow:0 32px 64px rgba(0,0,0,0.8),inset 0 1px 0 rgba(255,255,255,0.06);background-color:rgba(15,15,20,0.85);">
          ${inner}
        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;
}

/**
 * Sendet einen 2FA-Code per E-Mail
 */
export async function send2FAEmail(email: string, code: string): Promise<void> {
  const transport = getTransporter();

  const digits = code.split('');

  const body = `
    <p style="margin:0 0 24px;color:#a1a1aa;font-size:14px;line-height:1.7;text-align:center;">
      Geben Sie diesen Code im Capacity Timeline ein, um Ihre Anmeldung abzuschließen.
    </p>

    <!-- Code-Ziffern -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr>
        <td align="center">
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              ${digits.map(d => `
              <td style="padding:0 4px;">
                <div style="display:inline-block;width:46px;height:58px;line-height:58px;text-align:center;background-color:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15);border-radius:10px;color:#fafafa;font-size:28px;font-weight:700;font-family:ui-monospace,'SF Mono',Monaco,monospace;">${d}</div>
              </td>`).join('')}
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <!-- Gültigkeitshinweis -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr>
        <td align="center" style="background-color:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px 20px;">
          <p style="margin:0;color:#a1a1aa;font-size:13px;line-height:1.5;">
            ⏱&nbsp; Gültig für <strong style="color:#e4e4e7;">10 Minuten</strong> &nbsp;·&nbsp; Einmalig verwendbar
          </p>
        </td>
      </tr>
    </table>

    <!-- Divider -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
      <tr><td style="border-top:1px solid rgba(255,255,255,0.07);font-size:0;line-height:0;">&nbsp;</td></tr>
    </table>

    <p style="margin:0;color:#52525b;font-size:12px;line-height:1.6;text-align:center;">
      Falls Sie sich nicht angemeldet haben, können Sie diese E-Mail ignorieren.
    </p>`;

  const html = buildEmailHtml({
    title: "Ihr Anmelde-Code – Capacity Timeline",
    headline: "Ihr Anmelde-Code",
    description: "Bestätigen Sie Ihre Identität mit dem untenstehenden Code.",
    body,
  });

  try {
    console.log(`[email] Attempting to send 2FA code to ${email}...`);
    const result = await transport.sendMail({
      from: `"Capacity Timeline" <${SMTP_FROM}>`,
      to: email,
      subject: "Ihr Anmelde-Code – Capacity Timeline",
      html,
      text: `Ihr 2FA-Code: ${code}\n\nDieser Code ist 10 Minuten gültig und kann nur einmal verwendet werden.\n\nFalls Sie sich nicht angemeldet haben, ignorieren Sie diese E-Mail.`,
    });
    console.log(`[email] 2FA email sent successfully to ${email}. MessageId: ${result.messageId}`);
  } catch (error: any) {
    console.error("[email] Failed to send 2FA email:", error);
    console.error("[email] Error details:", {
      message: error?.message,
      code: error?.code,
      command: error?.command,
      response: error?.response,
      responseCode: error?.responseCode,
    });
    throw error;
  }
}

/**
 * Sendet eine Einladungs-E-Mail
 */
export async function sendInvitationEmail(
  email: string,
  token: string
): Promise<void> {
  const transport = getTransporter();
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:8080";
  const inviteUrl = `${baseUrl}/accept-invite?token=${token}`;

  const body = `
    <p style="margin:0 0 24px;color:#a1a1aa;font-size:14px;line-height:1.7;">
      Um Ihren Zugang zu aktivieren, klicken Sie auf den Button und legen Sie Ihr persönliches Passwort fest.
      Der Einladungslink ist <strong style="color:#fafafa;">7&nbsp;Tage</strong> gültig.
    </p>

    <!-- CTA-Button -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr>
        <td align="center">
          <a href="${inviteUrl}"
            style="display:inline-block;background-color:#f4f4f5;color:#09090b;font-size:15px;font-weight:600;text-decoration:none;padding:13px 32px;border-radius:10px;letter-spacing:0.1px;">
            Einladung annehmen →
          </a>
        </td>
      </tr>
    </table>

    <!-- Divider -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
      <tr><td style="border-top:1px solid rgba(255,255,255,0.07);font-size:0;line-height:0;">&nbsp;</td></tr>
    </table>

    <p style="margin:0;color:#52525b;font-size:12px;line-height:1.6;">
      Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:<br />
      <a href="${inviteUrl}" style="color:#71717a;word-break:break-all;">${inviteUrl}</a>
    </p>`;

  const html = buildEmailHtml({
    title: "Einladung zum Capacity Timeline",
    headline: "Sie wurden eingeladen",
    description: "Willkommen im Capacity Timeline – Ihrem zentralen Arbeitsbereich für Projektplanung&nbsp;&amp;&nbsp;Transparenz.",
    body,
  });

  try {
    await transport.sendMail({
      from: `"Capacity Timeline" <${SMTP_FROM}>`,
      to: email,
      subject: "Einladung zum Capacity Timeline",
      html,
      text: `Willkommen beim Capacity Timeline!\n\nSie wurden eingeladen. Klicken Sie auf diesen Link, um Ihr Passwort zu setzen und Ihren Zugang zu aktivieren:\n\n${inviteUrl}\n\nDer Link ist 7 Tage gültig.`,
    });
  } catch (error) {
    console.error("[email] Failed to send invitation email:", error);
    throw error;
  }
}

/**
 * Sendet eine Passwort-Reset-E-Mail
 */
export async function sendPasswordResetEmail(
  email: string,
  token: string
): Promise<void> {
  const transport = getTransporter();
  const baseUrl = process.env.FRONTEND_URL || "http://localhost:8080";
  const resetUrl = `${baseUrl}/accept-invite?token=${token}`;

  const body = `
    <p style="margin:0 0 24px;color:#a1a1aa;font-size:14px;line-height:1.7;">
      Ihr Passwort wurde von einem Administrator zurückgesetzt. Klicken Sie auf den Button,
      um ein neues Passwort zu setzen und Ihren Zugang wiederherzustellen.
      Der Link ist <strong style="color:#fafafa;">7&nbsp;Tage</strong> gültig.
    </p>

    <!-- CTA-Button -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
      <tr>
        <td align="center">
          <a href="${resetUrl}"
            style="display:inline-block;background-color:#f4f4f5;color:#09090b;font-size:15px;font-weight:600;text-decoration:none;padding:13px 32px;border-radius:10px;letter-spacing:0.1px;">
            Neues Passwort setzen →
          </a>
        </td>
      </tr>
    </table>

    <!-- Divider -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
      <tr><td style="border-top:1px solid rgba(255,255,255,0.07);font-size:0;line-height:0;">&nbsp;</td></tr>
    </table>

    <p style="margin:0;color:#52525b;font-size:12px;line-height:1.6;">
      Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:<br />
      <a href="${resetUrl}" style="color:#71717a;word-break:break-all;">${resetUrl}</a>
    </p>`;

  const html = buildEmailHtml({
    title: "Passwort zurückgesetzt – Capacity Timeline",
    headline: "Passwort zurückgesetzt",
    description: "Ein Administrator hat Ihr Passwort zurückgesetzt. Bitte setzen Sie jetzt ein neues Passwort.",
    body,
  });

  try {
    await transport.sendMail({
      from: `"Capacity Timeline" <${SMTP_FROM}>`,
      to: email,
      subject: "Passwort zurückgesetzt – Capacity Timeline",
      html,
      text: `Ihr Passwort wurde von einem Administrator zurückgesetzt.\n\nKlicken Sie auf diesen Link, um ein neues Passwort zu setzen:\n\n${resetUrl}\n\nDer Link ist 7 Tage gültig.\n\nFalls Sie diese Aktion nicht erwartet haben, wenden Sie sich bitte an Ihren Administrator.`,
    });
  } catch (error) {
    console.error("[email] Failed to send password reset email:", error);
    throw error;
  }
}

