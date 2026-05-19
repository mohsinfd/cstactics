# Banana / B Fidelity Task List

## Specialist Memory Contract

A future map-fidelity specialist should start here after reading `CLAUDE.md`,
`AGENTS.md`, and `docs/current-state.md`.

When improving Inferno:

- Banana/B cover truth is gameplay-critical. Utility, LOS, route timing, and
  contact fairness depend on these tiles.
- Never resize or move cover without running `npm run map:validate`.
- Preserve route order: T reaches car, then logs, then sandbags/top Banana, then
  B site.
- Update this file after every map slice with exact coordinates, route metrics,
  what became better, and what remains suspicious.
- Prefer tiny validated mask/cover edits over broad unverified rewrites.

## Purpose

Banana and B site geometry must become a reliable gameplay contract before
utility, LOS, cover penalties, and execute timing can feel fair. The player
should understand car, logs, sandbags, top Banana, coffins, oranges,
construction, and site cover from the board without needing debug labels.

## Current Findings

- `src/game/maps/inferno.ts` has Banana/B callout zones and cover objects, but
  the props are still too thin to carry gameplay readability on their own.
- 2026-05-14 renderer-only pass: `src/renderer/MapRenderer.tsx` now grounds
  Banana/B landmarks with contact shadows, subtle floor variation, quieter cover
  labels, and richer Banana Car/logs/sandbags/coffins/oranges/fountain/crate
  detailing. This improves screenshot readability without changing map data,
  cover footprints, LOS, route timing, or walkable masks.
- 2026-05-19 renderer-only full-map pass: `src/renderer/diorama/InfernoSetDressing.tsx`
  adds primitive-only Inferno landmarks from the root `VGp3Yed.png` reference,
  including Banana arches/barrels, B ruins/columns/stairs, A pit/moto details,
  Mid/Top Mid/Boiler props, and T/CT spawn pads. `MapRenderer.tsx` also merges
  adjacent wall footprint tiles into longer clay slabs so Banana/B reads more
  like a shaped tactical map and less like one-tile wall teeth. Gameplay cover,
  walkable masks, LOS, AP, and route timing were intentionally unchanged.
- `Banana Car` was present at `(38,51)` with a `3x2` footprint. That reads
  smaller than the landmark should and only blocks six full-cover tiles.
- `Sandbags` are present in data at `(43,68)` with a `2x1` half-cover footprint,
  but that is too subtle to solve the user-reported "missing sandbags" problem.
- `Logs` at `(37,61)` and `Half Wall` at `(42,71)` are both `3x1`/`2x1` strips.
  They create cover rules, but not yet a believable staged Banana fight.
- The walkable mask around car/top Banana appears to be the larger fidelity
  risk: the blocked room/building mass behind car and the top-Banana transition
  need a coordinated mask pass, not a one-tile tweak.
- B site has the expected first-pass objects (`Coffins`, `First Oranges`,
  `Second Oranges`, `Fountain`, `New Box`), but route timing and LOS from
  Banana, CT, coffins, construction, and oranges are not validated yet.
- 2026-05-13 B-entry inspection: `Dark Boxes` currently sits at `(49,79) 1x2`.
  Its adjacent walkable tiles are mostly labeled `Oranges`, so it reads more
  like a site/oranges blocker than a construction-side anchor.
- In-memory test only, not applied: shifting `Dark Boxes` one tile east to
  `(50,79) 1x2` creates the desired construction adjacency at `(51,79)`,
  `(51,80)`, and `(50,81)`, but it also changes validation route timing
  (`T_to_B` `80 -> 77`, `CT_to_B` `48 -> 41`). Treat that as too much gameplay
  movement for an unreviewed tiny fix.

## Ranked Implementation Slices

### P0 - Banana Car Landmark

Status: started.

Change:
- Increase `Banana Car` from `(38,51) 3x2` to `(38,51) 4x2`.

Acceptance criteria:
- Car is recognizable at normal camera distance without relying on its label.
- Car remains full cover and blocks LOS through its physical footprint.
- Banana still has a playable path around the car on adjacent walkable floor.
- T-side approach to lower Banana is not sealed or reduced to an accidental
  one-way dead end.

### P0 - Sandbags Pocket

Status: started.

Change:
- Rework `Sandbags` from the old `(43,68) 2x1` strip into a visible `(43,67)
  3x2` half-cover pocket near top Banana.
- Keep the lane open at `x46..48` so upper Banana can still route into B entry.

Acceptance criteria:
- Sandbags are visible as a distinct top-Banana prop from the default camera.
- A unit adjacent to sandbags receives half cover from CT/site-facing angles.
- A unit can route around sandbags without pathfinding pinches.
- Smoke and flash previews can target both the sandbags pocket and the B-entry
  side of top Banana.

### P0 - Blocked Room Behind Car / Banana Boundary

Status: started.

Change:
- Opened the single walkable mask tile at `(42,51)` so the enlarged Banana Car
  no longer seals lower Banana from logs/top Banana.

Recommended next data change:
- Regenerate or hand-correct the walkable mask around lower Banana/car so the
  building mass frames the lane instead of creating a wrong room/blocker shape.
- Audit roughly `x34..45, y48..58` against a radar reference before changing
  cover placement further.

Acceptance criteria:
- The car-side wall mass reads as a Banana boundary, not an accessible or
  swallowed room.
- Movement, LOS, and smoke previews agree on blocked versus playable tiles.
- The car fight has readable approach tiles on both the T-side and top-Banana
  side of the prop.

### P1 - Logs / Half-Wall Staging

Status: not implemented.

Recommended next data change:
- Resize/reposition `Logs` from `(37,61) 3x1` and `Half Wall` from `(42,71) 2x1`
  after the mask pass, so they create distinct lower, middle, and top Banana
  decisions rather than thin decorative strips.

Acceptance criteria:
- Logs, car, sandbags, and half-wall form a sequence of recognizable cover beats.
- A unit can hold or clear each beat with meaningful flanking/covered states.
- No cover object overlaps a non-walkable-only area without intentionally
  representing a blocker.

### P1 - B Entry, Coffins, Oranges, Construction

Status: not implemented.

Recommended next data change:
- Validate B-site object footprints around `Coffins` `(39,79) 2x2`, `First
  Oranges` `(45,74) 1x2`, `Second Oranges` `(47,76) 1x2`, and construction
  entry lanes from `x49..63, y70..84`.
- Coordinate task: decide whether `Dark Boxes` should move from `(49,79) 1x2`
  to `(50,79) 1x2`, or whether the construction-side cover needs a separate
  authored object instead. The simple one-tile east shift improves adjacency to
  construction but currently shortens `T_to_B` and `CT_to_B`, so it should be
  paired with a route review rather than merged as an isolated micro-edit.

Acceptance criteria:
- Banana-to-site entry has playable lanes into coffins/oranges/default.
- Coffins and oranges create expected cover without sealing site circulation.
- Construction to site and CT to site routes remain navigable.
- Plant zone B remains reachable and not dominated by accidental blockers.
- If `Dark Boxes` is moved east, `npm run map:validate` must still report
  `coverPlacementWarnings: 0`, `coverAdjacencyWarnings: 0`, and
  `routeSanityWarnings: 0`, and the orchestrator must explicitly accept any
  `T_to_B` or `CT_to_B` route-timing delta.

### P2 - Verification Checklist

Status: started. Renderer-only visual polish now has a checked browser
regression baseline.

Checks:
- `npm run map:validate` now reports Banana/B landmark routes: T Spawn to car,
  logs, sandbags, CT Spawn to sandbags, and Top Banana to B site.
- `npm run map:validate` now reports adjacent walkable tile counts for Banana
  car, logs, sandbags, half-wall, coffins, and oranges.
- `npm run map:validate` now fails when Banana route ordering regresses: car
  should precede logs, logs should precede sandbags, and sandbags/top Banana
  should precede B site.
- After the `(42,51)` mask fix, `T_to_Banana_Logs` dropped from `152` to `63`
  tiles and `T_to_Banana_Sandbags` reads `67`, which is a better route-order
  sanity check for lower-to-top Banana.
- Banana Drill: held lane, movement warning, smoke blocking, flash radius, shot
  preview, and contact break.
- Debug screenshot: capture Banana/B after each mask or cover edit and compare
  car, sandbags, logs, top Banana choke, coffins, oranges, and construction.
- Renderer-only prop polish should still run `npm run build`, `npm run lint`,
  and `npm run test:browser`; `npm run map:validate` is required only when
  cover data, walkable masks, LOS, or route-affecting map files change.
- Full-map renderer set dressing should additionally get a first-load browser
  screenshot check against `VGp3Yed.png` to ensure added landmarks do not read
  as gameplay blockers or hide units/overlays.

Acceptance criteria:
- A screenshot/checklist artifact exists for Banana/B map edits.
- Build passes after map-data changes.
- Utility tuning waits until Banana/B blocked/walkable/cover truth is stable.
