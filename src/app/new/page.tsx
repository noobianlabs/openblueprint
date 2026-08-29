import { Suspense } from "react";
import { RunView } from "./RunView";

/**
 * The generation run screen. RunView reads ?prompt= with useSearchParams,
 * which requires a Suspense boundary above it.
 */
export default function NewDesignPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="microlabel text-ink-faint">loading…</p>
        </div>
      }
    >
      <RunView />
    </Suspense>
  );
}
