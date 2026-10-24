"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import Button, { buttonClasses } from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import RunStatusBadge from "./RunStatusBadge";
import ConfirmDialog from "@/components/employees/ConfirmDialog";

// HR/Admin payroll workspace: run list, draft creation, per-run breakdown
// with totals + skipped employees, recalculate (draft), and the Admin-only
// finalize/lock actions. The API re-checks every permission and transition.

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const money = (n) => `PKR ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PayrollAdmin({ initialRuns, viewerRole, currentYear, currentMonth }) {
  const [runs, setRuns] = useState(initialRuns);
  const [detail, setDetail] = useState(null); // run detail object
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState("");
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const [confirm, setConfirm] = useState(null); // { action, run }

  async function refreshRuns() {
    const response = await fetch("/api/payroll/runs").catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (response?.ok) setRuns(data.runs ?? []);
  }

  async function createDraft() {
    setCreating(true);
    setError("");
    setBanner("");
    const response = await fetch("/api/payroll/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: Number(year), month: Number(month) }),
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (!response || !response.ok) {
      setError(data?.error ?? "Could not create the payroll run.");
      setCreating(false);
      return;
    }
    setBanner(`Draft created for ${data.run.label} (${data.totals.employees} payslip(s), ${money(data.totals.net)} net).`);
    setCreating(false);
    await refreshRuns();
    await openDetail(data.run.id);
  }

  async function openDetail(runId) {
    setLoading(true);
    setError("");
    const response = await fetch(`/api/payroll/runs/${runId}`).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (!response || !response.ok) {
      setError(data?.error ?? "Could not load the run.");
      setDetail(null);
    } else {
      setDetail(data);
    }
    setLoading(false);
  }

  async function runAction(action, runId) {
    setConfirm(null);
    setError("");
    setBanner("");
    const response = await fetch(`/api/payroll/runs/${runId}/${action}`, {
      method: "POST",
    }).catch(() => null);
    const data = response ? await response.json().catch(() => ({})) : {};
    if (!response || !response.ok) {
      setError(data?.error ?? "Action failed.");
      return;
    }
    setBanner(data.message ?? "Done.");
    await refreshRuns();
    await openDetail(runId);
  }

  const selectClass =
    "rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink shadow-card focus:border-primary focus:outline-none focus:ring-2 focus:ring-focus/30";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">
            Payroll
          </h2>
          <p className="mt-1 text-sm text-muted">
            HRA 40% · Medical 10% · Gross = 1.5 × basic · Unpaid leave
            deducted at basic ÷ 26 per working day.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            Month
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className={selectClass}
            >
              {MONTHS.map((name, i) => (
                <option key={name} value={i + 1}>{name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            Year
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className={selectClass}
            >
              {[0, 1].map((d) => {
                const y = currentYear - d;
                return <option key={y} value={y}>{y}</option>;
              })}
            </select>
          </label>
          <Button onClick={createDraft} disabled={creating}>
            {creating ? "Creating…" : "Create draft"}
          </Button>
        </div>
      </div>

      {banner !== "" && <Alert tone="success">{banner}</Alert>}
      {error !== "" && <Alert tone="error">{error}</Alert>}

      {/* Runs list */}
      {runs.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-muted">
            No payroll runs yet — create a draft for a past or current month.
          </p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line bg-page/60 text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="px-4 py-3 font-medium">Period</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Payslips</th>
                <th scope="col" className="px-4 py-3 font-medium">Gross</th>
                <th scope="col" className="px-4 py-3 font-medium">Deductions</th>
                <th scope="col" className="px-4 py-3 font-medium">Net</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {runs.map((run) => (
                <tr key={run.id} className="hover:bg-sage/20">
                  <td className="px-4 py-3 font-medium text-ink">{run.label}</td>
                  <td className="px-4 py-3"><RunStatusBadge status={run.status} /></td>
                  <td className="px-4 py-3 text-muted">{run.totals.employees}</td>
                  <td className="px-4 py-3 text-muted">{money(run.totals.gross)}</td>
                  <td className="px-4 py-3 text-muted">{money(run.totals.deduction)}</td>
                  <td className="px-4 py-3 font-medium text-ink">{money(run.totals.net)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className={buttonClasses(detail?.run?.id === run.id ? "secondary" : "ghost", "sm")}
                      onClick={() => openDetail(run.id)}
                    >
                      {loading && detail?.run?.id === run.id ? "Loading…" : "Review"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Run detail */}
      {detail && (
        <Card
          title={`${detail.run.label} — breakdown`}
          action={<RunStatusBadge status={detail.run.status} />}
        >
          {detail.payslips.length === 0 ? (
            <p className="py-4 text-sm text-muted">
              No payslips in this run — no eligible employees (active, salary
              set, joined before the period end).
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                    <th scope="col" className="py-2 pr-4 font-medium">Employee</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Basic</th>
                    <th scope="col" className="py-2 pr-4 font-medium">HRA (40%)</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Medical (10%)</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Gross</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Unpaid days</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Deduction</th>
                    <th scope="col" className="py-2 font-medium">Net pay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {detail.payslips.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2.5 pr-4 font-medium text-ink">{s.employee_name}</td>
                      <td className="py-2.5 pr-4 text-muted">{money(s.basic)}</td>
                      <td className="py-2.5 pr-4 text-muted">{money(s.hra)}</td>
                      <td className="py-2.5 pr-4 text-muted">{money(s.medical)}</td>
                      <td className="py-2.5 pr-4 text-muted">{money(s.gross)}</td>
                      <td className="py-2.5 pr-4 text-muted">{s.unpaid_leave_days}</td>
                      <td className="py-2.5 pr-4 text-danger">{s.deduction > 0 ? `− ${money(s.deduction)}` : "—"}</td>
                      <td className="py-2.5 font-semibold text-ink">{money(s.net_pay)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-line font-semibold text-ink">
                    <td className="py-2.5 pr-4">Totals</td>
                    <td colSpan={3} />
                    <td className="py-2.5 pr-4">{money(detail.totals.gross)}</td>
                    <td />
                    <td className="py-2.5 pr-4">− {money(detail.totals.deduction)}</td>
                    <td className="py-2.5">{money(detail.totals.net)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {detail.skipped.length > 0 && (
            <p className="mt-4 rounded-lg border border-dashed border-line bg-page px-3 py-2.5 text-xs text-muted">
              <span className="font-medium">Skipped (no payslip):</span>{" "}
              {detail.skipped.map((s) => `${s.name} — ${s.reason}`).join(" · ")}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            {detail.run.status === "draft" && (
              <Button variant="secondary" onClick={() => runAction("recalculate", detail.run.id)}>
                Recalculate draft
              </Button>
            )}
            {viewerRole === "admin" && detail.run.status === "draft" && (
              <Button
                onClick={() =>
                  setConfirm({
                    action: "finalize",
                    run: detail.run,
                    title: "Finalize payroll?",
                    message: `Finalizing ${detail.run.label} makes payslips visible to employees and locks editing. Recalculation will no longer be possible.`,
                    label: "Finalize",
                    tone: "primary",
                  })
                }
              >
                Finalize
              </Button>
            )}
            {viewerRole === "admin" && detail.run.status === "finalized" && (
              <Button
                onClick={() =>
                  setConfirm({
                    action: "lock",
                    run: detail.run,
                    title: "Lock payroll?",
                    message: `Locking ${detail.run.label} makes it permanently immutable. This cannot be undone.`,
                    label: "Lock",
                    tone: "danger",
                  })
                }
              >
                Lock
              </Button>
            )}
            {detail.run.status !== "draft" && viewerRole === "hr" && (
              <span className="text-xs text-muted">
                Only an Admin can finalize or lock payroll runs.
              </span>
            )}
          </div>
        </Card>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.label}
          tone={confirm.tone}
          onConfirm={() => runAction(confirm.action, confirm.run.id)}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
