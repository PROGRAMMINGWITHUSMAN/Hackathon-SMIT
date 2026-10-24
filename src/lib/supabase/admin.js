import "server-only";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// ⚠️ SERVER-ONLY, PRIVILEGED CLIENT — handles full database access.
//
// The "server-only" import above is a build-time tripwire: if any Client
// Component ever imports this file (directly or through another module),
// the build FAILS with a clear error instead of silently shipping the
// service-role key to browsers.
//
// This client uses SUPABASE_SERVICE_ROLE_KEY, which BYPASSES Row Level
// Security. If it ever ran in the browser, anyone could read and change
// everything. Rules:
//   1. Import this file ONLY from server code (Server Components,
//      Route Handlers) — never from a file with "use client".
//   2. Use it ONLY for the specific trusted operation that genuinely needs
//      to bypass RLS (e.g. looking up a verified user's profile row, since
//      `profiles` has RLS with zero policies).
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Admin Supabase client is not configured. Set NEXT_PUBLIC_SUPABASE_URL " +
      "and SUPABASE_SERVICE_ROLE_KEY in .env.local (server-side only)."
  );
}

export function createAdminClient() {
  return createClient(supabaseUrl, serviceRoleKey, {
    // No login session handling here — this client is not tied to a user.
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
