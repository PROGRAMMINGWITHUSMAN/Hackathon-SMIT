"use client";

import { useState } from "react";
import Modal from "@/components/employees/Modal";
import Button from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import {
  toKarachiInputValue,
  fromKarachiInputValue,
} from "@/lib/attendance-rules.mjs";

const inputClass =
  "block w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink shadow-card transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-focus/30";

// HR/Admin correction dialog for one attendance record. The inputs show
// Karachi wall time; values are converted to UTC before PATCHing. The server
// re-validates everything, recalculates the status, and writes an audit-log
// entry with the before/after values.

export default function CorrectDialog({ record, onClose, onSaved }) {
  const [checkIn, setCheckIn] = useState(toKarachiInputValue(record.check_in));
  const [checkOut, setCheckOut] = useState(toKarachiInputValue(record.check_out));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setFieldErrors({});

    const body = {
      check_in: fromKarachiInputValue(checkIn),
      check_out: checkOut === "" ? null : fromKarachiInputValue(checkOut),
    };

    let response;
    try {
      response = await fetch(`/api/attendance/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      setError("Network error — please try again.");
      setLoading(false);
      return;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (data.errors) setFieldErrors(data.errors);
      setError(data.error ?? "Something went wrong. Please try again.");
      setLoading(false);
      return;
    }
    onSaved(data.audit_warning ?? "Correction saved — the change was written to the audit log.");
  }

  return (
    <Modal title={`Correct attendance · ${record.work_date}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error !== "" && <Alert tone="error">{error}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="correct_in" className="text-sm font-medium text-ink">
              Check-in (PKT) *
            </label>
            <input
              id="correct_in"
              type="datetime-local"
              required
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              className={inputClass}
            />
            {fieldErrors.check_in && (
              <p className="text-xs text-danger">{fieldErrors.check_in}</p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="correct_out" className="text-sm font-medium text-ink">
              Check-out (PKT)
            </label>
            <input
              id="correct_out"
              type="datetime-local"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              className={inputClass}
            />
            {fieldErrors.check_out && (
              <p className="text-xs text-danger">{fieldErrors.check_out}</p>
            )}
          </div>
        </div>

        <Alert tone="info">
          Leave check-out empty to re-open the day. The status is recalculated
          automatically (under 5 worked hours = Half-day, which also beats
          Late). The original values are preserved in the audit log.
        </Alert>

        <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Saving…" : "Save correction"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
