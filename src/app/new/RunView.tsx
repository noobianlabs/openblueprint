"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DesignEngine, RefineQuestion } from "@/lib/engine";
import { getEngine, localEngine, resetEngineProbe, validateDesign } from "@/lib/engine";
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

/* An engine call that never settles is the worst failure mode here: the
   spinner turns forever and the user has nothing to act on. Both calls are
   bounded, and a timeout is treated like any other engine failure. */
const PLAN_TIMEOUT_MS = 45_000;
const BUILD_TIMEOUT_MS = 120_000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class TimeoutError extends Error {
  constructor(what: string, ms: number) {
    super(`${what} did not answer within ${Math.round(ms / 1000)}s`);
    this.name = "TimeoutError";
  }
}

function withTimeout<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new TimeoutError(what, ms)), ms);
    }),
  ]).finally(() => clearTimeout(timer)) as Promise<T>;
}

interface RunFailure {
  /** Headline for the card, e.g. "GENERATION FAILED". */
  title: string;
  message: string;
  /** Extra lines — validation problems, or the underlying engine message. */
  details?: string[];
  /** Storage failures do not get fixed by generating again; say so. */
  retryHint?: string;
}

/** Short, human phrasing for whatever the engine threw. */
function describeEngineError(err: unknown): { message: string; details?: string[] } {
  if (err instanceof TimeoutError) {
    return {
      message:
        "The design engine stopped responding, and the local fallback did not finish either. This is usually a slow or dropped connection.",
      details: [err.message],
    };
  }
  if (err instanceof Error) {
    return {
      message: "The design engine could not complete this request.",
      details: [err.message],
    };
  }
  return { message: "The design engine could not complete this request." };
}

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
  const [failure, setFailure] = useState<RunFailure | null>(null);
  /* Bumped by Retry. The pipeline effect keys off it, so a retry is a real
     second run rather than a reload of a page that already failed. */
  const [attempt, setAttempt] = useState(0);

  const startedFor = useRef(-1);
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
    // save the design under a second slug. Keyed by attempt so Retry, which
    // is a deliberate second run, still gets through.
    if (startedFor.current === attempt) return;
    startedFor.current = attempt;

    /* A superseded run must not write state or navigate underneath the run
       that replaced it. Liveness is read off the ref rather than a closure
       flag cleared on unmount: React's development double-invoke unmounts
       and remounts this effect, and a cleanup-based flag would kill the only
       run that ever starts, leaving the spinner turning forever. */
    const runId = attempt;
    const live = () => startedFor.current === runId;

    void (async () => {
      try {
        let engine: DesignEngine = await getEngine();
        if (!live()) return;
        setEngineLabel(engine.label);

        /* --- 1. plan --- */
        await delay(700);
        let plan;
        try {
          plan = await withTimeout(engine.plan(prompt), PLAN_TIMEOUT_MS, engine.label);
        } catch {
          // Whatever went wrong upstream — no key, a 500, a stalled request —
          // the local engine can always answer.
          engine = localEngine;
          if (!live()) return;
          setEngineLabel("local engine · fallback");
          plan = await withTimeout(localEngine.plan(prompt), PLAN_TIMEOUT_MS, "local engine");
        }
        if (!live()) return;

        for (const decision of plan.decisions) {
          setDecisions((current) => [...current, decision]);
          await delay(450);
          if (!live()) return;
        }
        await delay(300);
        if (!live()) return;

        /* --- 2. clarify --- */
        setQuestions(plan.questions);
        setStage(1);
        setRefineOpen(true);
        const given = await waitForRefine();
        if (!live()) return;

        /* --- 3 & 4. build --- */
        setStage(2);
        await delay(900);
        if (!live()) return;
        let pkg;
        try {
          pkg = await withTimeout(engine.build(prompt, given), BUILD_TIMEOUT_MS, engine.label);
        } catch {
          if (!live()) return;
          setEngineLabel("local engine · fallback");
          pkg = await withTimeout(
            localEngine.build(prompt, given),
            BUILD_TIMEOUT_MS,
            "local engine",
          );
        }
        if (!live()) return;

        /* A package that does not hold together would render as broken tabs
           rather than as a design, so it is rejected here. The local engine
           gets one chance to answer in its place before we give up. */
        let issues = validateDesign(pkg);
        if (issues.length && engine.id !== "local") {
          setEngineLabel("local engine · fallback");
          pkg = await withTimeout(
            localEngine.build(prompt, given),
            BUILD_TIMEOUT_MS,
            "local engine",
          );
          if (!live()) return;
          issues = validateDesign(pkg);
        }
        if (issues.length) {
          setFailure({
            title: "DESIGN FAILED ITS OWN CHECKS",
            message:
              "The generated design did not hold together — parts, wiring, and assembly did not agree — so it was not saved. Generating again usually produces a sound one.",
            details: issues.slice(0, 5),
          });
          return;
        }

        setStage(3);
        await delay(1000);
        if (!live()) return;

        /* --- 5. hand off --- */
        setStage(4);
        const record = makeUserRecord(pkg, prompt);
        const storageFailure = saveProject(record);
        if (!live()) return;
        if (storageFailure) {
          // Navigating now would land on a project that was never written.
          setFailure({
            title: "DESIGN COULD NOT BE SAVED",
            message: `The design was generated, but this browser would not store it. ${storageFailure}`,
            retryHint: "Generating again will hit the same limit — free up space first.",
          });
          return;
        }
        await delay(700);
        if (!live()) return;
        router.replace(`/p/${record.slug}`);
      } catch (err) {
        if (!live()) return;
        const { message, details } = describeEngineError(err);
        setFailure({ title: "GENERATION FAILED", message, details });
      }
    })();
  }, [prompt, router, waitForRefine, attempt]);

  /** Start the whole run over from a clean slate. */
  function retry() {
    // A probe that failed once is cached; forget it so the retry can reach
    // the Claude engine again.
    resetEngineProbe();
    gate.current = null;
    setFailure(null);
    setStage(0);
    setDecisions([]);
    setQuestions([]);
    setAnswers({});
    setOtherOpen({});
    setRefineOpen(false);
    setEngineLabel("local engine");
    setAttempt((n) => n + 1);
  }

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

        {failure ? (
          <div className="rounded-md border border-line bg-bg-card p-6">
            <p className="microlabel mb-2 text-ink">{failure.title}</p>
            <p className="mb-4 text-[13px] leading-relaxed text-ink-dim">{failure.message}</p>
            {failure.details && failure.details.length > 0 && (
              <ul className="mb-4 space-y-1.5">
                {failure.details.map((line, i) => (
                  <li key={i} className="flex gap-2 font-mono text-[11px] break-words text-ink-faint">
                    <span className="shrink-0">—</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            )}
            {failure.retryHint && (
              <p className="mb-4 text-[12px] text-ink-faint">{failure.retryHint}</p>
            )}
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={retry}
                className="microlabel rounded-sm border border-line px-3 py-1.5 text-accent hover:border-line-strong"
              >
                ↻ Try again
              </button>
              <Link href="/" className="microlabel text-ink-faint hover:text-ink">
                ← back home
              </Link>
            </div>
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
