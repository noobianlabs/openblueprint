import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line px-5 py-8">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
        <p className="microlabel">
          OpenBlueprint — open-source hardware design · MIT license
        </p>
        <div className="flex flex-wrap gap-6">
          <Link href="/about" className="microlabel flex min-h-10 items-center hover:text-ink">
            About
          </Link>
          <Link href="/faq" className="microlabel flex min-h-10 items-center hover:text-ink">
            FAQ
          </Link>
          <a
            href="https://github.com/noobianlabs/openblueprint"
            target="_blank"
            rel="noreferrer"
            className="microlabel flex min-h-10 items-center hover:text-ink"
          >
            GitHub
          </a>
        </div>
      </div>
      <p className="microlabel mx-auto mt-4 max-w-5xl text-ink-faint">
        Not affiliated with blueprint.io. Always sanity-check a generated
        design before buying parts or building.
      </p>
    </footer>
  );
}
