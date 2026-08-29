"use client";

import Link from "next/link";
import { useState } from "react";
import type { ProjectRecord } from "@/lib/design/schema";
import { InfoTab } from "@/components/tabs/InfoTab";
import { PartsTab } from "@/components/tabs/PartsTab";
import { WiringTab } from "@/components/tabs/WiringTab";
import { MechTab } from "@/components/tabs/MechTab";
import { InstructionsTab } from "@/components/tabs/InstructionsTab";

const TABS = [
  { key: "info", label: "Info", icon: "▤" },
  { key: "parts", label: "Parts", icon: "☰" },
  { key: "wiring", label: "Wiring", icon: "⌗" },
  { key: "mech", label: "Mech", icon: "⚙" },
  { key: "instructions", label: "Instructions", icon: "☑" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function ProjectView({ record }: { record: ProjectRecord }) {
  const [tab, setTab] = useState<TabKey>("info");

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
                onClick={() => setTab(t.key)}
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
              className="microlabel rounded-sm border border-line px-3 py-1.5 hover:border-line-strong hover:text-ink"
              title="Starring arrives with local persistence (phase 4)"
            >
              ★ {record.stars}
            </button>
            <button
              type="button"
              className="microlabel rounded-sm border border-line px-3 py-1.5 text-accent hover:border-line-strong"
              title="Copy to my projects arrives in phase 4"
            >
              ⧉ Copy
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {tab === "info" && <InfoTab record={record} />}
        {tab === "parts" && <PartsTab record={record} />}
        {tab === "wiring" && <WiringTab record={record} />}
        {tab === "mech" && <MechTab record={record} />}
        {tab === "instructions" && <InstructionsTab record={record} />}
      </main>
    </div>
  );
}
