"use client";

import { useCallback, useEffect, useState } from "react";

const ROLES = [
  { id: "admin", label: "Admins" },
  { id: "hr", label: "HR" },
  { id: "employee", label: "Employees" },
];

const EMPTY_FORM = {
  title: "",
  message: "",
  audience_roles: ["admin", "hr", "employee"],
};

export default function AnnouncementCenter({ role }) {
  const canManage = role === "admin" || role === "hr";
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/announcements${canManage ? "?manage=true" : ""}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load announcements.");
      setItems(data.announcements);
    } catch {
      setError("Announcements could not be loaded. Try again.");
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  function updateAudience(roleId) {
    setForm((current) => ({
      ...current,
      audience_roles: current.audience_roles.includes(roleId)
        ? current.audience_roles.filter((item) => item !== roleId)
        : [...current.audience_roles, roleId],
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        editing ? `/api/announcements/${editing.id}` : "/api/announcements",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        setError(Object.values(data.errors ?? {}).join(" ") || data.error || "Could not save announcement.");
        return;
      }
      setNotice(data.warnings?.join(" ") || "Announcement saved.");
      setEditing(null);
      setForm(EMPTY_FORM);
      await load();
    } catch {
      setError("Network error — announcement was not confirmed as saved. Refresh before retrying.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(item, status) {
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/announcements/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update announcement.");
      setNotice(data.warnings?.join(" ") || "Announcement updated.");
      await load();
    } catch (requestError) {
      setError(requestError.message || "Network error — please try again.");
    }
  }

  async function markRead(item) {
    try {
      const response = await fetch(`/api/announcements/${item.id}/read`, { method: "POST" });
      if (!response.ok) throw new Error();
      setItems((current) => current.map((entry) =>
        entry.id === item.id ? { ...entry, is_read: true } : entry
      ));
    } catch {
      setError("Could not update read state. Try again.");
    }
  }

  function startEdit(item) {
    setEditing(item);
    setForm({
      title: item.title,
      message: item.message,
      audience_roles: item.audience_roles,
    });
    setError("");
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-ink">Announcements</h2>
        <p className="mt-1 text-sm text-muted">
          {canManage ? "Create and publish updates for active team members." : "Updates shared with your role."}
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-danger/30 bg-danger-bg p-3 text-sm text-danger" role="alert">
          {error} <button type="button" onClick={load} className="font-semibold underline">Retry</button>
        </p>
      )}
      {notice && <p className="rounded-lg border border-success/30 bg-success-bg p-3 text-sm text-success" role="status">{notice}</p>}

      {canManage && (
        <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5 shadow-card">
          <h3 className="text-base font-semibold text-ink">{editing ? "Edit announcement" : "New announcement"}</h3>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Title
            <input required minLength={3} maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="rounded-xl border border-line bg-surface px-3 py-2 font-normal focus:outline-none focus:ring-2 focus:ring-focus/30" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Message
            <textarea required maxLength={5000} rows={5} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} className="resize-y rounded-xl border border-line bg-surface px-3 py-2 font-normal focus:outline-none focus:ring-2 focus:ring-focus/30" />
          </label>
          <fieldset>
            <legend className="text-sm font-medium text-ink">Audience (active accounts only)</legend>
            <div className="mt-2 flex flex-wrap gap-4">
              {ROLES.map((entry) => (
                <label key={entry.id} className="flex items-center gap-2 text-sm text-muted">
                  <input type="checkbox" checked={form.audience_roles.includes(entry.id)} onChange={() => updateAudience(entry.id)} />
                  {entry.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? "Saving…" : editing ? "Save changes" : "Save draft"}</button>
            {editing && <button type="button" onClick={() => { setEditing(null); setForm(EMPTY_FORM); }} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button>}
          </div>
        </form>
      )}

      {loading ? (
        <p className="rounded-xl border border-line bg-surface p-6 text-center text-sm text-muted" role="status">Loading announcements…</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-muted">No announcements yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id} className={`rounded-xl border border-line bg-surface p-5 shadow-card ${item.is_read ? "" : "border-l-4 border-l-primary"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-ink">{item.title}</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted">{item.message}</p>
                  <p className="mt-3 text-xs text-muted">
                    {item.status === "published" && item.published_at
                      ? `Published ${new Date(item.published_at).toLocaleString()}`
                      : `${item.status[0].toUpperCase()}${item.status.slice(1)} · created ${new Date(item.created_at).toLocaleString()}`}
                  </p>
                </div>
                {canManage ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => startEdit(item)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium">Edit</button>
                    {item.status !== "published" && <button type="button" onClick={() => updateStatus(item, "published")} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white">Publish</button>}
                    {item.status !== "archived" && <button type="button" onClick={() => updateStatus(item, "archived")} className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium">Archive</button>}
                  </div>
                ) : (
                  !item.is_read && <button type="button" onClick={() => markRead(item)} className="shrink-0 text-sm font-medium text-primary hover:underline">Mark read</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
