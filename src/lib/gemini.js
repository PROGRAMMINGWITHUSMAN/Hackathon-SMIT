import "server-only";
import { GoogleGenAI } from "@google/genai";

// ---------------------------------------------------------------------------
// Gemini client — SERVER ONLY (the "server-only" import makes any accidental
// Client Component import fail at build time).
//
// Security rules:
//   - The API key is read ONLY from process.env.GEMINI_API_KEY on the
//     server. It is never logged, returned, or shipped to the browser —
//     there is deliberately no NEXT_PUBLIC_GEMINI_API_KEY anywhere.
//   - Errors from the provider are mapped to SAFE client messages; raw
//     provider messages are logged server-side only (they never contain the
//     key, but we do not forward provider internals to clients either).
//
// Package/model: @google/genai (the official Google SDK, verified against
// ai.google.dev/gemini-api/docs and github.com/googleapis/js-genai) with
// `models.generateContent` — the long-stable documented text surface.
// ---------------------------------------------------------------------------

// Model choice (measured live with this project's key on 2026-10-25):
//   gemini-3.8-flash          ≈ 60s per short answer (thinking phase)
//   gemini-3.1-flash-lite     ≈ 2s  per short answer
// The assistant answers short questions over provided context, so the lite
// model is the right trade-off. thinkingBudget: 0 additionally disables the
// residual thinking phase.
export const GEMINI_MODEL = "gemini-3.1-flash-lite";

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY);
}

let cachedClient = null;

// Returns a configured client, or throws a safe, actionable error naming
// ONLY the variable (never a value).
export function getGeminiClient() {
  if (!isGeminiConfigured()) {
    throw new Error(
      "Gemini is not configured. Set GEMINI_API_KEY in .env.local (server-side only)."
    );
  }
  if (cachedClient == null) {
    cachedClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return cachedClient;
}

// Map a thrown SDK error (ApiError exposes {name, message, status}) to a
// SAFE { httpStatus, clientMessage } pair. Pure — unit-tested.
export function mapGeminiError(error) {
  const status = error?.status;

  if (status === 429) {
    return {
      httpStatus: 429,
      clientMessage:
        "Gemini is rate-limiting requests right now. Please try again in a moment.",
    };
  }
  if (status === 401 || status === 403) {
    return {
      httpStatus: 502,
      clientMessage:
        "Gemini rejected the request's credentials. Ask your administrator to check the GEMINI_API_KEY configuration.",
    };
  }
  return {
    httpStatus: 502,
    clientMessage:
      "Gemini could not process the request. Please try again later.",
  };
}

// Minimal text generation. Returns { text, model }.
// The caller decides what data may be passed here — Phase 8 Step 1 only
// ever sends synthetic connectivity-test input.
// thinkingBudget: 0 disables the model's "thinking" phase — measured 25–38s
// latency with default thinking vs. interactive speeds without it, which is
// the right trade-off for short assistant answers over provided context.
export async function geminiGenerateText(
  prompt,
  { systemInstruction, disableThinking = true } = {}
) {
  const client = getGeminiClient();
  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  });
  const text = typeof response?.text === "string" ? response.text : null;
  if (text == null) {
    throw new Error("Gemini returned no text content.");
  }
  return { text, model: GEMINI_MODEL };
}
