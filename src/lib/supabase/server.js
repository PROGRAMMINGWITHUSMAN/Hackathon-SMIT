import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// ---------------------------------------------------------------------------
// Supabase client for SERVER code (Server Components and Route Handlers).
// Reads the login session from Next.js cookies. Never imported by a client
// component — `next/headers` only exists on the server.
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
  );
}

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // That's fine — session refresh is handled by src/middleware.js.
        }
      },
    },
  });
}
