"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { notificationHref } from "@/lib/notification-links.mjs";

export default function NotificationList() {
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (nextOffset = 0) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/notifications?limit=20&offset=${nextOffset}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load notifications.");
      setNotifications(data.notifications);
      setUnread(data.unread_count);
      setTotal(data.total);
      setOffset(nextOffset);
    } catch {
      setError("Notifications could not be loaded. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void load(0); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function markRead(id) {
    try {
      const response = await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      });
      if (!response.ok) throw new Error();
      await load(offset);
    } catch {
      setError("Could not mark notification as read. Try again.");
    }
  }

  async function markAllRead() {
    try {
      const response = await fetch("/api/notifications/read-all", { method: "POST" });
      if (!response.ok) throw new Error();
      await load(offset);
    } catch {
      setError("Could not mark notifications as read. Try again.");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Notifications</h2>
          <p className="mt-1 text-sm text-muted">{unread} unread notifications</p>
        </div>
        {unread > 0 && (
          <button type="button" onClick={markAllRead} className="text-sm font-medium text-primary hover:underline">
            Mark all as read
          </button>
        )}
      </div>
      {loading ? (
        <p className="rounded-xl border border-line bg-surface p-6 text-center text-sm text-muted" role="status">Loading notifications…</p>
      ) : error ? (
        <div className="rounded-xl border border-danger/30 bg-danger-bg p-4 text-sm text-danger" role="alert">
          {error} <button type="button" onClick={() => load(offset)} className="font-semibold underline">Retry</button>
        </div>
      ) : notifications.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-muted">You’re all caught up.</div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {notifications.map((item) => (
            <li key={item.id} className={`flex flex-wrap items-start justify-between gap-3 p-4 ${item.read_at ? "" : "bg-primary-tint/40"}`}>
              <div>
                <p className="text-sm font-semibold text-ink">
                  {notificationHref(item.title) ? (
                    <Link href={notificationHref(item.title)} className="hover:text-primary hover:underline">
                      {item.title}
                    </Link>
                  ) : item.title}
                </p>
                <p className="mt-1 text-sm text-muted">{item.body}</p>
                <time className="mt-2 block text-xs text-muted" dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
              </div>
              {!item.read_at && (
                <button type="button" onClick={() => markRead(item.id)} className="text-sm font-medium text-primary hover:underline">Mark read</button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-between">
        <button type="button" disabled={loading || offset === 0} onClick={() => load(Math.max(0, offset - 20))} className="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50">Newer</button>
        <span className="self-center text-xs text-muted">{total ? `${offset + 1}–${Math.min(offset + notifications.length, total)} of ${total}` : "0 notifications"}</span>
        <button type="button" disabled={loading || offset + notifications.length >= total} onClick={() => load(offset + 20)} className="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-50">Older</button>
      </div>
      <Link href="/dashboard" className="text-sm font-medium text-primary hover:underline">Back to dashboard</Link>
    </div>
  );
}
