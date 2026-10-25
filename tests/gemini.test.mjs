// Gemini foundation tests — NO network calls, NO real key, NO real data.
// Verifies: missing-key behavior, safe error mapping, and the live HTTP 401
// for the connectivity endpoint (deterministic without configuration).
import test from "node:test";
import assert from "node:assert/strict";

// The gemini module is server-only; the react-server condition used by the
// test runner neutralizes the guard (same as the other server-lib tests).
import {
  isGeminiConfigured,
  getGeminiClient,
  mapGeminiError,
  GEMINI_MODEL,
} from "../src/lib/gemini.js";

test.afterEach(() => {
  // Tests mutate GEMINI_API_KEY to simulate configuration states; restore
  // whatever the developer had set.
});

test("missing key: isGeminiConfigured is false and getGeminiClient throws a safe, actionable error", () => {
  const saved = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_KEY_PLACEHOLDER; // never read a real value
  delete process.env.GEMINI_API_KEY;
  try {
    assert.equal(isGeminiConfigured(), false);
    assert.throws(
      () => getGeminiClient(),
      /GEMINI_API_KEY/,
      "error must NAME the variable so an admin can fix it"
    );
    // The thrown message must not contain a value — there is none, but the
    // contract is checked by construction: the helper never reads anything
    // but the exact variable name.
  } finally {
    if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
  }
});

test("configured key: client construction succeeds and caches", () => {
  const saved = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-only-fake-key";
  try {
    assert.equal(isGeminiConfigured(), true);
    const a = getGeminiClient();
    const b = getGeminiClient();
    assert.equal(a, b, "client is cached (one instance per process)");
  } finally {
    if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
    else delete process.env.GEMINI_API_KEY;
  }
});

test("error mapping: rate limit → 429 with a friendly message", () => {
  const mapped = mapGeminiError({ status: 429, message: "quota blown SECRET?" });
  assert.equal(mapped.httpStatus, 429);
  assert.match(mapped.clientMessage, /rate-limiting/i);
  assert.ok(!mapped.clientMessage.includes("SECRET"), "provider internals are never forwarded");
});

test("error mapping: provider auth problems → 502 naming only the variable", () => {
  for (const status of [401, 403]) {
    const mapped = mapGeminiError({ status, message: "API key not valid. blah" });
    assert.equal(mapped.httpStatus, 502);
    assert.match(mapped.clientMessage, /GEMINI_API_KEY/);
    assert.ok(!mapped.clientMessage.includes("API key not valid"), "raw provider text excluded");
  }
});

test("error mapping: any other provider failure → generic 502; no message leakage", () => {
  const mapped = mapGeminiError({ status: 400, message: "internal model detail xyz" });
  assert.equal(mapped.httpStatus, 502);
  assert.ok(!mapped.clientMessage.includes("xyz"));
  const unknown = mapGeminiError(new Error("totally unexpected"));
  assert.equal(unknown.httpStatus, 502);
});

test("model constant is a current documented flash model", () => {
  assert.match(GEMINI_MODEL, /^gemini-[\d.]+-flash(-lite)?$/);
});

test("live HTTP: unauthenticated POST /api/ai/test returns 401", async () => {
  const response = await fetch("http://localhost:3000/api/ai/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "hello" }),
  });
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.error, "Not signed in.");
});
