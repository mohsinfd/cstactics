# Banana / B Fidelity Task List

## Purpose

Banana and B site geometry must become a reliable gameplay contract before
utility, LOS, cover penalties, and execute timing can feel fair. The player
should understand car, logs, sandbags, top Banana, coffins, oranges,
construction, and site cover from the board without needing debug labels.

## Current Findings

- `src/game/maps/inferno.ts` has Banana/B callout zones and cover objects, but
  the props are still too thin to carry gameplay readability on their own.
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

Acceptance criteria:
- Banana-to-site entry has playable lanes into coffins/oranges/default.
- Coffins and oranges create expected cover without sealing site circulation.
- Construction to site and CT to site routes remain navigable.
- Plant zone B remains reachable and not dominated by accidental blockers.

### P2 - Verification Checklist

Status: started.

Checks:
- `npm run map:validate` now reports Banana/B landmark routes: T Spawn to car,
  logs, sandbags, CT Spawn to sandbags, and Top Banana to B site.
- `npm run map:validate` now reports adjacent walkable tile counts for Banana
  car, logs, sandbags, half-wall, coffins, and oranges.
- After the `(42,51)` mask fix, `T_to_Banana_Logs` dropped from `152` to `63`
  tiles and `T_to_Banana_Sandbags` reads `67`, which is a better route-order
  sanity check for lower-to-top Banana.
- Contact Drill: held lane, movement warning, smoke blocking, flash radius, shot
  preview, and contact break.
- Debug screenshot: capture Banana/B after each mask or cover edit and compare
  car, sandbags, logs, top Banana choke, coffins, oranges, and construction.

Acceptance criteria:
- A screenshot/checklist artifact exists for Banana/B map edits.
- Build passes after map-data changes.
- Utility tuning waits until Banana/B blocked/walkable/cover truth is stable.
