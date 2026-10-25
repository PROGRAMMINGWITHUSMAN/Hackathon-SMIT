import AnnouncementCenter from "@/components/communications/AnnouncementCenter";
import { getCurrentUser } from "@/lib/auth";

export default async function AnnouncementsPage() {
  const { profile } = await getCurrentUser();
  return <AnnouncementCenter role={profile?.role ?? "employee"} />;
}
