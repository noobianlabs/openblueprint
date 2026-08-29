"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ProjectCard } from "@/components/ProjectCard";
import type { ProjectRecord } from "@/lib/design/schema";
import { seeds } from "@/lib/design/seeds";
import { deleteProject, listMyProjects, listStars, starCount } from "@/lib/store";

type Filter = "all" | "starred";
type Sort = "recent" | "starred";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "ALL" },
  { key: "starred", label: "STARRED" },
];

const SORTS: { key: Sort; label: string }[] = [
  { key: "recent", label: "MOST RECENT" },
  { key: "starred", label: "MOST STARRED" },
];

function matches(record: ProjectRecord, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    record.pkg.name.toLowerCase().includes(q) ||
    record.pkg.summary.toLowerCase().includes(q) ||
    record.pkg.tags.some((t) => t.toLowerCase().includes(q))
  );
}

export function ProjectsBrowser() {
  const [mounted, setMounted] = useState(false);
  const [mine, setMine] = useState<ProjectRecord[]>([]);
  const [stars, setStars] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    setMine(listMyProjects());
    setStars(listStars());
    setMounted(true);
  }, []);

  const sortRecords = useMemo(
    () => (records: ProjectRecord[]) =>
      [...records].sort((a, b) =>
        sort === "starred"
          ? starCount(b) - starCount(a)
          : a.createdAt < b.createdAt
            ? 1
            : -1,
      ),
    [sort],
  );

  const visibleMine = sortRecords(
    mine.filter((r) => matches(r, query) && (filter === "all" || stars.includes(r.slug))),
  );
  const visibleSeeds = sortRecords(
    seeds.filter((s) => stars.includes(s.slug) && matches(s, query)),
  );

  function remove(slug: string) {
    deleteProject(slug);
    setMine(listMyProjects());
    setConfirming(null);
  }

  if (!mounted) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="microlabel text-ink-faint">loading…</p>
      </div>
    );
  }

  const empty = visibleMine.length === 0 && visibleSeeds.length === 0;

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h1 className="text-[13px] font-extrabold tracking-[0.16em]">MY PROJECTS</h1>
        <span className="microlabel text-ink-faint">
          {mine.length} saved · {stars.length} starred
        </span>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search designs…"
          className="min-w-48 flex-1 rounded-sm border border-line bg-bg-inset px-3 py-2 text-[12px] text-ink outline-none placeholder:text-ink-faint focus:border-line-strong"
        />
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`microlabel rounded-sm border px-3 py-1.5 transition-colors ${
                filter === f.key
                  ? "border-line-strong bg-bg-raised text-ink"
                  : "border-line hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSort(s.key)}
              className={`microlabel rounded-sm border px-3 py-1.5 transition-colors ${
                sort === s.key
                  ? "border-line-strong bg-bg-raised text-ink"
                  : "border-line hover:text-ink"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {empty ? (
        <div className="flex min-h-[36vh] flex-col items-center justify-center gap-3">
          <p className="microlabel text-ink-faint">
            {query || filter === "starred" ? "nothing matches" : "nothing saved in this browser yet"}
          </p>
          <Link href="/" className="microlabel text-accent hover:underline">
            generate your first design →
          </Link>
        </div>
      ) : (
        <>
          {visibleMine.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {visibleMine.map((project) => (
                <div key={project.slug} className="group relative">
                  <ProjectCard project={project} />
                  <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    {confirming === project.slug ? (
                      <div className="flex items-center gap-2 rounded-sm border border-line-strong bg-bg px-2 py-1">
                        <span className="microlabel text-ink-faint">delete?</span>
                        <button
                          type="button"
                          onClick={() => remove(project.slug)}
                          className="microlabel text-accent hover:underline"
                        >
                          yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(null)}
                          className="microlabel hover:text-ink"
                        >
                          no
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirming(project.slug)}
                        title={`Delete ${project.pkg.name}`}
                        className="rounded-sm border border-line bg-bg px-2 py-1 text-[12px] text-ink-faint hover:border-line-strong hover:text-ink"
                      >
                        ⌫
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {visibleSeeds.length > 0 && (
            <>
              <div className="mt-10 mb-4 flex items-center gap-3">
                <span className="microlabel text-ink-faint">STARRED COMMUNITY</span>
                <span className="h-px flex-1 bg-line" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {visibleSeeds.map((project) => (
                  <ProjectCard key={project.slug} project={project} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
