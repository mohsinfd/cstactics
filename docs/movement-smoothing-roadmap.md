# Movement Smoothing Roadmap

## Specialist Memory Contract

A future movement-feel specialist should start here after reading `CLAUDE.md`,
`AGENTS.md`, and `docs/current-state.md`.

When improving movement/camera/input:

- Preserve tactical truth. Game state remains tile-based; renderer motion is
  presentation.
- Optimize for human hands: quick mouse drags, trackpad pans, pinch/zoom,
  high-zoom vertical movement, and finding HUD controls after camera abuse.
- Keep timing helpers centralized in `src/renderer/movementEasing.ts`.
- Avoid broad store rewrites unless the orchestrator explicitly scopes them.
- After every movement/input slice, update this file with the decision, test
  result, and remaining friction.
- Run `npm run build`, `npm run lint`, and `npm run test:browser` after
  integration.

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

### Execute timing labels and resolver timing are now partially aligned

- `src/game/executeTimeline.ts` owns default execute offsets.
- Planned actions now carry `executeAtMs`.
- `commitPlannedActions` waits for the first movement/swing beat before moving,
  so the player-facing `0.6s` label is no longer purely decorative.
- This is still a first pass: offsets are not editable by the player yet.

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
- `easeInOutStride` is the default segment progress curve. It blends a small
  linear component into the cubic ease so repeated `95ms` tile retargets do not
  visually restart from a dead stop every step.
- `getDampedAlpha` gives renderer code a Three-independent way to damp toward a
  target while preserving frame-rate independence.

The helper is intentionally pure and small so it can be imported into
`UnitRenderer.tsx` when the orchestrator is ready to integrate visual work.

## Recommended Integration Patch

1. Keep `UnitRenderer.tsx` on `movementEasing.ts` for segment durations and
   progress curves.
2. Keep tactical truth tile-based, but treat the renderer position as a
   continuous presentation position:
   - when `targetKey` changes, keep the current displayed position as `from`;
   - use `getMovementSegmentDurationSeconds(tileDistance)` for duration;
   - use the default stride-blended `getSegmentProgress` for tile steps, or
     `getDampedAlpha` for continuous catch-up while a run is receiving rapid
     tile ticks;
   - snap to the exact tile center only when progress is complete or when the
     target distance exceeds the teleport threshold.
3. Add a short settle window (`DEFAULT_MOVEMENT_TIMING.settleSeconds`) before
   body bob/leg swing reset to zero, so the figure does not visibly pop upright
   between closely spaced tile updates.
4. Continue evolving planned execute offsets on top of the current `executeAtMs`
   contract toward a true simultaneous combat timeline.
5. In `MapRenderer.tsx`, keep hover path calculation tile-gated, but add a
   pointer-leave clear and a light path-preview visual transition:
   - the committed tactical path remains tile-crisp;
   - only opacity/ghosting eases for roughly `80-120ms`;
   - no destination tile should shift away from exact grid centers.
6. After integration, run `npm run build`, `npm run lint`, and
   `npm run test:browser`. Then do one manual browser pass: plan a Banana move,
   scrub hover across adjacent destination tiles, run execute, and watch for
   continuous unit velocity through the route.

## Non-Goals For The Movement Presentation Track

- No broad store refactor unless the movement resolver itself becomes the
  bottleneck.
- No change to pathfinding correctness or tactical tile/AP rules.
- No diagonal corner cutting: renderer smoothing must consume legal tile centers
  from the store rather than inventing a shorter visual route through blockers.

## Completed Timing Follow-Up

- The execute queue now has bounded `-/+` timing controls per planned action.
- Smoke/flash plans can be nudged inside the pre-swing utility band, while move
  plans can be staggered across the swing band.
- `commitPlannedActions` now honors utility delays and each movement runtime's
  own `executeAtMs` start instead of launching every move at the earliest swing
  beat.
- Remaining friction: this is still a two-band utility/swing contract, not yet a
  production timeline with simultaneous shot, utility, and interrupt ordering.
- Renderer movement timing now lands closer to the `95ms` store tick instead of
  easing each tile for roughly twice the resolver cadence. The unit renderer
  also clamps catch-up duration so a visually delayed miniature does not get
  progressively slower, and the stride/brace pose has a longer settle window for
  less tile-shuffle motion. Gameplay state, AP, pathfinding, LOS, and execute
  resolution remain unchanged.
- Main-board movement now uses a continuous presentation queue in
  `UnitRenderer.tsx`: every store-published tile remains the tactical truth, but
  the miniature consumes those tile centers as a route at near-constant speed
  instead of restarting an ease-out curve per tile. This removes the visible
  hop/pause cadence while preserving obstacle legality, because the renderer
  still passes through the pathfinder's tile centers. Stride animation is now
  phase-driven by distance traveled rather than raw wall-clock time, so the body
  does not pop between adjacent tile updates.
- Direct movement flow now treats each completed move as a handoff moment:
  selection cycles to the next same-side unit with AP, and the side advances
  automatically when no active-side unit can act. This reduces the repeated
  "move one soldier, hunt for the next soldier" friction while keeping AP and
  legal pathing unchanged.
- The store now exposes route-level movement presentation hints through
  `movementRoutes`. Direct moves and planned execute moves publish their full
  legal tile path before the resolver starts stepping unit positions. The unit
  renderer seeds its continuous queue from that path and uses gentler route
  catch-up plus damped run-blend pose transitions, so movement reads more like
  one continuous run than a sequence of separate tile arrivals.
- May 19 follow-up: `UnitRenderer.tsx` now treats a seeded full-route queue as
  authoritative for presentation while it is still running. Store updates still
  advance through exact legal tile centers, but the renderer no longer appends
  those same intermediate state targets into the queue a second time. This fixes
  the observed "moves forward, gets pulled back, then replays the smooth route"
  bug without changing AP, pathfinding, LOS, or resolver timing.

## Remaining Movement Feel Gap

- The presentation layer still lacks authored soldier pose assets: acceleration,
  deceleration, lean, strafe/aim poses, foot planting, and stop transitions are
  approximated procedurally rather than animated as a real sprite/model set.
- To reach "tiny soldier" quality, the next slice should add a route-aware pose
  state machine and/or authored sprite frames for idle, run, strafe, aim, stop,
  hit, and casualty states. The movement path should continue passing through
  legal tile centers, but the visual body needs higher-fidelity animation on top
  of the route-level handoff.
