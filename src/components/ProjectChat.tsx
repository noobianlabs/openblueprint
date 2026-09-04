"use client";

import { useEffect, useRef, useState } from "react";
import type { ProjectRecord } from "@/lib/design/schema";
import { answerQuestion, applyEdit } from "@/lib/engine/edits";
import {
  appendChat,
  clearChat,
  makeMessage,
  readChat,
  writeChat,
  type ChatKind,
  type ChatMessage,
} from "@/lib/chat-store";

/**
 * Per-project chat, docked bottom-right.
 *
 * The panel is a thin shell over `edits.ts`: it decides only whether a line is
 * a QUESTION or an EDIT REQUEST, then hands the text to `answerQuestion` or
 * `applyEdit` and renders whatever comes back verbatim. Every answer and every
 * refusal is the engine's own words — nothing is softened or invented here.
 *
 * Routing is deliberately conservative. A line only reads as an edit when it
 * carries an imperative marker AND does not open like a question, so "how much
 * does it cost to add Wi-Fi" is answered rather than acted on. A question can
 * never fall through to an edit: asking must not mutate the design.
 */

/** Imperative markers — the vocabulary of asking for a change. */
const EDIT_INTENT =
  /\b(swap|switch|change|replace|convert|instead|rebuild|regenerate|upgrade|add|remove|drop|include|use)\b|\bmake it\b|\bturn it into\b/;

/**
 * Openers that mean a question even when an edit verb follows. "Can" is
 * deliberately absent: "can you add Wi-Fi" is a request, not a query.
 */
const QUESTION_OPENER =
  /^(what|which|why|how|where|when|who|does|do|did|is|are|was|will|would|should|tell me)\b/;

export function readsAsEdit(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return EDIT_INTENT.test(lower) && !QUESTION_OPENER.test(lower);
}

export function ProjectChat({
  record,
  onEdited,
}: {
  record: ProjectRecord;
  /**
   * Called with the record an edit produced. It is a NEW record under a new
   * slug when the source was a seed — seeds fork rather than change.
   */
  onEdited: (next: ProjectRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  /* localStorage is client-only, and the seed branch of /p/[slug] renders on
     the server — so the first render is always the closed pill with no log. */
  useEffect(() => {
    setMessages(readChat(record.slug));
  }, [record.slug]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, open]);

  function say(kind: ChatKind, text: string): ChatMessage[] {
    const next = appendChat(record.slug, makeMessage("assistant", kind, text));
    setMessages(next);
    return next;
  }

  function respond(text: string, isEdit: boolean) {
    try {
      if (!isEdit) {
        say("question", answerQuestion(record.pkg, text).text);
        return;
      }

      const result = applyEdit(record, text);
      if (!result.ok) {
        say("edit", result.reason);
        return;
      }

      const log = say("edit", result.description);
      // A seed edit lands on a copy under a new slug; carry the conversation
      // across so the confirmation is still there after the navigation.
      if (result.record.slug !== record.slug) writeChat(result.record.slug, log);
      onEdited(result.record);
    } catch {
      // A rebuild the engine rejects is a failed edit, not a broken page.
      say("info", "That edit did not build cleanly, so the design is unchanged. Try one of the choices listed above.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;

    const isEdit = readsAsEdit(text);
    setMessages(appendChat(record.slug, makeMessage("user", isEdit ? "edit" : "question", text)));
    setDraft("");
    setBusy(true);
    // Paint the question first: recovering a design's answer set can rebuild
    // the whole option space before the edit itself runs.
    window.setTimeout(() => respond(text, isEdit), 0);
  }

  function onClear() {
    clearChat(record.slug);
    setMessages([]);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open project chat"
        aria-expanded={false}
        className="microlabel fixed right-4 bottom-4 z-30 rounded-full border border-line-strong bg-bg-card px-4 py-2 text-ink shadow-lg hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent focus-visible:outline-none"
      >
        Chat
      </button>
    );
  }

  return (
    <section
      aria-label="Project chat"
      className="fixed right-4 bottom-4 z-30 flex max-h-[60vh] w-[360px] max-w-[calc(100vw-2rem)] flex-col rounded-md border border-line-strong bg-bg-card shadow-lg"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2">
        <p className="microlabel text-ink">Chat · {record.pkg.name}</p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear chat history"
            className="microlabel hover:text-ink focus-visible:text-accent focus-visible:outline-none"
          >
            clear
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close project chat"
            className="microlabel text-[14px] leading-none hover:text-ink focus-visible:text-accent focus-visible:outline-none"
          >
            ×
          </button>
        </div>
      </header>

      <div ref={logRef} className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <p className="px-1 py-4 text-[12px] leading-relaxed text-ink-faint">
            Ask about this design — cost, what a part does, how something is wired, what
            powers it, tools, print settings. Or ask for a change, like
            <span className="text-ink-dim"> swap to battery power</span>. Every answer is
            read out of the package on screen; anything the engine cannot do, it says so.
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={
                m.role === "user"
                  ? "self-end max-w-[90%] rounded-sm border border-line-strong bg-bg-inset px-2.5 py-1.5 text-[12px] leading-relaxed whitespace-pre-wrap break-words text-ink"
                  : "self-start max-w-full rounded-sm border border-line bg-bg-raised px-2.5 py-1.5 text-[12px] leading-relaxed whitespace-pre-wrap break-words text-ink-dim"
              }
            >
              {m.role === "assistant" && m.kind === "edit" ? (
                <span className="microlabel mb-1 block text-accent">edit</span>
              ) : null}
              {m.text}
            </div>
          ))
        )}
        {busy ? <p className="microlabel self-start text-ink-faint">working…</p> : null}
      </div>

      <form onSubmit={onSubmit} className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={busy}
          aria-label="Message this design"
          placeholder="Ask or request a change…"
          className="min-w-0 flex-1 rounded-sm border border-line bg-bg-inset px-2 py-1.5 text-[12px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || draft.trim().length === 0}
          aria-label="Send message"
          className="microlabel shrink-0 rounded-sm border border-line px-2.5 py-1.5 hover:border-line-strong hover:text-ink focus-visible:border-accent focus-visible:text-accent focus-visible:outline-none disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </section>
  );
}
