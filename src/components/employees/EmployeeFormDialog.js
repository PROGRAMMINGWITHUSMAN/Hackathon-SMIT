"use client";

import { useState } from "react";
import Modal from "./Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Alert from "@/components/ui/Alert";

// Create / edit employee form inside a modal.
//
// What a viewer may do depends on their role (mirrored from the API rules —
// the server enforces all of this again):
//   Admin : every field, including role, salary, and status
//   HR    : ordinary record fields only — role is fixed to employee and the
//           salary field is not even sent
// The email field is only editable when creating (changing a Supabase Auth
// email is out of scope for this phase).

export default function EmployeeFormDialog({
  mode,
  employee,
  viewerRole,
  isSelf,
  onClose,
  onSaved,
}) {
  const editing = mode === "edit";

  const [form, setForm] = useState({
    full_name: employee?.full_name ?? "",
    email: employee?.email ?? "",
    password: "",
    confirm_password: "",
    role: employee?.role ?? "employee",
    department: employee?.department ?? "",
    designation: employee?.designation ?? "",
    joined_at: employee?.joined_at ?? "",
    basic_salary: employee?.basic_salary ?? "",
    status: employee?.status ?? "active",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  function setField(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setFieldErrors({});

    // Client-side password checks (the server re-validates everything).
    if (!editing) {
      if (form.password.length < 8) {
        setFieldErrors({ password: "Password must be at least 8 characters." });
        return;
      }
      if (form.password !== form.confirm_password) {
        setFieldErrors({ confirm_password: "Passwords do not match." });
        return;
      }
    }

    setLoading(true);

    // Build the request body from ONLY the fields this viewer may send.
    // Note: confirm_password is intentionally NEVER included — it exists
    // only to catch typos in this form.
    const body = { full_name: form.full_name };
    if (!editing) {
      body.email = form.email;
      body.password = form.password;
    }
    body.department = form.department;
    body.designation = form.designation;
    body.joined_at = form.joined_at;
    if (viewerRole === "admin") {
      body.role = form.role;
      body.basic_salary = form.basic_salary;
    }
    if (editing && viewerRole === "admin" && !isSelf) {
      body.status = form.status;
    }
    if (
      editing &&
      viewerRole === "hr" &&
      employee?.role === "employee" &&
      !isSelf
    ) {
      body.status = form.status;
    }

    const url = editing ? `/api/employees/${employee.id}` : "/api/employees";
    const method = editing ? "PATCH" : "POST";

    let response;
    try {
      response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      setError("Network error — please check your connection and try again.");
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

    onSaved([data.message, ...(data.warnings ?? [])].filter(Boolean).join(" "));
  }

  const inputClass =
    "block w-full rounded-xl border border-line px-3 py-2 text-sm text-ink placeholder-muted shadow-card transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-focus/30";

  return (
    <Modal
      title={editing ? "Edit employee" : "Add employee"}
      onClose={onClose}
      wide
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error !== "" && <Alert tone="error">{error}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            id="full_name"
            label="Full name *"
            required
            value={form.full_name}
            onChange={(e) => setField("full_name", e.target.value)}
            error={fieldErrors.full_name}
            placeholder="Ayesha Khan"
          />
          <Input
            id="email"
            label="Email *"
            type="email"
            required
            disabled={editing}
            value={form.email}
            onChange={(e) => setField("email", e.target.value)}
            error={fieldErrors.email}
            placeholder="ayesha@company.com"
          />
          {!editing && (
            <Input
              id="password"
              label="Password *"
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setField("password", e.target.value)}
              error={fieldErrors.password}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          )}
          {!editing && (
            <Input
              id="confirm_password"
              label="Confirm password *"
              type="password"
              required
              value={form.confirm_password}
              onChange={(e) => setField("confirm_password", e.target.value)}
              error={fieldErrors.confirm_password}
              placeholder="Repeat the password"
              autoComplete="new-password"
            />
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="role" className="text-sm font-medium text-ink">
              Role
            </label>
            <select
              id="role"
              value={form.role}
              onChange={(e) => setField("role", e.target.value)}
              disabled={viewerRole !== "admin" || isSelf}
              className={`${inputClass} disabled:cursor-not-allowed disabled:bg-sage/40 disabled:text-muted`}
            >
              <option value="employee">Employee</option>
              <option value="hr">HR</option>
              <option value="admin">Admin</option>
            </select>
            {viewerRole !== "admin" && (
              <p className="text-xs text-muted">
                Only an Admin can assign roles.
              </p>
            )}
            {fieldErrors.role && (
              <p className="text-xs text-danger">{fieldErrors.role}</p>
            )}
          </div>
          <Input
            id="department"
            label="Department"
            value={form.department}
            onChange={(e) => setField("department", e.target.value)}
            error={fieldErrors.department}
            placeholder="Engineering"
          />
          <Input
            id="designation"
            label="Designation"
            value={form.designation}
            onChange={(e) => setField("designation", e.target.value)}
            error={fieldErrors.designation}
            placeholder="Software Engineer"
          />
          <Input
            id="joined_at"
            label="Joining date"
            type="date"
            value={form.joined_at ?? ""}
            onChange={(e) => setField("joined_at", e.target.value)}
            error={fieldErrors.joined_at}
          />
          {viewerRole === "admin" && (
            <Input
              id="basic_salary"
              label="Basic salary (PKR)"
              type="number"
              min="0"
              step="0.01"
              value={form.basic_salary ?? ""}
              onChange={(e) => setField("basic_salary", e.target.value)}
              error={fieldErrors.basic_salary}
              placeholder="80000"
            />
          )}
          {editing && !isSelf && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="status" className="text-sm font-medium text-ink">
                Status
              </label>
              <select
                id="status"
                value={form.status}
                onChange={(e) => setField("status", e.target.value)}
                disabled={
                  viewerRole === "hr" && employee?.role !== "employee"
                }
                className={inputClass}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <p className="text-xs text-muted">
                Inactive accounts cannot sign in. Records are preserved.
              </p>
            </div>
          )}
        </div>

        {!editing && (
          <Alert tone="info">
            The employee signs in with this email and password — share the
            password with them securely. It is stored only as a Supabase hash;
            the confirmation field is never sent anywhere.
          </Alert>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading
              ? "Saving…"
              : editing
                ? "Save changes"
                : "Create employee"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
