// Netlify Functions and platform events can omit CONTEXT at runtime.
// KUDOS_PRODUCTION_RUNTIME is scoped to production Functions on the Netlify site.
// Continue to support Netlify installations that supply CONTEXT explicitly.
export function isKudosProductionRuntime(){
  return process.env.KUDOS_PRODUCTION_RUNTIME==="true" ||
    process.env.CONTEXT==="production";
}
