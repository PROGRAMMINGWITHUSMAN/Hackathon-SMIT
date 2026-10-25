// ---------------------------------------------------------------------------
// AI assistant capabilities — PURE functions (no I/O): the intent registry,
// input validation, and a tiny in-memory rate limiter. Unit-tested.
//
// Design rules:
//   - Every data intent declares the roles allowed to ask it. Detection
//     checks the caller's SERVER-derived role — there is no path where a
//     client-supplied role influences capability.
//   - The model never sees SQL, table names, or query rights — the route
//     resolves an intent, the server builds a minimal text context, and the
//     model only summarizes what it is given.
// ---------------------------------------------------------------------------

export const DATA_INTENTS = [
  {
    id: "org_attendance",
    label: "Organization attendance",
    roles: ["admin", "hr"],
    keywords: [
      "attendance", "absent", "absence", "present today", "who was late",
      "late today", "checked in", "check-in", "missing checkout",
    ],
    suggestions: [
      "Give me today's attendance summary",
      "How was attendance over the last working days?",
    ],
  },
  {
    id: "org_departments",
    label: "Department distribution",
    roles: ["admin", "hr"],
    keywords: [
      "departments", "department distribution", "headcount", "team size",
      "employee distribution", "per department", "department breakdown",
    ],
    suggestions: ["How are employees distributed across departments?"],
  },
  {
    id: "org_leave",
    label: "Leave overview",
    roles: ["admin", "hr"],
    keywords: ["leave requests", "pending leave", "leave balance of the team", "who is on leave", "leave summary"],
    suggestions: ["How many leave requests are pending?", "Summarize this year's leave requests"],
  },
  {
    id: "org_payroll",
    label: "Payroll summary",
    roles: ["admin", "hr"],
    keywords: ["payroll", "payslip totals", "payroll run", "net pay total", "salary total"],
    suggestions: ["What is the status of the latest payroll run?"],
  },
  {
    id: "org_audit",
    label: "Recent activity (audit)",
    roles: ["admin"],
    keywords: ["audit", "recent activity", "who approved", "who changed", "activity log"],
    suggestions: ["What administrative actions happened recently?"],
  },
  {
    id: "own_attendance",
    label: "My attendance",
    roles: ["admin", "hr", "employee"],
    keywords: ["my attendance", "my check-in", "my checkin", "was i late", "my half days", "my missing checkout", "my days present"],
    suggestions: ["How was my attendance this month?", "Was I ever late recently?"],
  },
  {
    id: "own_leave",
    label: "My leave",
    roles: ["admin", "hr", "employee"],
    keywords: [
      "my leave", "my balance", "my annual", "my sick", "my casual", "my unpaid",
      "my pending leave", "leave do i have", "days do i have", "my remaining",
    ],
    suggestions: ["How much leave do I have left?", "Do I have pending leave requests?"],
  },
  {
    id: "own_payslip",
    label: "My payslip",
    roles: ["admin", "hr", "employee"],
    keywords: [
      "my payslip", "my salary", "my net pay", "my last pay", "my deduction",
      "my latest payslip", "my pay", "payslip", "my gross",
    ],
    suggestions: ["What was my latest net pay?"],
  },
];

export const POLICY_INTENT = {
  id: "policy",
  label: "Policy & rules",
  roles: ["admin", "hr", "employee"],
  keywords: [
    "policy", "rule", "rules", "allowance", "allowances", "how many days",
    "late rule", "9:15", "09:15", "half day", "half-day", "hra", "medical",
    "gross", "formula", "payroll formula", "basic/26", "unpaid deduction",
    "weekend", "holiday", "working day", "how does", "when does", "can i",
    // Permission/rule questions are policy lookups, not data lookups —
    // phrase weight (5) beats a bare domain word like "payroll" (2), so
    // "Who can finalize payroll?" routes here instead of org_payroll.
    "who can", "who is allowed", "am i allowed", "allowed to",
    "permission", "permissions", "finalization rules", "rules for",
  ],
  suggestions: [
    "What counts as a half-day?",
    "How is unpaid leave deducted from my pay?",
    "Who can finalize payroll?",
  ],
};

// Returns the best-matching intent allowed for this role, or null when the
// question is unsupported (or the role may not ask it). Multi-word phrases
// are strong signals (weight 5); single words are weak (weight 2) — so
// "how many employees were absent" scores org_attendance via "absent"
// instead of a generic department match.
export function detectIntent(message, role) {
  const text = String(message ?? "").toLowerCase();
  const candidates = [...DATA_INTENTS, POLICY_INTENT];

  let best = null;
  let bestScore = 0;
  for (const intent of candidates) {
    if (!intent.roles.includes(role)) continue;
    let score = 0;
    for (const keyword of intent.keywords) {
      if (text.includes(keyword)) {
        score += keyword.includes(" ") ? 5 : 2;
      }
    }
    if (score > bestScore) {
      best = intent;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

// Bounded request validation. Returns { message, history } or { errors }.
export function validateChatBody(body) {
  const errors = {};

  if (
    typeof body.message !== "string" ||
    body.message.trim().length < 1 ||
    body.message.length > 500
  ) {
    errors.message = "Message must be a string of 1–500 characters.";
  }

  let history = [];
  if (body.history !== undefined) {
    if (!Array.isArray(body.history)) {
      errors.history = "history must be an array.";
    } else {
      if (body.history.length > 10) {
        errors.history = "history may contain at most 10 messages.";
      } else {
        for (const item of body.history) {
          if (
            !item ||
            typeof item !== "object" ||
            !["user", "assistant"].includes(item.role) ||
            typeof item.content !== "string" ||
            item.content.length < 1 ||
            item.content.length > 500
          ) {
            errors.history = "history entries must be {role: user|assistant, content: 1–500 chars}.";
            break;
          }
        }
        if (!errors.history) {
          history = body.history.slice(-6).map((m) => ({ role: m.role, content: m.content }));
        }
      }
    }
  }

  if (Object.keys(errors).length > 0) return { errors };
  return {
    message: body.message.trim(),
    history,
  };
}

// ---------------------------------------------------------------------------
// Tiny in-memory sliding-window rate limiter (no infrastructure). Resets
// when the server restarts; per-process — documented limitation that is
// perfectly adequate for a hackathon deployment.
// ---------------------------------------------------------------------------
export class RateLimiter {
  constructor({ windowMs = 60_000, max = 10 } = {}) {
    this.windowMs = windowMs;
    this.max = max;
    this.hits = new Map(); // key -> [timestamps]
  }

  check(key, nowMs = Date.now()) {
    const list = (this.hits.get(key) ?? []).filter(
      (t) => nowMs - t < this.windowMs
    );
    if (list.length >= this.max) {
      const retryInMs = this.windowMs - (nowMs - list[0]);
      this.hits.set(key, list);
      return { allowed: false, retryAfterSec: Math.ceil(retryInMs / 1000) };
    }
    list.push(nowMs);
    this.hits.set(key, list);
    if (this.hits.size > 5000) {
      // crude prune so the map cannot grow forever
      for (const [k, v] of this.hits) {
        if (v.every((t) => nowMs - t >= this.windowMs)) this.hits.delete(k);
      }
    }
    return { allowed: true, retryAfterSec: 0 };
  }
}
