# Movement Smoothing Roadmap

## Scope

This pass is additive only. `src/renderer/UnitRenderer.tsx` is the likely overlap
file for visual polish, so the first movement-smoothing artifact lives here and
does not change existing renderer behavior.

## What Feels Jerky Today

### Unit state advances faster than presentation settles

- `src/game/store.ts` advances real unit positions one tile at a time with
  `EXECUTION_STEP_MS = 95`.
- `src/renderer/UnitRenderer.tsx` interpolates each new tile target over
  `MOVE_STEP_SECONDS = 0.19`, clamped to `0.12-0.28s`.
- Because the store can publish the next tile while the unit is still animating
  toward the previous tile, the renderer repeatedly restarts an ease-out curve.
  That makes the unit feel like it surges and catches instead of running one
  continuous route.

### The easing curve is readable per tile, not over a whole run

- `easeOutCubic` gives a fast launch and slow finish for every target.
- During multi-tile movement, every store tick creates a fresh launch. The body
  bob and leg swing use global elapsed time, so they are not phase-locked to the
  path segment or to contact interrupts.
- The final snap is tactically correct, but the visual velocity curve can look
  non-human.

### Execute timing labels and resolver timing diverge

- `src/game/executeTimeline.ts` labels move/swing actions at `0.6s`.
- `commitPlannedActions` resolves utility, waits `EXECUTION_STEP_MS * 2`
  (`190ms`), then begins movement.
- This is mechanically fine for a prototype, but the player reads `0.6s` while
  the board starts moving much sooner, which makes cadence harder to parse.

### Path dragging is tile-gated but visually hard-swapped

- `InteractiveFloor` only recalculates hover paths when the pointer enters a
  new tile and ignores movement while a mouse button is down.
- That prevents redundant pathfinding during camera drags, but the preview line
  still swaps immediately to the new A* result. Fast hover over narrow routes can
  look like line flicker rather than intentional path adjustment.

### Camera/input is mostly protected, but stale hover can remain

- `MapControls` handles left/right drag panning with damping, and hover updates
  are skipped while buttons are down.
- There is no pointer-leave clearing on the interactive floor in the inspected
  path, so the last hover/path can remain visible after a pan until a new tile is
  crossed.

### Human usability tests do not measure movement feel yet

- `tests/human-usability.spec.ts` covers HUD reachability and camera abuse.
- There is no browser assertion for movement cadence, route readability, or
  click/drag path preview stability after planning and execute.

## Additive Helper

`src/renderer/movementEasing.ts` centralizes timing/easing values without
modifying renderer code:

- `TACTICAL_MOVEMENT_TICK_MS` mirrors the current `95ms` store cadence.
- `getMovementSegmentDurationSeconds` aligns segment duration with both tile
  distance and store tick cadence.
- `easeInOutCubic` is available for readable start/stop movement.
- `getDampedAlpha` gives renderer code a Three-independent way to damp toward a
  target while preserving frame-rate independence.

The helper is intentionally pure and small so it can be imported into
`UnitRenderer.tsx` when the orchestrator is ready to integrate visual work.

## Recommended Integration Patch

1. In `UnitRenderer.tsx`, replace local movement constants/easing with
   `movementEasing.ts`.
2. Keep tactical truth tile-based, but treat the renderer position as a
   continuous presentation position:
   - when `targetKey` changes, keep the current displayed position as `from`;
   - use `getMovementSegmentDurationSeconds(tileDistance)` for duration;
   - use `easeInOutCubic` for standalone moves, or `getDampedAlpha` for
     continuous catch-up while a run is receiving rapid tile ticks;
   - snap to the exact tile center only when progress is complete or when the
     target distance exceeds the teleport threshold.
3. Add a short settle window (`DEFAULT_MOVEMENT_TIMING.settleSeconds`) before
   body bob/leg swing reset to zero, so the figure does not visibly pop upright
   between closely spaced tile updates.
4. In planned execute, either make the resolver wait match the `0.6s` label or
   revise the timeline label to the real cadence. The board and queue should
   agree.
5. In `MapRenderer.tsx`, keep hover path calculation tile-gated, but add a
   pointer-leave clear and a light path-preview visual transition:
   - the committed tactical path remains tile-crisp;
   - only opacity/ghosting eases for roughly `80-120ms`;
   - no destination tile should shift away from exact grid centers.
6. After integration, run `npm run build`, `npm run lint`, and
   `npm run test:browser`. Then do one manual browser pass: plan a Banana move,
   scrub hover across adjacent destination tiles, run execute, and watch for
   continuous unit velocity through the route.

## Non-Goals For This Pass

- No edits to `UnitRenderer.tsx`.
- No broad store refactor.
- No change to pathfinding correctness or tactical tile/AP rules.
