"use client";

import Modal from "./Modal";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";

// Read-only employee details. Salary row is rendered for Admin viewers only
// (the API also strips it for everyone else — this is just presentation).

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-2.5 last:border-b-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium text-ink">
        {value === null || value === "" || value === undefined ? "—" : value}
      </dd>
    </div>
  );
}

export default function EmployeeDetailDialog({
  employee,
  viewerRole,
  onClose,
}) {
  return (
    <Modal title="Employee details" onClose={onClose}>
      <div className="flex items-center gap-3 border-b border-line pb-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-tint text-sm font-semibold text-primary">
          {initialsOf(employee.full_name)}
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">{employee.full_name}</p>
          <div className="mt-1 flex gap-1.5">
            <RoleBadge role={employee.role} />
            <StatusBadge status={employee.status} />
          </div>
        </div>
      </div>

      <dl className="mt-2">
        <Row label="Email" value={employee.email} />
        <Row label="Department" value={employee.department} />
        <Row label="Designation" value={employee.designation} />
        <Row label="Role" value={employee.role} />
        <Row label="Joining date" value={employee.joined_at} />
        <Row label="Status" value={employee.status} />
        {viewerRole === "admin" && (
          <Row
            label="Basic salary (PKR)"
            value={
              employee.basic_salary != null
                ? Number(employee.basic_salary).toLocaleString()
                : null
            }
          />
        )}
        <Row
          label="Added on"
          value={
            employee.created_at
              ? new Date(employee.created_at).toLocaleDateString()
              : null
          }
        />
      </dl>

      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}

export function initialsOf(fullName) {
  return (fullName ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

export function RoleBadge({ role }) {
  if (role === "admin") return <Badge tone="primary">Admin</Badge>;
  if (role === "hr") return <Badge tone="info">HR</Badge>;
  return <Badge tone="neutral">Employee</Badge>;
}

export function StatusBadge({ status }) {
  if (status === "active") return <Badge tone="success">Active</Badge>;
  return <Badge tone="danger">Inactive</Badge>;
}
