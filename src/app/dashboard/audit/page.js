import { redirect } from "next/navigation";
import AuditHistory from "@/components/communications/AuditHistory";
import { getCurrentUser } from "@/lib/auth";

export default async function AuditPage() {
  const { profile } = await getCurrentUser();
  if (profile?.role !== "admin") redirect("/dashboard");
  return <AuditHistory />;
}
