import { handleLeaveReview } from "@/lib/leave-review";

// POST /api/leaves/[id]/reject — same rules as approve, delegated to the
// shared handler so the two paths can never diverge.
export async function POST(request, { params }) {
  return handleLeaveReview(request, params, "rejected");
}
