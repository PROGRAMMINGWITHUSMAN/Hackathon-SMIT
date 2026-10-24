"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Alert from "@/components/ui/Alert";

// Set password — the second step of the invitation flow. The person just
// accepted their invite and has a session but no password; here they create
// one for future sign-ins. Requires an active session: without one you are
// sent to /login (this page can only ever change the CURRENT user's
// password — never anyone else's).
export default function SetPasswordPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // Must already be signed in (via the invitation link).
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/login");
      } else {
        setEmail(data.session.user.email ?? "");
      }
    });
  }, [router]);

  async function handleSetPassword(event) {
    event.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page px-6 py-16">
        <main className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
          <h1 className="text-lg font-semibold text-ink">Password saved</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            You can now sign in with your email and new password.{" "}
            {email !== "" ? `( ${email} )` : ""}
          </p>
          <div className="mt-6">
            <Button onClick={() => router.replace("/dashboard")}>
              Continue to HCM Lite
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-6 py-16">
      <main className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          One last step
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
          Set your password
        </h1>
        <p className="mt-1 text-sm text-muted">
          {email !== ""
            ? `Choose a password for ${email}. You'll use it to sign in next time.`
            : "Choose a password to sign in with next time."}
        </p>

        <form onSubmit={handleSetPassword} className="mt-6 flex flex-col gap-4">
          {error !== "" && <Alert tone="error">{error}</Alert>}

          <Input
            id="new_password"
            label="New password *"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
            autoComplete="new-password"
          />
          <Input
            id="confirm_password"
            label="Confirm password *"
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat your password"
            autoComplete="new-password"
          />

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? "Saving…" : "Save password"}
          </Button>
        </form>
      </main>
    </div>
  );
}
