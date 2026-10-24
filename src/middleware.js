import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// ---------------------------------------------------------------------------
// Middleware — runs on the server BEFORE the matched pages load. Two jobs:
//
//   1. Refresh the login session cookies when they get old (Supabase tokens
//      expire; this quietly swaps in fresh ones).
//   2. Gate pages: /dashboard requires a logged-in user; /login is pointless
//      when you are already logged in.
//
// Note: this is a convenience gate + cookie refresh. The REAL authorization
// check still happens in the page/route handler itself (see src/lib/auth.js).
// ---------------------------------------------------------------------------

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
  );
}

export async function middleware(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // New cookies must be written to BOTH the incoming request (so this
        // request sees them) and the outgoing response (so the browser
        // stores them). This is the pattern from the official Supabase docs.
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // getUser() checks the session against Supabase's server — it does not
  // trust what the cookie claims without verifying it.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (!user && path.startsWith("/dashboard")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  if (user && path === "/login") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

// Only run on pages that need it — not on every static file.
export const config = {
  matcher: ["/login", "/dashboard/:path*"],
};
