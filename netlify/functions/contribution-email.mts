import { getStore } from "@netlify/blobs";
import nodemailer from "nodemailer";

const labels: Record<string,string> = {
  safety: "Flight Safety",
  innovation: "Innovation",
  rewards: "Rewards / Recognition"
};

function clean(value: unknown, max = 4000) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, max);
}

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body: any;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const type = clean(body?.type, 30);
  if (!labels[type]) return Response.json({ error: "Unknown contribution type" }, { status: 400 });

  const routing = getStore("kudos-contribution-routing", { consistency: "strong" });
  const saved = await routing.get("routes", { type: "json" }) as any;
  const recipients = Array.isArray(saved?.routes?.[type]) ? saved.routes[type] : [];
  if (!recipients.length) return Response.json({ ok: true, delivered: false, reason: "no_recipients" });

  const host = process.env.KUDOS_SMTP_HOST;
  const port = Number(process.env.KUDOS_SMTP_PORT || 587);
  const user = process.env.KUDOS_SMTP_USER;
  const pass = process.env.KUDOS_SMTP_PASS;
  const from = process.env.KUDOS_EMAIL_FROM || user;

  if (!host || !user || !pass || !from) {
    return Response.json({ ok: false, delivered: false, reason: "smtp_not_configured" }, { status: 503 });
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  const submittedBy = clean(body?.submitted_by, 200);
  const team = clean(body?.submitter_team, 200);
  const date = clean(body?.submission_date, 40);
  const subject = clean(body?.subject, 300) || labels[type];
  const details = clean(body?.details, 10000);

  await transporter.sendMail({
    from,
    to: recipients.join(", "),
    subject: `KUDOS ${labels[type]} — ${subject}`,
    text: [
      `KUDOS ${labels[type]} contribution`,
      "",
      `Submitted by: ${submittedBy || "Unknown"}`,
      `Team: ${team || "Unknown"}`,
      `Date: ${date || "Unknown"}`,
      "",
      details,
      "",
      "Open KUDOS to review the full contribution."
    ].join("\n")
  });

  return Response.json({ ok: true, delivered: true, recipientCount: recipients.length });
};

export const config = { path: "/api/contribution-email" };
