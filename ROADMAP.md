# CS2 Tactics Roadmap

## Product North Star

CS2 Tactics should feel like Counter-Strike slowed down into readable tactical
decisions: recognizable maps, meaningful timing, readable crossfires, tense bomb
pressure, synchronized utility, trades, and clean turn-based command decisions.
The game can look indie, but it should never feel rough, vague, or toy-like.

The presentation rebuild track is now captured in
`docs/world-class-presentation-roadmap.md`. The core game logic should stay
renderer-independent; the next ceiling break is an authored presentation layer
for lighting, unit readability, animation timing, camera, HUD, and sound.

A contained Luanti spike remains in the presentation research as a reference
artifact, but it is no longer a main-client candidate. It is not a gameplay
port. React/Three remains the rules prototype; Luanti proved data-generated
whitebox boards can exist, then failed the May 17, 2026 mouse/camera/control
bar for playable-client use.

The original Spike B from the external-engine plan was S&box. It used the same
Banana/B data as the archived Luanti spike to test whether Source-2-adjacent C#
tooling provided enough visual lift to justify platform risk. A first S&box
Play-Mode proof exists under `spikes/sbox-banana-b-site/cstactics_spike/`,
including left-click selection, hover path preview, click-to-move, and
moved-unit screenshots. It is now killed as a main-client candidate because the
visual result is not enough better than Three.js to justify the switch.

The active presentation path is back in the browser, but the base Three.js map
is the primary playable client again. Its square-tile movement, hover previews,
LOS overlays, camera controls, and HUD regressions are already stronger than
the `/duel-2-5d` board slice. Use `/duel-2-5d`, Blender renders, and
`public/concepts/isometric-duel-target.png` as visual reference and asset
sources, then port the useful parts back onto the tile-true map instead of
replacing the gameplay board prematurely.

The first five seconds matter. A CS player should look at the board and say:
"That is Inferno." If the map silhouette, routes, timings, and site geometry do
not land, every other feature sits on weak ground.

## Product Pillars

1. **Map Recognition**
   Inferno must read immediately from a single camera view: T spawn, Banana, B
   site, Mid, Apartments, A site, Arch, Library, CT, and rotations should form a
   familiar mental model.

2. **Tactical Readability**
   Every tile, wall, cover object, bombsite, unit, and threat state should be
   understandable without tooltips. The player should spend their brain on
   tactics, not decoding the UI.

3. **Counter-Strike Pressure**
   Rounds should be driven by timing, trades, bomb threat, utility denial,
   economy pressure, and role identity. It should not become generic XCOM with
   CS names.

4. **Synchronized Execution**
   The best CS moments happen when three or four things collide in two seconds:
   a flash pops, an entry swings, a smoke blooms, a CT holds an angle, and a
   trade arrives. The long-term game loop should let players plan those beats,
   then resolve them together in short frozen-time chunks.

5. **Polished Indie Execution**
   Modest assets are acceptable. Sloppy interaction is not. Movement previews,
   shooting feedback, turn transitions, camera framing, and HUD hierarchy should
   feel deliberate.

6. **Data-Driven Production**
   Maps, weapons, roles, economy, and abilities should live as data plus tested
   systems. Professional quality comes from repeatable pipelines, not one-off
   hand edits.

## Target Round Loop

Long term, the game should not be strictly "one player moves, then the next."
That is useful for prototyping, but it misses CS timing. The intended structure:

1. **Free Positioning / Map Control**
   Players move into early-round shape until contact, noise, utility, or a
   watched lane creates tactical commitment.

2. **Freeze / Planning Window**
   Time slows. The player assigns multiple orders: swing, hold, smoke, flash,
   rotate, plant, defuse, reload, or save.

3. **Synchronized Resolution**
   Queued orders resolve over a short timeline. Utility pops, units move, hold
   angles trigger, trades occur, and the board lands in a new tactical state.

4. **Re-Freeze On New Information**
   Contact, damage, a kill, bomb state, or utility expiry pauses the action
   again so the player can make the next high-quality CS decision.

5. **Endgame Pressure**
   Plant/defuse timers, ammo, HP, utility, and known/unknown positions decide
   whether the right call is execute, retake, save, or hunt.

## Simultaneous Execute Roadmap

Goal: make the game feel like a slowed-down CS execute/retake rather than a
generic squad tactics turn.

The first proof point is not broad combat. It is angle ownership: a player
should be able to hold a lane, preview the danger of crossing it, commit the
move, trigger contact, and freeze into a trade decision. See
`docs/first-contact-vertical-slice.md` for the immediate build spec.

### Milestone A: Planned Orders Foundation

- Planning mode that queues moves instead of executing immediately.
- Planned path and destination previews for several active units at once.
- Commit button that resolves queued moves together.
- Basic conflict handling for occupied/duplicate destinations.
- Clear/cancel planned orders.

### Milestone B: Hold Angles and Contact

- Hold Angle order as CS-flavored overwatch. Implemented.
- Watched-lane overlay from held angles. Implemented.
- Hold-angle hover preview before committing a lane. Implemented.
- Movement through a watched lane can trigger reaction fire. Implemented for
  queued movement.
- Freeze when first contact happens. Implemented as an immediate contact break.
- Basic hit chance and damage resolver for reaction fire. Implemented.
- Weapon crit/headshot chance and crit damage in previews/resolution.
  Implemented as a first pass.
- Contact banner/interrupt state after first visible threat or damage.
  Implemented.
- Destination exposure readout and board-level hit/miss marker. Implemented.
- Threat tint for movement tiles visible to known enemies. Implemented.
- Queued move `WATCH`/`DANGER` planning warnings. Implemented.
- Shoot-mode line-of-fire overlay. Implemented.
- Automatic shoot-mode trade prompt after contact break. Implemented.
- First-pass ticked movement/contact resolution. Implemented.
- First-pass execute beat UI: utility starts at `0.0s`, movement/swing starts
  at `0.6s`, with matching queue rows and map markers. Implemented.
- Planned actions now carry an editable `executeAtMs` timing contract, and the
  resolver honors utility and movement offsets. Implemented as a first pass.
- Durable execute-interrupt decision state now records the contact beat, tile,
  shooter, stopped unit, best trade shot, and bomb pressure for the Contact
  Break panel. Implemented as a first pass.
- Browser regression now exercises Banana Drill -> queued crossing -> Run
  Execute -> Contact Break across desktop, narrow laptop, and compact HUD.
- Compact/zoom HUD viewport-budget regression is implemented for Banana Drill
  contact, and dense HUD mode now reduces secondary panels so the playfield
  remains readable under browser zoom stress.
- First-pass tactical cockpit HUD skin is implemented: shared panel chrome,
  stronger score/roster hierarchy, higher-contrast command/action controls,
  quieter lab shortcuts, and a compact Contact Break card that stays inside the
  viewport budget under simulated zoom.
- XCOM-inspired HUD proportions are implemented as a first pass: selected-unit
  status/actions live in a compact lower-edge deck, and Contact Break reads from
  the side instead of occupying the board's center.
- First presentation-ceiling pass started: HUD-level map dimming removed,
  board/lighting values lifted, and unit bodies now bias toward the default
  camera for readability while mechanical facing remains represented by tactical
  arcs and gameplay state.
- First tiny cinematic-contact proof slice is implemented: Banana Drill contact
  now drives a short camera push/settle beat and brighter shot-lane/impact
  markers, with proof screenshots/video captured under
  `artifacts/contact-cinematic-slice/`.
- Canvas readability regression now includes luminance/mid-value guardrails so
  the tactical board cannot regress into a near-black presentation while still
  passing nonblank pixel checks.
- Smoother movement cadence and wheel/trackpad map panning. Implemented as a
  first-pass interaction polish step.
- Route-level movement no longer double-queues store-published intermediate
  tile updates while a full presentation path is active, fixing the
  move-forward/pull-back/replay cadence without changing tile truth.
- Route-aware locomotion is now a renderer layer, not another easing tweak:
  full legal paths become sampled movement clips with one accelerate/coast/
  decelerate profile, pose classification separates movement direction from
  mechanical facing, and CT AI movement also publishes route hints.
- Opening setup defaults are implemented as first-pass usability: full rounds
  now start from widened T/CT spawn positions by default, while the setup HUD
  exposes optional random Inferno meta presets (`2-1-2`, `2-2-1`, `3-2`,
  `1-3-1`) with visible labels. Presets assign spawn slots by current-side
  lane intent and AWP best-peek chance instead of teleporting players into
  lane positions, so opening movement still begins from the actual spawn roll.
- First-pass action discoverability is implemented: a compact next-action panel
  explains the current expected player input, wrong map clicks surface a
  specific denial reason, and invalid actions now have a short procedural UI
  sound cue.
- Landmark cover silhouettes and destination risk card. Implemented.
- First-pass Banana/B renderer fidelity: contact shadows, material variation,
  quieter cover labels, and richer landmark prop details for car, logs,
  sandbags, coffins, oranges, fountain, and boxes without changing gameplay
  footprints. Implemented.
- Protected/flanked/exposed shot and movement warnings. Implemented as a
  first-pass directional cover readout.
- Corner-weighted cover penalties and corner labels. Implemented as a first-pass
  cover fidelity improvement.
- Procedural shot/contact audio cues. Implemented.
- First-pass elimination clarity: kill-aware combat log, shot marker, tracer
  label, casualty marker, and stronger kill audio. Implemented.
- Procedural movement, selection, planning, AI response, and turn feedback audio.
  Implemented as a first pass.
- Basic CT auto-response. Implemented as a scripted/simple opponent pass for
  testing the one-player loop.
- First-pass hit/death presentation VFX: shooter recoil, muzzle flash, target hit
  shock, and casualty death pulse. Implemented.
- Bounded editable execute offsets in the queue, with the resolver honoring
  utility beat delays and staggered movement starts. Implemented as a first pass.
- First-pass weapon-flavored shot presentation: combat events carry weapon
  identity, board damage numbers show HP loss, tracer/recoil/audio/HUD styling
  differs by weapon class, and contact breaks get a stronger pulse/readout.
  Implemented.
- Combat contact presentation foundation: audio cue/mix profiles now separate
  UI, movement, utility, combat, reaction, and impact buses; recent events play
  chronologically instead of only the latest item; unit weapon meshes now use the
  actual equipped weapon category for profile, scope, suppressor, barrel, and
  muzzle placement. Implemented as a first pass.
- Sprite/model identity contract: generated unit sprites now consume shared
  sprite visual profiles for team palette, headgear/chest marks, role glyphs,
  and role weapon/gear layer intent; browser regression includes a coarse canvas
  pixel-readability smoke for Banana Drill and Duel Lab. Implemented.
- Unit state readability pass: selected, selected-spent, hovered, shootable
  target, out-of-range target, spent, live, and inactive units now share an
  explicit renderer visual hierarchy so tactical action state reads before role
  decoration; visual regression now guards selected 0-AP readability. Implemented.
- First-pass contact moment polish: Contact Break now leads with a clear
  tactical decision call, stopped/shooter/responder facts, and stronger
  reaction-fire audio/VFX that fades as a combat beat instead of lingering as a
  debug overlay. Implemented.
- First-pass reusable execute/contact event stream: direct moves and planned
  executes now record ordered utility, movement/swing, contact, shot result, and
  trade/bomb decision events, while Contact Break still renders a compact
  timeline from the same data. Implemented.
- First-pass tactical fog of war: the active side gets a soft visibility shroud
  over unseen walkable space and live enemy miniatures/facing overlays are hidden
  unless revealed by proximity or line of sight. Implemented without changing
  store state, pathfinding, AP, LOS, or combat math.
- First-pass player-facing execute rail: clean executes show a compact
  live/debrief beat list from the reusable timeline, while Contact Break
  continues to own interrupted executes. Implemented.
- Authored interaction audio cues: reload, smoke bloom, flash pop, bomb
  pickup/plant/defuse/tick pressure, and alternating footstep cadence now use
  explicit feedback event types on the existing mix buses. Implemented as a
  first pass.
- Next: grow the reusable event stream into a production cinematic queue/replay
  system without rewriting combat math.
- Next visual/audio slice: multi-beat replay timing, richer casualty/targetable
  visual states, and a path toward authored sample assets instead of only
  procedural cues.
- Next intel slice: last-known enemy ghosts, sound/contact pings, and clearer
  fog UI language so hidden information feels like Counter-Strike uncertainty
  instead of missing pieces.

### Milestone C: Utility Timing

- Smoke and flash as immediate tactical actions. Implemented as first pass.
- Queue smoke/flash in planning mode and resolve utility before movement.
  Implemented as first pass.
- Smoke, flash, molly, and HE as planned orders.
- Editable smoke/flash offsets in the execute queue. Implemented as a first
  pass.
- Timeline offsets: flash pops before entry swing, smoke blooms before cross,
  molly denies retake path.
- Utility preview volumes on the map. Implemented for smoke/flash first pass.

### Milestone D: Resolution Timeline

- Resolve planned orders in small ticks instead of instant teleports. First pass
  implemented for movement/contact.
- Interrupt resolution on contact, death, bomb event, or major utility effect.
  First pass implemented for held-angle contact.
- Per-order execute offsets with bounded queue controls and staggered movement
  starts. Implemented as a first pass.
- Show a compact execute timeline: `0.0 smoke`, `0.5 flash`, `0.7 entry swing`.
  First-pass live/debrief rail is implemented for clean executes, and Contact
  Break owns interrupted execute timelines.
- Persist reusable execute/contact timeline data for inspection and regression
  tests. Implemented as a first pass; this is not yet a full cinematic
  queue/replay system.

### Milestone E: CS Match Loop

- Buy phase, economy, weapons, armor, kit, utility loadout.
- Bomb plant/defuse pressure. Implemented as first pass.
- Elimination, defuse, detonation, and time-expiry round outcomes. Implemented
  as first pass.
- Dropped bomb and pickup. Implemented as first pass.
- Scoreboard progression on `New Round`. Implemented as first pass.
- Ammo consumption and reload. Implemented as first pass.
- Role-aware default loadouts. Implemented as first pass.
- Weapon shot AP costs by class. Implemented as first pass.
- Save/hunt pressure.
- Round-to-round strategic consequences.

## Priority Rules

- Build contact before economy, AI, or role progression.
- Build Hold Angle before full utility depth, because angle ownership is the
  bridge between CS and XCOM.
- Build decision preview before complex resolution. The player must understand
  the risk before the action commits.
- Use scripted scenarios before broad AI. A good Banana hold/crossing slice is
  more valuable than weak full-map bot behavior.
- Keep new combat logic rendering-independent.

## Phase 0: Stabilize the Prototype

Goal: make the project easy to run, inspect, and iterate.

Acceptance:
- `npm run build` passes.
- `npm run lint` passes.
- Local dev server starts reliably.
- README explains what the game is, how to run it, and current status.
- Map validation script reports connectivity and route timings.
- Debug map view or exported image makes the silhouette inspectable.

## Phase 1: Inferno Recognition Sprint

Goal: rebuild the map until it is recognizable before adding more systems.

Work:
- Source a clean top-down Inferno reference workflow without committing
  copyrighted source imagery to the repo.
- Generate or trace a tile grid from a radar/reference image.
- Replace rectangle-only zones with a higher-fidelity silhouette.
- Prioritize Banana/B fidelity before further utility depth. See
  `docs/banana-b-fidelity-task-list.md`.
- Add validation so authored cover cannot render without matching gameplay
  cover. Implemented as a first pass.
- Add callout anchors for Banana, B, Mid, Second Mid, Apps, A, Arch, Library,
  Construction, CT, and T spawn.
- Validate route timings from T and CT spawns to both sites.
- Tune camera orientation so the first viewport presents Inferno clearly.
- Add a lightweight visual regression artifact for the map silhouette.

Acceptance:
- A CS player can identify Inferno from the first screen.
- T to A, T to B, CT to A, and CT to B timings are plausible relative to each
  other.
- Banana is curved and narrow, not a straight rectangular hallway.
- A site has pit, short, balcony/apps pressure, and library/moto access.
- B site has Banana choke, coffins/CT, construction, and site cover.

## Phase 2: Combat Vertical Slice

Goal: make one round playable and emotionally legible.

Work:
- Line of sight through walls and cover.
- Shoot action with aim preview before commit.
- Damage, headshot/crit, death, and kill feed.
  First-pass death markers, headshot/crit, weapon-labeled damage numbers, and
  kill feed clarity are implemented.
- Cover penalties and range penalties.
- Basic VFX: tracer, hit marker, muzzle flash, shooter recoil, target hit shock,
  death pulse, and weapon-class damage numbers. Implemented as first pass;
  tracer/impact overlays now decay as a short combat beat.
- Combat action panel for selected units.

Acceptance:
- Players can move, take contact, shoot, kill, and trade.
- The UI explains hit chance before firing.
- A dead unit is impossible to act with and clearly removed from the tactical
  state.

## Phase 3: Round Rules and Bomb

Goal: make the core CS round loop real.

Work:
- Elimination win condition.
- Round timer and timeout win condition.
- Bomb carrier, plant, dropped bomb, pickup, defuse, detonation.
- Post-plant phase and bomb timer pressure.
- Round reset.

Acceptance:
- A full round can end by elimination, time, plant/defuse, or detonation.
- Bomb state is visible at all times.
- T and CT decisions feel asymmetrical.

## Phase 4: Economy and Buy Phase

Goal: turn isolated rounds into a match.

Work:
- Multi-round match state.
- Per-player money, loss bonus, kill rewards, bomb plant bonus.
- Buy phase UI for pistols, rifles, SMGs, AWP, armor/kit/utility later.
- Save/force/full-buy tradeoffs.

Acceptance:
- Losing and winning changes future choices.
- Buying is fast, legible, and skippable for quick testing.

## Phase 5: Utility and Role Identity

Goal: make CS tactics deeper than raw aim.

Work:
- Smoke, flash, molotov/incendiary, HE.
- Role abilities: FlickShot, SprayTransfer, ExecuteCall, PopFlash, GhostRotate.
- Clear ability previews and cooldown/cost language.

Acceptance:
- Utility changes movement and sight decisions.
- Roles create different tactical jobs without breaking CS logic.

## Phase 6: Presentation Polish

Goal: move from prototype to polished indie.

Work:
- Flagship scenario shell: `/scenario/banana-execute` is now the focused
  presentation container for the next polish loop. It starts a 3v3 Banana -> B
  execute with bomb, utility, CT held angles, planning mode, a mission objective
  panel, and lab/debug controls hidden by default so the player sees a mission
  instead of a toolbox.
- Better map materials and landmark props. Landmark prop silhouettes are started.
- Quieter always-on cover labels and a first-pass tactical cockpit HUD reskin
  are implemented so screenshots read less like debug scaffolding and more like
  a deliberate tactics game surface.
- XCOM-style edge placement is started: the lower command band should stay
  compact, top HUD should remain sparse, and the center of the tactical board
  should be reserved for units, paths, contact, and shot feedback.
- World-class presentation roadmap added. The immediate track is board
  brightness/readability, camera-readable units, authored movement/contact
  timelines, cinematic contact staging, and authored audio.
- First presentation director proof slice is started for reaction contact:
  short camera emphasis plus board-level tracer/impact feedback. This proves
  the direction, but it still needs a real reusable cinematic queue, authored
  unit poses, and production audio.
- Camera presets and smoother pan/zoom limits.
- Sound design for shots, plants, defuses, UI, and phase changes. First-pass
  procedural interaction cues are implemented; authored sample assets and a
  production mix are still needed.
- High-DPI render pass for crisper zoom/readability. First pass implemented.
- Compact readability polish keeps the tactical mat from collapsing into
  near-black behind the HUD, preserving canvas pixel readability on small
  screens. Implemented.
- Better unit silhouettes and animations. Higher-resolution generated sprite
  overlays are started; authored art pipeline still needed.
- Player visualization and movement smoothing specialist handoffs are captured
  in `docs/player-visualization-roadmap.md` and
  `docs/movement-smoothing-roadmap.md`.
- Dual-track Luanti Banana/B visual spike: a generated 30x30 clay/whitebox
  Banana -> B-site slice now exists under `spikes/luanti-banana-b-site/`, with
  JSON-authored floors/walls/props/units, basic selection, movement range, path
  preview, and danger/LOS floor overlays. Use `npm run luanti:validate` before
  trusting map edits. Luanti is killed as the main visual-client path after the
  May 17 mouse/camera/control test; keep it only as a reference/data sandbox.
- Luanti runtime overhead proof: after the first attempt opened into default
  sky/first-person HUD view, the spike now forces a fixed overhead observer
  camera, hides survival HUD chrome, and captures proof at
  `spikes/luanti-banana-b-site/luanti-runtime-overhead.png`.
- S&box Spike B runtime proof: matching Banana/B data, repo-backed S&box addon,
  Play-Mode screenshot, first click-to-move proof, and pass/fail criteria now live under
  `spikes/sbox-banana-b-site/` and `docs/sbox-visual-spike.md`. Use
  `npm run sbox:validate` before touching its archived data. S&box is killed as
  a main-client path because it did not create enough visual lift over the
  browser prototype.
- Onboarding overlay for first-time players.
- Settings for performance and accessibility.

Acceptance:
- The game looks intentional in screenshots.
- Common actions have satisfying audio/visual feedback.
- Text and controls remain readable on laptop and desktop screens.
- Any alternate visual client earns its place with a first-load screenshot,
  tactical camera proof, and data-authoring validation before a port begins.

## Phase 7: Multiplayer Foundation

Goal: support real two-player matches.

Work:
- Authoritative game engine shared by client/server.
- Rooms and side assignment.
- Turn/action synchronization.
- Reconnect handling.
- Match history/debug logs.

Acceptance:
- Two browser tabs can complete a match without desync.
- Invalid actions are rejected by the authoritative state.

## Operating Rules

- Do not add major gameplay systems until Inferno recognition is fixed.
- Treat Banana/B cover, blocked tiles, and LOS as one shared contract before
  tuning utility or combat in that lane.
- Every feature needs a visible debug path while the game is in prototype.
- After every major feature, spawn a read-only tester agent to run the
  post-feature human usability regression in
  `docs/human-usability-regression.md`.
- Browser human-click regression should run with `npm run test:browser` before
  a feature is called done.
- Use `docs/orchestrator-framework.md` for future main-thread + specialist-agent
  work: explore in parallel, execute with owned write sets, integrate centrally.
- Keep game logic rendering-independent.
- Prefer small, testable systems over large opaque rewrites.
- Optimize for a professional vertical slice before expanding content.
