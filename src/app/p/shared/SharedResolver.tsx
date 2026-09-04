"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ProjectView } from "@/components/ProjectView";
import type { ProjectRecord } from "@/lib/design/schema";
import { decodeShare, ShareDecodeError, type SharePayload } from "@/lib/design/share";
import { makeUserRecord, saveProject } from "@/lib/store";

type State =
  | { kind: "empty" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; payload: SharePayload };

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
        if (!cancelled) setState({ kind: "ready", payload });
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

  function onCopy() {
    const copy = makeUserRecord(payload.pkg, payload.pkg.name);
    saveProject(copy);
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
      <ProjectView record={record} />
    </div>
  );
}
