"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import Alert from "@/components/ui/Alert";
import Button, { buttonClasses } from "@/components/ui/Button";

// Auth callback — where Supabase email links (invitations now; password
// resets later) land. Three jobs, in order:
//
//   1. Exchange the credential: PKCE links arrive as ?code=..., email links
//      as tokens in the URL hash (consumed automatically by the browser
//      client on startup — detectSessionInUrl).
//   2. On success: the person has a session but (after an invite) NO
//      password yet — send them to set one.
//   3. On failure: show the REAL reason in plain language (expired or
//      already-used link, etc.) with what to do next. Errors are surfaced,
//      never swallowed.
export default function AuthCallbackPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let settled = false;
    let timeoutId = null;

    function goToSetPassword() {
      if (settled) return;
      settled = true;
      router.replace("/auth/set-password");
    }

    function showError(text) {
      if (settled) return;
      settled = true;
      setErrorMessage(text);
    }

    async function run() {
      // PKCE-style links carry ?code=...
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(
          window.location.href
        );
        if (error) {
          showError(error.message);
          return;
        }
        goToSetPassword();
        return;
      }

      // Supabase already rejected the link: #error=...&error_description=...
      const hashParams = new URLSearchParams(
        window.location.hash.replace(/^#/, "")
      );
      const hashError =
        hashParams.get("error_description") || hashParams.get("error");
      if (hashError) {
        showError(hashError);
        return;
      }

      // Email links arrive as tokens in the hash (#access_token=...). The
      // @supabase/ssr browser client does NOT auto-consume these (it expects
      // PKCE ?code= links), so we parse and install them explicitly.
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          showError(error.message);
          return;
        }
        goToSetPassword();
        return;
      }

      // No code and no tokens — nothing to redeem.
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        goToSetPassword();
        return;
      }

      const { data: listener } = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_IN") goToSetPassword();
      });

      // If no session materializes, the link was empty/invalid — say so
      // honestly instead of hanging.
      timeoutId = setTimeout(() => {
        showError(
          "This link did not contain a valid sign-in session. It may have expired or already been used."
        );
      }, 5000);

      return () => listener.subscription.unsubscribe();
    }

    run();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [router]);

  if (errorMessage === "") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page px-6">
        <p className="text-sm text-muted">Finishing sign-in…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-6 py-16">
      <main className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 shadow-card">
        <h1 className="text-lg font-semibold text-ink">Link not valid</h1>
        <div className="mt-4">
          <Alert tone="error">{errorMessage}</Alert>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Invitation links can only be used once and expire after 24 hours. If
          your link has already been used or is older than that, ask your
          administrator to send a fresh invitation — or sign in if you have
          already set a password.
        </p>
        <div className="mt-6 flex items-center gap-2">
          <Link href="/login" className={buttonClasses("primary", "base")}>
            Go to sign in
          </Link>
          <Button variant="secondary" onClick={() => router.replace("/")}>
            Back to home
          </Button>
        </div>
      </main>
    </div>
  );
}
