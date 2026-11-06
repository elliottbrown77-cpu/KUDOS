import {getStore,getDeployStore} from "@netlify/blobs";
const name="kudos-contribution-routing";
function counts(routes:any){
  const out:any={};
  for(const k of ["safety","rewards","innovation"])
    out[k]=Array.isArray(routes?.[k])?routes[k].length:null;
  return out;
}
export default async function handler(req:Request) {
  if(req.method!=="GET")return new Response("Method not allowed",{status:405});
  const result:any={
    context:process.env.CONTEXT||null,
    deployContext:process.env.DEPLOY_CONTEXT||null,
    smtpHostPresent:!!process.env.KUDOS_SMTP_HOST,
    smtpUserPresent:!!process.env.KUDOS_SMTP_USER,
    smtpPassPresent:!!process.env.KUDOS_SMTP_PASS,
    deliveryFlag:process.env.KUDOS_EMAIL_DELIVERY_ENABLED==="true",
    v2ImportPresent:!!process.env.KUDOS_VERIFIED_LEGACY_RECIPIENT_IMPORT_V2,
    defaultRoutesPresent:!!process.env.KUDOS_NOTIFICATION_DEFAULT_ROUTES
  };
  for(const [key,store] of [
    ["global",getStore(name,{consistency:"strong"})],
    ["deploy",getDeployStore(name)]
  ] as const){
    try {
      const saved=await store.get("routes",{type:"json"}) as any;
      const v2=await store.get("verified-legacy-form-recipients-v2",{type:"json"});
      const v3=await store.get("verified-legacy-form-recipients-v3",{type:"json"});
      result[key]={counts:counts(saved?.routes),v2Marker:!!v2,v3Marker:!!v3,updatedAt:saved?.updatedAt||null};
    }catch(e){result[key]={error:e instanceof Error?e.name:"Error"};}
  }
  return Response.json(result,{headers:{"Cache-Control":"no-store"}});
}
export const config={path:"/api/kudos-notification-diagnostic"};
