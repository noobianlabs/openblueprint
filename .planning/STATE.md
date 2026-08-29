# STATE.md — Project Memory

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-29)

**Core value:** Prompt in → complete design package out across six views
**Current focus:** Phase 6 — Visual views

## Current Position

- Milestone: v1
- Phase: 6 (Visual views) — executing
- Status: Phases 1–5 shipped 2026-08-29
- Last activity: 2026-08-29 — full browser walkthrough passed; star/copy wired to the store; README + LICENSE written

## Accumulated Decisions

- 2026-08-29: `DesignPackage` schema is the spine; all views render from it
- 2026-08-29: Deterministic `LocalEngine` is the default generation path (no API key in env); `ClaudeEngine` behind `ANTHROPIC_API_KEY`
- 2026-08-29: GitHub issues stand in for Linear until the Linear MCP connector is authorized by the user
- 2026-08-29: Seed content is original and benign; scraped examples (laser jammer) explicitly not reused
- 2026-08-29: Node >= 20 required — the Next 15 build hard-fails on the Node 18.7 that `which node` resolves by default here
- 2026-08-29: `src/lib/design/geometry.ts` derives part geometry deterministically from category + name. It is the shared spine for every visual view (2D part art, 3D assembly, future exports) — the DesignPackage deliberately carries no dimensions
- 2026-08-29: ARCH is its own view, not a mode of WIRING. Block-level signal flow and pin-level nets are two different questions and overlaying them is what makes schematics unreadable

## Verified (browser, production build)

- Landing, gallery, /about, /projects render with zero console errors
- All six tabs render for both seed and generated designs
- Wiring graph: 8 nodes / 18 edges on a generated design, 5 / 16 on a seed
- Generation: prompt → plan → clarifying questions → build → /p/[slug]
- Persistence across reload: instruction checkboxes, stars, saved projects, copies

## Blockers

- Linear MCP requires OAuth in an interactive session — user action needed before Linear sync

## Session Continuity

Next step: land Phase 6 visuals (part art, 3D viewer + STL, ARCH), re-verify in the browser, capture screenshots, ship.
