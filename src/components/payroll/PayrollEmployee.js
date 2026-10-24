"use client";

import Card from "@/components/ui/Card";
import RunStatusBadge from "./RunStatusBadge";

// Employee payslip view: only finalized/locked runs (the API enforces this —
// drafts never reach this list). Amounts in PKR.

const money = (n) => `PKR ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PayrollEmployee({ payslips }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-ink">
          My payslips
        </h2>
        <p className="mt-1 text-sm text-muted">
          HRA = 40% of basic · Medical = 10% · Gross = 1.5 × basic · unpaid
          leave deducted at basic ÷ 26 per working day.
        </p>
      </div>

      {payslips.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-muted">
            No payslips yet — they appear here after payroll is finalized.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {payslips.map((s) => (
            <Card key={s.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">{s.period_label}</p>
                  <p className="text-xs text-muted">Payroll {s.run_status}</p>
                </div>
                <RunStatusBadge status={s.run_status} />
              </div>

              <dl className="mt-4 divide-y divide-line text-sm">
                {[
                  ["Basic", money(s.basic)],
                  ["HRA (40%)", money(s.hra)],
                  ["Medical (10%)", money(s.medical)],
                  ["Gross", money(s.gross)],
                  [
                    `Unpaid leave (${s.unpaid_leave_days} day${s.unpaid_leave_days === 1 ? "" : "s"})`,
                    s.deduction > 0 ? `− ${money(s.deduction)}` : "—",
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between py-2">
                    <dt className="text-muted">{label}</dt>
                    <dd className="font-medium text-ink">{value}</dd>
                  </div>
                ))}
                <div className="flex items-center justify-between py-2">
                  <dt className="font-semibold text-ink">Net pay</dt>
                  <dd className="text-lg font-semibold text-primary">
                    {money(s.net_pay)}
                  </dd>
                </div>
              </dl>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
