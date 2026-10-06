// Tunesmith admin API. Runs on Supabase Edge Functions with the service-role key,
// so it can manage auth users. Every request is authenticated here: the caller's
// access token must belong to an admin (full access) or employee (read-only).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ROLES = ["admin", "employee", "user"];
const ADMIN_ONLY = new Set(["set_role", "set_password", "set_banned", "delete_user", "create_user", "update_profile"]);
const PROFILE_COLS = "id, role, username, display_name, bio, avatar_url, favorite_genres, created_at";

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function allUsers() {
  const users = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

async function timed(fn: () => Promise<unknown>) {
  const t = performance.now();
  try {
    await fn();
    return { ok: true, ms: Math.round(performance.now() - t) };
  } catch (e) {
    return { ok: false, ms: Math.round(performance.now() - t), error: (e as Error).message || String(e) };
  }
}

async function adminCount() {
  const { count, error } = await db.from("tunesmith_profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
  if (error) throw error;
  return count ?? 0;
}

async function targetUser(userId: unknown) {
  if (typeof userId !== "string" || !/^[0-9a-f-]{36}$/i.test(userId)) throw new HttpError(400, "Missing or invalid user.");
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error || !data?.user) throw new HttpError(404, "User not found.");
  const { data: prof } = await db.from("tunesmith_profiles").select("role").eq("id", userId).maybeSingle();
  return { user: data.user, role: prof?.role ?? "user" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Who is calling?
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Please sign in again." }, 401);
  const { data: authData, error: authErr } = await db.auth.getUser(token);
  const me = authData?.user;
  if (authErr || !me) return json({ error: "Please sign in again." }, 401);
  const { data: myProfile } = await db.from("tunesmith_profiles").select("role").eq("id", me.id).maybeSingle();
  const myRole = myProfile?.role;
  if (myRole !== "admin" && myRole !== "employee") return json({ error: "You don't have access to the admin area." }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid request." }, 400); }
  const action = String(body.action || "");
  if (ADMIN_ONLY.has(action) && myRole !== "admin") return json({ error: "Only administrators can do that." }, 403);

  const audit = (act: string, target: { id?: string; email?: string } | null, detail: Record<string, unknown> = {}) =>
    db.from("tunesmith_admin_audit").insert({
      actor_id: me.id, actor_email: me.email, action: act,
      target_id: target?.id ?? null, target_email: target?.email ?? null, detail,
    });

  try {
    switch (action) {
      case "overview": {
        const since24 = new Date(Date.now() - 864e5).toISOString();
        const since7 = new Date(Date.now() - 7 * 864e5).toISOString();
        const [dbCheck, authCheck, storageCheck] = await Promise.all([
          timed(async () => { const { error } = await db.from("tunesmith_profiles").select("id", { head: true, count: "exact" }); if (error) throw error; }),
          timed(async () => { const { error } = await db.auth.admin.listUsers({ page: 1, perPage: 1 }); if (error) throw error; }),
          timed(async () => { const { error } = await db.storage.getBucket("tunesmith-avatars"); if (error) throw error; }),
        ]);
        const users = await allUsers();
        const { data: profiles } = await db.from("tunesmith_profiles").select("id, role, display_name");
        const roles = { admin: 0, employee: 0, user: 0 } as Record<string, number>;
        (profiles || []).forEach((p) => (roles[p.role] = (roles[p.role] || 0) + 1));
        const { data: events } = await db.from("tunesmith_events").select("id, user_id, kind, detail, created_at")
          .gte("created_at", since7).order("created_at", { ascending: false }).limit(5000);
        const ev = events || [];
        const byKind24: Record<string, number> = {};
        const byDay: Record<string, number> = {};
        for (const e of ev) {
          if (e.created_at >= since24) byKind24[e.kind] = (byKind24[e.kind] || 0) + 1;
          const day = e.created_at.slice(0, 10);
          if (!["sign_in", "visit"].includes(e.kind)) byDay[day] = (byDay[day] || 0) + 1;
        }
        const emails = new Map(users.map((u) => [u.id, u.email]));
        return json({
          role: myRole,
          checkedAt: new Date().toISOString(),
          health: { database: dbCheck, auth: authCheck, storage: storageCheck },
          users: {
            total: users.length,
            new7d: users.filter((u) => u.created_at >= since7).length,
            active24h: users.filter((u) => u.last_sign_in_at && u.last_sign_in_at >= since24).length,
            banned: users.filter((u) => u.banned_until && new Date(u.banned_until) > new Date()).length,
            roles,
          },
          activity: {
            requests24h: ev.filter((e) => e.created_at >= since24 && !["sign_in", "visit", "failed"].includes(e.kind)).length,
            failures24h: byKind24.failed || 0,
            byKind24,
            byDay,
            recent: ev.slice(0, 30).map((e) => ({ ...e, email: emails.get(e.user_id) || null })),
          },
        });
      }

      case "list_users": {
        const users = await allUsers();
        const { data: profiles, error } = await db.from("tunesmith_profiles").select(PROFILE_COLS);
        if (error) throw error;
        const byId = new Map((profiles || []).map((p) => [p.id, p]));
        const rows = users.map((u) => {
          const p = byId.get(u.id) || {};
          return {
            id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at,
            email_confirmed_at: u.email_confirmed_at, banned_until: u.banned_until ?? null,
            role: p.role || "user", username: p.username ?? null, display_name: p.display_name ?? null,
            bio: p.bio ?? null, avatar_url: p.avatar_url ?? null, favorite_genres: p.favorite_genres ?? [],
          };
        }).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
        return json({ users: rows });
      }

      case "set_role": {
        const role = String(body.role);
        if (!ROLES.includes(role)) throw new HttpError(400, "Unknown role.");
        const t = await targetUser(body.userId);
        if (t.user.id === me.id && role !== "admin") throw new HttpError(400, "You can't remove your own admin access.");
        if (t.role === "admin" && role !== "admin" && (await adminCount()) <= 1) throw new HttpError(400, "There must always be at least one administrator.");
        const { error } = await db.from("tunesmith_profiles").upsert({ id: t.user.id, role });
        if (error) throw error;
        await audit("set_role", t.user, { from: t.role, to: role });
        return json({ ok: true });
      }

      case "set_password": {
        const password = String(body.password || "");
        if (password.length < 8 || password.length > 72) throw new HttpError(400, "Passwords must be 8–72 characters.");
        const t = await targetUser(body.userId);
        const { error } = await db.auth.admin.updateUserById(t.user.id, { password });
        if (error) throw error;
        await audit("set_password", t.user);
        return json({ ok: true });
      }

      case "set_banned": {
        const banned = Boolean(body.banned);
        const t = await targetUser(body.userId);
        if (t.user.id === me.id) throw new HttpError(400, "You can't suspend your own account.");
        const { error } = await db.auth.admin.updateUserById(t.user.id, { ban_duration: banned ? "876000h" : "none" });
        if (error) throw error;
        await audit(banned ? "suspend_user" : "restore_user", t.user);
        return json({ ok: true });
      }

      case "delete_user": {
        const t = await targetUser(body.userId);
        if (t.user.id === me.id) throw new HttpError(400, "You can't delete your own account here.");
        if (t.role === "admin" && (await adminCount()) <= 1) throw new HttpError(400, "There must always be at least one administrator.");
        const { error } = await db.auth.admin.deleteUser(t.user.id);
        if (error) throw error;
        await audit("delete_user", t.user);
        return json({ ok: true });
      }

      case "create_user": {
        const email = String(body.email || "").trim().toLowerCase();
        const role = String(body.role || "user");
        const password = body.password ? String(body.password) : undefined;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address.");
        if (!ROLES.includes(role)) throw new HttpError(400, "Unknown role.");
        if (password && (password.length < 8 || password.length > 72)) throw new HttpError(400, "Passwords must be 8–72 characters.");
        const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true, password });
        if (error) throw new HttpError(400, /already/i.test(error.message) ? "An account with that email already exists." : error.message);
        const { error: pErr } = await db.from("tunesmith_profiles").upsert({ id: data.user.id, role });
        if (pErr) throw pErr;
        await audit("create_user", data.user, { role, with_password: Boolean(password) });
        return json({ ok: true, id: data.user.id });
      }

      case "update_profile": {
        const t = await targetUser(body.userId);
        const patch: Record<string, unknown> = { id: t.user.id };
        for (const k of ["display_name", "username", "bio"]) if (k in body) patch[k] = body[k] === "" ? null : body[k];
        const { error } = await db.from("tunesmith_profiles").upsert(patch);
        if (error) throw new HttpError(400, error.code === "23505" ? "That username is taken." : error.message);
        await audit("update_profile", t.user, { fields: Object.keys(patch).filter((k) => k !== "id") });
        return json({ ok: true });
      }

      case "audit_log": {
        if (myRole !== "admin") throw new HttpError(403, "Only administrators can do that.");
        const { data, error } = await db.from("tunesmith_admin_audit").select("*").order("created_at", { ascending: false }).limit(100);
        if (error) throw error;
        return json({ entries: data });
      }

      default:
        return json({ error: "Unknown action." }, 400);
    }
  } catch (e) {
    const err = e as HttpError;
    return json({ error: err.message || "Something went wrong." }, err.status || 500);
  }
});
