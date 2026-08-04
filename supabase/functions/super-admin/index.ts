// Super Admin control plane.
// Handles multi-client (tenant) onboarding and management.
// All requests must carry a valid JWT (Supabase Auth) or legacy app_sessions token
// belonging to a user whose role is `super_admin`.
//
// POST /functions/v1/super-admin
// Headers: { 'Authorization': 'Bearer <JWT>' }
// Body: { action: string, payload?: Record<string, unknown> }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const TENANT_TABLES = [
  "staff", "attendance", "punch_events", "break_events", "break_types",
  "break_policies", "leave_requests", "advances", "advance_entries",
  "payroll_runs", "payroll_snapshots", "salary_hikes", "salary_manual_overrides",
  "face_embeddings", "face_registration_logs", "old_staff_records",
  "part_time_advance_tracking", "part_time_settlements", "app_settings",
  "locations", "designations", "floors", "salary_categories",
  "location_shift_config", "location_designation_shift_config",
  "statutory_portal_config",
];

const ALLOWED_ROLES = ["admin", "manager", "supervisor", "statutory_admin", "staff"];

function slugify(v: string) {
  return v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

function isEmail(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 254;
}

async function logAudit(admin: any, tenantId: string, action: string, details: string, performedBy: string, changes?: any, before?: any, after?: any) {
  try {
    await admin.from("audit_logs").insert([{
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      tenant_id: tenantId,
      action,
      details,
      performed_by: performedBy,
      changes: changes ?? null,
      before: before ?? null,
      after: after ?? null,
      timestamp: new Date().toISOString()
    }]);
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const legacyToken = req.headers.get("x-session-token");
    const authHeader = req.headers.get("authorization");
    let jwt = "";
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      jwt = authHeader.substring(7);
    }

    if (!legacyToken && !jwt) {
      return json({ error: "Missing session token or authorization header" }, 401);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let sessionUserId = "";

    if (jwt) {
      const { data: { user: authUser }, error: authErr } = await admin.auth.getUser(jwt);
      if (authErr || !authUser) {
        console.error("[super-admin] JWT validation failed:", authErr?.message);
        return json({ error: "Invalid or expired authorization token" }, 401);
      }

      // Look up by auth_id first, then email fallback
      let { data: uRow } = await admin
        .from("app_users")
        .select("id")
        .eq("auth_id", authUser.id)
        .maybeSingle();

      if (!uRow && authUser.email) {
        const { data: uByEmail } = await admin
          .from("app_users")
          .select("id")
          .eq("email", authUser.email)
          .maybeSingle();
        uRow = uByEmail;
        // Auto-patch auth_id for future lookups
        if (uRow) {
          await admin.from("app_users").update({ auth_id: authUser.id }).eq("id", uRow.id);
        }
      }

      if (!uRow) {
        return json({ error: "User profile not found" }, 403);
      }
      sessionUserId = uRow.id;
    } else if (legacyToken) {
      const { data: session, error: sessionErr } = await admin
        .from("app_sessions")
        .select("user_id, expires_at, is_valid")
        .eq("token", legacyToken)
        .eq("is_valid", true)
        .maybeSingle();

      if (sessionErr) {
        console.error("Session lookup error:", sessionErr);
        return json({ error: `Session lookup failed: ${sessionErr.message}` }, 500);
      }

      if (!session || new Date(session.expires_at).getTime() < Date.now()) {
        return json({ error: "Session expired or invalid — please log in again" }, 401);
      }
      sessionUserId = session.user_id;
    }

    const { data: me, error: meErr } = await admin
      .from("app_users")
      .select("id, email, role, is_active")
      .eq("id", sessionUserId)
      .maybeSingle();

    if (meErr) {
      console.error("User lookup error:", meErr);
      return json({ error: `User lookup failed: ${meErr.message}` }, 500);
    }

    if (!me) {
      return json({ error: "User account not found" }, 403);
    }
    if (!me.is_active) {
      return json({ error: "User account is inactive" }, 403);
    }
    if (me.role !== "super_admin") {
      return json({ error: `Super admin access required (your role: ${me.role})` }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");
    const p = (body?.payload ?? {}) as Record<string, any>;

    switch (action) {
      /* ---------------- Tenants ---------------- */
      case "list_tenants": {
        const { data: tenants, error } = await admin
          .from("tenants")
          .select("*")
          .order("created_at", { ascending: true });
        if (error) return json({ error: error.message }, 400);

        // Enrich with staff_count and admin user info for each tenant
        const enriched = await Promise.all((tenants ?? []).map(async (t: any) => {
          const [{ count: staffCount }, { data: admins }] = await Promise.all([
            admin.from("staff").select("id", { count: "exact", head: true }).eq("tenant_id", t.id),
            admin.from("app_users").select("id, email, full_name, role, is_active, last_login").eq("tenant_id", t.id).order("created_at"),
          ]);
          return {
            ...t,
            staff_count: staffCount ?? 0,
            user_count: admins?.length ?? 0,
            users: admins ?? [],
          };
        }));

        return json({ data: enriched });
      }

      case "list_tenant_users": {
        const tenantId = String(p.tenant_id ?? "");
        if (!tenantId) return json({ error: "tenant_id required" }, 400);

        const { data: users, error } = await admin
          .from("app_users")
          .select("id, email, full_name, role, is_active, last_login, created_at, location, tenant_id")
          .eq("tenant_id", tenantId)
          .order("created_at");

        if (error) return json({ error: error.message }, 400);
        return json({ data: users ?? [] });
      }

      case "create_tenant": {
        const name = String(p.name ?? "").trim();
        if (!name) return json({ error: "Client name is required" }, 400);
        const staffLimit = Number.isFinite(Number(p.staff_limit)) ? Math.max(1, Number(p.staff_limit)) : 50;

        const { data: tenant, error } = await admin
          .from("tenants")
          .insert({
            name,
            slug: p.slug ? slugify(String(p.slug)) : slugify(name),
            status: String(p.status ?? "ACTIVE").toUpperCase(),
            staff_limit: staffLimit,
            location_limit: Number.isFinite(Number(p.location_limit)) ? Math.max(1, Number(p.location_limit)) : 10,
            sub_user_limit: Number.isFinite(Number(p.sub_user_limit)) ? Math.max(0, Number(p.sub_user_limit)) : 5,
            plan: String(p.plan ?? "standard"),
            contact_name: p.contact_name ?? null,
            contact_email: p.contact_email ?? null,
            contact_phone: p.contact_phone ?? null,
            notes: p.notes ?? null,
            staff_portal_enabled: p.staff_portal_enabled === undefined ? true : !!p.staff_portal_enabled,
          })
          .select()
          .single();
        if (error) return json({ error: error.message }, 400);

        let adminUser: unknown = null;
        if (p.admin_email) {
          if (!isEmail(p.admin_email)) return json({ error: "Invalid admin email" }, 400);
          const pwd = String(p.admin_password ?? "");
          if (pwd.length < 8) return json({ error: "Admin password must be at least 8 characters" }, 400);

          const normalizedEmail = String(p.admin_email).trim().toLowerCase();

          // 1. Create or get user in Supabase Auth
          let authUserId = "";
          const { data: existingAuth } = await admin.auth.admin.listUsers();
          const existingUser = (existingAuth?.users ?? []).find((u: any) => u.email === normalizedEmail);

          if (existingUser) {
            // Update password if user already exists in auth
            await admin.auth.admin.updateUserById(existingUser.id, { password: pwd, email_confirm: true });
            authUserId = existingUser.id;
          } else {
            const { data: authData, error: authErr } = await admin.auth.admin.createUser({
              email: normalizedEmail,
              password: pwd,
              email_confirm: true,
              user_metadata: {
                full_name: String(p.admin_full_name ?? `${name} Admin`),
                role: "admin",
              }
            });
            if (authErr || !authData.user) {
              return json({ error: `Client created but Supabase Auth failed: ${authErr?.message}`, data: tenant }, 400);
            }
            authUserId = authData.user.id;
          }

          // 2. Create or update the app_user profile
          const { data: created, error: uErr } = await admin
            .from("app_users")
            .upsert({
              id: authUserId,
              email: normalizedEmail,
              password_hash: await bcrypt.hash(pwd, 10),
              full_name: String(p.admin_full_name ?? `${name} Admin`),
              role: "admin",
              is_active: true,
              tenant_id: tenant.id,
              auth_id: authUserId,
            }, { onConflict: "email" })
            .select("id, email, full_name, role, is_active, tenant_id, auth_id")
            .single();

          if (uErr) return json({ error: `Client created but admin profile failed: ${uErr.message}`, data: tenant }, 400);
          adminUser = created;
        }

        await logAudit(admin, tenant.id, "settings_update", `Tenant ${name} created`, me.email, null, null, tenant);
        return json({ data: { tenant, adminUser } });
      }

      case "update_tenant": {
        const id = String(p.id ?? "");
        if (!id) return json({ error: "Client id required" }, 400);

        const patch: Record<string, unknown> = {};
        for (const k of ["name", "plan", "contact_name", "contact_email", "contact_phone", "notes"]) {
          if (p[k] !== undefined) patch[k] = p[k];
        }
        if (p.staff_portal_enabled !== undefined) patch.staff_portal_enabled = !!p.staff_portal_enabled;
        if (p.slug !== undefined) patch.slug = p.slug ? slugify(String(p.slug)) : null;
        if (p.status !== undefined) patch.status = String(p.status).toUpperCase();
        if (p.staff_limit !== undefined) patch.staff_limit = Math.max(1, Number(p.staff_limit));
        if (p.location_limit !== undefined) patch.location_limit = Math.max(1, Number(p.location_limit));
        if (p.sub_user_limit !== undefined) patch.sub_user_limit = Math.max(0, Number(p.sub_user_limit));

        const { data: beforeData } = await admin.from("tenants").select("*").eq("id", id).single();
        const { data, error } = await admin.from("tenants").update(patch).eq("id", id).select().single();
        if (error) return json({ error: error.message }, 400);

        await logAudit(admin, id, "settings_update", `Tenant ${data.name} updated`, me.email, null, beforeData, data);
        return json({ data });
      }

      case "delete_tenant": {
        const id = String(p.id ?? "");
        if (!id) return json({ error: "Client id required" }, 400);
        if (!p.confirm) return json({ error: "Confirmation required" }, 400);

        // 1. Invalidate all active user sessions for this tenant
        const { data: tenantUsers } = await admin.from("app_users").select("id").eq("tenant_id", id);
        const userIds = (tenantUsers ?? []).map((u: any) => u.id);
        if (userIds.length > 0) {
          await admin.from("app_sessions").delete().in("user_id", userIds);
        }

        // 2. Remove all tenant-scoped operational data
        for (const table of TENANT_TABLES) {
          const { error } = await admin.from(table).delete().eq("tenant_id", id);
          if (error && !/does not exist/i.test(error.message)) {
            console.warn(`Failed clearing ${table}: ${error.message}`);
          }
        }

        // 3. Delete all tenant users
        await admin.from("app_users").delete().eq("tenant_id", id);

        // 4. Delete the tenant record
        const { error } = await admin.from("tenants").delete().eq("id", id);
        if (error) return json({ error: error.message }, 400);

        return json({ data: { deleted: id } });
      }

      /* ---------------- Platform overview ---------------- */
      case "overview": {
        const [{ data: tenants }, { count: staffCount }, { count: userCount }] = await Promise.all([
          admin.from("tenants").select("id, status, staff_limit"),
          admin.from("staff").select("id", { count: "exact", head: true }),
          admin.from("app_users").select("id", { count: "exact", head: true }).neq("role", "super_admin"),
        ]);

        return json({
          data: {
            tenants: tenants?.length ?? 0,
            activeTenants: (tenants ?? []).filter((t: any) => t.status === "ACTIVE").length,
            suspendedTenants: (tenants ?? []).filter((t: any) => t.status !== "ACTIVE").length,
            totalSeats: (tenants ?? []).reduce((s: number, t: any) => s + (t.staff_limit ?? 0), 0),
            totalStaff: staffCount ?? 0,
            totalUsers: userCount ?? 0,
          },
        });
      }

      case "tenant_stats": {
        const id = String(p.id ?? "");
        if (!id) return json({ error: "Client id required" }, 400);

        const today = new Date().toISOString().split("T")[0];
        const [
          { count: totalStaff },
          { count: activeStaff },
          { count: todayAttendance },
          { count: userCount },
        ] = await Promise.all([
          admin.from("staff").select("id", { count: "exact", head: true }).eq("tenant_id", id),
          admin.from("staff").select("id", { count: "exact", head: true }).eq("tenant_id", id).eq("status", "active"),
          admin.from("attendance").select("id", { count: "exact", head: true }).eq("tenant_id", id).eq("date", today),
          admin.from("app_users").select("id", { count: "exact", head: true }).eq("tenant_id", id),
        ]);

        return json({
          data: {
            totalStaff: totalStaff ?? 0,
            activeStaff: activeStaff ?? 0,
            todayAttendance: todayAttendance ?? 0,
            userCount: userCount ?? 0,
          }
        });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("super-admin error:", err);
    return json({ error: (err as Error).message ?? "Internal error" }, 500);
  }
});
