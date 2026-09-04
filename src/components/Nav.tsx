import Link from "next/link";

export function Nav() {
  return (
    <nav className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-line bg-bg/90 px-5 py-3 backdrop-blur">
      {/* The wordmark drops below `sm` so the link row keeps enough room; the
          glyph alone still needs an accessible name at that point. */}
      <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="OpenBlueprint home">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-sm bg-accent text-[13px] font-extrabold text-black"
          aria-hidden="true"
        >
          ⌬
        </span>
        <span className="hidden text-[13px] font-extrabold tracking-[0.18em] sm:inline">
          OPENBLUEPRINT
        </span>
      </Link>
      {/* Same horizontal-scroll fallback as the tab bar: on a narrow screen
          this row scrolls within the nav instead of forcing the page body
          to scroll sideways. */}
      <div className="flex items-center gap-4 overflow-x-auto sm:gap-6">
        <Link
          href="/about"
          className="microlabel flex min-h-10 shrink-0 items-center whitespace-nowrap hover:text-ink"
        >
          About
        </Link>
        <Link
          href="/faq"
          className="microlabel flex min-h-10 shrink-0 items-center whitespace-nowrap hover:text-ink"
        >
          FAQ
        </Link>
        <Link
          href="/projects"
          className="microlabel flex min-h-10 shrink-0 items-center whitespace-nowrap hover:text-ink"
        >
          My Projects
        </Link>
        <a
          href="https://github.com/noobianlabs/openblueprint"
          target="_blank"
          rel="noreferrer"
          className="microlabel flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-sm border border-line px-3 py-1.5 hover:border-line-strong hover:text-ink"
        >
          GitHub ↗
        </a>
      </div>
    </nav>
  );
}
