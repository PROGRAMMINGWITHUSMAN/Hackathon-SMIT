"use client";

import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Button from "@/components/ui/Button";
import { IconLogout } from "@/components/ui/icons";

// Small client component: ends the Supabase session (clears the cookies)
// and sends the user back to the login page. Behavior unchanged — only the
// styling was updated.
export default function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleSignOut}>
      <IconLogout className="h-4 w-4" />
      Sign out
    </Button>
  );
}
