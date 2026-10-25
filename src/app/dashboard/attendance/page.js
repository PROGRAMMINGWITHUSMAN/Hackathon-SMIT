import { getCurrentUser } from "@/lib/auth";
import AttendanceEmployee from "@/components/attendance/AttendanceEmployee";
import AttendanceAdmin from "@/components/attendance/AttendanceAdmin";
import Card from "@/components/ui/Card";
import Alert from "@/components/ui/Alert";
import { karachiDateString } from "@/lib/attendance-rules.mjs";
import {
  getAttendanceHistory,
  getEmployeeDay,
  getOrgDayView,
} from "@/lib/attendance";

// Server Component — role decides the view. Employees see only their own
// data (the API enforces the same for direct calls); Admin/HR get the
// organization day view. All times/decisions are computed on the server.

export default async function AttendancePage() {
  // Layout guarantees a verified user with an active profile.
  const { profile } = await getCurrentUser();

  const today = karachiDateString(new Date());

  // Fetch first (try/catch around data only), build JSX afterwards.
  let day = null;
  let history = null;
  let view = null;
  let loadError = false;
  try {
    if (profile.role === "employee") {
      [day, history] = await Promise.all([
        getEmployeeDay(profile.organization_id, profile.id, today),
        getAttendanceHistory(profile.organization_id, profile.id, null, today),
      ]);
    } else {
      view = await getOrgDayView(profile.organization_id, today);
    }
  } catch (error) {
    console.error("Attendance page failed to load:", error);
    loadError = true;
  }

  let content;
  if (loadError) {
    content = (
      <Card>
        <Alert tone="error">
          Could not load attendance. Refresh the page to try again.
        </Alert>
      </Card>
    );
  } else if (profile.role === "employee") {
    content = <AttendanceEmployee today={day} history={history} />;
  } else {
    content = <AttendanceAdmin initial={view} today={today} />;
  }

  return content;
}
