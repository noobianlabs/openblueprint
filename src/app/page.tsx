import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { ProjectCard } from "@/components/ProjectCard";
import { PromptBox } from "@/components/PromptBox";
import { seeds } from "@/lib/design/seeds";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main className="flex-1">
        <section className="blueprint-grid relative overflow-hidden border-b border-line">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(60% 80% at 50% -10%, rgba(61,219,180,0.16), transparent 60%), radial-gradient(45% 60% at 12% 90%, rgba(167,139,250,0.10), transparent 60%), radial-gradient(45% 60% at 88% 90%, rgba(251,191,36,0.10), transparent 60%)",
            }}
          />
          <div className="relative mx-auto flex max-w-5xl flex-col items-center gap-6 px-5 py-24">
            <h1 className="text-center text-3xl font-extrabold tracking-[0.14em] sm:text-4xl">
              BLUEPRINT SOMETHING BUILDABLE
            </h1>
            <p className="max-w-xl text-center text-[13px] text-ink-dim">
              Describe a hardware project. Get a complete design package —
              parts, wiring, mechanics, and build instructions.
            </p>
            <PromptBox />
            <p className="microlabel text-ink-faint">
              open source · no account · runs entirely in your browser
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-12">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-[13px] font-extrabold tracking-[0.16em]">
              COMMUNITY PROJECTS
            </h2>
            <span className="microlabel text-ink-faint">
              {seeds.length} designs
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {seeds.map((p) => (
              <ProjectCard key={p.slug} project={p} />
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
