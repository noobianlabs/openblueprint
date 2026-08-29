# OpenBlueprint

## What This Is

OpenBlueprint is an open-source rebuild of blueprint.io — an AI hardware design tool. You describe a hardware project in plain English and it generates a complete, buildable design package: a bill of materials with costs, an interactive wiring diagram, a mechanical assembly tree, and step-by-step build instructions. It runs entirely in the browser with no account required.

## Core Value

Prompt in → complete design package out, rendered across five views (Info / Parts / Wiring / Mech / Instructions). If everything else fails, a visitor must be able to open a project and read a coherent, buildable design.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] REQ-01 Landing page: hero, prompt box, community projects grid (dark terminal aesthetic)
- [ ] REQ-02 `DesignPackage` schema — single source of truth every view renders from
- [ ] REQ-03 Four original seed projects shipped as data
- [ ] REQ-04 INFO tab: summary, feature tags, BOM rollup by category with costs
- [ ] REQ-05 PARTS tab: search, category filter, qty/unit/subtotal, total estimated cost
- [ ] REQ-06 WIRING tab: interactive node graph with pins and data/power/ground nets
- [ ] REQ-07 MECH tab: assembly hierarchy tree + viewer panel
- [ ] REQ-08 INSTRUCTIONS tab: tools & assumptions, phased steps with part/tool chips, persisted progress
- [ ] REQ-09 Generation engine: prompt → DesignPackage; deterministic local engine by default, Claude API engine behind `ANTHROPIC_API_KEY`
- [ ] REQ-10 Browser persistence (localStorage): my projects, stars, instruction progress
- [ ] REQ-11 Copy a community project into my projects
- [ ] REQ-12 README, MIT license, distinct branding (no blueprint.io assets)
- [ ] REQ-13 GitHub repo with per-phase issues and ship notes on every shipped phase

### Out of Scope

- Accounts, billing, credits, plans — open source, no monetization
- Real CAD/STL generation (ForgeCAD equivalent) — needs a geometry service; MECH ships tree + viewer panel instead
- Image upload / draw input — v2 candidate, needs vision model
- Public publishing/share links & contest — no backend in v1
- Cloning blueprint.io branding, logo, or copy — legal/ethical boundary
- Reusing scraped example designs (e.g. the laser-jammer project) — content policy; all seed data is original and benign

## Context

- blueprint.io researched live on 2026-08-29: landing (hero + prompt + community grid), project view tabs INFO/PARTS/WIRING/MECH/INSTRUCTIONS, FAQ documents generation flow, credits, CAD wallet, publishing.
- Development is driven by GSD Core (installed locally in `.claude/` via `npx @opengsd/gsd-core --claude --local`), following the Discuss → Plan → Execute → Verify → Ship phase loop with fresh-context executor subagents.
- No `ANTHROPIC_API_KEY` in the build environment — the deterministic engine is the default, verified path.

## Constraints

- **Tech stack**: Next.js (App Router) + TypeScript + Tailwind CSS 4 + @xyflow/react — boring, verifiable, static-exportable
- **No backend**: seed data bundled, user data in localStorage — keeps v1 deployable anywhere
- **Keyless default**: every feature must work without any API key
- **Branding**: name "OpenBlueprint", original copy and seed content, MIT license

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| One `DesignPackage` JSON schema as the spine | Every tab renders from it; LLM emits it via structured output; mock engine emits the same shape | — Pending |
| Deterministic template engine default, Claude engine opt-in | Only path verifiable without API key; real engine slots in behind env var | — Pending |
| @xyflow/react for wiring | Pan/zoom/nodes for free; hand-rolling a canvas engine is out of scope | — Pending |
| localStorage over database | v1 has no auth; keeps deploys static | — Pending |
| GitHub issues per phase as tracker | Linear MCP needs OAuth unavailable in this session; issues mirror into Linear later | — Pending |

---
*Last updated: 2026-08-29 after project initialization*
