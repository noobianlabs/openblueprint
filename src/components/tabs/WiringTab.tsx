import type { ProjectRecord } from "@/lib/design/schema";

export function WiringTab({ record }: { record: ProjectRecord }) {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <p className="microlabel text-ink-faint">
        Wiring view for {record.pkg.name} — under construction
      </p>
    </div>
  );
}
