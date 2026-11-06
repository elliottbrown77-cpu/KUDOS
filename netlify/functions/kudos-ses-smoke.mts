import { getStore } from "@netlify/blobs";
import nodemailer from "nodemailer";

// Temporary, one-shot SES verification; no contribution contents are ever sent.
// This file is removed after the test. Sending is not enabled for contributions.
const TEST_ID="kudos-ses-20261106-1";
function statusStore(){
  return getStore("kudos-contribution-routing",{consistency:"strong"});
}
export default {
  async deploySucceeded(event:any){
    if(process.env.CONTEXT!=="production" || process.env.KUDOS_SES_SMOKE_ENABLED!=="true")return;
    const s=statusStore();
    const existing=await s.get("ses-smoke-test",{type:"json"}) as any;
    if(existing?.testId===TEST_ID)return;
    await s.setJSON("ses-smoke-test",{testId:TEST_ID,state:"started",at:new Date().toISOString()});
    const host=process.env.KUDOS_SMTP_HOST, user=process.env.KUDOS_SMTP_USER,
      password=process.env.KUDOS_SMTP_PASS, from=process.env.KUDOS_EMAIL_FROM,
      recipient=process.env.KUDOS_SES_SMOKE_TO, port=Number(process.env.KUDOS_SMTP_PORT||587);
    if(!host||!user||!password||!from||!recipient||port!==587){
      await s.setJSON("ses-smoke-test",{testId:TEST_ID,state:"missing_configuration",at:new Date().toISOString()});
      return;
    }
    const smtp=nodemailer.createTransport({
      host,port,secure:false,requireTLS:true,tls:{minVersion:"TLSv1.2"},
      connectionTimeout:7000,greetingTimeout:7000,socketTimeout:7000,
      auth:{user,pass:password}
    });
    try{
      await smtp.verify();
      await smtp.sendMail({
        from:{name:"KUDOS Human Performance",address:from},
        to:recipient,
        subject:"KUDOS Amazon SES connection test",
        text:"This is a one-time test of the KUDOS email connection. No KUDOS contribution information has been shared.\n\nAutomatic notification emails remain disabled.",
        disableFileAccess:true,disableUrlAccess:true
      });
      await s.setJSON("ses-smoke-test",{testId:TEST_ID,state:"accepted_by_smtp",at:new Date().toISOString()});
      await s.setJSON("status-rewards",{lastTestAt:new Date().toISOString(),lastResult:"ses_test_accepted"});
    }catch(e){
      await s.setJSON("ses-smoke-test",{testId:TEST_ID,state:"smtp_failed",at:new Date().toISOString()});
      console.error("KUDOS one-off SES smoke test did not complete:",(e as any)?.code||"smtp_error");
    }finally{smtp.close();}
  },
  async fetch(req:Request){
    if(req.method!=="GET")return Response.json({error:"Method not allowed"},{status:405});
    const s=statusStore();
    const result=await s.get("ses-smoke-test",{type:"json"}) as any;
    return Response.json({
      status:result?.state||"not_started",
      checkedAt:result?.at||null,
      automaticSendingEnabled:process.env.KUDOS_EMAIL_DELIVERY_ENABLED==="true"
    },{headers:{"Cache-Control":"no-store"}});
  },
  config:{path:"/api/kudos-mail-health"}
};
