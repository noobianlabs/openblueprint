import Link from "next/link";
import type { ProjectRecord } from "@/lib/design/schema";
import { partCount } from "@/lib/design/schema";

export function ProjectCard({ project }: { project: ProjectRecord }) {
  return (
    <Link
      href={`/p/${project.slug}`}
      className="group overflow-hidden rounded-md border border-line bg-bg-card transition-colors hover:border-line-strong"
    >
      <div
        className="blueprint-grid relative flex h-36 items-center justify-center"
        style={{
          background: `radial-gradient(120% 140% at 20% 0%, ${project.cover.hueA}26, transparent 55%), radial-gradient(120% 140% at 85% 100%, ${project.cover.hueB}22, transparent 55%), var(--bg-inset)`,
        }}
      >
        <span
          className="text-5xl opacity-80 transition-transform group-hover:scale-110"
          style={{ textShadow: `0 0 40px ${project.cover.hueA}` }}
        >
          {project.cover.glyph}
        </span>
      </div>
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
