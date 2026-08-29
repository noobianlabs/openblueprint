import type { ProjectRecord } from "@/lib/design/schema";

export function PartsTab({ record }: { record: ProjectRecord }) {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <p className="microlabel text-ink-faint">
        Parts view for {record.pkg.name} — under construction
      </p>
    </div>
  );
}
