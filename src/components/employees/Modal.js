"use client";

import { useEffect, useRef } from "react";
import { IconX } from "@/components/ui/icons";

// Shared dialog shell used by the employee dialogs (form, details, confirm).
// Bottom sheet on mobile, centered card on larger screens. Escape closes it,
// focus starts on the close button, and the backdrop is dimmed.
export default function Modal({ title, onClose, children, wide = false }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    closeButtonRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface shadow-pop sm:rounded-2xl ${
          wide ? "sm:max-w-2xl" : "sm:max-w-lg"
        }`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-muted transition hover:bg-sage/60 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <IconX className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
