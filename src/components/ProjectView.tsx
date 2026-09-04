"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ProjectRecord } from "@/lib/design/schema";
import {
  isStarred,
  lastStorageFailure,
  makeUserRecord,
  renameProject,
  saveProject,
  toggleStar,
} from "@/lib/store";
import { buildProjectZip, exportFilename } from "@/lib/design/export";
import { shareUrl } from "@/lib/design/share";
import { InfoTab } from "@/components/tabs/InfoTab";
import { PartsTab } from "@/components/tabs/PartsTab";
import { WiringTab } from "@/components/tabs/WiringTab";
import { MechTab } from "@/components/tabs/MechTab";
import { ArchTab } from "@/components/tabs/ArchTab";
import { InstructionsTab } from "@/components/tabs/InstructionsTab";
import { VersionHistory } from "@/components/VersionHistory";
import { TabBoundary } from "@/components/TabBoundary";

const TABS = [
  { key: "info", label: "Info", icon: "▤" },
  { key: "parts", label: "Parts", icon: "☰" },
  { key: "arch", label: "Arch", icon: "◫" },
  { key: "wiring", label: "Wiring", icon: "⌗" },
  { key: "mech", label: "Mech", icon: "⚙" },
  { key: "instructions", label: "Instructions", icon: "☑" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const DEFAULT_SHARE_TITLE = "Copy a read-only share link — the design travels in the URL, nothing is uploaded";

/** navigator.clipboard needs a secure context; execCommand is the fallback everywhere else. */
async function copyToClipboard(text: string): Promise<void> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // fall through to the execCommand fallback below
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

export function ProjectView({ record }: { record: ProjectRecord }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("info");
  const [starred, setStarred] = useState(false);
  const [copying, setCopying] = useState(false);
  const [exportState, setExportState] = useState<"idle" | "working" | "done">("idle");
  const [shareState, setShareState] = useState<"idle" | "working" | "copied">("idle");
  const [shareTitle, setShareTitle] = useState(DEFAULT_SHARE_TITLE);
  const isOwned = record.source === "user";
  const [projectName, setProjectName] = useState(record.pkg.name);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(record.pkg.name);
  const skipBlurRef = useRef(false);
  const [showHistory, setShowHistory] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  /* Star state is browser-local; read it after mount so SSR and the first
     client render agree. */
  useEffect(() => setStarred(isStarred(record.slug)), [record.slug]);

  /* `?tab=` makes a view shareable — a link can point at the wiring diagram
     rather than at the top of the project. Read after mount so the server and
     first client render agree, and back/forward stay in step. */
  useEffect(() => {
    const apply = () => {
      const wanted = new URLSearchParams(window.location.search).get("tab");
      if (wanted && TABS.some((t) => t.key === wanted)) setTab(wanted as TabKey);
    };
    apply();
    window.addEventListener("popstate", apply);
    return () => window.removeEventListener("popstate", apply);
  }, []);

  function selectTab(key: TabKey) {
    setTab(key);
    const url = new URL(window.location.href);
    if (key === "info") url.searchParams.delete("tab");
    else url.searchParams.set("tab", key);
    window.history.replaceState(null, "", url);
  }

  /* A rename is committed to storage immediately, but the `record` prop is
     resolved upstream and does not change — so the views would keep the old
     name until a reload. Hand them a record carrying the name on screen. */
  const shown =
    projectName === record.pkg.name
      ? record
      : { ...record, pkg: { ...record.pkg, name: projectName } };

  function onStar() {
    setStarred(toggleStar(record.slug));
  }

  async function onShare() {
    if (shareState === "working") return;
    setShareState("working");
    try {
      const { url, oversized } = await shareUrl(shown);
      setShareTitle(
        oversized
          ? "Link copied — this design is large, so the link is long and some apps may truncate it"
          : DEFAULT_SHARE_TITLE,
      );
      await copyToClipboard(url);
      setShareState("copied");
      window.setTimeout(() => setShareState("idle"), 2000);
    } catch {
      // Never strand the button mid-flight; nothing was copied.
      setShareState("idle");
    }
  }

  async function onExport() {
    setExportState("working");
    let url: string | null = null;
    try {
      const blob = await buildProjectZip(shown, new Date());
      url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = exportFilename(shown);
      link.click();
      setExportState("done");
      window.setTimeout(() => setExportState("idle"), 2000);
    } catch {
      // Never strand the button mid-flight; the design is still on screen.
      setExportState("idle");
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }

  /* A copy that could not be written must not navigate: /p/<slug> would
     resolve to nothing and read as a bug rather than as full storage. */
  function onCopy() {
    const copy = makeUserRecord(shown.pkg, shown.pkg.name);
    const failure = saveProject(copy);
    if (failure) {
      setStorageError(failure);
      return;
    }
    setStorageError(null);
    setCopying(true);
    router.push(`/p/${copy.slug}`);
  }

  function startRename() {
    setNameDraft(projectName);
    setRenaming(true);
  }

  function commitRename() {
    setRenaming(false);
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === projectName) {
      setNameDraft(projectName);
      return;
    }
    setProjectName(trimmed);
    renameProject(record.slug, trimmed);
    setStorageError(lastStorageFailure());
  }

  function cancelRename() {
    setRenaming(false);
    setNameDraft(projectName);
  }

  function onNameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      skipBlurRef.current = true;
      commitRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      skipBlurRef.current = true;
      cancelRename();
    }
  }

  function onNameBlur() {
    if (skipBlurRef.current) {
      skipBlurRef.current = false;
      return;
    }
    commitRename();
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* scrollbar-width covers Firefox; this covers WebKit. */}
      <style>{`.obp-tabbar::-webkit-scrollbar { display: none; }`}</style>
      <header className="sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5">
          <div className="flex min-w-0 shrink-0 items-center gap-3">
            <Link href="/" className="microlabel shrink-0 hover:text-ink">
              ← Community
            </Link>
            <span className="h-4 w-px shrink-0 bg-line" />
            {renaming ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={onNameKeyDown}
                onBlur={onNameBlur}
                className="min-w-0 max-w-[16rem] rounded-sm border border-line-strong bg-bg-inset px-2 py-1 text-[13px] text-ink outline-none"
              />
            ) : (
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-[13px] font-semibold text-ink" title={projectName}>
                  {projectName}
                </span>
                {isOwned && (
                  <button
                    type="button"
                    onClick={startRename}
                    title="Rename project"
                    className="shrink-0 text-ink-faint hover:text-ink"
                  >
                    ✎
                  </button>
                )}
              </div>
            )}
          </div>
          {/* Six tabs do not fit at 375px. The row scrolls sideways instead of
              wrapping; it stays left-aligned while scrollable, because a
              centred overflowing row clips its first tabs out of reach. */}
          <div
            className="obp-tabbar order-3 flex w-full flex-nowrap justify-start gap-1 overflow-x-auto sm:order-none sm:w-auto sm:justify-center"
            style={{ scrollbarWidth: "none" }}
          >
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => selectTab(t.key)}
                className={`microlabel shrink-0 rounded-sm border px-3 py-1.5 whitespace-nowrap transition-colors ${
                  tab === t.key
                    ? "border-line-strong bg-bg-raised text-ink"
                    : "border-transparent hover:text-ink"
                }`}
              >
                <span className="mr-1.5">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative flex shrink-0 items-center gap-2">
            {isOwned && (
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                aria-pressed={showHistory}
                className={`microlabel rounded-sm border px-3 py-1.5 hover:border-line-strong ${
                  showHistory ? "border-line-strong bg-bg-raised text-ink" : "border-line hover:text-ink"
                }`}
                title="Version history"
              >
                ⟲ History
              </button>
            )}
            <button
              type="button"
              onClick={onStar}
              aria-pressed={starred}
              className={`microlabel rounded-sm border px-3 py-1.5 hover:border-line-strong ${
                starred ? "border-line-strong text-accent" : "border-line hover:text-ink"
              }`}
              title={starred ? "Unstar" : "Star this design"}
            >
              ★ {record.stars + (starred ? 1 : 0)}
            </button>
            <button
              type="button"
              onClick={onCopy}
              disabled={copying}
              className="microlabel rounded-sm border border-line px-3 py-1.5 text-accent hover:border-line-strong disabled:opacity-60"
              title="Save a copy to my projects"
            >
              ⧉ {copying ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={onShare}
              disabled={shareState === "working"}
              className="microlabel rounded-sm border border-line px-3 py-1.5 hover:border-line-strong hover:text-ink disabled:opacity-60"
              title={shareTitle}
            >
              ⤴ {shareState === "copied" ? "Copied link" : "Share"}
            </button>
            <button
              type="button"
              onClick={onExport}
              disabled={exportState === "working"}
              className="microlabel rounded-sm border border-line px-3 py-1.5 hover:border-line-strong hover:text-ink disabled:opacity-60"
              title="Download design JSON, BOM CSV, instructions and STL as one ZIP"
            >
              ↓ {exportState === "working" ? "Packing" : exportState === "done" ? "Saved" : "Export"}
            </button>
            {isOwned && showHistory && (
              <div className="absolute top-full right-0 z-50 mt-2">
                <VersionHistory
                  slug={record.slug}
                  onRestored={() => window.location.reload()}
                />
              </div>
            )}
          </div>
        </div>
      </header>

      {storageError && (
        <div className="flex items-start justify-between gap-3 border-b border-line bg-bg-inset px-5 py-2">
          <p className="text-[12px] leading-relaxed text-ink-dim">
            <span className="microlabel mr-2 text-ink">NOT SAVED</span>
            {storageError}
          </p>
          <button
            type="button"
            onClick={() => setStorageError(null)}
            aria-label="Dismiss storage warning"
            className="microlabel shrink-0 text-ink-faint hover:text-ink"
          >
            ✕
          </button>
        </div>
      )}

      {/* One boundary per view, keyed by tab: a design that breaks Mech must
          not take Parts down with it, and switching away and back gives the
          failed view a clean mount rather than the boundary's fallback. */}
      <main className="flex-1">
        {tab === "info" && (
          <TabBoundary key="info" view="Info">
            <InfoTab record={shown} />
          </TabBoundary>
        )}
        {tab === "parts" && (
          <TabBoundary key="parts" view="Parts">
            <PartsTab record={shown} />
          </TabBoundary>
        )}
        {tab === "arch" && (
          <TabBoundary key="arch" view="Arch">
            <ArchTab record={shown} />
          </TabBoundary>
        )}
        {tab === "wiring" && (
          <TabBoundary key="wiring" view="Wiring">
            <WiringTab record={shown} />
          </TabBoundary>
        )}
        {tab === "mech" && (
          <TabBoundary key="mech" view="Mech">
            <MechTab record={shown} />
          </TabBoundary>
        )}
        {tab === "instructions" && (
          <TabBoundary key="instructions" view="Instructions">
            <InstructionsTab record={shown} />
          </TabBoundary>
        )}
      </main>
    </div>
  );
}
