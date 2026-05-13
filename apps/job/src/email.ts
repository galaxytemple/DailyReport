import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.ORACLE_SMTP_HOST!,
  port: Number(process.env.ORACLE_SMTP_PORT ?? 587),
  secure: false,
  auth: {
    user: process.env.ORACLE_SMTP_USER!,
    pass: process.env.ORACLE_SMTP_PASS!,
  },
});

export async function sendReport(opts: {
  to: string[];
  theme: string;
  content: string;
}): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  await transporter.sendMail({
    from: process.env.SMTP_FROM!,
    to: opts.to.join(', '),
    subject: `[Daily Report] ${opts.theme} — ${date}`,
    text: opts.content,
    html: `<pre style="font-family:monospace;white-space:pre-wrap;line-height:1.5">${opts.content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')}</pre>`,
  });
}
