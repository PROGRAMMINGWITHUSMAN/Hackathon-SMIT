import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { isGeminiConfigured, geminiGenerateText, mapGeminiError } from "@/lib/gemini";
import {
  detectIntent,
  validateChatBody,
  RateLimiter,
} from "@/lib/ai-capabilities.mjs";
import { buildContextForIntent, POLICY_CONTEXT } from "@/lib/ai-context";

// ---------------------------------------------------------------------------
// POST /api/ai/chat — the AI assistant endpoint (Phase 8).
//
//   Auth      : any ACTIVE profile (server-verified session; role comes from
//               the database profile, never the request).
//   Body      : { message: 1–500 chars, history?: up to 10 bounded entries }.
//   Flow      : intent detection (explicit registry) →
//               unsupported        → canned answer, NO model call
//               data intent + flag OFF → privacy notice, NO model call
//               data intent + flag ON  → minimal aggregated context + model
//               policy intent     → static product-docs context + model
//   Privacy   : AI_ALLOW_HR_CONTEXT must be "true" (set by the owner after
//               accepting Gemini's data terms for their tier) before ANY
//               HR data is sent to the provider. Default: off.
//   Limits    : in-memory sliding window — 10 requests / minute / user.
//   Errors    : 400/401/429/503/502/500 — safe messages only.
// ---------------------------------------------------------------------------

const rateLimiter = new RateLimiter({ windowMs: 60_000, max: 10 });

const SYSTEM_INSTRUCTION = `You are the HCM Lite assistant, a helpful HR-operations helper.
Rules:
- Answer ONLY from the CONTEXT provided for this turn (plus the conversation so far). If the context does not contain the answer, say you don't have that information.
- Never invent numbers, names, or policies. Never request personal data.
- You cannot create, edit, approve, reject, cancel, or finalize anything — if asked, explain the user must do it in the app and who is allowed.
- Be concise (a few sentences or a short list). Plain text, no markdown tables.`;

function hrContextDisabledReply() {
  return "Data lookups are disabled until the organization approves sending HR data to the AI provider. I can still answer policy and rule questions — try asking about attendance rules, leave allowances, or the payroll formula.";
}

function unsupportedReply() {
  return "I can help with HCM Lite questions: attendance, leave, payroll policies and rules, and (depending on your role) summaries of attendance, leave, payroll and your own records. Try one of the suggested questions.";
}

export async function POST(request) {
  try {
    const guard = await requireApiUser(["admin", "hr", "employee"]);
    if (guard.errorResponse) return guard.errorResponse;
    const { profile } = guard;

    const limit = rateLimiter.check(profile.id);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: `You're sending messages too quickly — try again in ${limit.retryAfterSec}s.` },
        { status: 429 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 }
      );
    }

    const extra = Object.keys(body ?? {}).filter(
      (k) => !["message", "history"].includes(k)
    );
    if (extra.length > 0) {
      return NextResponse.json(
        { error: `Unexpected field(s): ${extra.join(", ")}.` },
        { status: 400 }
      );
    }

    const { errors, message, history } = validateChatBody(body ?? {});
    if (errors) {
      return NextResponse.json(
        { error: "Validation failed.", errors },
        { status: 400 }
      );
    }

    // --- Intent resolution (server-side role, explicit registry) ---
    const intent = detectIntent(message, profile.role);
    if (!intent) {
      return NextResponse.json({ reply: unsupportedReply(), intent: "unsupported" });
    }

    const isDataIntent = intent.id !== "policy";
    const hrContextAllowed = process.env.AI_ALLOW_HR_CONTEXT === "true";
    if (isDataIntent && !hrContextAllowed) {
      return NextResponse.json({
        reply: hrContextDisabledReply(),
        intent: intent.id,
        data_disabled: true,
      });
    }

    if (!isGeminiConfigured()) {
      return NextResponse.json(
        { error: "AI is not configured. Ask your administrator to set GEMINI_API_KEY." },
        { status: 503 }
      );
    }

    const context = isDataIntent
      ? await buildContextForIntent(intent.id, profile)
      : POLICY_CONTEXT;

    if (context === null) {
      // Role not permitted for this intent (defense in depth — detection
      // already filters by role).
      return NextResponse.json({ reply: unsupportedReply(), intent: "unsupported" });
    }

    // Compose a bounded prompt: short history + question, with the context
    // provided separately in the system instruction.
    const historyText = history
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");
    const prompt = `CONTEXT:\n${context}\n\n${historyText ? `CONVERSATION SO FAR:\n${historyText}\n\n` : ""}USER QUESTION: ${message}`;

    let result;
    try {
      result = await geminiGenerateText(prompt, {
        systemInstruction: SYSTEM_INSTRUCTION,
      });
    } catch (error) {
      const mapped = mapGeminiError(error);
      console.error("Gemini chat error:", error?.status, error?.message);
      return NextResponse.json(
        { error: mapped.clientMessage },
        { status: mapped.httpStatus }
      );
    }

    // Bound the reply size defensively.
    const reply = result.text.slice(0, 2000);
    return NextResponse.json({ reply, intent: intent.id });
  } catch (error) {
    console.error("POST /api/ai/chat failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
