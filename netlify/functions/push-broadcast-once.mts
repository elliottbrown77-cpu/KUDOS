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

const CAMPAIGN_ID = "manual-reminder-2026-09-29-a";

export default async () => {
  const publicKey = Netlify.env.get("KUDOS_VAPID_PUBLIC_KEY");
  const privateKey = Netlify.env.get("KUDOS_VAPID_PRIVATE_KEY");
  const subject = Netlify.env.get("KUDOS_VAPID_SUBJECT") || "https://chfkudos.netlify.app";
  if (!publicKey || !privateKey) throw new Error("KUDOS VAPID keys are not configured");

  const runStore = getStore("kudos-push-runs", { consistency: "strong" });
  const runKey = `broadcast/${CAMPAIGN_ID}`;

  if (await runStore.get(runKey)) {
    console.log("KUDOS one-off broadcast already completed", CAMPAIGN_ID);
    return;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const subscriptions = getStore("kudos-push-subscriptions", { consistency: "strong" });
  const { blobs } = await subscriptions.list({ prefix: "device/" });

  if (!blobs.length) {
    console.warn("KUDOS one-off broadcast: no subscriptions found");
    return;
  }

  const payload = JSON.stringify({
    title: "KUDOS reminder",
    body: "Quick reminder — open KUDOS and update your progress.",
    icon: "/kudos-app-192-v2.png",
    badge: "/kudos-app-192-v2.png",
    tag: CAMPAIGN_ID,
    data: { url: "/?kudos=log" }
  });

  let sent = 0;
  let removed = 0;
  let failed = 0;

  for (let i = 0; i < blobs.length; i += 40) {
    const batch = blobs.slice(i, i + 40);
    await Promise.allSettled(batch.map(async ({ key }) => {
      const row = await subscriptions.get(key, { type: "json" }) as StoredSubscription | null;
      if (!row?.subscription) return;
      try {
        await webpush.sendNotification(row.subscription as any, payload, {
          TTL: 60 * 60,
          urgency: "normal"
        });
        sent += 1;
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await subscriptions.delete(key);
          removed += 1;
          return;
        }
        failed += 1;
        console.error("KUDOS one-off push failed", key, error?.statusCode || error?.message || error);
      }
    }));
  }

  await runStore.setJSON(runKey, {
    completedAt: new Date().toISOString(),
    campaignId: CAMPAIGN_ID,
    visibleSubscriptions: blobs.length,
    sent,
    removed,
    failed
  });

  console.log("KUDOS one-off broadcast complete", {
    campaignId: CAMPAIGN_ID,
    visibleSubscriptions: blobs.length,
    sent,
    removed,
    failed
  });
};

export const config = { schedule: "* * * * *" };
