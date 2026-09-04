# SHIPLOG

One entry per shipped phase. Full notes in `.planning/notes/`.

| Date | Phase | Shipped | Note |
|------|-------|---------|------|
| 2026-08-29 | 1 — Foundation | Scaffold, DesignPackage schema, design system, landing, project shell, exemplar seed | [phase-1-ship-note](.planning/notes/phase-1-ship-note.md) |
| 2026-08-29 | 2 — Document views | INFO, PARTS, INSTRUCTIONS tabs; per-project step progress | — |
| 2026-08-29 | 3 — Diagram views | WIRING pin-level node graph, MECH assembly tree | — |
| 2026-08-29 | 4 — Generation & persistence | Prompt → plan → questions → build; localStorage projects, stars, copies | — |
| 2026-08-29 | 5 — Verify & ship | Browser walkthrough, star/copy wired to the store, README + LICENSE | — |
| 2026-08-30 | 6 — Visual views | Part geometry spine, procedural part art, three.js assembly viewer with STL export, ARCH block diagram, deep-linkable tabs | — |

## v1.0.0 — 2026-09-01

Phase 10, production hardening. The app is responsive to 375px, keyboard
navigable with a visible focus ring everywhere, indexable, and it degrades
instead of breaking.

- **Responsive (Sonnet).** Nav collapses, wide content scrolls inside its own
  container rather than the page body, MECH and WIRING stack their side panels
  under the canvas on narrow screens, touch targets reach 40px.
- **Accessibility (Sonnet).** Raised `--text-faint` from 3.1–3.3:1 to 4.6–5.0:1
  so every dim-text pair clears AA; an app-wide `:focus-visible` ring that beats
  the `outline-none` trap wherever it appears, including inside the diagram
  library's own stylesheet.
- **Metadata (Haiku).** Per-route titles through a `%s — OpenBlueprint`
  template, OpenGraph and Twitter tags, `robots.txt`, an SVG favicon and Apple
  icon, and a designed 404. `/new` and `/projects` are noindex — they are
  user-state screens backed by local storage.
- **Resilience (Opus).** Each of the six views sits in its own error boundary,
  so a malformed design degrades one tab instead of white-screening the app.
  Generation has timeouts and a retry that genuinely re-runs; storage failures
  surface instead of being swallowed; share payloads are checked for internal
  consistency, not just shape.

Verified on the production build: no horizontal body overflow at 375px, the tab
bar scrolls, a design with an unknown part category shows the Wiring boundary
while Info and Mech still render, the console keeps the diagnostic, and the
focus ring paints.

Orchestrator fixes during verification: the 404 linked to `/p`, which does not
exist; the chat pill covered the total-cost figure on narrow screens.
