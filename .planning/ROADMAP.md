# Roadmap: OpenBlueprint

## Overview

Five phases take an empty repo to a shipped v1: scaffold + schema + seed data first (the spine), then the project viewer tabs in two parallel waves, then the generation flow and persistence, then verify/polish/ship with docs and GitHub. Each phase ends with a commit, a pushed ship note, and a closed GitHub issue.

## Phases

- [ ] **Phase 1: Foundation** - Next.js scaffold, DesignPackage schema, seed projects, design system, landing page
- [ ] **Phase 2: Document views** - INFO, PARTS, INSTRUCTIONS tabs
- [ ] **Phase 3: Diagram views** - WIRING node graph, MECH assembly tree
- [ ] **Phase 4: Generation & persistence** - prompt → engine → project, localStorage, my projects, copy
- [ ] **Phase 5: Verify & ship** - browser walkthrough, fixes, README/license, GitHub + ship notes

## Phase Details

### Phase 1: Foundation
**Goal**: Runnable app with the data spine and landing page
**Depends on**: Nothing
**Requirements**: REQ-01, REQ-02, REQ-03
**Success Criteria**:
  1. `npm run dev` serves a landing page with hero, prompt box, community grid
  2. `DesignPackage` type compiles and 4 seed projects validate against it
  3. Clicking a community card routes to `/p/[slug]` (shell page)
**Plans**: 1 plan

Plans:
- [ ] 01-01: Scaffold, schema, seeds, landing

### Phase 2: Document views
**Goal**: INFO, PARTS, INSTRUCTIONS tabs render any DesignPackage
**Depends on**: Phase 1
**Requirements**: REQ-04, REQ-05, REQ-08
**Success Criteria**:
  1. INFO shows summary, tags, category BOM rollup with total
  2. PARTS searches/filters and totals correctly
  3. INSTRUCTIONS shows tools/assumptions and phased steps; checkboxes persist per project
**Plans**: 1 plan

Plans:
- [ ] 02-01: Info + Parts + Instructions components

### Phase 3: Diagram views
**Goal**: WIRING and MECH tabs render any DesignPackage
**Depends on**: Phase 1 (parallel with Phase 2)
**Requirements**: REQ-06, REQ-07
**Success Criteria**:
  1. WIRING shows a pannable node graph: part nodes with pins, edges styled by net type, legend, parts sidebar
  2. MECH shows the assembly tree with category badges and a viewer panel
**Plans**: 1 plan

Plans:
- [ ] 03-01: Wiring graph + Mech tree components

### Phase 4: Generation & persistence
**Goal**: Prompt on the landing page produces a saved, viewable project
**Depends on**: Phases 2, 3
**Requirements**: REQ-09, REQ-10, REQ-11
**Success Criteria**:
  1. Submitting a prompt runs the engine with visible progress and lands on the new project
  2. Engine is pluggable: deterministic engine keyless; Claude engine used when `ANTHROPIC_API_KEY` is set
  3. My projects, stars, and copied community projects survive reload
**Plans**: 1 plan

Plans:
- [ ] 04-01: Engine interface, local engine, Claude engine, store, generation UX

### Phase 5: Verify & ship
**Goal**: Verified v1 on GitHub with docs and ship notes
**Depends on**: Phase 4
**Requirements**: REQ-12, REQ-13
**Success Criteria**:
  1. Full browser walkthrough passes (landing → generate → all five tabs → reload persistence)
  2. README, LICENSE, screenshots; repo pushed; all phase issues closed with ship notes
**Plans**: 1 plan

Plans:
- [ ] 05-01: Verification walkthrough, polish, docs, ship

## Progress

**Execution Order:** 1 → (2 ∥ 3) → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/1 | Not started | - |
| 2. Document views | 0/1 | Not started | - |
| 3. Diagram views | 0/1 | Not started | - |
| 4. Generation & persistence | 0/1 | Not started | - |
| 5. Verify & ship | 0/1 | Not started | - |
