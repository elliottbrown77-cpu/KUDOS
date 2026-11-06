// Legacy browser-triggered mail sending is disabled.
// Verified Netlify Form submissions now generate routed notifications instead.
// This prevents arbitrary visitors from using this endpoint to send mail.
export default async (_req:Request) =>
  Response.json({error:"Direct contribution email requests are disabled; use verified form submissions."},
    {status:410,headers:{"Cache-Control":"no-store"}});
export const config={path:"/api/contribution-email"};
