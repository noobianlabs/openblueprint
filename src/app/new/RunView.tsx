"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DesignEngine, RefineQuestion } from "@/lib/engine";
import { getEngine, localEngine } from "@/lib/engine";
import { makeUserRecord, saveProject } from "@/lib/store";

const STAGES = [
  "PLANNING ARCHITECTURE…",
  "CLARIFYING DESIGN CHOICES…",
  "GENERATING ELECTRICAL DESIGN…",
  "GENERATING MECHANICAL DESIGN…",
  "DESIGN READY",
] as const;

const SUB_STATUS = [
  "matching the request to a hardware archetype",
  "waiting on your answers",
  "allocating pins and closing the nets",
  "mapping mounts, brackets, and fasteners",
  "saving to this browser",
] as const;

const OTHER = "Other…";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function RunView() {
  const router = useRouter();
  const params = useSearchParams();
  const prompt = (params.get("prompt") ?? "").trim();

  const [stage, setStage] = useState(0);
  const [decisions, setDecisions] = useState<string[]>([]);
  const [questions, setQuestions] = useState<RefineQuestion[]>([]);
  const [refineOpen, setRefineOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [otherOpen, setOtherOpen] = useState<Record<string, boolean>>({});
  const [engineLabel, setEngineLabel] = useState("local engine");
  const [error, setError] = useState<string | null>(null);

  const started = useRef(false);
  const gate = useRef<((given: Record<string, string>) => void) | null>(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const waitForRefine = useCallback(
    () => new Promise<Record<string, string>>((resolve) => (gate.current = resolve)),
    [],
  );

  const resolveRefine = useCallback((given: Record<string, string>) => {
    setRefineOpen(false);
    gate.current?.(given);
    gate.current = null;
  }, []);

  useEffect(() => {
    if (!prompt) {
      router.replace("/");
      return;
    }
    // React runs effects twice in development; a second pass here would
    // save the design under a second slug.
    if (started.current) return;
    started.current = true;

    void (async () => {
      try {
        let engine: DesignEngine = await getEngine();
        setEngineLabel(engine.label);

        /* --- 1. plan --- */
        await delay(700);
        let plan;
        try {
          plan = await engine.plan(prompt);
        } catch {
          engine = localEngine;
          setEngineLabel("local engine · fallback");
          plan = await localEngine.plan(prompt);
        }

        for (const decision of plan.decisions) {
          setDecisions((current) => [...current, decision]);
          await delay(450);
        }
        await delay(300);

        /* --- 2. clarify --- */
        setQuestions(plan.questions);
        setStage(1);
        setRefineOpen(true);
        const given = await waitForRefine();

        /* --- 3 & 4. build --- */
        setStage(2);
        await delay(900);
        let pkg;
        try {
          pkg = await engine.build(prompt, given);
        } catch {
          setEngineLabel("local engine · fallback");
          pkg = await localEngine.build(prompt, given);
        }
        setStage(3);
        await delay(1000);

        /* --- 5. hand off --- */
        setStage(4);
        const record = makeUserRecord(pkg, prompt);
        saveProject(record);
        await delay(700);
        router.replace(`/p/${record.slug}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "generation failed");
      }
    })();
  }, [prompt, router, waitForRefine]);

  function setAnswer(id: string, value: string) {
    setAnswers((current) => {
      const next = { ...current };
      if (value) next[id] = value;
      else delete next[id];
      return next;
    });
  }

  if (!prompt) return null;

  return (
    <div className="blueprint-grid flex min-h-screen flex-col">
      <style>{`
        @keyframes obp-rise {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .obp-rise { animation: obp-rise 320ms ease-out both; }
      `}</style>

      <header className="flex items-center justify-between border-b border-line px-5 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-accent text-[13px] font-extrabold text-black">
            ⌬
          </span>
          <span className="text-[13px] font-extrabold tracking-[0.18em]">OPENBLUEPRINT</span>
        </Link>
        <span className="microlabel rounded-sm border border-line px-2.5 py-1 text-ink-faint">
          {engineLabel}
        </span>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
        <div className="mb-8 flex justify-end">
          <p className="max-w-xl rounded-md rounded-tr-none border border-line-strong bg-bg-raised px-4 py-3 text-[13px] leading-relaxed">
            {prompt}
          </p>
        </div>

        {error ? (
          <div className="rounded-md border border-line bg-bg-card p-6">
            <p className="microlabel mb-2 text-ink">GENERATION FAILED</p>
            <p className="mb-4 text-[13px] text-ink-dim">{error}</p>
            <Link href="/" className="microlabel text-accent hover:underline">
              ← back home
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <section className="rounded-md border border-line bg-bg-card p-5">
              <ul className="space-y-2.5">
                {STAGES.map((label, i) => {
                  const state = i < stage ? "done" : i === stage ? "active" : "pending";
                  return (
                    <li key={label}>
                      <div className="flex items-center gap-3">
                        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                          {state === "done" ? (
                            <span className="text-[12px] text-accent">✓</span>
                          ) : state === "active" ? (
                            <span className="h-3 w-3 animate-spin rounded-full border border-line-strong border-t-accent" />
                          ) : (
                            <span className="text-[11px] text-ink-faint">○</span>
                          )}
                        </span>
                        <span
                          className={`microlabel ${
                            state === "pending"
                              ? "text-ink-faint"
                              : state === "active"
                                ? "text-ink"
                                : "text-ink-dim"
                          }`}
                        >
                          {label}
                        </span>
                      </div>
                      {state === "active" && (
                        <p className="mt-1 pl-[26px] text-[11px] text-ink-faint">{SUB_STATUS[i]}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            {decisions.length > 0 && (
              <section className="rounded-md border border-line bg-bg-card p-5">
                <p className="microlabel mb-3 text-ink-faint">DESIGN DECISIONS</p>
                <ul className="space-y-2.5">
                  {decisions.map((decision, i) => (
                    <li key={i} className="obp-rise flex gap-2.5 text-[13px] leading-relaxed text-ink-dim">
                      <span className="shrink-0 text-accent">—</span>
                      <span>{decision}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {refineOpen && (
              <section className="obp-rise rounded-md border border-line-strong bg-bg-raised p-5">
                <p className="microlabel mb-1 text-ink">REFINE_DESIGN</p>
                <p className="mb-5 text-[13px] text-ink-dim">
                  Answer to customize the hardware architecture, or skip to use defaults.
                </p>

                <div className="space-y-5">
                  {questions.map((q) => {
                    const custom = otherOpen[q.id] === true;
                    return (
                      <div key={q.id}>
                        <p className="mb-2 text-[13px] text-ink">{q.question}</p>
                        <div className="flex flex-wrap gap-2">
                          {q.options.map((option) => {
                            const selected = !custom && answers[q.id] === option;
                            return (
                              <button
                                key={option}
                                type="button"
                                onClick={() => {
                                  setOtherOpen((s) => ({ ...s, [q.id]: false }));
                                  setAnswer(q.id, selected ? "" : option);
                                }}
                                className={`rounded-sm border px-3 py-1.5 text-[12px] transition-colors ${
                                  selected
                                    ? "border-accent bg-accent/10 text-accent"
                                    : "border-line text-ink-dim hover:border-line-strong hover:text-ink"
                                }`}
                              >
                                {option}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => {
                              setOtherOpen((s) => ({ ...s, [q.id]: !custom }));
                              setAnswer(q.id, "");
                            }}
                            className={`rounded-sm border px-3 py-1.5 text-[12px] transition-colors ${
                              custom
                                ? "border-accent bg-accent/10 text-accent"
                                : "border-line text-ink-faint hover:border-line-strong hover:text-ink"
                            }`}
                          >
                            {OTHER}
                          </button>
                        </div>
                        {custom && (
                          <input
                            autoFocus
                            value={answers[q.id] ?? ""}
                            onChange={(e) => setAnswer(q.id, e.target.value)}
                            placeholder="describe what you want instead"
                            className="mt-2 w-full rounded-sm border border-line bg-bg-inset px-3 py-2 text-[12px] text-ink outline-none placeholder:text-ink-faint focus:border-line-strong"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => resolveRefine({})}
                    className="microlabel rounded-sm border border-line px-4 py-2 hover:border-line-strong hover:text-ink"
                  >
                    SKIP
                  </button>
                  <button
                    type="button"
                    onClick={() => resolveRefine(answersRef.current)}
                    className="rounded-sm bg-accent px-4 py-2 text-[11px] font-bold tracking-[0.12em] text-black uppercase"
                  >
                    GENERATE
                  </button>
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
