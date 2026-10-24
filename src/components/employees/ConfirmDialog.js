"use client";

import Modal from "./Modal";
import Button from "@/components/ui/Button";

// Small confirmation dialog for consequential actions (deactivate /
// reactivate). The parent performs the API call; this dialog just asks.
export default function ConfirmDialog({
  title,
  message,
  confirmLabel,
  tone = "primary",
  loading = false,
  error = "",
  onConfirm,
  onClose,
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm leading-relaxed text-muted">{message}</p>
      {error !== "" && (
        <p className="mt-3 rounded-xl border border-danger/40 bg-danger-bg p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-5 flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant={tone === "danger" ? "primary" : "primary"}
          onClick={onConfirm}
          disabled={loading}
          className={tone === "danger" ? "bg-danger hover:bg-danger/90 focus-visible:ring-danger" : ""}
        >
          {loading ? "Working…" : confirmLabel}
        </Button>
    </div>
    </Modal>
  );
}
