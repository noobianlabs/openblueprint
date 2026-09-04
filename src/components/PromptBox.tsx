"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ideaAt } from "@/lib/design/ideas";

export function PromptBox() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");

  function submit() {
    const p = prompt.trim();
    if (!p) return;
    router.push(`/new?prompt=${encodeURIComponent(p)}`);
  }

  function insertIdea() {
    setPrompt(ideaAt());
  }

  return (
    <div className="w-full max-w-2xl rounded-lg border border-line bg-bg-raised/95 p-2 shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Ask for a design… e.g. a solar-powered weather station for my balcony"
        rows={2}
        className="w-full resize-none bg-transparent px-3 py-2 text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink-faint"
      />
      <div className="flex items-center justify-between px-2 pb-1">
        <button
          type="button"
          onClick={insertIdea}
          className="microlabel rounded-sm px-2 py-1 hover:bg-bg-card hover:text-ink"
          title="Need an idea?"
        >
          ◇ idea
        </button>
        <div className="flex items-center gap-2">
          <span className="microlabel rounded-sm border border-line px-2 py-1 text-ink-faint">
            local engine
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={!prompt.trim()}
            className="rounded-sm bg-accent px-3 py-1.5 text-[12px] font-bold text-black transition-opacity disabled:opacity-30"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );
}
