"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProjectView } from "@/components/ProjectView";
import type { ProjectRecord } from "@/lib/design/schema";
import { getSeed } from "@/lib/design/seeds";
import { getMyProject } from "@/lib/store";

/**
 * Seeds are static, so they render on the server and the client alike.
 * Anything else lives in localStorage, which cannot be read until after
 * mount — hence the loading beat.
 */
export function ProjectResolver({ slug }: { slug: string }) {
  const seed = getSeed(slug);
  const [mounted, setMounted] = useState(false);
  const [mine, setMine] = useState<ProjectRecord | undefined>(undefined);

  useEffect(() => {
    if (seed) return;
    setMine(getMyProject(slug));
    setMounted(true);
  }, [slug, seed]);

  if (seed) return <ProjectView record={seed} />;

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="microlabel text-ink-faint">loading…</p>
      </div>
    );
  }

  if (mine) return <ProjectView record={mine} />;

  return (
    <div className="blueprint-grid flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-md rounded-md border border-line bg-bg-card p-6 text-center">
        <p className="microlabel mb-2 text-ink">NO SUCH DESIGN</p>
        <p className="mb-5 text-[13px] leading-relaxed text-ink-dim">
          Nothing is stored under <span className="text-ink">/p/{slug}</span> in this
          browser. Designs are saved locally, so a link from another device or a
          cleared cache will land here.
        </p>
        <Link href="/" className="microlabel text-accent hover:underline">
          ← back home
        </Link>
      </div>
    </div>
  );
}
