"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ProjectChat } from "@/components/ProjectChat";
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
  const router = useRouter();
  const seed = getSeed(slug);
  const [mounted, setMounted] = useState(false);
  const [mine, setMine] = useState<ProjectRecord | undefined>(undefined);

  useEffect(() => {
    if (seed) return;
    setMine(getMyProject(slug));
    setMounted(true);
  }, [slug, seed]);

  /**
   * An applied edit is already persisted by the time this runs. A seed forks
   * to a copy under a new slug, so that case navigates; a design of your own
   * changes in place, and re-reading the record is enough — every tab derives
   * from `record.pkg`, so the new package propagates without a reload.
   */
  function onEdited(next: ProjectRecord) {
    if (next.slug !== slug) {
      router.push(`/p/${next.slug}`);
      return;
    }
    setMine(next);
  }

  if (seed) {
    return (
      <>
        <ProjectView record={seed} />
        <ProjectChat record={seed} onEdited={onEdited} />
      </>
    );
  }

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="microlabel text-ink-faint">loading…</p>
      </div>
    );
  }

  if (mine) {
    return (
      <>
        <ProjectView record={mine} />
        <ProjectChat record={mine} onEdited={onEdited} />
      </>
    );
  }

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
