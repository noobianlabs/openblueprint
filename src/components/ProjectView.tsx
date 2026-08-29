"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ProjectRecord } from "@/lib/design/schema";
import { isStarred, makeUserRecord, saveProject, toggleStar } from "@/lib/store";
import { InfoTab } from "@/components/tabs/InfoTab";
import { PartsTab } from "@/components/tabs/PartsTab";
import { WiringTab } from "@/components/tabs/WiringTab";
import { MechTab } from "@/components/tabs/MechTab";
import { ArchTab } from "@/components/tabs/ArchTab";
import { InstructionsTab } from "@/components/tabs/InstructionsTab";

const TABS = [
  { key: "info", label: "Info", icon: "▤" },
  { key: "parts", label: "Parts", icon: "☰" },
  { key: "arch", label: "Arch", icon: "◫" },
  { key: "wiring", label: "Wiring", icon: "⌗" },
  { key: "mech", label: "Mech", icon: "⚙" },
  { key: "instructions", label: "Instructions", icon: "☑" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function ProjectView({ record }: { record: ProjectRecord }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("info");
  const [starred, setStarred] = useState(false);
  const [copying, setCopying] = useState(false);

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

  function onStar() {
    setStarred(toggleStar(record.slug));
  }

  function onCopy() {
    const copy = makeUserRecord(record.pkg, record.pkg.name);
    saveProject(copy);
    setCopying(true);
    router.push(`/p/${copy.slug}`);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/95 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5">
          <Link href="/" className="microlabel shrink-0 hover:text-ink">
            ← Community
          </Link>
          <div className="order-3 flex w-full justify-center gap-1 sm:order-none sm:w-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => selectTab(t.key)}
                className={`microlabel rounded-sm border px-3 py-1.5 transition-colors ${
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
          <div className="flex shrink-0 items-center gap-2">
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
          </div>
        </div>
      </header>

      <main className="flex-1">
        {tab === "info" && <InfoTab record={record} />}
        {tab === "parts" && <PartsTab record={record} />}
        {tab === "arch" && <ArchTab record={record} />}
        {tab === "wiring" && <WiringTab record={record} />}
        {tab === "mech" && <MechTab record={record} />}
        {tab === "instructions" && <InstructionsTab record={record} />}
      </main>
    </div>
  );
}
