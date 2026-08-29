# STATE.md — Project Memory

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-29)

**Core value:** Prompt in → complete design package out across five views
**Current focus:** Phase 1 — Foundation

## Current Position

- Milestone: v1
- Phase: 2 ∥ 3 (Document views ∥ Diagram views), executing in parallel subagents
- Status: Phase 1 shipped 2026-08-29
- Last activity: 2026-08-29 — Phase 1 verified in browser and shipped; issue #1 closed

## Accumulated Decisions

- 2026-08-29: `DesignPackage` schema is the spine; all views render from it
- 2026-08-29: Deterministic `LocalEngine` is the default generation path (no API key in env); `ClaudeEngine` behind `ANTHROPIC_API_KEY`
- 2026-08-29: GitHub issues stand in for Linear until the Linear MCP connector is authorized by the user
- 2026-08-29: Seed content is original and benign; scraped examples (laser jammer) explicitly not reused

## Blockers

- Linear MCP requires OAuth in an interactive session — user action needed before Linear sync

## Session Continuity

Next step: execute Phase 1 (scaffold, schema, seeds, landing), then dispatch parallel executors for Phases 2 and 3.
