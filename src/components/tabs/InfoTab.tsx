import type { ProjectRecord } from "@/lib/design/schema";

export function InfoTab({ record }: { record: ProjectRecord }) {
  const { pkg } = record;
  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <div className="flex flex-wrap gap-2">
        {pkg.tags.map((t) => (
          <span key={t} className="cat-chip" style={{ ["--chip-color" as string]: "var(--accent)" }}>
            {t}
          </span>
        ))}
      </div>
      <p className="microlabel mt-6">AI summary</p>
      <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-dim">
        {pkg.summary}
      </p>
      <h1 className="mt-8 text-xl font-extrabold tracking-[0.1em] uppercase">
        {pkg.name}
      </h1>
      <p className="microlabel mt-1 text-ink-faint">by {record.author}</p>
    </div>
  );
}
