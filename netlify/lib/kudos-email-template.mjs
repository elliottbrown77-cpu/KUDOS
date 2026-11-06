// Shared KUDOS HTML email renderer. Data comes from Netlify-verified form events.
// Escape HTML entities without changing, omitting or redacting field contents.
// Infrastructure-only form-name/bot-field are excluded; every submitted data
// field (including unexpected additions) is included in the email.
export const TYPE_LABELS=Object.freeze({
  safety:"Flight Safety",innovation:"Innovation",rewards:"Recognition"
});
const APP_URL="https://chfkudos.netlify.app/";
const LOGO_URL=APP_URL+"kudos-app-192-v3.png";
const ORDER=[
  ["submitted_by","Submitted by"],
  ["submitter_profile_code","Profile code"],
  ["submitter_profile_id","Profile ID"],
  ["submitter_team","Team"],
  ["submission_date","Submission date"],
  ["category","Category"],
  ["title","Title"],
  ["subject","Subject"],
  ["nominated_person","Person recognised"],
  ["reason","Reason for recognition"],
  ["description","Description"],
  ["external_reference","External reference"],
  ["site_url","Submission page"]
];
const INTERNAL_FIELDS=new Set(["form-name","form_name","bot-field","bot_field"]);
const safe=value=>String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
const label=key=>String(key).replace(/[_-]+/g," ").replace(/\b\w/g,v=>v.toUpperCase());
function displayValue(value){
  if(value===null||value===undefined)return "";
  if(Array.isArray(value))return value.map(displayValue).join(", ");
  if(typeof value==="object")return JSON.stringify(value);
  return String(value);
}
export function contributionRows(data){
  if(!data||typeof data!=="object"||Array.isArray(data))return [];
  const keys=Object.keys(data).filter(k=>!INTERNAL_FIELDS.has(k)&&!k.startsWith("__"));
  const ordered=ORDER.filter(([k])=>keys.includes(k));
  const known=new Set(ordered.map(([k])=>k));
  for(const k of keys){if(!known.has(k))ordered.push([k,label(k)]);}
  return ordered.map(([key,name])=>({key,label:name,value:displayValue(data[key])}));
}
export function exampleContribution(type){
  const shared={
    submitted_by:"Sample Contributor",submitter_profile_code:"EXAMPLE-001",
    submitter_profile_id:"sample-profile-123",submitter_team:"Example Team",
    submission_date:"2026-11-06",site_url:APP_URL
  };
  switch(type){
    case "safety":return {...shared,category:"Example hazard",description:"This is sample narrative text only.\nA second example line demonstrates paragraphs in the finished email.",external_reference:"EXAMPLE-REF-001"};
    case "innovation":return {...shared,category:"Process improvement",title:"Example innovation idea",subject:"Innovation — example",description:"This is a demonstration of the full idea description.\nNo real contribution has been included."};
    case "rewards":return {...shared,nominated_person:"Example Colleague",reason:"Demonstration recognition narrative.\nNo real personal data is included."};
    default:throw new Error("Unknown contribution type");
  }
}
export function renderContributionEmail(type,data,{test=false}={}){
  if(!TYPE_LABELS[type])throw new Error("Unknown contribution type");
  const category=TYPE_LABELS[type];
  const rows=contributionRows(data);
  const title=(test?"TEST — ":"")+"New KUDOS "+category+" contribution";
  const topRows=rows.map((r,i)=>`<tr><td style="width:33%;padding:13px 14px;vertical-align:top;border-bottom:1px solid #e1e5e0;background:${i%2===0?"#f8faf7":"#ffffff"};color:#435f46;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;">${safe(r.label)}</td><td style="padding:13px 14px;vertical-align:top;border-bottom:1px solid #e1e5e0;background:${i%2===0?"#f8faf7":"#ffffff"};color:#162631;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;overflow-wrap:anywhere;word-break:break-word;">${safe(r.value).replace(/\r\n|\r|\n/g,"<br>")||"<em style='color:#778078'>Not provided</em>"}</td></tr>`).join("");
  const notice=test?`<tr><td style="padding:14px 24px;background:#fff6dc;border-top:1px solid #e1c679;color:#654b12;font:13px/1.5 Arial,Helvetica,sans-serif;"><strong>TEST EMAIL:</strong> All field values below are examples, not a real submission.</td></tr>`:"";
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safe(title)}</title></head>
<body style="margin:0;padding:0;background:#eef1ed;color:#14202b;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#eef1ed;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;background:#ffffff;border:1px solid #dce3da;">
<tr><td style="padding:0;background:#0c2338;border-top:7px solid #435f46;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="96" style="padding:24px 0 24px 24px;vertical-align:middle;"><img src="${LOGO_URL}" width="70" height="70" alt="KUDOS logo" style="display:block;border:0;width:70px;height:70px;object-fit:contain"></td>
<td style="padding:24px 20px 24px 6px;vertical-align:middle;"><div style="font:bold 29px/1.15 Arial,Helvetica,sans-serif;letter-spacing:1px;color:#ffffff;">KUDOS</div><div style="font:12px/1.6 Arial,Helvetica,sans-serif;letter-spacing:1.3px;color:#d8c18c;text-transform:uppercase;">Human Performance Optimisation</div><div style="font:11px/1.5 Arial,Helvetica,sans-serif;color:#d8e2dc;">Ready to lead. Ready to fight. Ready to win.</div></td>
</tr></table></td></tr>
<tr><td style="height:4px;background:#d8c18c;font-size:0;line-height:0;">&nbsp;</td></tr>
${notice}
<tr><td style="padding:28px 24px 20px;"><div style="display:inline-block;padding:7px 11px;border-radius:4px;background:#435f46;color:#ffffff;font:bold 11px/1.3 Arial,Helvetica,sans-serif;letter-spacing:.7px;text-transform:uppercase;">${safe(category)}</div>
<h1 style="margin:16px 0 10px;font:bold 25px/1.2 Arial,Helvetica,sans-serif;color:#0c2338;">${safe(title)}</h1>
<p style="margin:0;color:#51645a;font:14px/1.7 Arial,Helvetica,sans-serif;">${test?"Preview of the full form details in the new email design.":"The complete form submission is shown below."}</p></td></tr>
<tr><td style="padding:0 24px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #dce3da;border-collapse:collapse;table-layout:fixed;">${topRows}</table></td></tr>
<tr><td style="padding:0 24px 26px;"><a href="${APP_URL}" style="display:inline-block;padding:13px 18px;border-radius:5px;background:#435f46;color:#ffffff;text-decoration:none;font:bold 14px/1.3 Arial,Helvetica,sans-serif;">Open KUDOS</a></td></tr>
<tr><td style="padding:17px 24px;background:#0c2338;border-top:4px solid #d8c18c;color:#dce4e0;font:12px/1.7 Arial,Helvetica,sans-serif;">KUDOS — CHF Human Performance<br>Flight Safety matters must still follow authorised reporting procedures.</td></tr>
</table></td></tr></table></body></html>`;
  const text=[title,test?"TEST EMAIL — all values are examples.":"Full submission details:",...rows.map(r=>r.label+": "+r.value),"","Open KUDOS: "+APP_URL,"Flight Safety reporting must follow authorised procedures."].join("\n\n");
  return {subject:title,html,text,fieldCount:rows.length};
}
