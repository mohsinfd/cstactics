# Current State

## Product Verdict

CS2 Tactics currently has a promising tactical prototype shell, but it is not yet
a complete CS/XCOM game loop. The most important missing piece is contact:
angles, visibility, held lanes, shots, damage, trades, and freeze-on-contact.

The project already has many future-facing nouns: weapons, phases, bomb state,
cover, roles, economy, and map callouts. The next production push must add the
verbs that make those nouns matter.

## Implemented

- Vite, React, Three, and Zustand browser prototype.
- Game state separated from renderers and UI.
- Inferno-inspired data model with zones, callouts, spawns, plant zones, cover
  objects, and validation tooling.
- Radar-derived walkable mask and route validation.
- Unit selection and active-team roster.
- A* pathfinding and movement range calculation.
- AP-banded movement preview.
- XCOM-style movement boundary outlines for 1 AP / 2 AP decisions.
- Hovered tile path preview, AP cost, shot-remains/full-commit badge, and
  destination cover readout.
- Destination risk card that groups AP, cover, and threat/contact state.
- Hovered destination exposure readout against visible enemies and held lanes.
- Movement range tiles visible to known enemies receive a danger tint.
- Player hover/selection feedback with tactical brackets and facing arcs.
- Planning mode that queues move orders.
- Planned path/destination previews for queued move orders.
- Queued move rows and planned destination markers show `WATCH` or `DANGER`
  when the planned route/destination is risky.
- Command bar with planning, execute, and end-turn controls.
- Basic team turn switching and auto-advance between usable units.
- Line-of-sight helper for grid-based visibility.
- Hold Angle action foundation.
- Watched-lane overlay for held angles.
- Hold Angle hover preview before committing a lane.
- Hovered/queued move warning when crossing a live held lane.
- Minimal reaction-fire resolver for queued movement through held lanes.
- Minimal direct Shoot action with setup-phase disabled reason.
- Shared shot preview/resolution math for visible targets, hit chance, and
  damage.
- Selected-unit target list for visible enemies, including out-of-range
  distinction.
- Shootable target rings and hit-chance labels in shoot mode.
- Shoot mode draws line-of-fire overlays with hit chance.
- First-pass directional cover penalty for shots: adjacent cover only helps when
  it is between shooter and target.
- Combat log panel for hit/miss/damage feedback.
- Contact Break panel for reaction-fire interrupts.
- Board-level hit/miss marker at the combat event tile.
- Contact breaks automatically switch the selected survivor into Shoot mode for
  the immediate trade decision.
- Contact Drill prototype scenario for testing the Banana hold/crossing loop.
- Pointer hover updates are gated by tile to reduce redundant path recalculation
  during dragging.
- Planned movement resolves in short visible ticks and interrupts on held-angle
  contact.
- Angled orthographic tactical camera with explicit `lookAt` orientation so the
  board reliably appears on first load.
- Landmark cover silhouettes for Inferno readability: Banana Car, Logs,
  Sandbags, B Fountain, Coffins, Oranges, Truck, Library Shelf, rails, walls,
  and pillars.

## Partially Implemented

- Roles exist as data and visual identity, but not yet as tactical jobs.
- Weapons exist as data and now drive simple preview/damage resolution, but
  ammo, reload, recoil depth, and richer per-modifier shot breakdowns are still
  missing.
- Cover exists as static geometry/readout and now contributes to basic
  directional shot penalties, but flanked/exposed logic and cover-corner fidelity
  are still missing.
- Bomb state exists as data, but plant/defuse actions are not implemented.
- Economy exists as state, but no buy phase or round-to-round decision loop uses it.
- Planning exists for movement with a first-pass ticked execute, but not yet a
  full multi-order CS timeline with utility offsets and simultaneous beats.

## Not Implemented Yet

- Directional/production-grade line-of-sight solver.
- Full shot preview breakdown before commit.
- Crit/headshot logic and richer kill feed.
- Production-grade Hold Angle / overwatch lifecycle.
- Full freeze-on-contact state machine and cinematic interrupt timeline.
- Flanked/exposed warnings.
- Smoke, flash, molly, HE, or utility timing.
- Ammo and reload.
- Plant, defuse, dropped bomb, or bomb timer pressure.
- Enemy AI.
- Audio.
- Real synchronized execute timeline.

## Immediate Focus

Finish hardening the first contact vertical slice before broadening the game:

1. CT holds Banana.
2. T queues movement through Banana.
3. The destination/movement preview warns that the lane is watched.
4. The player commits.
5. Movement resolves in short ticks and stops when contact occurs.
6. The CT sees the crossing and reaction fire triggers.
7. Hit chance and damage resolve.
8. The game surfaces a contact break so the player can make the trade/continue
   call.

This is the first moment where the game can feel like Counter-Strike slowed into
XCOM-style decisions.
