import { getStore } from "@netlify/blobs";
import webpush from "web-push";

export default async () => {
  const runStore = getStore("kudos-push-runs", { consistency: "strong" });
  const runKey = "catchup-2026-09-25";
  const existing = await runStore.get(runKey, { type: "json" });
  if (existing) return Response.json({ ok:true, alreadySent:true, ...existing });

  const publicKey = Netlify.env.get("KUDOS_VAPID_PUBLIC_KEY");
  const privateKey = Netlify.env.get("KUDOS_VAPID_PRIVATE_KEY");
  const subject = Netlify.env.get("KUDOS_VAPID_SUBJECT") || "https://chfkudos.netlify.app";
  if (!publicKey || !privateKey) return Response.json({ ok:false, error:"VAPID keys missing" }, { status:500 });

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const subscriptions = getStore("kudos-push-subscriptions", { consistency: "strong" });
  const { blobs } = await subscriptions.list({ prefix: "device/" });
  if (!blobs.length) {
    return Response.json({ ok:false, error:"No push subscriptions visible", visibleSubscriptions:0 }, { status:409 });
  }

  const payload = JSON.stringify({
    title: "KUDOS reminder",
    body: "Remember to log this week KUDOS!",
    icon: "/kudos-app-192-v2.png",
    badge: "/kudos-app-192-v2.png",
    tag: runKey,
    data: { url: "/?kudos=log" }
  });

  let sent=0, removed=0, failed=0;
  for (let i=0;i<blobs.length;i+=40) {
    const batch=blobs.slice(i,i+40);
    await Promise.allSettled(batch.map(async ({key})=>{
      const row=await subscriptions.get(key,{type:"json"}) as any;
      if (!row?.subscription) return;
      try{
        await webpush.sendNotification(row.subscription,payload,{TTL:60*60*6});
        sent++;
      }catch(error:any){
        if(error?.statusCode===404||error?.statusCode===410){
          await subscriptions.delete(key);
          removed++;
        }else{
          failed++;
          console.error("KUDOS catch-up push failed",key,error?.statusCode||error?.message||error);
        }
      }
    }));
  }

  const result={completedAt:new Date().toISOString(),sent,removed,failed,visibleSubscriptions:blobs.length};
  if(sent>0) await runStore.setJSON(runKey,result);
  return Response.json({ok:sent>0,...result},{status:sent>0?200:500});
};

export const config = { schedule: "0 18 25 9 *" };
