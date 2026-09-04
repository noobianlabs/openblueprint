import type { Metadata } from "next";
import { Suspense } from "react";
import { RunView } from "./RunView";

export const metadata: Metadata = {
  title: "Generate New Design",
  description: "Create a hardware design package from a text description.",
  robots: {
    index: false,
  },
};

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
