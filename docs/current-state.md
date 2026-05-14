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
- Cover-placement validation now catches visible cover objects that do not
  resolve to gameplay cover tiles.
- Unit selection and active-team roster.
- A* pathfinding and movement range calculation.
- AP-banded movement preview.
- XCOM-style movement boundary outlines for 1 AP / 2 AP decisions.
- Weapon shot AP costs: pistols, SMGs, and melee cost 1 AP to fire; rifles and
  snipers cost 2 AP.
- Selected-unit action buttons show AP costs for shooting, holding, utility, and
  reload actions.
- Hovered tile path preview, AP cost, shot-remains/full-commit badge, and
  destination cover readout.
- Destination risk card that groups AP, cover, and threat/contact state.
- Hovered destination exposure readout against visible enemies and held lanes.
- Movement range tiles visible to known enemies receive a danger tint.
- Player hover/selection feedback with tactical brackets and facing arcs.
- Planning mode that queues move orders.
- Planning mode can queue first-pass smoke and flash orders, resolving utility
  before movement during `Run Execute`.
- Execute queue now shows first-pass CS timing bands: utility starts at `0.0s`
  and movement/swing starts at `0.6s` by default.
- Planned actions now carry authored execute timing (`executeAtMs`), and the
  execute queue exposes bounded `-/+` controls for first-pass per-order timing.
- The resolver honors utility beat delays and staggered movement starts instead
  of treating queue timing as display-only.
- Planned path/destination previews for queued move orders.
- Planned map markers include timing labels so board state matches the execute
  queue.
- Queued move rows and planned destination markers show `WATCH` or `DANGER`
  when the planned route/destination is risky.
- Command bar with clearer Plan Execute, Banana Drill, Run Execute, and End Turn controls.
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
- First-pass headshot/critical system uses weapon crit chance and crit damage in
  shot previews and combat resolution.
- Selected-unit target list for visible enemies, including out-of-range
  distinction.
- Shootable target rings and hit-chance labels in shoot mode.
- Shoot mode draws line-of-fire overlays with hit chance.
- First-pass directional cover penalty for shots: adjacent cover only helps when
  it is between shooter and target.
- Shot previews now distinguish protected, flanked, and exposed targets instead
  of treating all nearby cover as equal.
- Directional cover now weighs corner/diagonal protection lower than direct
  face cover and labels corner protection in previews.
- Visible target cards, tile risk cards, contact breaks, and combat logs show
  compact aim breakdowns with range and cover modifiers.
- Visible target cards show headshot chance/damage before the player fires.
- Movement danger overlays now separate exposed/flanked danger from protected
  contested tiles.
- Combat log panel for hit/miss/damage feedback.
- Combat events now track target HP before/after a hit and flag eliminations.
- First-pass kill feed clarity: combat log, contact break copy, shot marker, and
  tracer labels distinguish eliminations from normal hits.
- Combat events now carry weapon identity, and first-pass shot presentation uses
  weapon-class tracer width/count, board damage numbers, recoil scale, audio
  weight, contact-break styling, and combat-log weapon chips.
- Combat audio now has a first-pass cue/mix profile layer with quieter UI and
  movement buses, stronger reaction/contact buses, gain caps, and chronological
  playback for newly seen recent events instead of only the newest log item.
- Unit weapon meshes now follow the actual equipped weapon category for length,
  barrel, scope, suppressor, muzzle anchor, and muzzle scale while preserving
  role body/gear identity.
- Generated unit sprites now use a shared sprite visual profile for team
  palette, headgear marks, armband/chest badge, role glyph placement, and role
  weapon/gear layer intent instead of duplicating canvas-only art direction.
- Unit tactical state visuals now use a local renderer hierarchy for selected,
  selected-spent, hovered, shootable target, out-of-range target, spent, live,
  and inactive units so action state reads ahead of decorative role detail.
- Dead units now leave a small team/role casualty marker on the tactical board.
- Durable Contact Break decision panel for reaction-fire interrupts. The store
  now records the execute beat, contact tile, shooter/stopped unit, best
  immediate trade shot, and bomb pressure until the player responds.
- Contact Break interrupts now carry reusable execute timeline events plus a
  compact HUD-compatible timeline that explains the lane cross, held defender,
  shot result, and trade/bomb call without changing combat resolution.
- Direct moves and planned executes persist `currentExecuteTimeline` /
  `lastExecuteTimeline` state with ordered utility, movement/swing, contact,
  shot-result, and decision events for inspection and regression coverage.
- A compact player-facing execute rail now uses `currentExecuteTimeline` during
  resolution and `lastExecuteTimeline` after clean completed executes, giving a
  first-pass live/debrief beat read without duplicating the Contact Break panel.
- Contact Break now leads with a stronger decision frame: stopped player,
  shooter, weapon result, best responder/trade read, bomb pressure, and the
  immediate tactical call are visible in the compact panel.
- Board-level hit/miss marker at the combat event tile with a short fade/lift
  animation, including a stronger elimination state.
- First-pass combat presentation VFX: shooter recoil, muzzle flash, target hit
  shock, weapon-flavored tracer/impact feedback, timed tracer decay, and
  casualty death pulse.
- Procedural shot/contact audio cues play for direct fire, reaction fire, hits,
  misses, and eliminations; reaction-fire contact now gets a stronger
  procedural sting.
- Contact breaks automatically switch the selected survivor into Shoot mode for
  the immediate trade decision, while the Contact Break panel keeps showing the
  trade/bomb context.
- Banana Drill prototype scenario for testing the Banana hold/crossing loop.
- Duel Lab debug scenario for quickly testing a one-T versus one-CT combat
  state with immediate movement, shooting, utility, cover, and weapon feedback.
- Pointer hover updates are gated by tile to reduce redundant path recalculation
  during dragging.
- Wheel/trackpad scroll pans the tactical board by default; modified wheel and
  view buttons handle zoom.
- Camera input now separates trackpad-style pan/pinch from discrete mouse-wheel
  zoom and has a repeatable usability test in
  `docs/usability-camera-input-test.md`.
- HUD panels and primary actions now expose stable `data-testid` hooks for
  human-click browser usability checks.
- Automated browser usability regression runs through `npm run test:browser`
  across desktop, narrow laptop, and compact HUD viewports.
- Browser regression now includes a deterministic Banana Drill contact-freeze
  flow so the decision panel and trade action stay reachable after execute.
- Post-feature human usability regression protocol is documented in
  `docs/human-usability-regression.md`.
- Main-thread orchestration, specialist-agent ownership, and done-definition
  rules are documented in `docs/orchestrator-framework.md`.
- Player visualization and movement smoothing now have bounded specialist
  handoff artifacts in `docs/player-visualization-roadmap.md` and
  `docs/movement-smoothing-roadmap.md`.
- Planned movement resolves in short visible ticks and interrupts on held-angle
  contact. Unit interpolation now advances through smaller, overlapping ticks
  for smoother motion.
- Angled orthographic tactical camera with explicit `lookAt` orientation so the
  board reliably appears on first load.
- Landmark cover silhouettes for Inferno readability: Banana Car, Logs,
  Sandbags, B Fountain, Coffins, Oranges, Truck, Library Shelf, rails, walls,
  and pillars.
- Renderer-only Banana/B prop fidelity pass: cover props now have contact
  shadows, quieter cover labels, subtle floor material variation, richer Banana
  Car/logs/sandbags/coffins/oranges/fountain/crate details, and unchanged
  gameplay footprints.
- First-pass Banana cover correction: car, logs, and sandbags now sit on real
  gameplay cover tiles instead of off-lane wall mask cells.
- Basic CT auto-response: CT can run a short automated turn after T passes,
  repositioning toward holds, taking obvious shots, and setting held angles.
- First-pass smoke utility that blocks line of sight with target preview,
  duration, board volume, and audio feedback.
- First-pass flash utility with target preview, burst marker, affected-count
  readout, and aim penalty that weakens direct shots and held-angle reactions.
- Bomb plant and defuse actions with site validation, kit-aware defuse cost,
  post-plant timer pressure, round-end state, bomb marker, and objective HUD.
- First-pass round outcomes for elimination, bomb detonation, defuse, and round
  timer expiry, with a round-over panel and `New Round` reset.
- Dropped bomb and pickup loop: killing the carrier leaves an objective marker,
  objective HUD, and T-side pickup action.
- Round-over `New Round` advances the match score and round counter while full
  reset still starts a fresh match.
- First-pass ammo and reload loop: shots and reaction fire consume magazine
  ammo, empty weapons cannot shoot/hold, and reload spends AP from reserve ammo.
- Role-aware default loadouts: AWPers spawn with AWPs, entries/lurkers with
  rifles, and CT support/IGL roles with CT rifles instead of everyone using
  side pistols.
- Procedural feedback audio for selection, planning, movement, turn transitions,
  AI response, utility, and combat.
- First-pass combat contact presentation foundation: recent combat/feedback
  events can play as short ordered cue bursts, and unit weapon silhouettes are
  no longer tied only to role defaults.
- Authored interaction feedback events now drive procedural reload, smoke
  bloom, flash pop, bomb pickup/plant/defuse/tick pressure, and alternating
  footstep cadence cues without changing gameplay math.
- High-DPI canvas rendering and higher-resolution generated unit sprite overlays
  for crisper camera/browser zoom.
- Browser regression now includes a lightweight canvas pixel-readability smoke
  for Banana Drill and Duel Lab, checking nonblank board rendering, CT/T color
  families, and action/target highlight pixels across desktop, narrow laptop,
  and compact HUD viewports.
- The visual readability smoke also forces a selected 0-AP Duel Lab unit and
  checks for slate/DONE-state pixels plus selected ownership pixels, guarding
  against selected-but-unavailable units reading as actionable.
- First-pass authored tactical-map material polish for Banana/B landmarks, while
  keeping map masks, LOS, route timing, and cover data unchanged.

## Partially Implemented

- Roles exist as data, visual identity, and first-pass loadout identity, but not
  yet as full tactical jobs.
- Weapons exist as data and now drive simple preview/damage/headshot/AP-cost
  resolution and first-pass shot presentation/decay, but deeper weapon recoil
  rules and richer per-modifier shot breakdowns are still missing.
- Cover exists as static geometry/readout and now contributes to directional shot
  penalties with protected/flanked/exposed/corner messaging, but production cover
  fidelity is still first-pass.
- Bomb state now supports a first playable plant/defuse/drop/pickup loop, but
  save/hunt logic is still missing.
- Economy exists as state, but no buy phase or round-to-round decision loop uses it.
- Planning exists for movement with a first-pass ticked execute, editable timing
  beats, a reusable execute/contact event stream, and compact live/debrief rail,
  but not yet a full cinematic queue/replay system with simultaneous combat
  beats and production interrupt sequencing.
- Utility exists as immediate and first-pass queued smoke/flash actions, but not
  yet with true timeline offsets, bounces, molly/HE, or richer counterplay.

## Not Implemented Yet

- Directional/production-grade line-of-sight solver.
- Full shot preview breakdown before commit.
- Richer kill feed beyond first-pass weapon, headshot, damage, and elimination
  markers.
- Production-grade Hold Angle / overwatch lifecycle.
- Production-grade cinematic interrupt timeline, replay controls, and
  multi-event contact queue beyond the reusable first-pass event stream.
- Production-grade cover fidelity for complex geometry, peeking, and multi-tile
  objects.
- Molly, HE, and production-grade utility timing.
- Production-grade ammo economy, reload timing, and weapon-specific firing
  rules.
- Save/hunt outcomes.
- Production-grade enemy AI.
- Production-grade authored audio assets and final mix.
- Production-grade synchronized execute timeline beyond the current bounded
  per-order utility/swing timing contract, inspectable event stream, and compact
  player-facing live/debrief rail.

## Immediate Focus

Finish hardening the first contact vertical slice before broadening the game:

1. CT holds Banana.
2. T queues movement through Banana.
3. The destination/movement preview warns that the lane is watched.
4. The player commits.
5. Movement resolves in short ticks and stops when contact occurs.
6. The CT sees the crossing and reaction fire triggers.
7. Hit chance, cover state, and damage resolve with visible/audio feedback.
8. The game surfaces a durable contact break so the player can make the
   trade/continue call with beat, cover, trade, and bomb context visible.

This is the first moment where the game can feel like Counter-Strike slowed into
XCOM-style decisions.
