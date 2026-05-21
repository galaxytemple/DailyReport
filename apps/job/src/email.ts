import nodemailer from 'nodemailer';
import { marked } from 'marked';

// OCI's region alias smtp.<region>.oraclecloud.com connects to a server whose
// cert CN is smtp.email.<region>.oci.oraclecloud.com, so Node's strict
// checkServerIdentity rejects it. Pin SNI + cert verification to the canonical
// name via ORACLE_SMTP_TLS_SERVERNAME while keeping the alias as connect host.
const tlsServername =
  process.env.ORACLE_SMTP_TLS_SERVERNAME ?? process.env.ORACLE_SMTP_HOST!;

const transporter = nodemailer.createTransport({
  host: process.env.ORACLE_SMTP_HOST!,
  port: Number(process.env.ORACLE_SMTP_PORT ?? 587),
  secure: false,
  auth: {
    user: process.env.ORACLE_SMTP_USER!,
    pass: process.env.ORACLE_SMTP_PASS!,
  },
  tls: { servername: tlsServername },
});

export async function sendReport(opts: {
  to: string[];
  theme: string;
  content: string;
}): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  // Render markdown to HTML so headings, lists, and ref-number links from
  // analyze.ts's linkRefs() become clickable in mail clients. Plain-text
  // body keeps the raw markdown for clients that prefer it.
  const html = await marked.parse(opts.content, { async: true });
  await transporter.sendMail({
    from: process.env.SMTP_FROM!,
    to: opts.to.join(', '),
    subject: `[Daily Report] ${opts.theme} — ${date}`,
    text: opts.content,
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;line-height:1.6;max-width:720px;color:#222">${html}</div>`,
  });
}
