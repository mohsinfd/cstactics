# World-Class Presentation Roadmap

## Mandate

Keep the core tactics engine. Replace the prototype presentation ceiling.

The target is not "a React/Three prototype with nicer colors." The target is a
CS2 stratboard-style 3D whitebox tactics map: a clean white/clay tactical level
model with simplified red/blue miniatures, readable architecture, and strong
tactical overlays for movement, sightlines, control zones, and executes.

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
   overlay contrast.
