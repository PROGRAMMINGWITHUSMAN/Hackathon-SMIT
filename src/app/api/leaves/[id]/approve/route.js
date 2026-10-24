import { handleLeaveReview } from "@/lib/leave-review";

// POST /api/leaves/[id]/approve — Admin/HR only, never the request's owner.
// Compare-and-swap in the data layer: an already-reviewed request → 409.
export async function POST(request, { params }) {
  return handleLeaveReview(request, params, "approved");
}
