import Link from "next/link";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-5 py-12">
          <h1 className="text-2xl font-extrabold tracking-[0.14em]">404</h1>
          <p className="mt-4 text-[13px] leading-relaxed text-ink-dim">
            The page you are looking for does not exist.
          </p>

          <section className="border-t border-line py-8">
            <div className="space-y-3 text-[13px] leading-relaxed text-ink-dim">
              <p>
                This might be a mistyped URL, or a design saved in a different
                browser — projects live in local storage, not on a server. The
                community gallery is on the home page.
              </p>
              {/* Only real routes: the gallery is the home page, and there is
                  no /p index — /p/[slug] and /p/shared are its only children. */}
              <div className="flex gap-3 pt-2">
                <Link
                  href="/"
                  className="text-accent hover:underline"
                >
                  Community gallery ↗
                </Link>
                <span className="text-ink-faint">·</span>
                <Link
                  href="/projects"
                  className="text-accent hover:underline"
                >
                  My projects ↗
                </Link>
              </div>
            </div>
          </section>

          <p className="microlabel mt-8 border border-line-strong px-4 py-3 text-ink">
            PAGE NOT FOUND
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
