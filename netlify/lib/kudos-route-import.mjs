// One-time import of original Netlify Form notification recipient addresses into the
// administrator-managed Netlify Blobs routing store. No email addresses live
// in source control: the additions are a production-only secret environment
// variable. Future Admin edits work normally after the one-time marker.
const TYPES=["safety","innovation","rewards"];
const MARKER="verified-legacy-form-recipients-v2";
const KEY="KUDOS_VERIFIED_LEGACY_RECIPIENT_IMPORT_V2";
const ADDRESS=/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
function normalise(obj){
  if(!obj||typeof obj!=="object"||Array.isArray(obj))obj={};
  const result={};
  for(const type of TYPES){
    const values=obj[type]||[];
    if(!Array.isArray(values)||values.length>20)throw Error("Invalid recipient list");
    const list=values.map(x=>String(x||"").trim().toLowerCase());
    if(list.some(x=>x.length>254||!ADDRESS.test(x)))throw Error("Invalid email address");
    result[type]=[...new Set(list)];
  }
  return result;
}
export async function loadContributionRoutes(store,defaults={}){
  const saved=await store.get("routes",{type:"json"});
  const baseline=normalise(saved?.routes||defaults);
  const env=process.env[KEY];
  if(!env||process.env.CONTEXT!=="production")
    return {routes:baseline,saved,imported:false};
  const marker=await store.get(MARKER,{type:"json"});
  if(marker)return {routes:baseline,saved,imported:false};
  const additions=normalise(JSON.parse(env));
  const merged={};
  for(const type of TYPES){
    const values=[...new Set([...baseline[type],...additions[type]])];
    if(values.length>20)throw Error("Too many recipients for "+type);
    merged[type]=values;
  }
  const updated={routes:merged,updatedAt:new Date().toISOString()};
  await store.setJSON("routes",updated);
  await store.setJSON(MARKER,{completedAt:updated.updatedAt,importedFrom:"verified-netlify-notification-screenshot-20261106"});
  return {routes:merged,saved:updated,imported:true};
}
