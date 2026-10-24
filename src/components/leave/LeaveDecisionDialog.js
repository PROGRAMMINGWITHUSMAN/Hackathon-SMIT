"use client";

import { useState } from "react";
import Modal from "@/components/employees/Modal";
import Button from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";

// Approve/Reject dialog with an optional reviewer comment. The comment goes
// into the audit log and the employee's notification (documented behavior —
// no schema change was needed for it).
export default function LeaveDecisionDialog({
  request,
  decision, // "approve" | "reject"
  onClose,
  onDone,
}) {
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch(`/api/leaves/${request.id}/${decision}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: comment.trim() === "" ? null : comment.trim() }),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (!response || !response.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      setLoading(false);
      return;
    }
    onDone(data.message ?? "Done.");
  }

  const approving = decision === "approve";

  return (
    <Modal
      title={approving ? "Approve leave request?" : "Reject leave request?"}
      onClose={onClose}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="rounded-xl border border-line bg-page/60 p-3 text-sm text-muted">
          <p className="font-medium text-ink">
            {request.employee_name} · {request.leave_type}
          </p>
          <p className="mt-1">
            {request.start_date} → {request.end_date} · {request.days} working
            day{request.days === 1 ? "" : "s"}
            {request.reason ? ` · “${request.reason}”` : ""}
          </p>
        </div>

        {error !== "" && <Alert tone="error">{error}</Alert>}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="reviewer_comment" className="text-sm font-medium text-ink">
            Comment to the employee (optional)
          </label>
          <textarea
            id="reviewer_comment"
            rows={2}
            maxLength={500}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={
              approving ? "e.g. Enjoy your break!" : "e.g. Team crunch that week — please re-book."
            }
            className="block w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder-muted shadow-card focus:border-primary focus:outline-none focus:ring-2 focus:ring-focus/30"
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Back
          </Button>
          <Button
            type="submit"
            disabled={loading}
            className={
              approving
                ? ""
                : "bg-danger hover:bg-danger/90 focus-visible:ring-danger"
            }
          >
            {loading ? "Saving…" : approving ? "Approve" : "Reject"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
