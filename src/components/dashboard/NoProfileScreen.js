import SignOutButton from "@/app/dashboard/signout-button";

// Terminal screen for signed-in visitors who have no active HCM profile
// (bootstrap still pending, or the account was deactivated). Shared by the
// dashboard pages so the message stays identical everywhere.
export default function NoProfileScreen({ email }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-6 py-16">
      <main className="w-full max-w-md rounded-2xl border border-warning/40 bg-warning-bg p-8 text-center shadow-card">
        <h1 className="text-lg font-semibold text-warning">
          Account not set up yet
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-warning">
          You are signed in as <span className="font-medium">{email}</span>,
          but this account has no active HCM Lite profile — either setup is
          still pending or the account has been deactivated. Ask your
          administrator (see <code>supabase/bootstrap-admin.sql</code>).
        </p>
        <div className="mt-6">
          <SignOutButton />
        </div>
      </main>
    </div>
  );
}
