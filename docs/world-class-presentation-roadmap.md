# World-Class Presentation Roadmap

## Mandate

Keep the core tactics engine. Replace the prototype presentation ceiling.

The target is not "a React/Three prototype with nicer colors." The target is a
CS2 stratboard-style 3D whitebox tactics map: a clean white/clay tactical level
model with simplified red/blue miniatures, readable architecture, and strong
tactical overlays for movement, sightlines, control zones, and executes.

Because the current Three.js presentation has repeatedly hit a visual ceiling,
the roadmap included a Luanti spike as a visual-client feasibility test. Luanti
has now failed the May 17, 2026 mouse/camera/control bar for main-client use;
keep it only as a reference/data sandbox. React/Three remains the tactical rules
prototype until another base proves it is worth porting toward.

The original second external-engine spike was S&box. It used the same Banana/B
data as the archived Luanti spike so the comparison stayed fair: Luanti tested
constrained voxel/nodebox authoring, while S&box tested whether
Source-2-adjacent C# tooling gave enough visual lift to justify platform risk.
A first S&box Play-Mode proof is captured in
`spikes/sbox-banana-b-site/sbox-playmode.png`, and a first playable movement
proof is captured in `spikes/sbox-banana-b-site/sbox-playable-moved.png`.
S&box is now killed as the main-client candidate because the visual result is
not enough better than Three.js/browser to justify the platform and editor
cost.

The active production direction is now the base React/Three browser client with
better authored presentation assets. The base map remains the gameplay surface
because its tile movement, overlays, camera controls, and regression coverage
are stronger than the `/duel-2-5d` board slice. Blender and `board2d5` remain
valuable art R&D: they can produce reference renders, sprite assets, materials,
and eventually board layers, but they should not replace the base renderer
until their movement/tile/occlusion contract is equally exact.

## North Star

Counter-Strike slowed into XCOM should feel like this:

1. The board is the hero.
2. Units are readable from the default camera at all times.
3. Actions resolve through authored beats, not raw interpolation.
4. Contact freezes on the interesting frame.
5. The HUD behaves like an instrument panel, not a debug overlay.
6. Every presentation choice is testable through screenshots and human-click
   browser flows.

## Non-Negotiable Architecture

- **Simulation remains renderer-independent.** Store actions produce events:
  move, step, utility bloom/pop, spotted, reaction shot, hit, kill, plant,
  defuse, contact break, and round end.
- **Presentation consumes events.** Animation, sound, camera, particles, and HUD
  should read a timeline stream instead of inventing gameplay outcomes.
- **Renderer is replaceable.** Three.js is acceptable as a stage while it helps;
  it must not trap art direction, animation, or UI in ad hoc geometry.
- **Authoring beats procedural.** Procedural fallback is fine, but world-class
  feel comes from authored timing, poses, samples, and shot/contact staging.

## Art Direction

### CS2 Whitebox Stratboard

- Inferno should read as a clean clay/whitebox tactical level model, not a
  moody low-poly diorama or black grid.
- Walkable lanes use warm off-white tops, slightly darker side faces, and
  near-white wall caps so paths, units, utility, and control overlays stand
  apart without HUD dimming.
- Out-of-bounds space should be a pale desaturated blue-gray studio void that
  frames the playable board without becoming the visual subject.
- Landmark props should stay primitive-only and light-gray/clay first; tactical
  silhouette matters more than decorative color or material realism.
- Strong color is reserved for tactical language: red/blue teams, movement
  bands, danger, sightlines, utility volumes, contact, and execute timing.

### Unit Readability

- Mechanical facing belongs to cones, arcs, held lanes, weapon aim lines, and
  combat math.
- Character bodies should present toward the default camera enough that team,
  role, weapon, and alive/spent/dead state read immediately.
- Role identity should be larger than tiny labels: AWP silhouette, utility belt,
  entry bulk, IGL comms, lurker slimmer profile.
- Long term, choose one production path:
  - rigged low-poly GLB soldiers with authored clips, or
  - high-resolution 2.5D sprite sheets with authored directional poses.

## Animation System

Replace "position interpolation" with a presentation timeline.

### Required Clips

- idle ready
- select pulse / readiness shift
- start move anticipation
- tactical step / run
- stop and brace
- aim raise
- recoil by weapon class
- hit flinch
- kill collapse / casualty pose
- smoke throw
- flash throw
- plant / defuse / pickup

### Timing Rules

- Every movement segment has anticipation, travel, and settle.
- Every shot has aim raise, muzzle event, recoil, impact, and recovery.
- Contact freezes on a deliberate frame with the shooter/target readable.
- Camera and audio are timed to the same beats as units.

## HUD And UX

Use XCOM-style proportions:

- Selected-unit status, weapon/ammo, AP, and actions live in a compact lower-edge
  command deck.
- Top HUD only communicates score, side, round, and phase.
- Scenario/debug tools are secondary and visually demoted.
- Contact Break is a side decision panel unless it is intentionally staged as a
  cinematic pause.
- The board center is reserved for units, paths, utility, targeting, and combat
  feedback.

## Audio Direction

- Procedural cues are temporary scaffolding.
- Build an authored sample library for:
  - UI confirm/deny/hover/select
  - footsteps by movement intensity
  - rifle/SMG/pistol/AWP/suppressed shots
  - hit, armor hit, headshot, kill
  - smoke bloom, flash pop, plant, defuse, bomb tick
  - contact sting, trade opportunity, round win/loss
- Mix by bus: UI, movement, utility, combat, contact, objective, ambient.
- No cue should mask the contact decision.

## Camera Direction

- Default camera must show Inferno as a coherent board.
- Camera movement should never be required to use the HUD.
- Add cinematic camera beats only after the tactical camera is stable:
  - subtle push on contact
  - recoil shake
  - kill hit-stop
  - bomb pressure pulse
- Tactical readability always beats cinematic flourish.

## Cinematic Proof To Tactical 2.5D Adaptation

The `/cinematic-1v1` proof is not the final camera. It is a close-contact
presentation target. The production game should adapt it through three camera
states:

1. **Tactical board view**: angled 2.5D/isometric camera, readable Inferno
   lanes, compact lower command deck, no front-facing diorama framing.
2. **Targeting emphasis**: same board camera, but larger projected unit
   silhouettes, team-colored selection/target frames, hit chance, shot lane,
   and invalid-click feedback live in world space.
3. **Contact beat**: a short camera push and hit-stop on the existing board,
   using the proof's muzzle/tracer/impact/collapse language without replacing
   tactical readability.

The proof tells us what must survive into the real view: target feedback must
be obvious, wrong clicks must get immediate denial feedback, shots need a
timed muzzle/tracer/impact beat, and death must leave a readable casualty
state. It does not imply a permanent front-view game camera.

The first board-camera proof now lives at `/duel-2-5d` with `/cinematic-1v1-25d`
as an alias. It keeps the tiny 1v1 loop but moves it onto an angled B-site map
slice. This is the near-term place to tune the planned view: board silhouette,
cover silhouettes, unit scale, target frames, shot lane, invalid feedback, and
casualty placement. It is still a presentation bridge, not the final
store-integrated Duel Lab.

The current `/duel-2-5d` implementation uses the generated concept image itself
as the board layer so the playable route can match the approved art target
immediately. The next production step is decomposition: rebuild that image as
reusable map tiles, walls, cover props, unit rigs/sprites, decals, lighting, and
VFX layers driven by the real Duel Lab state.

The tactical calibration approach is now proven in miniature: the full board
does not need to be physically cut into tiles. Keep the isometric board art as
the visual layer, then author a separate ground graph for walkable positions,
cover hints, path preview, target frames, and interaction hit areas. Only the
walkable floor/control layer needs tile semantics; walls and props can remain
painted or become layered props later.

## Tooling And Pipeline

- Add screenshot gates for desktop, narrow laptop, compact, contact, zoom stress,
  Duel Lab, and Banana Drill.
- Add a board-brightness/readability pixel smoke so the map cannot regress into
  near-black.
- Keep authored visual profiles in data files.
- Introduce asset manifests for sprites, GLBs, audio samples, and VFX profiles.
- Add debug scene selectors for 1v1 movement, shooting, utility, contact,
  plant/defuse, and round-end.

## Milestones

### Milestone P0: Stop Presentation Regressions

- Remove HUD-level map dimming.
- Restore board mid-values and lighting.
- Keep selected-unit UI at the lower edge.
- Keep Contact Break off the tactical center.
- Add docs/tests that define HUD proportion and board brightness.

### Milestone P1: Readable Tactical Board

- Material pass for lane hierarchy, out-of-bounds mass, cover, sites, and
  landmark props.
- Board brightness and contrast gates.
- Cleaner utility/cover/held-lane overlay priority.
- First viewport should read as Inferno without interacting.

### Milestone P2: Camera-Readable Units

- Decouple mechanical facing from character presentation facing.
- Add bigger role silhouettes and weapon silhouettes.
- Add selected/spent/target/dead states that read before labels.
- Decide final unit pipeline: GLB rig or authored 2.5D sprite sheets.

### Milestone P3: Authored Motion

- Add event-driven presentation timelines.
- Replace move interpolation with start/step/settle beats.
- Add aim/recoil/hit/death/utility clips.
- Add contact freeze pose and hit-stop.

### Milestone P4: Cinematic Contact

- Contact Break becomes a staged event: camera nudge, shooter read, target read,
  shot, result, trade window.
- Trade action is obvious but the board remains visible.
- Kill/death feedback carries emotional weight without hiding tactical state.

Progress:

- First proof slice added for Banana Drill contact: reaction-fire interrupts now
  kick a short camera push/settle beat while the board shows a brighter shot
  lane, contact ring, muzzle glint, and impact sparks. This is intentionally
  small; the next step is to move the beat definitions into a reusable
  presentation queue driven by execute/contact timeline events.
- Material and palette direction now lives in `src/renderer/artDirection.ts`.
  The previous muted blue/gray low-poly diorama tokens have pivoted to a
  CS2 stratboard whitebox target: warm off-white floors, near-white wall caps,
  light-gray wall/cover sides, clay/plaster roughness, and a pale neutral
  blue-gray studio void.
- The tactical board now has a renderer-only floating slab edge pass between
  floor and wall layers, with cover footprints included in the board silhouette
  and slate walls split into darker bodies plus lighter cap instancing.
- Renderer-only landmark cover props now live in
  `src/renderer/diorama/LandmarkProps.tsx`, keeping MapRenderer focused on
  floor, labels, overlays, and interaction while Banana/B silhouettes stay
  driven by existing cover/callout data.
- The first-load tactical view now uses a one-shot R3F camera bootstrap and a
  pixel smoke for light clay board coverage, preventing regressions where the
  canvas shows only blue void or the board falls back into near-black values.
- The production board direction is now primitive-only 3D whitebox stratboard:
  merged warm floor tops, visible slab skirts only at true void borders,
  near-white wall caps, light clay landmark props, orthographic non-rotatable
  camera framing, and tactical overlays stacked above the board instead of
  decorative effects replacing them.
- Whitebox finishing pass tightened the first screenshot: the default camera is
  closer but still keeps the board legible, the background is a pale neutral
  studio void, room-boundary walls have stronger plinth/body/cap mass and
  shadowing, miniatures are larger, and low-opacity team control/facing overlays
  give the map a stratboard read before any command is selected.
- First true unit-presentation replacement pass landed: tactical units now use
  chunkier braced stratboard miniature geometry, team-specific CT/T physical
  silhouettes, larger body-mounted role modules, thicker weapon silhouettes, and
  renderer-only movement timing tuned closer to the resolver cadence.
- Dual-track Luanti visual spike scaffold landed under
  `spikes/luanti-banana-b-site/`: a JSON-generated 30x30 Banana -> B-site
  clay/whitebox board with walls, primitive props, red/blue unit markers,
  right-click selection, movement range, planned path, and danger/LOS overlays.
  `npm run luanti:validate` now guards the spike data before a Luanti runtime
  screenshot is trusted.
- Luanti runtime proof landed after fixing the bad native first-person view:
  the spike now opens into a fixed overhead observer camera with survival HUD
  chrome hidden, a neutral tabletop/sky, and screenshot proof at
  `spikes/luanti-banana-b-site/luanti-runtime-overhead.png`.
- Luanti product verdict landed on May 17, 2026: killed as the main visual
  client. The overhead proof passed mechanically, but mouse/camera/right-click
  feel is unacceptable for a playable tactical client.
- S&box Spike B runtime proof landed under `spikes/sbox-banana-b-site/` with
  matching Banana/B data, a repo-backed `cstactics_spike` addon, and
  `docs/sbox-visual-spike.md`. S&box source is cloned and bootstrapped at
  `C:\Users\Mohsin Dingankar\Downloads\sbox-public`; after a local app-id `480`
  patch, Play Mode generated the Banana/B board and produced
  `spikes/sbox-banana-b-site/sbox-playmode.png`.
- S&box playable proof now supports visible-cursor left-click selection, hover
  path preview, click-to-move, `N` next-unit, and `R` reset. Runtime proof logged
  `Moved T_ENT to (16, 6)` and produced
  `spikes/sbox-banana-b-site/sbox-playable-moved.png`.
- S&box product verdict landed on May 17, 2026: killed as the main visual
  client. It works mechanically, but the screenshot is not a meaningful visual
  jump over the existing browser prototype.
- First Blender clay diorama layer pass landed for `/duel-2-5d`: a scripted
  Blender scene builds B Banana/B-site geometry from the same locked isometric
  composition, renders base/shadow/foreground layers into
  `public/board2d5/scenes/banana-b-clay-v1/`, and keeps gameplay actors
  separate from the board art.
- First layered browser-board runtime seam landed for `/duel-2-5d`: the concept
  image is now driven by a typed `board2d5` package with graph nodes, edges,
  actor/target anchors, cover hints, validation, reachability/path helpers, and
  a small event vocabulary for select, preview, move, aim, invalid, shot, hit,
  kill, and reset. This is the chosen agent-safe path toward the offline
  compiled 2.5D board pipeline.
- First layered/authorable board correction landed after the baked-image
  critique: `/duel-2-5d` now separates runtime CT/T actors from the board layer,
  moves hotspots and sprite metadata into the board package, defines explicit
  baked-unit masks and foreground occluders, and adds `/duel-2-5d?debug=1` as a
  tiny authoring surface where placed cover blocks can be created, dragged, and
  exported as board-package coordinates. This is still not final art; it is the
  missing production affordance that lets future agents tune placement data
  instead of editing JSX by eye.
- The authoring surface now exposes the real package-driving handles: path
  nodes, actor anchor, target anchor, baked-unit masks, and foreground
  occluders. Dragging a handle updates the board runtime immediately and the
  export panel emits a package-shaped patch, which makes visual/layout tuning
  agent-safe enough to continue without hiding coordinates in CSS.
- `/duel-2-5d` now has the first deterministic 2v2 contact/trade board slice
  on the layered concept board. The current beat is intentionally small and
  product-facing: CT entry moves from Banana into B-site contact, dies to the
  held T anchor, the second CT gets a trade action, and the T anchor receives a
  down marker. The slice was flipped to CT-side action because the locked
  concept image already bakes blue figures on the lower/Banana side and orange
  defenders on the upper/site side; fighting that baked composition made the
  previous T-side test visually confusing.

### Milestone P5: Production Sound

- Replace procedural-only cues with authored samples.
- Add mix buses, ducking, and priority rules.
- Every action gets a satisfying but restrained response.

### Milestone P6: Asset Pipeline

- Establish repeatable import/export for units, props, VFX, and audio.
- Add budgets for texture size, triangle count, animation clips, and load time.
- Build a tiny style bible with color, silhouette, lighting, motion, and sound
  examples.

### Milestone P7: Vertical Slice Polish Bar

- Banana 2v2:
  - T plans a flash/smoke/swing.
  - CT holds.
  - Contact triggers.
  - Reaction shot resolves.
  - Trade decision is readable.
  - Kill/death/utility/audio feel intentional.
- This slice must look good in a screenshot and feel good in a 30-second clip.

## Immediate Execution Queue

1. Remove HUD map-darkening overlay. Done.
2. Brighten map palette, lighting, and out-of-bounds frame. Done.
3. Make unit bodies camera-readable while preserving mechanical facing arcs.
   First pass done.
4. Add board brightness regression. Done.
5. Start event-timeline presentation service for movement/contact. Started with
   the Banana Drill contact proof; generalize into a reusable queue next.
6. Replace movement interpolation with authored move beats.
7. Prototype one authored weapon recoil/hit/death sequence in Duel Lab.
8. Keep the main renderer on the CS2 whitebox stratboard target: clay palette,
   studio lighting, closer orthographic default camera, and strong tactical
   overlay contrast. First finishing pass done.
9. Next: make planned executes look like authored strategy-board arrows and
   contact beats, then move the reusable event timeline toward production
   animation/audio sequencing.
10. Next unit slice: replace procedural primitive miniatures with either an
   authored low-poly rig prototype or generated directional sprite sheet, but do
   not return to small shared humanoid pawns.
11. Do not continue Luanti main-client testing; use it only for reference/data
   validation if a future task touches the archived spike.
12. Stop external-engine proving unless a new product decision explicitly
   reopens it. The next visual task is the browser presentation rebuild on the
   base Three.js map: preserve tile-perfect movement and improve units,
   movement poses, contact beats, and materials there.
13. Browser-board slice status: typed layered scene data, separate actor
   sprites, Blender-rendered base/shadow/foreground board layers, draggable
   node/actor/target handles, query-gated cover placement/export authoring, and
   a 2v2 contact/trade beat are implemented for `/duel-2-5d`, but that route is
   now an art/reference spike rather than the main gameplay client.
14. Main path correction: keep the base Three.js map as the playable board and
   port the strongest `board2d5` learnings back into it. First slice done:
   CT/T rifle SVG assets now render as enlarged camera-facing unit billboards in
   `UnitRenderer.tsx` with the gameplay graph untouched.
15. Next unit slice: turn the base-map sprite path into authored directional
   pose sheets for idle, move, aim, hit, and casualty states, then tune movement
   timing so sprites travel cleanly across the existing square tile grid.
16. Improve Blender only where it directly feeds the main path: rendered unit
   pose sheets, material reference, or board-layer experiments whose tile
   footprints can be validated against the base map.
17. Main-board movement smoothing first pass done: `UnitRenderer.tsx` now
   consumes store-published tile centers through a continuous presentation queue
   at near-constant speed, preserving legal path centers while removing the
   per-tile ease-out hop cadence. Next movement slice should add authored
   strafe/stop/aim pose frames on top of this route runner.
