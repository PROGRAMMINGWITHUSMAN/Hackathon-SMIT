"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Button, { buttonClasses } from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import { IconSearch, IconUsers } from "@/components/ui/icons";
import EmployeeFormDialog from "./EmployeeFormDialog";
import EmployeeDetailDialog, {
  RoleBadge,
  StatusBadge,
  initialsOf,
} from "./EmployeeDetailDialog";
import ConfirmDialog from "./ConfirmDialog";

// The employee directory. The server page passes the real employee list;
// search and filters run client-side over that data (fine at this scale),
// and every create/edit/status change goes through the API, then
// router.refresh() re-fetches fresh data on the server.

export default function EmployeesClient({
  employees,
  viewerRole,
  viewerId,
  loadFailed,
}) {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null); // employee being edited
  const [viewing, setViewing] = useState(null); // employee being inspected
  const [confirmTarget, setConfirmTarget] = useState(null); // { employee, nextStatus }
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [banner, setBanner] = useState({ tone: "success", text: "" });

  const counts = useMemo(
    () => ({
      total: employees.length,
      active: employees.filter((e) => e.status === "active").length,
      inactive: employees.filter((e) => e.status === "inactive").length,
      managers: employees.filter((e) => e.role !== "employee").length,
    }),
    [employees],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter((e) => {
      if (roleFilter !== "all" && e.role !== roleFilter) return false;
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (q !== "") {
        const haystack = `${e.full_name} ${e.email ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [employees, query, roleFilter, statusFilter]);

  async function changeStatus(employee, nextStatus) {
    setConfirmLoading(true);
    setConfirmError("");
    let response;
    try {
      response = await fetch(`/api/employees/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
    } catch {
      setConfirmError("Network error — please try again.");
      setConfirmLoading(false);
      return;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setConfirmError(data.error ?? "Something went wrong.");
      setConfirmLoading(false);
      return;
    }
    setConfirmTarget(null);
    setConfirmLoading(false);
    const statusMessage = nextStatus === "inactive"
      ? `${employee.full_name} deactivated — access disabled, records kept.`
      : `${employee.full_name} reactivated.`;
    setBanner({
      tone: nextStatus === "inactive" ? "warning" : "success",
      text: [statusMessage, ...(data.warnings ?? [])].join(" "),
    });
    router.refresh();
  }

  const selectClass =
    "rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink shadow-card focus:border-primary focus:outline-none focus:ring-2 focus:ring-focus/30";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">
            Employee directory
          </h2>
          <p className="mt-1 text-sm text-muted">
            {counts.total} {counts.total === 1 ? "person" : "people"} in your
            organization.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>Add employee</Button>
      </div>

      {banner.text !== "" && <Alert tone={banner.tone}>{banner.text}</Alert>}
      {loadFailed && (
        <Alert tone="error">
          Could not load the employee list. Refresh the page to try again.
        </Alert>
      )}

      {/* Summary cards — real counts from the database */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total employees", value: counts.total },
          { label: "Active", value: counts.active },
          { label: "Inactive", value: counts.inactive },
          { label: "Admin & HR", value: counts.managers },
        ].map((s) => (
          <Card key={s.label}>
            <p className="text-2xl font-semibold text-ink">{s.value}</p>
            <p className="mt-1 text-sm text-muted">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Toolbar: search + filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email…"
            aria-label="Search employees by name or email"
            className="w-full rounded-xl border border-line bg-surface py-2 pl-10 pr-3 text-sm text-ink placeholder-muted shadow-card focus:border-primary focus:outline-none focus:ring-2 focus:ring-focus/30"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            aria-label="Filter by role"
            className={selectClass}
          >
            <option value="all">All roles</option>
            <option value="admin">Admin</option>
            <option value="hr">HR</option>
            <option value="employee">Employee</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            className={selectClass}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Content: empty / filtered-empty / table */}
      {employees.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-sage text-primary">
              <IconUsers className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">No employees yet</p>
              <p className="mt-1 text-sm text-muted">
                Add your first team member to start the directory.
              </p>
            </div>
            <Button onClick={() => setCreating(true)}>Add employee</Button>
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm font-semibold text-ink">
              No employees match your search or filters.
            </p>
            <button
              className={`${buttonClasses("secondary", "sm")}`}
              onClick={() => {
                setQuery("");
                setRoleFilter("all");
                setStatusFilter("all");
              }}
            >
              Clear search & filters
            </button>
          </div>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-line bg-surface shadow-card md:block">
            <table className="w-full min-w-250 text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-page/60 text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className="px-4 py-3 font-medium">
                    Employee
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Department
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Designation
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Role
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Joined
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-sage/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-tint text-[11px] font-semibold text-primary">
                          {initialsOf(e.full_name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">
                            {e.full_name}
                          </p>
                          <p className="truncate text-xs text-muted">
                            {e.email ?? "—"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {e.department ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {e.designation ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <RoleBadge role={e.role} />
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {e.joined_at ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={e.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          className={`${buttonClasses("ghost", "sm")}`}
                          onClick={() => setViewing(e)}
                        >
                          View
                        </button>
                        <button
                          className={`${buttonClasses("ghost", "sm")}`}
                          onClick={() => setEditing(e)}
                        >
                          Edit
                        </button>
                        {e.id !== viewerId && (
                          <button
                            className={`${buttonClasses(
                              e.status === "active" ? "ghost" : "ghost",
                              "sm",
                            )}`}
                            onClick={() =>
                              setConfirmTarget({
                                employee: e,
                                nextStatus:
                                  e.status === "active" ? "inactive" : "active",
                              })
                            }
                          >
                            {e.status === "active"
                              ? "Deactivate"
                              : "Reactivate"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-3 md:hidden">
            {filtered.map((e) => (
              <div
                key={e.id}
                className="rounded-xl border border-line bg-surface p-4 shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-tint text-[11px] font-semibold text-primary">
                      {initialsOf(e.full_name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {e.full_name}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {e.email ?? "—"}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={e.status} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <RoleBadge role={e.role} />
                  <span className="text-xs text-muted">
                    {e.department ?? "No department"}
                  </span>
                </div>
                <div className="mt-3 flex gap-2 border-t border-line pt-3">
                  <button
                    className={`${buttonClasses("secondary", "sm")} flex-1`}
                    onClick={() => setViewing(e)}
                  >
                    View
                  </button>
                  <button
                    className={`${buttonClasses("secondary", "sm")} flex-1`}
                    onClick={() => setEditing(e)}
                  >
                    Edit
                  </button>
                  {e.id !== viewerId && (
                    <button
                      className={`${buttonClasses("ghost", "sm")} flex-1`}
                      onClick={() =>
                        setConfirmTarget({
                          employee: e,
                          nextStatus:
                            e.status === "active" ? "inactive" : "active",
                        })
                      }
                    >
                      {e.status === "active" ? "Deactivate" : "Reactivate"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Dialogs */}
      {creating && (
        <EmployeeFormDialog
          mode="create"
          viewerRole={viewerRole}
          onClose={() => setCreating(false)}
          onSaved={(message) => {
            setCreating(false);
            setBanner({
              tone: "success",
              text: message ?? "Employee created.",
            });
            router.refresh();
          }}
        />
      )}
      {editing && (
        <EmployeeFormDialog
          mode="edit"
          employee={editing}
          viewerRole={viewerRole}
          isSelf={editing.id === viewerId}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            setBanner({ tone: "success", text: message ?? "Changes saved." });
            router.refresh();
          }}
        />
      )}
      {viewing && (
        <EmployeeDetailDialog
          employee={viewing}
          viewerRole={viewerRole}
          onClose={() => setViewing(null)}
        />
      )}
      {confirmTarget && (
        <ConfirmDialog
          title={
            confirmTarget.nextStatus === "inactive"
              ? "Deactivate employee?"
              : "Reactivate employee?"
          }
          message={
            confirmTarget.nextStatus === "inactive"
              ? `${confirmTarget.employee.full_name} will no longer be able to sign in. Their records are preserved and can be reactivated later.`
              : `${confirmTarget.employee.full_name} will regain access and be able to sign in again.`
          }
          confirmLabel={
            confirmTarget.nextStatus === "inactive"
              ? "Deactivate"
              : "Reactivate"
          }
          tone={confirmTarget.nextStatus === "inactive" ? "danger" : "primary"}
          loading={confirmLoading}
          error={confirmError}
          onConfirm={() =>
            changeStatus(confirmTarget.employee, confirmTarget.nextStatus)
          }
          onClose={() => {
            setConfirmTarget(null);
            setConfirmError("");
          }}
        />
      )}
    </div>
  );
}
