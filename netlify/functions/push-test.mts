import { getStore } from "@netlify/blobs";
import webpush from "web-push";

type StoredSubscription = {
  deviceId: string;
  subscription: {
    endpoint: string;
    expirationTime?: number | null;
    keys: { p256dh: string; auth: string };
  };
};

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

  const subscriptions = getStore("kudos-push-subscriptions", { consistency: "strong" });
  const key = `device/${deviceId}`;
  const row = await subscriptions.get(key, { type: "json" }) as StoredSubscription | null;

  if (!row?.subscription) {
    return Response.json({ error: "No saved push subscription for this device" }, { status: 404 });
  }

  const publicKey = Netlify.env.get("KUDOS_VAPID_PUBLIC_KEY");
  const privateKey = Netlify.env.get("KUDOS_VAPID_PRIVATE_KEY");
  const subject = Netlify.env.get("KUDOS_VAPID_SUBJECT") || "https://chfkudos.netlify.app";
  if (!publicKey || !privateKey) {
    return Response.json({ error: "Push service is not configured" }, { status: 503 });
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const payload = JSON.stringify({
    title: "KUDOS notifications working",
    body: "Test successful — this device can receive KUDOS reminders.",
    icon: "/kudos-app-192-v2.png",
    badge: "/kudos-app-192-v2.png",
    tag: `kudos-test-${Date.now()}`,
    data: { url: "/" }
  });

  try {
    await webpush.sendNotification(row.subscription as any, payload, {
      TTL: 300,
      urgency: "high"
    });
    return Response.json({ ok: true, delivered: true });
  } catch (error: any) {
    if (error?.statusCode === 404 || error?.statusCode === 410) {
      await subscriptions.delete(key);
      return Response.json({ error: "This device subscription has expired. Re-enable notifications.", expired: true }, { status: 410 });
    }
    console.error("KUDOS test push failed", error?.statusCode || error?.message || error);
    return Response.json({ error: "Push provider rejected the test notification" }, { status: 502 });
  }
};

export const config = { path: "/api/push-test" };
