# Requirements: OpenBlueprint v1

Scoped requirements for the v1 milestone. IDs are referenced by ROADMAP.md phases and ship notes.

## v1 Requirements

| ID | Requirement | Phase | Acceptance |
|----|-------------|-------|------------|
| REQ-01 | Landing page: hero headline, prompt box with engine selector, community projects grid, top nav (About, GitHub), footer | 1 | Renders at `/`; cards link to project pages |
| REQ-02 | `DesignPackage` TypeScript schema: meta, parts (category/domain/qty/cost/pins/print settings), connections (pin-to-pin, net type), assembly tree, tools, assumptions, instruction phases | 1 | Types compile; all seeds + engine output typecheck |
| REQ-03 | 4 original seed projects: line-follower robot, balcony weather station, 4-key macropad, self-watering planter | 1 | Each has ≥10 parts, ≥6 connections, ≥3 instruction phases |
| REQ-04 | INFO tab: AI summary, feature tags, author, collapsible BOM rollup by category → subcategory with part counts and costs, grand total | 2 | Matches seed data totals |
| REQ-05 | PARTS tab: text search, category filter, rows with image placeholder, name, role, description, badge, qty, unit ~cost, subtotal; total estimated cost footer | 2 | Search + filter combine; totals correct |
| REQ-06 | WIRING tab: node graph (pan/zoom), part nodes grouped by category color with pin handles, edges styled by net (data solid / power dashed / ground muted) with labels, legend, electrical parts sidebar | 3 | All seed connections render; no overlapping initial layout |
| REQ-07 | MECH tab: assembly hierarchy tree (enclosure → mounts → components) with category badges and counts; viewer panel with placeholder state | 3 | Tree mirrors `assembly` data |
| REQ-08 | INSTRUCTIONS tab: tools & assumptions card, numbered phases (Fabricate/Wire/Bring-up/Assemble pattern), steps with tool + part chips and detail text, per-step checkboxes, N/M done counters | 2 | Progress persists in localStorage per project |
| REQ-09 | Generation: `DesignEngine` interface; `LocalEngine` (deterministic, keyless, template + prompt-derived) default; `ClaudeEngine` via `/api/generate` when `ANTHROPIC_API_KEY` set; staged progress UI | 4 | Prompt → project without network key; same schema both engines |
| REQ-10 | Persistence: localStorage store for my projects, stars, instruction progress; My Projects page with search/filter | 4 | Survives reload |
| REQ-11 | Copy: "Copy" on a community project clones it into my projects for editing/regeneration | 4 | Copied project independent of seed |
| REQ-12 | Docs & branding: README (screenshots, architecture, honest non-affiliation note), MIT LICENSE, original name/logo/copy | 5 | Repo presentable |
| REQ-13 | Process: GitHub repo, issue per phase, ship note per phase (`.planning/notes/` + SHIPLOG.md), issues closed on ship | 5 | All notes exist; issues closed |

## Deferred (v2 candidates)

- Image/sketch input to generation (vision)
- Real parametric CAD generation + STL/STEP export
- Backend with auth, publishing, share links
- Linear sync (blocked on MCP OAuth in an interactive session)
- ZIP export of the design package
