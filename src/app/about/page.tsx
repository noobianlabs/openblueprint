import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "About — OpenBlueprint",
  description:
    "What OpenBlueprint is, how it generates hardware design packages, and what it deliberately is not.",
};

const REPO = "https://github.com/noobianlabs/openblueprint";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-8">
      <h2 className="microlabel mb-3 text-ink">{title}</h2>
      <div className="space-y-3 text-[13px] leading-relaxed text-ink-dim">{children}</div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-5 py-12">
          <h1 className="text-2xl font-extrabold tracking-[0.14em]">ABOUT OPENBLUEPRINT</h1>
          <p className="mt-4 text-[13px] leading-relaxed text-ink-dim">
            Describe a hardware project in one sentence. Get back a design package
            you could actually order and build from.
          </p>

          <Section title="WHAT IT DOES">
            <p>
              prompt → parts, wiring, mechanics, instructions. One request produces
              a bill of materials with real part numbers and costs, a complete
              connection net down to pin names, an assembly tree of every printed
              and bought part, and a phased build sequence with the tools each step
              needs.
            </p>
            <p>
              Nothing is stored on a server. Generated designs live in this
              browser&rsquo;s local storage, which also means clearing site data
              clears your projects.
            </p>
          </Section>

          <Section title="TWO ENGINES">
            <p>
              The default engine is deterministic and runs entirely in your
              browser: it matches your prompt to a hardware archetype and composes
              a design from a curated part library. No account, no key, no network
              round trip — and the same prompt always yields the same design.
            </p>
            <p>
              Bring your own Anthropic API key and the AI engine takes over
              instead, writing the package directly. Its output is held to the same
              structural checks as the local engine; anything that fails them falls
              back rather than shipping a broken design.
            </p>
          </Section>

          <Section title="OPEN SOURCE">
            <p>
              MIT licensed, and the interesting part is the design schema — one
              shape that every view renders from and every engine emits. Issues and
              pull requests welcome.
            </p>
            <p>
              <a
                href={REPO}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                github.com/noobianlabs/openblueprint ↗
              </a>
            </p>
          </Section>

          <Section title="WHAT IT IS NOT">
            <p>
              Not affiliated with, endorsed by, or connected to blueprint.io. This
              is an independent open-source rebuild of an idea we liked.
            </p>
            <p>
              Generated designs are a starting point, not a reviewed schematic.
              Voltages, pin assignments, current budgets, and mechanical
              clearances all need checking against real datasheets before you buy
              parts or apply power.
            </p>
          </Section>

          <p className="microlabel mt-8 border border-line-strong px-4 py-3 text-ink">
            NOT A SUBSTITUTE FOR ENGINEERING JUDGMENT
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
