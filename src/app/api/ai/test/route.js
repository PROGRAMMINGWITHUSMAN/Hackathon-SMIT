import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import {
  isGeminiConfigured,
  geminiGenerateText,
  mapGeminiError,
} from "@/lib/gemini";

// ---------------------------------------------------------------------------
// POST /api/ai/test — authenticated Gemini connectivity check (Phase 8, Step 1).
//
//   - Any ACTIVE profile may call it (verified session, server-side).
//   - Body is optional and validated: { prompt } must be a string of 1–200
//     characters. When omitted, a fixed SYNTHETIC prompt is used — no HR
//     data of any kind is sent to Gemini in this step.
//   - Missing key → 503 (safe, actionable). Provider rate limit → 429.
//     Other provider failures → 502 with a generic message (details only in
//     server logs). Unexpected → 500 generic. Never a stack trace or key.
// ---------------------------------------------------------------------------

const SYNTHETIC_PROMPT =
  "This is a connectivity test. Reply with exactly: HCM Lite Gemini connection successful.";

export async function POST(request) {
  try {
    const guard = await requireApiUser(["admin", "hr", "employee"]);
    if (guard.errorResponse) return guard.errorResponse;

    let prompt = SYNTHETIC_PROMPT;
    try {
      const body = await request.json();
      if (body != null && typeof body === "object" && !Array.isArray(body)) {
        const extra = Object.keys(body).filter((k) => k !== "prompt");
        if (extra.length > 0) {
          return NextResponse.json(
            { error: `Unexpected field(s): ${extra.join(", ")}.` },
            { status: 400 }
          );
        }
        if (body.prompt !== undefined) {
          if (
            typeof body.prompt !== "string" ||
            body.prompt.trim().length < 1 ||
            body.prompt.length > 200
          ) {
            return NextResponse.json(
              { error: "prompt must be a string of 1–200 characters." },
              { status: 400 }
            );
          }
          prompt = body.prompt;
        }
      }
    } catch {
      // Empty body is fine — the synthetic prompt is the default.
    }

    if (!isGeminiConfigured()) {
      return NextResponse.json(
        {
          error:
            "AI is not configured. Ask your administrator to set GEMINI_API_KEY in .env.local.",
        },
        { status: 503 }
      );
    }

    let result;
    try {
      result = await geminiGenerateText(prompt, {
        systemInstruction:
          "You are a connectivity test endpoint. Answer briefly and never request personal data.",
      });
    } catch (error) {
      // Provider/SDK failure — log server-side only, return a safe message.
      const mapped = mapGeminiError(error);
      if (mapped.httpStatus === 500) {
        console.error("Gemini test failed:", error?.message);
      } else {
        console.error("Gemini provider error:", error?.status, error?.message);
      }
      return NextResponse.json(
        { error: mapped.clientMessage },
        { status: mapped.httpStatus }
      );
    }

    return NextResponse.json({
      ok: true,
      model: result.model,
      reply: result.text,
    });
  } catch (error) {
    console.error("POST /api/ai/test failed:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
