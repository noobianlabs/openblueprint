"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ProjectView } from "@/components/ProjectView";
import type { DesignPackage, ProjectRecord } from "@/lib/design/schema";
import { decodeShare, ShareDecodeError, type SharePayload } from "@/lib/design/share";
import { makeUserRecord, saveProject } from "@/lib/store";

type State =
  | { kind: "empty" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; payload: SharePayload };

/**
 * `decodeShare` proves the payload has the right *shape* — every field is
 * present and of the right type. It cannot prove the design refers to itself
 * consistently, and a link that says "wire part `mcu1` to part `sensor9`"
 * with no `sensor9` in the parts list decodes cleanly and then blows up a
 * view. These are the cross-references the views assume.
 *
 * Deliberately narrower than the engine's `validateDesign`: that one also
 * enforces house style (10-16 parts, uppercase tags, 3-4 phases), and a
 * shared design that breaks a style rule is still perfectly renderable.
 * Rejecting it would turn a working link into a dead one.
 *
 * Returns a human-readable problem, or null if the design hangs together.
 */
function referentialProblem(pkg: DesignPackage): string | null {
  if (pkg.parts.length === 0) {
    return "This design has no parts in it, so there is nothing to show.";
  }

  const partIds = new Set(pkg.parts.map((p) => p.id));
  const pinsById = new Map(pkg.parts.map((p) => [p.id, new Set(p.pins ?? [])]));

  for (const conn of pkg.connections) {
    for (const end of [conn.from, conn.to]) {
      if (!partIds.has(end.part)) {
        return `A wire in this design connects to a part ("${end.part}") that is not in its parts list.`;
      }
      if (!pinsById.get(end.part)?.has(end.pin)) {
        return `A wire in this design lands on a pin ("${end.pin}") that part "${end.part}" does not have.`;
      }
    }
  }

  // A tree nested this deep is malformed rather than merely detailed, and
  // walking it further risks a stack overflow on a hostile link.
  const walk = (nodes: DesignPackage["assembly"], depth: number): string | null => {
    if (depth > 12) {
      return "The assembly tree in this design is nested far deeper than a real one would be.";
    }
    for (const node of nodes) {
      if (!partIds.has(node.part)) {
        return `The assembly tree names a part ("${node.part}") that is not in this design's parts list.`;
      }
      const deeper = node.children ? walk(node.children, depth + 1) : null;
      if (deeper) return deeper;
    }
    return null;
  };
  const assemblyProblem = walk(pkg.assembly, 0);
  if (assemblyProblem) return assemblyProblem;

  for (const phase of pkg.instructions) {
    for (const step of phase.steps) {
      for (const id of step.parts) {
        if (!partIds.has(id)) {
          return `An assembly step refers to a part ("${id}") that is not in this design's parts list.`;
        }
      }
    }
  }

  /* A step naming a tool that is not in tools[] is deliberately not checked:
     it renders fine and reads fine, and rejecting the link over it would kill
     a design nobody would call broken. */
  return null;
}

const BROKEN_LINK_SUFFIX =
  " The link is probably damaged, or was made by a different version of the app. Ask whoever sent it for a fresh one.";

/**
 * `/p/shared` has no id of its own — the entire design lives after the `#`
 * in the URL, decoded client-side. That fragment never reaches the server
 * (browsers don't send it), so this is unavoidably a client component that
 * reads `location.hash` after mount.
 */
export function SharedResolver() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const fragment = window.location.hash.slice(1);
    if (!fragment) {
      setState({ kind: "empty" });
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    decodeShare(fragment)
      .then((payload) => {
        if (cancelled) return;
        /* Decoding proves the shape; this proves the design refers to itself
           consistently. Without it a link that passes decoding can still take
           a view down on render. */
        const problem = referentialProblem(payload.pkg);
        if (problem) {
          setState({ kind: "error", message: problem + BROKEN_LINK_SUFFIX });
          return;
        }
        setState({ kind: "ready", payload });
      })
      .catch((err) => {
        if (cancelled) return;
        const message =
          err instanceof ShareDecodeError
            ? err.message
            : "This share link could not be read.";
        setState({ kind: "error", message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="microlabel text-ink-faint">decoding share link…</p>
      </div>
    );
  }

  if (state.kind === "empty") {
    return (
      <div className="blueprint-grid flex min-h-screen items-center justify-center px-5">
        <div className="w-full max-w-md rounded-md border border-line bg-bg-card p-6 text-center">
          <p className="microlabel mb-2 text-ink">SHARED DESIGN LINK</p>
          <p className="mb-5 text-[13px] leading-relaxed text-ink-dim">
            This page renders a design shared via a link — the whole design is
            encoded after the <span className="text-ink">#</span> in the URL,
            and nothing is uploaded anywhere. Open a link someone sent you, or
            use the Share button on any project to make one.
          </p>
          <Link href="/" className="microlabel text-accent hover:underline">
            ← back home
          </Link>
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="blueprint-grid flex min-h-screen items-center justify-center px-5">
        <div className="w-full max-w-md rounded-md border border-line bg-bg-card p-6 text-center">
          <p className="microlabel mb-2 text-ink">SHARE LINK PROBLEM</p>
          <p className="mb-5 text-[13px] leading-relaxed text-ink-dim">{state.message}</p>
          <Link href="/" className="microlabel text-accent hover:underline">
            ← back home
          </Link>
        </div>
      </div>
    );
  }

  return <SharedDesign payload={state.payload} />;
}

function SharedDesign({ payload }: { payload: SharePayload }) {
  const router = useRouter();
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const record: ProjectRecord = {
    slug: "shared",
    /* The sharer's own copy is authored "you". Rendering that verbatim would
       credit their design to whoever opens the link, so name the relationship
       instead of the person — we genuinely do not know who they are. */
    author: payload.author === "you" ? "a shared link" : payload.author,
    source: "seed",
    stars: 0,
    createdAt: new Date().toISOString(),
    cover: payload.cover,
    pkg: payload.pkg,
  };

  /* Navigating after a failed write would land on a project that does not
     exist — better to say why the copy did not happen. */
  function onCopy() {
    const copy = makeUserRecord(payload.pkg, payload.pkg.name);
    const failure = saveProject(copy);
    if (failure) {
      setCopyError(failure);
      return;
    }
    setCopyError(null);
    setCopying(true);
    router.push(`/p/${copy.slug}`);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-bg-inset px-5 py-2">
        <p className="microlabel text-ink-dim">
          Shared design — read-only. Anyone with this link can view it; nothing was
          uploaded anywhere.
        </p>
        <button
          type="button"
          onClick={onCopy}
          disabled={copying}
          className="microlabel shrink-0 rounded-sm border border-line px-3 py-1.5 text-accent hover:border-line-strong disabled:opacity-60"
          title="Save this design to my projects, editable from then on"
        >
          ⧉ {copying ? "Copied" : "Copy to my projects"}
        </button>
      </div>
      {copyError && (
        <p className="border-b border-line bg-bg-inset px-5 py-2 text-[12px] leading-relaxed text-ink-dim">
          <span className="microlabel mr-2 text-ink">NOT COPIED</span>
          {copyError}
        </p>
      )}
      <ProjectView record={record} />
    </div>
  );
}
