# Blueprint.io walkthrough — authenticated (user's Chrome), 2026-08-29

Signed-in exploration of blueprint.io done in the user's browser at their request. What the real product does, and what v1 copies vs. defers.

## Signed-in shell
- Left sidebar: account chip, Home / Community / Projects, RECENT project list (name + "N parts"), Discord + feedback + upgrade links. Collapses in project view.
- Landing (Home): hero "BLUEPRINT SOMETHING REAL", animated-placeholder prompt box with idea/upload/draw buttons and model pill (Lite), contest button.

## Generation flow (ran one real generation: "self-watering desk planter…")
1. Submit → dedicated run view at `/blueprint?run={uuid}` — prompt bubble at top, chat input at bottom (with stop button), "Upgrade for better models" banner.
2. AI streams design-decision bullets ("Select an ESP32 or Arduino Nano… capacitive soil moisture sensor… 5V submersible micro pump via MOSFET…").
3. Staged checklist with live spinner + sub-status lines:
   `PLANNING ARCHITECTURE → CLARIFYING DESIGN CHOICES → GENERATING ELECTRICAL DESIGN → GENERATING MECHANICAL DESIGN (→ mapping mounts) → DESIGN READY`
4. Clarifying stage = REFINE_DESIGN card: "Answer to customize the hardware architecture, or skip to use defaults." 3 multiple-choice questions (each with Other…), e.g. pump switching method (MOSFET/relay/L298N/SSR), power strategy, sensor type. Buttons: SKIP / GENERATE / "More questions →".
5. Design materializes progressively in the project view: title, tags, AI summary, BOM skeleton rows; tab icons get dot badges as their data lands.
6. AI render can fail independently of the design — inline error "The initial image could not be generated. Click **Retry** to continue from the finished design." with RETRY button.
7. A dino-style mini-game ("PRESS SPACE TO JUMP") plays during waits.

## Project workspace (owner)
- Header: renamable title dropdown, tabs INFO/PARTS/WIRING/MECH/INSTRUCTIONS, DOWNLOAD (Pro ZIP), green PUBLISH.
- Left CHAT panel: conversation history (prompt bubble + streamed bullets), SUGGESTIONS (3 design-specific question chips, regenerate per design), input "> Ask about this design..." with **Edit | Ask** mode toggle, image + draw buttons, model pill.
- INFO (owner-editable): image gallery + "+" slot, removable tags + ADD TAG, AI SUMMARY with regenerate, editable IMAGE PROMPT, rich-text project notes.
- WIRING: "ENRICH WIRING" button; nodes contain part photos + pin chips; edges labeled (5V, analog, gate, PWM); sidebar = electrical parts by category with eye-visibility toggles + DATA/POWER/GROUND legend; zoom/fit controls. URL `?tab=graph`.
- Category set observed includes MODULE (e.g. "Pump MOSFET Switch — IRL540 N-Channel MOSFET") in addition to MCU/SENSOR/ACTUATOR/POWER/ENCLOSURE/3D PRINT/MISC.
- MECH: ForgeCAD viewer, parts tree, "CAD 0/10" wallet counter, per-part Generate CAD (STL/STEP/GLB download; credits) — **not rebuilt in v1**.
- My Projects: search, ALL/PUBLISHED/STARRED, sort by recency/stars, hover trash delete, cards = cover/title/summary excerpt/date/part count.

## Adopted into v1 scope (updates applied)
- `module` added to PartCategory.
- Phase 4 generation UX now mirrors the run view: staged checklist + streamed decision bullets + refine-questions step (deterministic per archetype in LocalEngine) + progressive tab badges.
- Chat panel: Ask-mode heuristic answers + per-design suggestion chips keyless; real Claude answers when key present. Edit-mode = regenerate with modifier (LocalEngine) / real edit (ClaudeEngine).
- My Projects page pattern (search/filter/sort/delete).

## Explicitly deferred
- CAD generation/downloads, image renders (render slot ships as styled placeholder + retry pattern), publish/share backend, credits/upgrade UI, contest, draw/upload inputs.
