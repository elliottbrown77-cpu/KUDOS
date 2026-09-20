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

function ukParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value || "";
  return {
    weekday: get("weekday"),
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: Number(get("hour")),
    minute: Number(get("minute"))
  };
}

export default async () => {
  const now = ukParts();
  const monday = now.weekday === "Mon" && now.hour === 8;
  const friday = now.weekday === "Fri" && now.hour === 12;

  if (!monday && !friday) {
    console.log("KUDOS reminder: outside UK reminder window", now);
    return;
  }

  const publicKey = process.env.KUDOS_VAPID_PUBLIC_KEY;
  const privateKey = process.env.KUDOS_VAPID_PRIVATE_KEY;
  const subject = process.env.KUDOS_VAPID_SUBJECT || "https://chfkudos.netlify.app";
  if (!publicKey || !privateKey) throw new Error("KUDOS VAPID keys are not configured");

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const runStore = getStore("kudos-push-runs", { consistency: "strong" });
  const slot = `${now.year}-${now.month}-${now.day}-${now.hour}`;
  if (await runStore.get(slot)) {
    console.log("KUDOS reminder already sent for", slot);
    return;
  }

  const subscriptions = getStore("kudos-push-subscriptions", { consistency: "strong" });
  const { blobs } = await subscriptions.list({ prefix: "device/" });

  const body = monday
    ? "Start the week with KUDOS — update your challenge progress."
    : "Before you finish for the week, update your KUDOS progress.";

  const payload = JSON.stringify({
    title: "KUDOS progress reminder",
    body,
    icon: "/kudos-app-192-v2.png",
    badge: "/kudos-app-192-v2.png",
    tag: `kudos-progress-${slot}`,
    data: { url: "/?kudos=log" }
  });

  let sent = 0;
  let removed = 0;
  let failed = 0;

  for (let i = 0; i < blobs.length; i += 40) {
    const batch = blobs.slice(i, i + 40);
    const results = await Promise.allSettled(batch.map(async ({ key }) => {
      const row = await subscriptions.get(key, { type: "json" }) as StoredSubscription | null;
      if (!row?.subscription) return;
      try {
        await webpush.sendNotification(row.subscription as any, payload, { TTL: 60 * 60 * 6 });
        sent += 1;
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await subscriptions.delete(key);
          removed += 1;
          return;
        }
        failed += 1;
        console.error("KUDOS push failed", key, error?.statusCode || error?.message || error);
      }
    }));
    void results;
  }

  await runStore.setJSON(slot, {
    completedAt: new Date().toISOString(),
    sent,
    removed,
    failed
  });

  console.log("KUDOS reminder complete", { slot, sent, removed, failed });
};

export const config = { schedule: "0 * * * *" };
