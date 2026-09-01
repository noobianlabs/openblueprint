import Link from "next/link";
import type { ProjectRecord } from "@/lib/design/schema";
import { partCount } from "@/lib/design/schema";
import { HeroShot } from "@/components/art/HeroShot";

export function ProjectCard({ project }: { project: ProjectRecord }) {
  return (
    <Link
      href={`/p/${project.slug}`}
      className="group overflow-hidden rounded-md border border-line bg-bg-card transition-colors hover:border-line-strong"
    >
      {/* The cover is a render of this project's own massing model, on the
          gradient it always had. Until that render lands — and forever, without
          WebGL — the glyph cover shows instead. */}
      <HeroShot record={project} variant="card" className="blueprint-grid h-36" />
      <div className="space-y-1.5 border-t border-line p-3">
        <p className="truncate text-[12px] font-bold tracking-[0.08em] uppercase">
          {project.pkg.name}
        </p>
        {/* A long author name must shorten itself rather than wrap the whole
            meta line — the counts before it are fixed-width and should hold. */}
        <p className="microlabel flex items-center gap-2 whitespace-nowrap text-ink-faint">
          <span className="shrink-0">{partCount(project.pkg)} parts</span>
          <span className="shrink-0">·</span>
          <span className="shrink-0">★ {project.stars}</span>
          <span className="shrink-0">·</span>
          <span className="min-w-0 truncate">{project.author}</span>
        </p>
      </div>
    </Link>
  );
}
