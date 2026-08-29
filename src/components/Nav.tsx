import Link from "next/link";

export function Nav() {
  return (
    <nav className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-bg/90 px-5 py-3 backdrop-blur">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-accent text-[13px] font-extrabold text-black">
          ⌬
        </span>
        <span className="text-[13px] font-extrabold tracking-[0.18em]">
          OPENBLUEPRINT
        </span>
      </Link>
      <div className="flex items-center gap-6">
        <Link href="/about" className="microlabel hover:text-ink">
          About
        </Link>
        <Link href="/projects" className="microlabel hover:text-ink">
          My Projects
        </Link>
        <a
          href="https://github.com/noobianlabs/openblueprint"
          target="_blank"
          rel="noreferrer"
          className="microlabel rounded-sm border border-line px-3 py-1.5 hover:border-line-strong hover:text-ink"
        >
          GitHub ↗
        </a>
      </div>
    </nav>
  );
}
