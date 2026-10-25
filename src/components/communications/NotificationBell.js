"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { notificationHref } from "@/lib/notification-links.mjs";

function countLabel(count) {
  return count > 99 ? "99+" : String(count);
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/notifications?limit=5");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load notifications.");
      setItems(data.notifications);
      setUnread(data.unread_count);
    } catch {
      setError("Notifications could not be loaded. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = setTimeout(() => { void load(); }, 0);
    const refresh = () => load();
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, 60_000);
    return () => {
      clearTimeout(initialLoad);
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
    };
  }, [load]);

  async function markRead(id) {
    try {
      const response = await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });
      if (!response.ok) throw new Error("Could not mark notification as read.");
      await load();
    } catch {
      setError("Could not mark notification as read. Try again.");
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        aria-controls="notification-panel"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) load();
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-line text-muted transition hover:bg-page hover:text-ink focus:outline-none focus:ring-2 focus:ring-focus/30"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4a2 2 0 01-.6-1.4V11a6 6 0 00-5-5.9V4a1 1 0 00-2 0v1.1A6 6 0 006 11v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-danger px-1 text-[10px] leading-4 text-white" aria-hidden="true">
            {countLabel(unread)}
          </span>
        )}
      </button>

      {open && (
        <section
          id="notification-panel"
          aria-label="Recent notifications"
          className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Notifications</h2>
            <span className="text-xs text-muted">{unread} unread</span>
          </div>
          {loading ? (
            <p className="px-4 py-6 text-center text-sm text-muted" role="status">Loading…</p>
          ) : error ? (
            <div className="px-4 py-5 text-center">
              <p className="text-sm text-danger" role="alert">{error}</p>
              <button type="button" onClick={load} className="mt-2 text-sm font-medium text-primary hover:underline">Retry</button>
            </div>
          ) : items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">You’re all caught up.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">
              {items.map((item) => (
                <li key={item.id} className={`px-4 py-3 ${item.read_at ? "bg-surface" : "bg-primary-tint/50"}`}>
                  <p className="text-sm font-medium text-ink">
                    {notificationHref(item.title) ? (
                      <Link
                        href={notificationHref(item.title)}
                        onClick={() => setOpen(false)}
                        className="hover:text-primary hover:underline"
                      >
                        {item.title}
                      </Link>
                    ) : item.title}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{item.body}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <time className="text-[11px] text-muted" dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
                    {!item.read_at && (
                      <button type="button" onClick={() => markRead(item.id)} className="text-xs font-medium text-primary hover:underline">Mark read</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/dashboard/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-line px-4 py-3 text-center text-sm font-medium text-primary hover:bg-page"
          >
            View all notifications
          </Link>
        </section>
      )}
    </div>
  );
}
