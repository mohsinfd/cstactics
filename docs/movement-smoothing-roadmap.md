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
- May 20 locomotion pass: movement presentation now has a renderer-only
  `src/renderer/locomotion/LocomotionController.ts`. It turns a full legal path
  into one `MovementClip`, samples cumulative distance along the route, applies
  a single accelerate/coast/decelerate profile across the whole run, classifies
  forward/diagonal/strafe/backpedal/stop poses from movement direction versus
  aim direction, and exposes dev-only `window.__CS_TACTICS_MOVEMENT_DEBUG__`
  stats for active route id, progress, speed, pose, and endpoint error. CT AI
  movement now also publishes route-level presentation hints instead of only
  per-tile store updates.
- Immediate follow-up after human rejection: revealing the procedural leg/arm
  rig while moving was the wrong fix because it mixed two unit art systems.
  The renderer now keeps that legacy rig hidden and drives the visible 2.5D
  unit through generated SVG pose-frame assets for idle, run, diagonal, strafe,
  backpedal, stop-brace, hit, and dead states. Consecutive generated frames
  change actual limb/head/torso/rifle geometry rather than applying only a
  whole-sprite transform. The route-aware locomotion controller still supplies
  the legal path, speed, pose intent, and stride phase; gameplay truth remains
  tile-based.
- Movement presentation routes now include a duration hint derived from the
  same tactical tick cadence that advances store tile truth. `createMovementClip`
  stretches its route-level speed profile to that duration so the visible run
  lands with the tactical route instead of lagging into the next selection or
  turn handoff.

## Remaining Movement Feel Gap

- The presentation layer now has generated SVG pose assets and a URL-based
  manifest, but it still needs real artist/Blender-exported sprite or atlas art
  for premium foot planting, stop transitions, strafe silhouettes, and
  directional weapon/body reads. The manifest is a bridge so those frames can
  be swapped in without changing AP, pathfinding, LOS, or route sampling.
- May 21 asset-pipeline follow-up: the generated SVG script is now explicitly
  marked placeholder-only, `docs/unit-sprite-asset-contract.md` defines the
  production frame contract, and `scripts/blender/export-unit-sprite-sheet.py`
  establishes a manual Blender export path for `public/board2d5/units/exported`.
  `unitAnimationManifest.ts` can switch between generated and exported assets
  without touching `UnitRenderer`.
- Direct movement now waits for per-tile visual arrival times from
  `src/game/movementPresentationTiming.ts` before advancing store tile truth.
  That keeps direct-move contact interrupts aligned to visible arrival instead
  of firing on a fixed `95ms` loop while the renderer is still accelerating or
  decelerating through the route.
- In dev, setting `window.__CS_TACTICS_SHOW_MOVEMENT_DEBUG__ = true` shows the
  selected unit's route id, pose, route progress, speed, endpoint error, and
  current frame URL on the board.
- May 21 follow-up: movement timing constants now live in
  `src/game/movementTimingProfile.ts` and are consumed by both the game-side
  arrival-time helper and renderer-side locomotion controller. Planned execute
  movement and CT AI movement now use the same per-route arrival times instead
  of fixed per-tile waits, so visible routes share one timing model. The renderer
  also holds `stop_brace` for a short explicit beat after route completion before
  returning to idle. The remaining quality blocker is still authored CT/T sprite
  content; the current generated SVGs remain placeholder plumbing. The first
  proof target is documented at `art/sprite-proof/ct-rifle/README.md` so CT can
  switch to exported PNG frames independently of T once those assets exist.
- Route-level presentation aim and movement intent now exist on
  `MovementPresentationRoute`. Normal direct moves use `fast_reposition` so they
  mostly face movement direction; planned execute uses `cautious_hold_aim` for
  aim-locked movement; CT AI can use `move_to_hold_target` while moving to holds.
  This keeps strafe/backpedal presentation intentional instead of making every
  left-click move look like an angle-hold creep.
- Dev movement QA now has a deterministic console command:
  `window.__CS_TACTICS_START_MOVEMENT_PROOF__()`. It creates a one-CT proof,
  runs a 6+ tile forward leg and a lateral aim-locked leg, and works with
  `window.__CS_TACTICS_SHOW_MOVEMENT_DEBUG__ = true` to inspect pose, frame URL,
  progress, speed, endpoint error, stop-brace remaining time, and last completed
  route id. The same proof is also exposed as a dev-only `Move Proof` HUD button.
- `npm run sprites:validate` checks that all generated CT/T frames exist and
  blocks any team set to exported unless its required PNG frames are present.
  For exported PNGs it also checks dimensions, alpha presence, transparent
  background pixels, and coarse per-clip bounding-box center jitter.
- Store handoff after non-contact direct moves, planned execute movement, and CT
  AI movement now waits for the active movement intent's stop-brace beat before
  AP/selection/AI progression continues. Contact breaks still own their own
  shot/decision beat and do not wait behind this settle.
- Correctness follow-up: `face_move` now classifies against the sampled route
  movement direction instead of stale stored unit facing, so `fast_reposition`
  mostly reads as `run_forward`. Completed routes are guarded from stale
  `movementRoutes` reinitializing while stop-brace is counting down. Movement
  proof logging now records route, pose, and frame URL transitions, and
  `window.__CS_TACTICS_GET_MOVEMENT_PROOF_SUMMARY__()` returns pose coverage and
  unique frame counts by pose after a proof run.
- Briskness follow-up: `src/game/movementTimingProfile.ts` now defines
  intent-specific timing profiles instead of one careful-walk profile.
  `fast_reposition` uses a faster 11 tiles/sec route with a 120ms stop-brace for
  normal left-click movement, `cautious_hold_aim` keeps aim-locked proof/planned
  movement slower and more readable, and `move_to_hold_target` sits between them
  for CT AI holds. Store arrival timing, renderer clip sampling, stop-brace
  handoff, and proof summaries all consume the same intent profile.
- Render-jitter follow-up: sprite frame swaps no longer mark the material as
  needing update during `useFrame`; all unit animation textures are configured
  and GPU-prewarmed once after load. Dev QA can set
  `window.__CS_TACTICS_LOCK_UNIT_ANIMATION_FRAME__ = true` to separate route
  motion from flipbook-frame artifacts, and
  `window.__CS_TACTICS_GET_MOVEMENT_PERF_SUMMARY__()` reports delta spikes,
  movement distance, and frame-swap count after the movement proof. Per-tile
  movement feedback spam was removed from direct, planned, CT AI, and proof
  movement loops so HUD feedback work does not run on every route step.
