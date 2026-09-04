"use client";

import { useEffect, useState } from "react";
import { fmtCost, partCount, totalCost } from "@/lib/design/schema";
import { listVersions, restoreVersion, type VersionEntry } from "@/lib/store";

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/**
 * Version list for a user-owned project. Reads localStorage on mount (SSR
 * has none), and lets each snapshot be restored with an inline confirm —
 * restoring itself snapshots the pre-restore state, so nothing here is
 * destructive.
 */
export function VersionHistory({
  slug,
  onRestored,
}: {
  slug: string;
  onRestored: () => void;
}) {
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [confirming, setConfirming] = useState<number | null>(null);

  useEffect(() => {
    setVersions(listVersions(slug));
  }, [slug]);

  function restore(index: number) {
    if (restoreVersion(slug, index)) onRestored();
  }

  return (
    <div className="w-80 max-w-[90vw] rounded-md border border-line-strong bg-bg-card p-3 shadow-lg">
      <p className="microlabel mb-2 text-ink-faint">Version history</p>
      {versions.length === 0 ? (
        <p className="px-1 py-4 text-center text-[12px] leading-relaxed text-ink-faint">
          No earlier versions yet — edits and restores create them.
        </p>
      ) : (
        <ul className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">
          {versions.map((v, i) => (
            <li
              key={`${v.at}-${i}`}
              className="flex items-center justify-between gap-2 rounded-sm border border-line px-2.5 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-[12px] text-ink">{v.label}</p>
                <p className="microlabel text-ink-faint">
                  {timeAgo(v.at)} · {partCount(v.pkg)} parts · {fmtCost(totalCost(v.pkg))}
                </p>
              </div>
              {confirming === i ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="microlabel text-ink-faint">restore?</span>
                  <button
                    type="button"
                    onClick={() => restore(i)}
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
                  onClick={() => setConfirming(i)}
                  className="microlabel shrink-0 rounded-sm border border-line px-2 py-1 hover:border-line-strong hover:text-ink"
                >
                  Restore
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
