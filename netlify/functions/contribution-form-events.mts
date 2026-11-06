import { getStore } from "@netlify/blobs";
import nodemailer from "nodemailer";
import {renderContributionEmail} from "../lib/kudos-email-template.mjs";
import {loadContributionRoutes} from "../lib/kudos-route-import.mjs";
import {isKudosProductionRuntime} from "../lib/kudos-runtime.mjs";

// Event handlers are invoked only after Netlify has verified a form submission.
// Include all verified form submission details in the branded email.
const label:Record<string,string>={safety:"Flight Safety",innovation:"Innovation",rewards:"Recognition"};
const matchForm:Record<string,string>={
  "kudos-safety":"safety",
  "kudos-innovation":"innovation",
  "kudos-recognition":"rewards"
};
function contributionType(event: any): string | null {
  const data=event?.data||{};
  // Ignore the second, aggregate audit form. Otherwise notifications duplicate.
  const form=String(event?.form?.name||event?.formName||data["form-name"]||"");
  if(form==="kudos-contributions"||form==="kudos-contribution")return null;
  if(matchForm[form])return matchForm[form];
  if(form)return null;
  // Older events may omit the form name; infer only from an unmistakable form schema.
  if("report_type" in data)return null;
  if("nominated_person" in data&&"reason" in data)return "rewards";
  if("title" in data&&"category" in data&&"description" in data)return "innovation";
  if("category" in data&&"description" in data&&!("title" in data))return "safety";
  return null;
}
async function record(type:string, result:string) {
  const routing=getStore("kudos-contribution-routing",{consistency:"strong"});
  await routing.setJSON("status-"+type,{lastAttemptAt:new Date().toISOString(),lastResult:result});
}
export default {
  async deploySucceeded(){
    if(!isKudosProductionRuntime())return;
    const routing=getStore("kudos-contribution-routing",{consistency:"strong"});
    const seed=process.env.KUDOS_NOTIFICATION_DEFAULT_ROUTES;
    const defaults=seed?JSON.parse(seed):{};
    await loadContributionRoutes(routing,defaults);
  },
  async formSubmitted(event:any) {
    if(!isKudosProductionRuntime())return;
    const type=contributionType(event);
    if(!type)return;
    const routing=getStore("kudos-contribution-routing",{consistency:"strong"});
    const seed=process.env.KUDOS_NOTIFICATION_DEFAULT_ROUTES;
    let initial:Record<string,unknown>={};
    if(seed){
      try{initial=JSON.parse(seed);}
      catch(e){console.error("KUDOS default notification routes are invalid");return;}
    }
    const {routes:source}=await loadContributionRoutes(routing,initial);
    const recipients=Array.isArray(source?.[type])?
      [...new Set(source[type].map((v:unknown)=>String(v||"").trim().toLowerCase()))]
        .filter((email:string)=>email.length<=254&&/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(email)).slice(0,20):[];
    if(!recipients.length){await record(type,"no_recipients");return;}
    const configured=Boolean(process.env.KUDOS_SMTP_HOST&&process.env.KUDOS_SMTP_USER&&
      process.env.KUDOS_SMTP_PASS&&(process.env.KUDOS_EMAIL_FROM||process.env.KUDOS_SMTP_USER));
    if(!configured || process.env.KUDOS_EMAIL_DELIVERY_ENABLED!=="true"){
      await record(type,"delivery_not_configured");return;
    }
    try {
      const port=Number(process.env.KUDOS_SMTP_PORT||587);
      if(!Number.isInteger(port)||port<1||port>65535)throw Error("SMTP port is invalid");
      const smtp=nodemailer.createTransport({
        host:process.env.KUDOS_SMTP_HOST,port,
        secure:port===465,requireTLS:port!==465,
        tls:{minVersion:"TLSv1.2"},
        connectionTimeout:7000,greetingTimeout:7000,socketTimeout:7000,
        auth:{user:process.env.KUDOS_SMTP_USER,pass:process.env.KUDOS_SMTP_PASS}
      });
      try {
        const message=renderContributionEmail(type,event.data||{});
        await smtp.sendMail({
          from:{name:"KUDOS Human Performance",address:process.env.KUDOS_EMAIL_FROM||process.env.KUDOS_SMTP_USER||""},
          to:recipients.join(", "),
          subject:message.subject,
          html:message.html,
          text:message.text,
          disableFileAccess:true,disableUrlAccess:true
        });
      } finally {smtp.close();}
      await record(type,"sent_html_full");
    }catch(e){
      await record(type,"delivery_failed");
      console.error("KUDOS verified-form notification failed for category",type,
        e instanceof Error?e.name:"error");
      throw e;
    }
  }
};
