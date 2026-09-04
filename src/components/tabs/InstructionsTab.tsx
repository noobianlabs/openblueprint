"use client";

import { useEffect, useState } from "react";
import type { ProjectRecord, Step } from "@/lib/design/schema";
import { CATEGORY_META, partById } from "@/lib/design/schema";
import { getProgress, toggleStep } from "@/lib/progress";

export function InstructionsTab({ record }: { record: ProjectRecord }) {
  const { pkg } = record;
  const [done, setDone] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Read persisted progress after mount — the server render has no localStorage.
  useEffect(() => {
    setDone(getProgress(record.slug));
  }, [record.slug]);

  function check(stepId: string) {
    setDone(toggleStep(record.slug, stepId));
  }

  function toggleDetail(stepId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  }

  /** Count only ids that still exist in the package, so stale storage can't inflate it. */
  const countDone = (steps: Step[]) => steps.filter((s) => done.has(s.id)).length;
  const allSteps = pkg.instructions.flatMap((phase) => phase.steps);

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <h1 className="microlabel text-ink">Instructions</h1>
        <p className="microlabel text-ink-faint">
          {countDone(allSteps)}/{allSteps.length} done
        </p>
      </div>

      <section className="mt-6 rounded-md border border-line bg-bg-card p-4">
        <p className="microlabel">Tools &amp; assumptions</p>
        <div className="mt-3 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="microlabel text-ink-faint">Tools</p>
            <ul className="mt-2 space-y-1">
              {pkg.tools.map((tool) => (
                <li key={tool} className="text-[12px] text-ink-dim">
                  ⛭ {tool}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="microlabel text-ink-faint">Assumptions</p>
            <ul className="mt-2 space-y-1">
              {pkg.assumptions.map((a) => (
                <li key={a} className="text-[12px] text-ink-dim">
                  — {a}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {pkg.instructions.map((phase, i) => (
        <section key={phase.id} className="mt-8">
          <div className="flex items-baseline justify-between border-b border-line pb-2">
            <h2 className="text-[13px] font-bold tracking-[0.08em] uppercase">
              {i + 1}. {phase.title}
            </h2>
            <span className="microlabel text-ink-faint">
              {countDone(phase.steps)}/{phase.steps.length}
            </span>
          </div>

          <ul>
            {phase.steps.map((step) => {
              const checked = done.has(step.id);
              const isOpen = expanded.has(step.id);
              return (
                <li key={step.id} className="border-b border-line py-3">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => check(step.id)}
                    className="flex min-h-10 w-full items-start gap-3 py-1 text-left"
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] border text-[10px] ${
                        checked
                          ? "border-accent text-accent"
                          : "border-line-strong text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    <span className="microlabel w-8 shrink-0 text-ink-faint">{step.id}</span>
                    <span
                      className={`flex-1 text-[13px] ${
                        checked ? "text-ink-faint line-through" : "font-bold text-ink"
                      }`}
                    >
                      {step.title}
                    </span>
                  </button>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[4.5rem]">
                    {step.tools.map((tool) => (
                      <span
                        key={tool}
                        className="rounded-sm border border-line px-2 py-0.5 text-[10px] tracking-[0.08em] text-ink-faint uppercase"
                      >
                        {tool}
                      </span>
                    ))}
                    {step.parts.map((partId) => {
                      const part = partById(pkg, partId);
                      return (
                        <span
                          key={partId}
                          className="cat-chip"
                          style={
                            part
                              ? { ["--chip-color" as string]: CATEGORY_META[part.category].color }
                              : undefined
                          }
                        >
                          {part ? part.name : partId}
                        </span>
                      );
                    })}
                  </div>

                  <div className="pl-[4.5rem]">
                    <button
                      type="button"
                      onClick={() => toggleDetail(step.id)}
                      aria-expanded={isOpen}
                      className="microlabel mt-2 inline-flex min-h-10 items-center text-ink-faint hover:text-ink"
                    >
                      {isOpen ? "hide details ▴" : "view details ▾"}
                    </button>
                    {isOpen && (
                      <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-ink-dim">
                        {step.detail}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
