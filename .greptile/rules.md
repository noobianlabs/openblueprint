# Reviewing OpenBlueprint

An open-source tool that turns a plain-English hardware idea into a complete design
package: bill of materials, system architecture, wiring diagram, 3D massing model with
STL export, and step-by-step build instructions. Next.js App Router, TypeScript,
Tailwind v4, three.js. Everything runs in the browser.

## The two commitments everything else follows from

**It works with no key.** The default engine is deterministic and local: an archetype
matcher plus template composition, no network, no account, no API key. A Claude-backed
engine exists behind `ANTHROPIC_API_KEY` and is strictly additive. A change that makes
the keyless path depend on a key or a network call breaks the project's premise.

**It never claims what it cannot derive.** Every number, link and label on screen is
either computed from the design package or explicitly marked as an estimate. This is a
tool people might buy parts from, so a plausible-looking invention is worse than an
admission of ignorance. The chat says what it cannot do; the 3D view says it is a
massing model; sourcing links are searches, not products; costs are marked approximate.

## Where the bodies are buried

These are real bugs that shipped, not hypotheticals. They are the highest-value things
to catch.

- **Unlayered CSS wins.** A class declared outside `@layer` in `globals.css` beats every
  Tailwind utility on the same element. This silently killed hover states and font sizes
  across the app, and two contributors worked around it with inline styles before anyone
  found the cause.
- **`focus:outline-none` + `focus-visible:outline`** is a Tailwind v4 trap: `:focus`
  matches whenever `:focus-visible` does, so the outline custom property is set to `none`
  and the focus ring never paints. Accessibility regression that looks fine in review.
- **WebGL contexts are a finite resource.** A renderer per component exhausts the browser
  cap once a gallery mounts several cards. One shared renderer, a queue, a cache.
- **`tsc --noEmit` is not the gate.** Its incremental cache has passed a file that
  `next build` then rejected. The build is the gate.
- **Binary formats are consumed by other software.** A one-byte error in the ZIP central
  directory or the STL header produces a file that opens in one tool and fails in
  another. Check the arithmetic, not the intent.

## What good review looks like here

Concrete and reproducible beats stylistic. A finding worth writing names the input that
breaks, or the platform where it renders wrong. Prefer one high-confidence correctness
bug over five preferences.

Worth flagging: silent failure paths, storage access that can throw, an assumption that
`window` exists during SSR, a number presented as fact that is actually a guess, a
dependency added where the repo hand-rolls its own, and anything that would white-screen
the app when one design package is malformed.

Not worth flagging: alternative phrasings of the same logic, comment density, or moving
code between files without a behavioral reason.

## Structure

`src/lib/design/` is the spine — `schema.ts` defines the design package every view reads,
`geometry.ts` derives physical dimensions from parts, and the writers (`stl.ts`,
`export.ts`, `share.ts`) turn a package into files or links. `src/lib/engine/` generates
packages. `src/components/tabs/` is the six-view project surface. `.planning/` holds the
phase plans; each shipped phase has a plan document and a GitHub issue.
