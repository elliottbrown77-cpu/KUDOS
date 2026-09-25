import { getStore } from "@netlify/blobs";

function ukParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value || "";
  return {
    weekday: get("weekday"),
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: Number(get("hour"))
  };
}

export default async () => {
  const now = ukParts();
  const subscriptions = getStore("kudos-push-subscriptions", { consistency: "strong" });
  const runs = getStore("kudos-push-runs", { consistency: "strong" });

  const { blobs } = await subscriptions.list({ prefix: "device/" });
  const slots = [8, 12].map(hour => ({
    slot: `${now.year}-${now.month}-${now.day}-${hour}`,
    hour
  }));

  const todayRuns: Record<string, unknown> = {};
  for (const x of slots) {
    todayRuns[String(x.hour)] = await runs.get(x.slot, { type: "json" });
  }

  return Response.json({
    ok: true,
    uk: now,
    visibleSubscriptions: blobs.length,
    todayRuns
  }, {
    headers: { "cache-control": "no-store" }
  });
};

export const config = { path: "/api/push-status" };
