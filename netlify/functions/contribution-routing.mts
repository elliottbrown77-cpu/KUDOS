import { getStore, getDeployStore } from "@netlify/blobs";
import nodemailer from "nodemailer";
import {renderContributionEmail,exampleContribution} from "../lib/kudos-email-template.mjs";
import {loadContributionRoutes} from "../lib/kudos-route-import.mjs";

const SUPABASE_URL = "https://yzrzlexarwgpsqgxbrzn.supabase.co";
const SUPABASE_KEY = "sb_publishable_tmv3lizHLy9tYrGyG_BwPw_4IHXEIow";
const TYPES = ["safety", "innovation", "rewards"] as const;
type MailType = typeof TYPES[number];
type Routes = Record<MailType,string[]>;

function store() {
  return process.env.CONTEXT === "production"
    ? getStore("kudos-contribution-routing", { consistency: "strong" })
    : getDeployStore("kudos-contribution-routing");
}
function configured() {
  return Boolean(process.env.KUDOS_SMTP_HOST && process.env.KUDOS_SMTP_USER &&
    process.env.KUDOS_SMTP_PASS && (process.env.KUDOS_EMAIL_FROM || process.env.KUDOS_SMTP_USER));
}
function enabled() {
  return configured() && process.env.KUDOS_EMAIL_DELIVERY_ENABLED === "true";
}
function normalise(value: unknown): Routes {
  const obj=value && typeof value==="object" ? value as Record<string,unknown> : {};
  const out = {} as Routes;
  for (const type of TYPES) {
    const list = obj[type];
    if (!Array.isArray(list) || list.length > 20) throw new Error("Provide at most 20 addresses per contribution type");
    const emails = list.map(e=>String(e ?? "").trim().toLowerCase());
    if (emails.some(e => !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(e) || e.length>254))
      throw new Error("One or more recipient email addresses are invalid");
    out[type]=[...new Set(emails)];
  }
  return out;
}
function initialRoutes(): Routes {
  const raw=process.env.KUDOS_NOTIFICATION_DEFAULT_ROUTES||"";
  if (!raw) return normalise({});
  return normalise(JSON.parse(raw));
}
async function requireAdmin(req: Request) {
  const auth=req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("UNAUTHENTICATED");
  const userRes=await fetch(SUPABASE_URL+"/auth/v1/user",{
    headers:{apikey:SUPABASE_KEY,authorization:auth}
  });
  if (!userRes.ok) throw new Error("UNAUTHENTICATED");
  const user=await userRes.json();
  const accessRes=await fetch(
    SUPABASE_URL+"/rest/v1/app_users?auth_user_id=eq."+encodeURIComponent(user.id)+"&select=role",
    {headers:{apikey:SUPABASE_KEY,authorization:auth}}
  );
  if (!accessRes.ok) throw new Error("FORBIDDEN");
  const roles=await accessRes.json();
  if (roles?.[0]?.role!=="admin") throw new Error("FORBIDDEN");
}
// One-time reconciliation: older builds saved recipient changes in Supabase
// while the live email system uses Netlify Blobs. A signed-in Workspace Admin
// can reconcile the SQL mirror safely; subsequent Admin changes take precedence.
async function reconcileSqlRecipients(req: Request, s: ReturnType<typeof store>,
  saved: {routes?:Routes,updatedAt?:string}|null, routes: Routes) {
  const key="notification-recipient-sql-reconciliation-v3";
  if(process.env.CONTEXT!=="production" || await s.get(key,{type:"json"}))
    return {saved,routes,reconciled:false};
  const auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))return {saved,routes,reconciled:false};
  const response=await fetch(SUPABASE_URL+
    "/rest/v1/contribution_email_routes?select=contribution_type,recipients",{
    headers:{apikey:SUPABASE_KEY,authorization:auth,"Cache-Control":"no-store"}
  });
  if(!response.ok)return {saved,routes,reconciled:false};
  const list=await response.json() as Array<{contribution_type:string,recipients:string[]}>;
  if(!Array.isArray(list)||!list.length)return {saved,routes,reconciled:false};
  const extra:Record<string,unknown>={};
  for(const item of list){
    if(TYPES.includes(item.contribution_type as MailType)&&Array.isArray(item.recipients))
      extra[item.contribution_type]=item.recipients;
  }
  const legacy=normalise(extra);
  const merged={} as Routes;
  for(const type of TYPES){
    merged[type]=[...new Set([...routes[type],...legacy[type]])];
    if(merged[type].length>20)throw Error("Too many "+type+" recipients to reconcile");
  }
  const updatedAt=new Date().toISOString();
  const result={routes:merged,updatedAt};
  await s.setJSON("routes",result);
  await s.setJSON(key,{completedAt:updatedAt,
    counts:Object.fromEntries(TYPES.map(type=>[type,merged[type].length]))});
  return {saved:result,routes:merged,reconciled:true};
}
async function statusPayload(req:Request) {
  const s=store();
  const imported=await loadContributionRoutes(s,initialRoutes());
  const {saved,routes,reconciled}=await reconcileSqlRecipients(req,s,imported.saved,imported.routes);
  const health:Record<string,unknown>={};
  for(const type of TYPES) health[type]=await s.get("status-"+type,{type:"json"});
  const smoke=await s.get("ses-smoke-test",{type:"json"}) as {state?:string,at?:string}|null;
  return {ok:true,routes,routesSaved:!!saved||!!process.env.KUDOS_NOTIFICATION_DEFAULT_ROUTES,updatedAt:saved?.updatedAt||null,
    smtpConfigured:configured(),deliveryEnabled:enabled(),health,
    recipientCounts:Object.fromEntries(TYPES.map(type=>[type,routes[type].length])),
    recipientsReconciled:reconciled,
    smokeTest:smoke?{status:String(smoke.state||"unknown"),checkedAt:smoke.at||null}:null};
}
export default async (req: Request) => {
  if (!["GET","POST"].includes(req.method)) return Response.json({error:"Method not allowed"},{status:405});
  try { await requireAdmin(req); }
  catch(e) {
    return Response.json({error:e instanceof Error && e.message==="UNAUTHENTICATED"?
      "Administrator sign-in required":"Workspace Administrator permission required"},
      {status:e instanceof Error&&e.message==="UNAUTHENTICATED"?401:403});
  }
  try {
    if(req.method==="GET")return Response.json(await statusPayload(req),{headers:{"Cache-Control":"no-store"}});
    const body=await req.json() as Record<string,unknown>;
    const action=String(body.action||"save");
    if(action==="save"){
      const routes=normalise(body.routes);
      await store().setJSON("routes",{routes,updatedAt:new Date().toISOString()});
      return Response.json(await statusPayload(req));
    }
    if(action==="test"){
      const type=String(body.type||"") as MailType;
      if(!TYPES.includes(type))return Response.json({error:"Choose a notification type"},{status:400});
      if(!configured())return Response.json({error:"An approved SMTP sender has not been configured."},{status:503});
      const info=await statusPayload(req);
      const recipients=info.routes[type];
      if(!recipients?.length)return Response.json({error:"Save at least one recipient for this type"},{status:400});
      const recent=info.health[type] as {lastTestAt?:string}|null;
      if(recent?.lastTestAt && Date.now()-Date.parse(recent.lastTestAt)<60000)
        return Response.json({error:"Please allow one minute between test messages for this category"},{status:429});
      const port=Number(process.env.KUDOS_SMTP_PORT||587);
      if(!Number.isInteger(port)||port<1||port>65535)throw new Error("Invalid SMTP port");
      const smtp=nodemailer.createTransport({
        host:process.env.KUDOS_SMTP_HOST,port,
        secure:port===465,requireTLS:port!==465,
        tls:{minVersion:"TLSv1.2"},
        connectionTimeout:7000,greetingTimeout:7000,socketTimeout:7000,
        auth:{user:process.env.KUDOS_SMTP_USER,pass:process.env.KUDOS_SMTP_PASS}
      });
      try {
        const message=renderContributionEmail(type,exampleContribution(type),{test:true});
        await smtp.sendMail({from:{
            name:"KUDOS Human Performance",address:process.env.KUDOS_EMAIL_FROM||process.env.KUDOS_SMTP_USER||""
          },to:recipients.join(", "),
          subject:message.subject,
          html:message.html,
          text:message.text,
          disableFileAccess:true,disableUrlAccess:true
        });
      } finally {
        smtp.close();
      }
      await store().setJSON("status-"+type,{lastTestAt:new Date().toISOString(),lastResult:"html_sample_sent"});
      return Response.json({ok:true,recipientCount:recipients.length,testSent:true});
    }
    return Response.json({error:"Unknown action"},{status:400});
  }catch(e){
    console.error("KUDOS notification settings request failed",e instanceof Error?e.message:"error");
    return Response.json({error:e instanceof Error?e.message:"Unable to complete request"},{status:500});
  }
};
export const config={path:"/api/contribution-routing"};
