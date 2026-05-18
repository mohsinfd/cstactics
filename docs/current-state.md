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
- Compact/zoom HUD hardening now adds dense layout behavior for the top bar,
  roster, view controls, command bar, selected-unit panel, and Contact Break
  state. Under dense contact, lower-priority combat/objective/legend panels
  yield so the board remains visible.
- Browser regression now enforces a HUD viewport-footprint budget after Banana
  Drill contact, including simulated compact browser zoom, so controls being
  "visible" cannot mask a board-occluding layout failure.
- First-pass tactical cockpit HUD reskin: shared glass/steel panel language,
  stronger scoreboard/roster chrome, more intentional command/action buttons,
  demoted lab shortcuts, and compact Contact Break sizing that preserves the
  viewport-footprint budget under simulated zoom.
- XCOM-inspired HUD proportion pass: the selected-unit detail now defaults to a
  lower-edge unit flag/action deck, and Contact Break sits as a side decision
  panel instead of blocking the tactical center.
- World-class presentation rebuild roadmap is captured in
  `docs/world-class-presentation-roadmap.md`; the core simulation remains the
  asset to preserve while lighting, unit readability, animation, camera, HUD,
  and sound become the rebuild track.
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
- The canvas readability smoke now also guards board luminance/mid-value pixel
  coverage so presentation changes cannot silently push the tactical map back
  into near-black values.
- The visual readability smoke also forces a selected 0-AP Duel Lab unit and
  checks for slate/DONE-state pixels plus selected ownership pixels, guarding
  against selected-but-unavailable units reading as actionable.
- First-pass authored tactical-map material polish for Banana/B landmarks, while
  keeping map masks, LOS, route timing, and cover data unchanged.
- CS2 stratboard whitebox pass: renderer colors now flow through
  `src/renderer/artDirection.ts`, the board renders as a floating clay tactical
  model over a pale studio void, walls use taller white room-boundary masses,
  landmark props are primitive-only silhouettes, and gameplay/map data remains
  unchanged.
- Whitebox finishing pass: the first-load camera now frames the board closer
  without hiding spawn miniatures under the HUD, the studio void is neutral
  instead of blue-dominant, wall plinth/body/cap masses cast readable shadows,
  tactical miniatures are scaled up, and subtle team control/facing overlays are
  visible before the player clicks a scenario.
- First stratboard miniature replacement pass: live tactical units now use
  chunkier braced primitive bodies, team-specific CT helmet/armor and T
  scarf/headwrap geometry, body-mounted role modules, thicker lifted weapon
  silhouettes, and faster renderer-only movement timing that stays closer to the
  tile resolver cadence without changing gameplay state.
- First-load board visibility is guarded by an R3F-side camera bootstrap plus a
  browser pixel smoke that checks for light clay board pixels before scenario
  buttons are clicked.
- Compact canvas readability now keeps the underlying tactical mat out of
  near-black so the board holds readable pixels behind the HUD on small screens.
- First presentation-ceiling pass removed HUD-level map dimming, lifted map and
  lighting values, and biases unit bodies toward the default camera while
  keeping tactical facing represented by arcs/gameplay state.
- First tiny Presentation Director slice is implemented for Banana Drill
  contact: reaction-fire interrupts now trigger a short camera push/settle beat
  plus a brighter board-level shot lane, contact ring, muzzle glint, impact
  spark, and proof artifacts under `artifacts/contact-cinematic-slice/`.
- Duel Lab usability now has a hardening pass: the 1v1 scene opens with a
  tighter camera frame, direct-move debrief panels no longer linger over the
  duel, and hovered tile/risk information lives on the right rail instead of
  crossing the selected-unit action deck.
- A throwaway playable cinematic proof route exists at `/cinematic-1v1`: it
  bypasses the tactical HUD entirely and lets the player run a tiny CT-vs-T
  loop with move, shoot, invalid target feedback, AWP shot, impact, collapse,
  kill state, and reset. This is the current presentation target for judging
  the future 2.5D Duel Lab feel separately from current tactical UI debt.
- A second playable board-camera proof exists at `/duel-2-5d` (alias
  `/cinematic-1v1-25d`): it keeps the same 1v1 move/invalid/shoot/kill/reset
  loop but stages it on an angled B-site board slice so map-view composition,
  cover placement, target frames, shot lanes, and casualty placement can be
  tuned before integrating the style into real Duel Lab.
- `/duel-2-5d` now uses the generated isometric concept target as its in-game
  board art (`public/concepts/isometric-duel-target.png`) with clickable
  hotspots layered over it. This is intentionally a pixel-target bridge, not
  the final decomposed renderer.
- The same route now has an authored isometric floor graph over the concept
  image: eight calibrated walkable nodes, cover hints, a visible move-tile
  overlay, path line, and a movable CT gameplay marker. This proves the hybrid
  direction: keep the painted board texture, but drive movement/targeting from
  a separate tile layer.
- `/duel-2-5d` now has the first `board2d5` runtime seam: the eight-node
  concept board is defined as a typed board package with graph edges, cover
  hints, actor/target anchors, hit chance, move range, validation, graph
  pathing, and a small presentation event stream. The route still uses the
  concept image as the visual layer, but no longer keeps core tile/target data
  hardcoded inside the React component.
- The 2.5D browser proof now has stronger package-driven feedback: reachable
  tiles are derived from graph range, hover previews the path, movement commits
  through a board event, wrong clicks emit an invalid event, shooting emits
  shot/hit/kill events, and the baked target receives an obvious down marker.
- The `/duel-2-5d` bridge now has a first real layered-board/authoring pass:
  the board package owns scene projection, image layers, baked-unit mask
  placements, foreground occluder placements, actor/target sprite metadata, and
  target/actor hotspots. The normal route renders separate CT/T runtime actors
  over the concept board instead of relying only on baked characters, while
  `/duel-2-5d?debug=1` exposes a query-gated authoring overlay that can place
  draggable cover blocks on the board and export their package coordinates.
- The authoring overlay is now more than a cover toy: debug mode shows
  draggable handles for the eight path nodes, actor anchor, target anchor,
  baked-unit masks, and foreground occluders, routes authoring pointer events
  ahead of gameplay hotspots, and exports a package-shaped JSON patch with
  nodes, actors, targets, masks, occluders, and temporary authoring blocks.
- The `/duel-2-5d` bridge has moved from a 1v1 proof into a deterministic 2v2
  contact/trade slice aligned to the approved concept image composition: two CT
  actors start on the lower Banana side, two T defenders hold the upper B-site
  side, CT entry moves into contact, the entry is marked down, the second CT can
  take a 64% trade shot, and the T anchor receives the casualty marker.
- The `/duel-2-5d` concept frame now has an ultrawide/embedded-viewport fit
  guard: normal viewports stay centered, but very wide host viewports anchor the
  board into the visible left pane so the image does not appear cut off with a
  large blank area on the left.
- The `/duel-2-5d` runtime actors now render from board-package sprite asset
  URLs instead of CSS-constructed body/head/rifle spans. The first assets live
  under `public/board2d5/units/` with separate CT/T rifle and down-state SVGs,
  keeping the scenario deterministic while moving the route toward an exported
  layered asset pipeline.
- The `/duel-2-5d` board now has the first real Blender-authored clay diorama
  layer pass. `npm run board2d5:render` runs
  `scripts/blender/banana_b_clay_v1.py`, generates real geometry from a locked
  orthographic Blender camera, saves the source scene under
  `art/blender/banana-b-clay-v1/`, and exports base/shadow/foreground PNG
  layers under `public/board2d5/scenes/banana-b-clay-v1/`. The browser package
  now uses those rendered layers instead of the concept PNG as the board art.
- The `/duel-2-5d` tactical overlays now use Blender-authored movement tile
  footprints. `banana_b_clay_v1.py` writes non-rendered gameplay tile guide
  meshes into the `.blend`, exports their board-space polygons to
  `src/renderer/board2d5/bananaBClayGeometry.ts`, and renders matching subtle
  floor grooves into the board art so move decals light actual physical cells
  instead of approximate CSS diamonds.
- May 18, 2026 product correction: the base Three.js map is back to being the
  primary playable client because its movement tiles, pathing, hover previews,
  LOS overlays, and camera/HUD regressions are already strongest there.
  `/duel-2-5d` and the Blender clay board remain valuable visual R&D and asset
  pipeline proofs, but they are not the main gameplay route until their tile
  contract can match the base renderer without approximation.
- The base Three.js map now uses the `board2d5` CT/T rifle SVG art as enlarged
  camera-facing unit sprites in `UnitRenderer.tsx`, with a primitive fallback
  while image textures load. This ports the best part of the 2.5D visual spike
  back onto the tile-true map without touching gameplay graph, AP, LOS, or
  movement resolution.
- A dual-track Luanti visual spike now exists under
  `spikes/luanti-banana-b-site/`. It does not port gameplay; it generates a
  30x30 Banana -> B-site whitebox slice from JSON data with clay floors, taller
  walls, primitive props, five CT markers, five T markers, right-click
  selection, movement range, path preview, and red danger/LOS floor bands.
- On May 17, 2026, the Luanti spike was fixed after a bad runtime attempt that
  opened into native sky/first-person HUD view. It now launches into a fixed
  overhead observer camera, hides Luanti survival HUD chrome, uses a neutral
  tabletop/sky, equips a long-range selector, and has proof screenshot
  `spikes/luanti-banana-b-site/luanti-runtime-overhead.png`.
- Product verdict on May 17, 2026: Luanti is killed as the main visual-client
  candidate. The generated board and validation data remain useful reference
  artifacts, but mouse/camera/right-click feel is unacceptable for the playable
  client path.
- `npm run luanti:validate` guards the Luanti slice against invalid map data:
  unit overlap, unsupported surfaces/props, out-of-bounds rectangles, props
  inside walls, props without floor support, blocked path/danger tiles, and
  non-contiguous authored paths.
- The original external-engine Spike B now has a runnable S&box source-build
  proof under `spikes/sbox-banana-b-site/cstactics_spike/` with matching
  Banana/B data and `docs/sbox-visual-spike.md`. On May 17, 2026, the local
  S&box checkout at `C:\Users\Mohsin Dingankar\Downloads\sbox-public` launched
  `local.cstactics_spike` in offline editor mode and Play Mode generated the
  Banana/B board; proof screenshot:
  `spikes/sbox-banana-b-site/sbox-playmode.png`.
- S&box now has first playable interaction proof: visible cursor, left-click
  unit selection, cyan movement range, hover path preview, click-to-move, `N`
  next-unit, `R` reset, and on-screen status text. Runtime proof logged
  `Moved T_ENT to (16, 6)` and captured
  `spikes/sbox-banana-b-site/sbox-playable.png` plus
  `spikes/sbox-banana-b-site/sbox-playable-moved.png`.
- Product verdict on May 17, 2026: S&box is killed as the main visual-client
  candidate too. The playable proof works, but it does not create enough visual
  lift over the current Three.js/browser route to justify S&box platform/editor
  risk.
- `npm run sbox:validate` validates the S&box spike data against the same
  authored map contract as Luanti so the two engine tests compare the same
  slice instead of drifting into different demos.

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
  plus one thin contact presentation beat, but not yet a full cinematic
  queue/replay system with simultaneous combat beats and production interrupt
  sequencing.
- The HUD is still first-pass, but Duel Lab now has regression coverage for
  tile-info/action-deck overlap and direct-move debrief clutter.
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
- A production-quality presentation layer. Both external-engine spikes have
  failed the main-client gate: Luanti failed mouse/camera/control feel, and
  S&box failed to produce enough visual lift. The active path now keeps the base
  Three.js map as the playable client and harvests the best `board2d5`/Blender
  discoveries as sprites, pose assets, materials, and reference renders.
- A full board-package-to-real-sim bridge. The current `board2d5` slice defines
  the adapter seam and event vocabulary, but the local 2v2 contact scenario
  remains deterministic until the presentation quality is approved.
- Production decomposition of the concept art into final floor, wall, foreground
  occlusion, unit, and VFX image layers. The first Blender board layer pass now
  proves the real render pipeline, but it is still a v1 clay blockout and needs
  stronger CS-like material detail plus exported unit/pose renders.

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

In parallel, continue the visual-client decision from evidence, not hope.
Luanti and S&box are both retired as main-client candidates and should only be
touched for reference/data validation. The browser route remains the path, but
the primary playable surface is now the base Three.js map because it already has
the cleanest movement/tiling contract. The next visual milestone should improve
base-map unit sprites, authored movement poses, and contact beats while using
`/duel-2-5d`, Blender renders, and `public/concepts/isometric-duel-target.png`
as reference and asset sources rather than replacing the gameplay board.

The immediate browser route is now: keep the tile-true Three.js map playable,
make its unit sprites and movement presentation approach the 2.5D target, then
only promote Blender board layers if their authored tile/occlusion contract can
match the base renderer without visual approximation.
