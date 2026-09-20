import { getStore, getDeployStore } from "@netlify/blobs";

type PushSubscriptionJSON = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
};

function store() {
  return process.env.CONTEXT === "production"
    ? getStore("kudos-push-subscriptions", { consistency: "strong" })
    : getDeployStore("kudos-push-subscriptions");
}

function validDeviceId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,100}$/.test(value);
}

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) {
    return new Response("Forbidden", { status: 403 });
  }

  let body: any;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const deviceId = body?.deviceId;
  if (!validDeviceId(deviceId)) {
    return Response.json({ error: "Invalid device id" }, { status: 400 });
  }

  const key = `device/${deviceId}`;
  const subscriptions = store();

  if (body?.action === "unsubscribe") {
    await subscriptions.delete(key);
    return Response.json({ ok: true });
  }

  const subscription = body?.subscription as PushSubscriptionJSON | undefined;
  if (!subscription?.endpoint?.startsWith("https://") ||
      !subscription?.keys?.p256dh ||
      !subscription?.keys?.auth) {
    return Response.json({ error: "Invalid push subscription" }, { status: 400 });
  }

  await subscriptions.setJSON(key, {
    deviceId,
    subscription,
    createdAt: new Date().toISOString(),
    userAgent: req.headers.get("user-agent") || ""
  });

  return Response.json({ ok: true });
};

export const config = { path: "/api/push-subscribe" };
