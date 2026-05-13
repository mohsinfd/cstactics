# Banana / B Fidelity Task List

## Purpose

Banana and B site geometry must become a reliable gameplay contract before
utility, LOS, cover penalties, and execute timing can feel fair. The player
should understand car, logs, sandbags, top Banana, coffins, oranges,
construction, and site cover from the board without needing debug labels.

## Acceptance

- Banana reads as a curved, narrow pressure lane with believable car/logs/
  sandbags/top-Banana cover.
- Car is large enough to be recognizable and to create real full-cover behavior,
  but it does not over-block the lane.
- Sandbags exist as a meaningful half-cover pocket near top Banana.
- The room/building mass behind car does not visually or mechanically swallow
  the route/site.
- B site has playable lanes from Banana, coffins, oranges, construction, and CT.
- Smoke/flash/LOS previews use the same blocked/walkable/cover truth as
  movement and shooting.

## Tasks

- [x] Audit current Banana/B walkable mask tiles against an Inferno radar reference:
  bottom Banana, car, logs, sandbags, top Banana, B entry, coffins, oranges,
  construction, CT.
- [x] Fix the car area first: resize/reposition `Banana Car` so it is visually
  obvious, occupies plausible full-cover tiles, and leaves a readable route
  around it.
- [x] Fix sandbags next: place a visible `Sandbags` half-cover object in the real
  top-Banana pocket and verify it affects directional cover from CT/site angles.
- [ ] Split the oversized wall/building mass behind car into smaller boundary
  contours so it frames Banana instead of covering the whole site/read.
- [x] Add or adjust `Logs`, `Half Wall`, and top-Banana cover so Banana has staged
  decisions instead of one giant exposed corridor.
- [x] Verify that cover objects produce the intended walkability: cover tiles block
  movement where they are physical props, nearby floor tiles remain playable.
- [ ] Validate key route timings after geometry edits: T Spawn to car, T Spawn to
  top Banana, CT Spawn to coffins, CT Spawn to B site, construction to B site.
- [ ] Add a debug screenshot/checklist for Banana/B that can be compared after each
  map edit.
- [ ] Test gameplay from the Contact Drill after every map change: held lane,
  movement warning, smoke blocking, flash radius, shot preview, and contact
  break.
- [ ] Only after Banana/B is stable, tune utility radii and LOS around that area.
