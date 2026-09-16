// Shared caller resolution for edge functions.
// Accepts either a Supabase Auth JWT (Authorization: Bearer <jwt>) or a legacy
// app_sessions token (x-session-token), and resolves the matching app_users row.

// deno-lint-ignore-file no-explicit-any

export interface Caller {
  id: string;
  role: string;
  tenant_id: string | null;
  is_active: boolean;
}

export interface CallerResult {
  ok: boolean;
  status?: number;
  error?: string;
  caller?: Caller;
}

const USER_COLS = "id, role, is_active, tenant_id, auth_id, email";

export async function resolveCaller(admin: any, req: Request): Promise<CallerResult> {
  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const sessionToken = req.headers.get("x-session-token") ?? "";

  // A Supabase JWT always starts with "eyJ"; anything else is a legacy token.
  const jwt = bearer.startsWith("eyJ") ? bearer : (sessionToken.startsWith("eyJ") ? sessionToken : "");
  const legacyToken = !jwt && sessionToken ? sessionToken : "";

  let user: any = null;

  if (jwt) {
    const { data, error } = await admin.auth.getUser(jwt);
    const authUser = data?.user;
    if (error || !authUser) {
      return { ok: false, status: 401, error: "Invalid or expired authorization token" };
    }

    const { data: byAuthId } = await admin
      .from("app_users").select(USER_COLS).eq("auth_id", authUser.id).maybeSingle();
    user = byAuthId;

    if (!user && authUser.email) {
      const { data: byEmail } = await admin
        .from("app_users").select(USER_COLS).eq("email", authUser.email).maybeSingle();
      user = byEmail;
      if (user && !user.auth_id) {
        await admin.from("app_users").update({ auth_id: authUser.id }).eq("id", user.id);
      }
    }
  } else if (legacyToken) {
    const { data: session } = await admin
      .from("app_sessions")
      .select("user_id, role, expires_at, is_valid")
      .eq("token", legacyToken)
      .eq("is_valid", true)
      .maybeSingle();

    if (!session || new Date(session.expires_at).getTime() < Date.now()) {
      return { ok: false, status: 401, error: "Invalid or expired session" };
    }

    const { data: uRow } = await admin
      .from("app_users").select(USER_COLS).eq("id", session.user_id).maybeSingle();
    user = uRow;
  } else {
    return { ok: false, status: 401, error: "Authentication required" };
  }

  if (!user) return { ok: false, status: 403, error: "User profile not found" };
  if (!user.is_active) return { ok: false, status: 403, error: "User account is deactivated" };

  return {
    ok: true,
    caller: {
      id: user.id,
      role: user.role ?? "staff",
      tenant_id: user.tenant_id ?? null,
      is_active: !!user.is_active,
    },
  };
}

export function requireRole(caller: Caller, allowed: string[]): CallerResult {
  if (!allowed.includes(caller.role)) {
    return { ok: false, status: 403, error: "Not authorized" };
  }
  return { ok: true, caller };
}
