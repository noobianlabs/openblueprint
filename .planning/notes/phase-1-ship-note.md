# Ship note — Phase 1: Foundation (2026-08-29)

**Requirements shipped:** REQ-01 (landing), REQ-02 (DesignPackage schema), REQ-03 (partial — 1 of 4 seeds; remaining 3 authored in a parallel executor before Phase 5)

## What was built
- Manual Next.js 15 + React 19 + Tailwind 4 scaffold (create-next-app conflicts with the pre-existing `.claude/` GSD install, so the scaffold is hand-rolled and lean).
- `src/lib/design/schema.ts` — the `DesignPackage` spine: parts (10 categories incl. `module`, observed in the live product), pin-to-pin connections with data/power/ground nets, assembly tree, instruction phases, plus BOM rollup/cost helpers.
- Exemplar seed: Balcony Weather Station (15 parts, 21 connections, 4 instruction phases) — the authoring template for the remaining seeds.
- Design system: all-mono (JetBrains Mono), dark drafting-table theme, blueprint-grid motif, category color tokens.
- Landing page: hero + prompt box (idea button, engine pill, routes to `/new`), community grid, nav/footer. Project shell at `/p/[slug]` with the five-tab frame (Info live; other tabs stubbed for Phases 2–3).

## Verification
- `tsc --noEmit` clean; `next build` clean (4 routes).
- Browser-verified: landing renders with seed card; card routes to project view; Info tab shows tags/summary/title.

## Notes
- Authenticated walkthrough of the real product (user's browser) captured in `.planning/research/app-walkthrough.md`; it added the `module` category and reshaped the Phase 4 generation UX (staged run + refine questions).
