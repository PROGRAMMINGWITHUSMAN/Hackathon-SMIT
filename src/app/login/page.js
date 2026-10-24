"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Alert from "@/components/ui/Alert";
import AuthHashRedirect from "@/components/AuthHashRedirect";
import { IconGrid, IconEye, IconEyeOff, IconCheck } from "@/components/ui/icons";

// Login page — split layout: brand panel on desktop, form card always.
// The sign-in logic is unchanged: Supabase Auth checks the credentials,
// stores the session in cookies, and we redirect to /dashboard.
// There is deliberately NO sign-up here. Colors come from design tokens.

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(event) {
    // Stop the browser's default form submit (which reloads the whole page).
    event.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(
        error.message === "Invalid login credentials"
          ? "Wrong email or password. Please try again."
          : error.message
      );
      setLoading(false);
      return;
    }

    // Logged in — go to the dashboard. refresh() makes the server components
    // re-render with the fresh session cookies.
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      <AuthHashRedirect />
      {/* Brand panel — desktop only (uses the dark sidebar token). The
          headline block sits centered in the remaining space so the tall
          panel feels balanced instead of bottom-heavy. */}
      <div className="hidden w-1/2 flex-col bg-sidebar p-12 lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sage text-sidebar">
            <IconGrid className="h-4.5 w-4.5" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-white">
            HCM Lite
          </span>
        </div>

        <div className="flex flex-1 items-center">
          <div className="max-w-md">
            <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white">
              Your whole team, in one place.
            </h2>
            <ul className="mt-8 space-y-4">
              {[
                "Employees, attendance, leave, and payroll in a single dashboard",
                "Role-based access — Admin, HR, and Employee see what they should",
                "Server-side security: sessions and roles verified, never trusted from the browser",
              ].map((line) => (
                <li key={line} className="flex items-start gap-3">
                  <IconCheck className="mt-0.5 h-5 w-5 shrink-0 text-sage" />
                  <span className="flex-1 text-sm leading-relaxed text-sage/90">
                    {line}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="text-xs text-sage">HCM Lite · Saylani Hackathon 2026</p>
      </div>

      {/* Form side */}
      <div className="flex w-full items-center justify-center bg-page px-6 py-10 sm:py-16 lg:w-1/2">
        <main className="w-full max-w-md">
          <div className="rounded-2xl border border-line bg-surface p-8 shadow-card">
            <div className="flex items-center gap-2.5 lg:hidden">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
                <IconGrid className="h-4.5 w-4.5" />
              </span>
              <span className="text-sm font-semibold tracking-tight text-ink">
                HCM Lite
              </span>
            </div>

            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink lg:mt-0">
              Welcome back
            </h1>
            <p className="mt-1 text-sm text-muted">
              Use the account your administrator set up for you.
            </p>

            <form onSubmit={handleLogin} className="mt-6 flex flex-col gap-4">
              <Input
                id="email"
                label="Email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
              />

              {/* Password field built like Input, plus a show/hide button */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="password"
                  className="text-sm font-medium text-ink"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="block w-full rounded-xl border border-line px-3 py-2 pr-11 text-sm text-ink placeholder-muted shadow-card transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-focus/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-muted transition hover:text-ink"
                  >
                    {showPassword ? (
                      <IconEyeOff className="h-5 w-5" />
                    ) : (
                      <IconEye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              {error !== "" && <Alert tone="error">{error}</Alert>}

              <Button
                type="submit"
                disabled={loading}
                size="lg"
                className="w-full"
              >
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <p className="mt-6 text-center text-xs text-muted">
              No account or locked out? Ask your administrator — HCM Lite has
              no public sign-up.
            </p>
          </div>
          <p className="mt-6 text-center text-xs text-muted/80">
            Server-verified sessions · Supabase Auth
          </p>
        </main>
      </div>
    </div>
  );
}
