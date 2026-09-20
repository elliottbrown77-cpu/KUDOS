import { getStore, getDeployStore } from "@netlify/blobs";

const SUPABASE_URL = "https://yzrzlexarwgpsqgxbrzn.supabase.co";
const SUPABASE_KEY = "sb_publishable_tmv3lizHLy9tYrGyG_BwPw_4IHXEIow";

function store() {
  return process.env.CONTEXT === "production"
    ? getStore("kudos-contribution-routing", { consistency: "strong" })
    : getDeployStore("kudos-contribution-routing");
}

async function requireAdmin(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("UNAUTHENTICATED");

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, authorization: auth }
  });
  if (!userRes.ok) throw new Error("UNAUTHENTICATED");
  const user = await userRes.json();

  const accessRes = await fetch(
    `${SUPABASE_URL}/rest/v1/app_users?auth_user_id=eq.${encodeURIComponent(user.id)}&select=role`,
    { headers: { apikey: SUPABASE_KEY, authorization: auth } }
  );
  if (!accessRes.ok) throw new Error("FORBIDDEN");
  const access = await accessRes.json();
  if (access?.[0]?.role !== "admin") throw new Error("FORBIDDEN");
}

function normalise(value: unknown) {
  const types = ["safety","innovation","rewards"];
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const out: Record<string,string[]> = {};
  for (const type of types) {
    const list = Array.isArray(input[type]) ? input[type] : [];
    out[type] = [...new Set(list
      .map(x => String(x || "").trim().toLowerCase())
      .filter(x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)))];
  }
  return out;
}

export default async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try { await requireAdmin(req); }
  catch (e: any) {
    return new Response(e?.message === "UNAUTHENTICATED" ? "Unauthenticated" : "Forbidden",
      { status: e?.message === "UNAUTHENTICATED" ? 401 : 403 });
  }

  let body: any;
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const routes = normalise(body?.routes);
  await store().setJSON("routes", { routes, updatedAt: new Date().toISOString() });
  return Response.json({ ok: true, routes });
};

export const config = { path: "/api/contribution-routing" };
