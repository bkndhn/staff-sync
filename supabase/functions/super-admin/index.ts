// Super Admin control plane.
// Handles multi-client (tenant) onboarding and management.
// All requests must carry a valid app_sessions token belonging to a
// user whose role is `super_admin`.
//
// POST /functions/v1/super-admin
// Headers: { 'x-session-token': '<token>' }
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
    const token = req.headers.get("x-session-token");
    if (!token) return json({ error: "Missing session token" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: session } = await admin
      .from("app_sessions")
      .select("user_id, expires_at, is_valid")
      .eq("token", token)
      .eq("is_valid", true)
      .maybeSingle();

    if (!session || new Date(session.expires_at).getTime() < Date.now()) {
      return json({ error: "Invalid or expired session" }, 401);
    }

    const { data: me } = await admin
      .from("app_users")
      .select("id, email, role, is_active, super_admin_role")
      .eq("id", session.user_id)
      .maybeSingle();

    if (!me || !me.is_active || me.role !== "super_admin") {
      return json({ error: "Super admin access required" }, 403);
    }
    
    const saRole = me.super_admin_role || "owner"; // default to owner if null

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

        return json({ data: tenants ?? [] });
      }

      case "create_tenant": {
        if (saRole !== "owner") {
          return json({ error: "Only owners can onboard new clients" }, 403);
        }
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
          const { data: created, error: uErr } = await admin
            .from("app_users")
            .insert({
              email: String(p.admin_email).trim().toLowerCase(),
              password_hash: await bcrypt.hash(pwd, 10),
              full_name: String(p.admin_full_name ?? `${name} Admin`),
              role: "admin",
              is_active: true,
              tenant_id: tenant.id,
            })
            .select("id, email, full_name, role, is_active, tenant_id")
            .single();
          if (uErr) return json({ error: `Client created but admin failed: ${uErr.message}`, data: tenant }, 400);
          adminUser = created;
        }

        await logAudit(
          admin, 
          tenant.id, 
          "settings_update", 
          `Tenant ${name} created`, 
          me.email, 
          null, 
          null, 
          tenant
        );

        return json({ data: { tenant, adminUser } });
      }

      case "update_tenant": {
        const id = String(p.id ?? "");
        if (!id) return json({ error: "Client id required" }, 400);
        
        // RBAC Checks for updating tenant
        if (saRole === "support") {
          // Support can only toggle status and staff portal
          if (p.name !== undefined || p.plan !== undefined || p.staff_limit !== undefined || p.slug !== undefined) {
            return json({ error: "Support admins cannot modify plan, limit, or core client details" }, 403);
          }
        }
        if (saRole === "billing") {
          // Billing can only modify plan, staff_limit, and contact info, not status or staff portal
          if (p.status !== undefined || p.staff_portal_enabled !== undefined) {
            return json({ error: "Billing admins cannot suspend clients or modify portal access" }, 403);
          }
        }

        const patch: Record<string, unknown> = {};
        for (const k of ["name", "plan", "contact_name", "contact_email", "contact_phone", "notes"]) {
          if (p[k] !== undefined) patch[k] = p[k];
        }
        if (p.staff_portal_enabled !== undefined) patch.staff_portal_enabled = !!p.staff_portal_enabled;
        if (p.slug !== undefined) patch.slug = p.slug ? slugify(String(p.slug)) : null;
        if (p.status !== undefined) patch.status = String(p.status).toUpperCase();
        if (p.staff_limit !== undefined) patch.staff_limit = Math.max(1, Number(p.staff_limit));

        const { data: beforeData } = await admin.from("tenants").select("*").eq("id", id).single();
        const { data, error } = await admin.from("tenants").update(patch).eq("id", id).select().single();
        if (error) return json({ error: error.message }, 400);

        await logAudit(
          admin,
          id,
          "settings_update",
          `Tenant ${data.name} updated`,
          me.email,
          null,
          beforeData,
          data
        );

        return json({ data });
      }

      case "delete_tenant": {
        if (saRole !== "owner") {
          return json({ error: "Only owners can delete clients" }, 403);
        }
        const id = String(p.id ?? "");
        if (!id) return json({ error: "Client id required" }, 400);
        if (!p.confirm) return json({ error: "Confirmation required" }, 400);

        // Remove all tenant-scoped data, then users, then the tenant itself.
        for (const table of TENANT_TABLES) {
          const { error } = await admin.from(table).delete().eq("tenant_id", id);
          if (error && !/does not exist/i.test(error.message)) {
            return json({ error: `Failed clearing ${table}: ${error.message}` }, 400);
          }
        }
        await admin.from("app_users").delete().eq("tenant_id", id);
        const { data: beforeData } = await admin.from("tenants").select("*").eq("id", id).single();
        const { error } = await admin.from("tenants").delete().eq("id", id);
        if (error) return json({ error: error.message }, 400);

        // Can't reliably log to audit_logs if tenant is deleted (tenant_id foreign key),
        // so we skip audit log for tenant deletion for now, or log to a platform-level audit table.

        return json({ data: { deleted: id } });
      }



      /* Client user management intentionally lives inside each client's own
         admin app — the platform console never reads client user data. */

      /* ---------------- Platform overview ---------------- */
      case "overview": {
        const { data: tenants } = await admin.from("tenants").select("id, status, staff_limit");
        
        return json({
          data: {
            tenants: tenants?.length ?? 0,
            activeTenants: (tenants ?? []).filter((t: any) => t.status === "ACTIVE").length,
            suspendedTenants: (tenants ?? []).filter((t: any) => t.status !== "ACTIVE").length,
            totalSeats: (tenants ?? []).reduce((s: number, t: any) => s + (t.staff_limit ?? 0), 0),
          },
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
