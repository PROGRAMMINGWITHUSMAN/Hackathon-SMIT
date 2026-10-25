import { NextResponse } from "next/server";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// getCurrentUser() — the one helper every protected page (and later, every
// protected API route) starts with. Runs ONLY on the server.
//
// Step 1 verifies the visitor's identity with Supabase (using the signed
// session cookie — the browser's claims are checked, not trusted blindly).
// Step 2 loads that person's profile (their role) from the database.
//
// SECURITY notes:
//   - The role ALWAYS comes from the `profiles` table, never from the
//     browser. A user cannot "send" themselves a different role.
//   - The profile lookup uses the server-only admin client because
//     `profiles` has RLS with zero policies — a session client could not
//     read even the user's own row. It is safe here because we only ever
//     request the single row whose id equals the VERIFIED user's id.
// ---------------------------------------------------------------------------

// React cache() makes this request-scoped: when a layout AND its page (or
// several helpers) call getCurrentUser() during one render, the underlying
// getUser() network call and profile query run ONCE. Verification strength
// is unchanged — every request still performs the full check.
export const getCurrentUser = cache(async function getCurrentUser() {
  // Step 1: who is logged in? (verified server-side by Supabase)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profile: null };
  }

  // Step 2: what is their role in our app?
  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, full_name, role, organization_id, status")
    .eq("id", user.id) // only the verified user's own row — never anyone else's
    .single();

  if (error) {
    // Logged in, but no profile row exists yet (e.g. admin bootstrap still
    // pending). Let the caller decide how to present that.
    return { user, profile: null };
  }

  // Deactivated accounts are rejected here, in one place, so every
  // protected page (and every future protected API route) denies them
  // without each caller needing its own check. Schema allows exactly
  // 'active' | 'inactive' — anything but 'active' is treated as no access.
  if (profile.status !== "active") {
    return { user, profile: null };
  }

  return { user, profile };
});

// ---------------------------------------------------------------------------
// requireApiUser(roles) — guard for Route Handlers. Verifies the caller with
// getCurrentUser(), then checks their role against the allowed list.
// Returns { user, profile } on success, or { errorResponse } with the
// correct HTTP status (401 not signed in / 403 inactive or wrong role)
// ready to be returned by the handler.
// ---------------------------------------------------------------------------
export async function requireApiUser(allowedRoles) {
  const { user, profile } = await getCurrentUser();

  if (!user) {
    return {
      errorResponse: NextResponse.json(
        { error: "Not signed in." },
        { status: 401 }
      ),
    };
  }

  if (!profile) {
    return {
      errorResponse: NextResponse.json(
        {
          error:
            "Your account is not active. Ask your administrator for access.",
        },
        { status: 403 }
      ),
    };
  }

  if (!allowedRoles.includes(profile.role)) {
    return {
      errorResponse: NextResponse.json(
        { error: "You do not have permission to do this." },
        { status: 403 }
      ),
    };
  }

  return { user, profile };
}
