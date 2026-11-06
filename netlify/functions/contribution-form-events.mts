import { getStore } from "@netlify/blobs";
import nodemailer from "nodemailer";

// Event handlers are invoked only after Netlify has verified a form submission.
// Do not email the contributor's name, details, safety description or free text.
const label:Record<string,string>={safety:"Flight Safety",innovation:"Innovation",rewards:"Recognition"};
const matchForm:Record<string,string>={
  "kudos-safety":"safety",
  "kudos-innovation":"innovation",
  "kudos-recognition":"rewards"
};
function contributionType(event: any): string | null {
  const data=event?.data||{};
  // Ignore the second, aggregate audit form. Otherwise notifications duplicate.
  const form=String(event?.form?.name||event?.formName||event?.name||data["form-name"]||"");
  if(form==="kudos-contributions"||form==="kudos-contribution")return null;
  if(matchForm[form])return matchForm[form];
  if(form)return null;
  // Older events may omit the form name; infer only from an unmistakable form schema.
  if("report_type" in data)return null;
  if("nominated_person" in data&&"reason" in data)return "rewards";
  if("external_reference" in data&&"category" in data)return "safety";
  if("title" in data&&"category" in data&&"description" in data)return "innovation";
  return null;
}
async function record(type:string, result:string) {
  const routing=getStore("kudos-contribution-routing",{consistency:"strong"});
  await routing.setJSON("status-"+type,{lastAttemptAt:new Date().toISOString(),lastResult:result});
}
export default {
  async formSubmitted(event:any) {
    if(process.env.CONTEXT!=="production")return;
    const type=contributionType(event);
    if(!type)return;
    const routing=getStore("kudos-contribution-routing",{consistency:"strong"});
    const saved=await routing.get("routes",{type:"json"}) as any;
    const recipients=Array.isArray(saved?.routes?.[type])?saved.routes[type]:[];
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
        await smtp.sendMail({
          from:{name:"KUDOS Human Performance",address:process.env.KUDOS_EMAIL_FROM||process.env.KUDOS_SMTP_USER||""},
          to:recipients.join(", "),
          subject:"New KUDOS "+label[type]+" contribution",
          text:"A new KUDOS "+label[type]+" contribution has been submitted.\n\n"+
            "Sign in to KUDOS to review the entry using your authorised management account:\n"+
            "https://chfkudos.netlify.app/\n\n"+
            "This notification does not contain the submission details. Do not use KUDOS email as an official Flight Safety reporting channel.",
          disableFileAccess:true,disableUrlAccess:true
        });
      } finally {smtp.close();}
      await record(type,"sent");
    }catch(e){
      await record(type,"delivery_failed");
      console.error("KUDOS verified-form notification failed for category",type,
        e instanceof Error?e.name:"error");
      throw e;
    }
  }
};
