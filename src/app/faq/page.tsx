import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "FAQ — OpenBlueprint",
  description: "Frequently asked questions about OpenBlueprint hardware design generation.",
};

function Question({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line py-6">
      <h3 className="mb-3 text-[13px] font-bold text-ink">{q}</h3>
      <div className="space-y-3 text-[13px] leading-relaxed text-ink-dim">{children}</div>
    </div>
  );
}

export default function FaqPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-5 py-12">
          <h1 className="text-2xl font-extrabold tracking-[0.14em]">FAQ</h1>
          <p className="mt-4 text-[13px] leading-relaxed text-ink-dim">
            Questions about OpenBlueprint, how it works, and what it generates.
          </p>

          <Question q="What is OpenBlueprint?">
            <p>
              OpenBlueprint turns hardware project descriptions into buildable design packages.
              Describe what you want in one sentence, and you get back a complete bill of
              materials with part numbers and costs, wiring diagrams with pinouts, assembly
              instructions, and a 3D model of the massing.
            </p>
          </Question>

          <Question q="How does design generation work?">
            <p>
              There are two engines. The default is deterministic and runs entirely in your
              browser: it matches your prompt to a hardware archetype (rover, station, lamp,
              planter, timer, wearable, or gadget) and assembles a design from a curated library
              of parts. No account, no API key, no network round trip required.
            </p>
            <p>
              If you bring your own Anthropic API key, the AI engine takes over instead. It
              writes the design package directly from your prompt, with the same structural
              checks as the local engine — anything that fails validation falls back rather than
              shipping a broken design.
            </p>
          </Question>

          <Question q="Where is my data?">
            <p>
              Everything stays in your browser. Generated projects live in this browser's local
              storage — there is no backend server, and nothing is uploaded anywhere. Clearing
              your browser's site data deletes all saved projects.
            </p>
          </Question>

          <Question q="Is the 3D model real CAD?">
            <p>
              No. The exported STL file is a massing model built from estimated dimensions of
              the parts — it shows you the rough shape and scale, but is not a precision CAD
              file. Always sanity-check the generated design against real datasheets before you
              buy parts or build, especially for electrical connections, power budgets, and
              mechanical clearances. The model is useful for visualization; it is not suitable
              for direct manufacturing.
            </p>
          </Question>

          <Question q="What about sourcing links?">
            <p>
              The bill of materials includes real part numbers from distributors like Digi-Key
              and Adafruit, so you can look them up and verify pricing. Links are not embedded
              in the export — instead, every part points to an open keyword search in your parts
              database. For printed parts (3D-printed enclosures, brackets, etc.), there are no
              links; you print them yourself or send the STL to a service.
            </p>
          </Question>

          <Question q="What does the Export ZIP contain?">
            <p>
              Four files that make the design useful without OpenBlueprint:
            </p>
            <ul className="list-inside list-disc space-y-2">
              <li>
                <strong>design.json</strong> — the complete design package as structured data
              </li>
              <li>
                <strong>bom.csv</strong> — bill of materials, spreadsheet-ready, with part numbers
                and costs
              </li>
              <li>
                <strong>instructions.md</strong> — build instructions as readable markdown, with
                tools and parts listed per step
              </li>
              <li>
                <strong>assembly.stl</strong> — 3D mesh of the massing model for visualization
              </li>
            </ul>
          </Question>

          <Question q="Can I share a design?">
            <p>
              Yes. Share links encode the entire design in the URL itself, so the design travels
              with the link without needing a backend. Anyone with the link can open and edit
              your design without logging in. You can find the share option on any project.
            </p>
          </Question>

          <Question q="Is OpenBlueprint affiliated with blueprint.io?">
            <p>
              No. OpenBlueprint is an independent open-source project, not affiliated with,
              endorsed by, or connected to blueprint.io. We liked the idea and rebuilt it from
              the ground up.
            </p>
          </Question>

          <p className="microlabel mt-8 border border-line-strong px-4 py-3 text-ink">
            NOT A SUBSTITUTE FOR ENGINEERING JUDGMENT
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
