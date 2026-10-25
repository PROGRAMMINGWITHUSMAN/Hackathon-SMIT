"use client";

import { useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { IconSpark, IconX } from "@/components/ui/icons";

// The AI assistant chat. Session-only state (nothing is persisted); sends
// {message, history} to POST /api/ai/chat and renders the reply with
// loading / error + retry states and role-based suggested questions.

export default function AssistantChat({ role, suggestions }) {
  const [messages, setMessages] = useState([]); // {role, content}
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  async function send(text) {
    const message = (text ?? input).trim();
    if (message === "" || loading) return;

    const history = messages.slice(-6).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const nextMessages = [...messages, { role: "user", content: message }];
    setMessages(nextMessages);
    setInput("");
    setError("");
    setLoading(true);

    let response;
    try {
      response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
    } catch {
      setError("Network error — please try again.");
      setLoading(false);
      return;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "Something went wrong. Please try again.");
      setLoading(false);
      return;
    }
    setMessages([...nextMessages, { role: "assistant", content: data.reply }]);
    setLoading(false);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">
            AI assistant
          </h2>
          <p className="mt-1 text-sm text-muted">
            Ask about policies and rules{role === "employee" ? ", or your own attendance, leave and payslips" : ", your organization's summaries, or your own records"}.
            Chat history lives in this page session only.
          </p>
        </div>
      </div>

      {/* Conversation */}
      <div className="flex min-h-[280px] flex-col gap-3 rounded-xl border border-line bg-surface p-4 shadow-card">
        {messages.length === 0 && !loading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-tint text-primary">
              <IconSpark className="h-6 w-6" />
            </span>
            <p className="max-w-sm text-sm text-muted">
              Ask a question, or start with a suggestion below.
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              m.role === "user"
                ? "self-end bg-primary text-white"
                : "self-start border border-line bg-page/60 text-ink"
            }`}
          >
            {m.content}
          </div>
        ))}

        {loading && (
          <div className="self-start rounded-2xl border border-line bg-page/60 px-4 py-2.5 text-sm text-muted">
            Thinking…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error !== "" && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-danger/40 bg-danger-bg p-3 text-sm text-danger">
          <span>{error}</span>
          <button
            className="rounded-lg border border-danger/40 px-3 py-1 text-xs font-medium text-danger transition hover:bg-danger/10"
            onClick={() => send(messages[messages.length - 1]?.content)}
            disabled={loading || messages.length === 0}
          >
            Retry
          </button>
        </div>
      )}

      {/* Suggestions */}
      {messages.length === 0 && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              disabled={loading}
              className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink shadow-card transition hover:border-primary/40 hover:text-primary disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          rows={2}
          maxLength={500}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask about policies, your records, or organization summaries…"
          aria-label="Message the assistant"
          className="block flex-1 resize-none rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder-muted shadow-card focus:border-primary focus:outline-none focus:ring-2 focus:ring-focus/30"
        />
        <Button type="submit" disabled={loading || input.trim() === ""}>
          {loading ? "Sending…" : "Send"}
        </Button>
      </form>
    </div>
  );
}
