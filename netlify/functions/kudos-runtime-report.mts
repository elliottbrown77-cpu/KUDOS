import {getStore,getDeployStore} from "@netlify/blobs";
import nodemailer from "nodemailer";
import {loadContributionRoutes} from "../lib/kudos-route-import.mjs";
import {isKudosProductionRuntime} from "../lib/kudos-runtime.mjs";
function summary(data:any) {
  const counts:any={};for(const k of ["safety","rewards","innovation"])
    counts[k]=Array.isArray(data?.[k])?data[k].length:null;
  return counts;
}
export default {
  async deploySucceeded(event:any) {
    if(!isKudosProductionRuntime())return;
    const report:any={
      productionRuntimeRecognised:isKudosProductionRuntime(),
      deployId:String(event?.deploy?.id||"unknown"),
      context:process.env.CONTEXT||null,
      deployContext:process.env.DEPLOY_CONTEXT||null,
      siteUrl:process.env.URL||null,
      deployPrimeUrl:process.env.DEPLOY_PRIME_URL||null,
      enabledValue:process.env.KUDOS_EMAIL_DELIVERY_ENABLED||null,
      smtpHostPresent:!!process.env.KUDOS_SMTP_HOST,
      smtpUserPresent:!!process.env.KUDOS_SMTP_USER,
      smtpPasswordPresent:!!process.env.KUDOS_SMTP_PASS,
      defaultRoutesPresent:!!process.env.KUDOS_NOTIFICATION_DEFAULT_ROUTES,
      recipientImportPresent:!!process.env.KUDOS_VERIFIED_LEGACY_RECIPIENT_IMPORT_V2
    };
    for(const [key,raw] of [["default",process.env.KUDOS_NOTIFICATION_DEFAULT_ROUTES],
      ["importV2",process.env.KUDOS_VERIFIED_LEGACY_RECIPIENT_IMPORT_V2]] as const){
      try{report[key]=raw?summary(JSON.parse(raw)):null;}catch{report[key]="parse_error";}
    }
    try{
      const globalStore=getStore("kudos-contribution-routing",{consistency:"strong"});
      const defaults=process.env.KUDOS_NOTIFICATION_DEFAULT_ROUTES
        ?JSON.parse(process.env.KUDOS_NOTIFICATION_DEFAULT_ROUTES):{};
      const migration=await loadContributionRoutes(globalStore,defaults);
      report.migration={imported:migration.imported,counts:summary(migration.routes)};
    }catch(e){
      report.migration={error:e instanceof Error?e.message:"unknown"};
    }
    for(const [name,store] of [
      ["global",getStore("kudos-contribution-routing",{consistency:"strong"})],
      ["deploy",getDeployStore("kudos-contribution-routing")]
    ] as const){
      try{
        const routes=await store.get("routes",{type:"json"}) as any;
        report[name]={counts:summary(routes?.routes),
          markerV2:!!(await store.get("verified-legacy-form-recipients-v2",{type:"json"})),
          markerV3:!!(await store.get("verified-legacy-form-recipients-v3",{type:"json"}))};
      }catch(e){report[name]={error:e instanceof Error?e.message:"unknown"};}
    }
    console.log("KUDOS_RUNTIME_DIAGNOSTIC",JSON.stringify(report));
    const transport=nodemailer.createTransport({
      host:process.env.KUDOS_SMTP_HOST||"email-smtp.eu-west-2.amazonaws.com",
      port:587,secure:false,requireTLS:true,tls:{minVersion:"TLSv1.2"},
      connectionTimeout:7000,greetingTimeout:7000,socketTimeout:7000,
      auth:{user:process.env.KUDOS_SMTP_USER,pass:process.env.KUDOS_SMTP_PASS}
    });
    try{
      await transport.sendMail({
        from:{name:"KUDOS System Diagnostic",address:process.env.KUDOS_EMAIL_FROM||"membership@rnwsa.org"},
        to:"ell_brown@outlook.com",
        subject:"KUDOS routing repair verification 2026-11-06",
        text:"KUDOS technical diagnostic, counts only. No submission content or addresses.\n\n"+JSON.stringify(report,null,2),
        disableFileAccess:true,disableUrlAccess:true
      });
    }catch(e){console.error("KUDOS diagnostic mail failed",e instanceof Error?e.name:"error");}
    finally{transport.close();}
  }
};