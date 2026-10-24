import { createBrowserClient } from "@supabase/ssr";

// ---------------------------------------------------------------------------
// Browser-safe Supabase client (used by client components, e.g. the login
// form). Uses ONLY the two public values: the project URL and the anon key.
// Both are safe to ship to the browser — the URL is just our project's
// address, and the anon key is protected by Row Level Security, so by itself
// it cannot read or write any data in our tables.
//
// createBrowserClient (from @supabase/ssr) keeps the login session in cookies
// so it also works on the server — this is the current official Supabase
// pattern for Next.js App Router.
//
// SECURITY: SUPABASE_SERVICE_ROLE_KEY must NEVER be used in this file. That
// key bypasses RLS (full database access) and belongs only in the
// server-only file src/lib/supabase/admin.js.
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Fail immediately with a helpful message if .env.local is not set up.
// The error names the VARIABLES only — it never prints their values.
const notConfigured =
  !supabaseUrl ||
  !supabaseAnonKey ||
  supabaseUrl.startsWith("REPLACE_WITH") ||
  supabaseAnonKey.startsWith("REPLACE_WITH");

if (notConfigured) {
  throw new Error(
    "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local " +
      "(values: Supabase Dashboard → Project Settings → API)."
  );
}

// One shared client for the whole app. Use it in client components with:
//   import { supabase } from "@/lib/supabase";
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
