"use client";

import { useState } from "react";
import Modal from "@/components/employees/Modal";
import Button from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";

// Approve/Reject dialog. Decision notifications contain no free-form
// reviewer text, keeping potentially sensitive details out of messages.
export default function LeaveDecisionDialog({
  request,
  decision, // "approve" | "reject"
  onClose,
  onDone,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch(`/api/leaves/${request.id}/${decision}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (!response || !response.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      setLoading(false);
      return;
    }
    onDone([data.message ?? "Done.", ...(data.warnings ?? [])].join(" "));
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
