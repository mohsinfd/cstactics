# Luanti Visual Spike

## Purpose

This is a contained dual-track visual-production spike. The React/Three client
remains the tactical rules reference. Luanti is being used only to test whether
a generated voxel/whitebox tactical board can solve the current visual
production problem faster than continuing to hand-roll every presentation layer
in Three.js.

Verdict on May 17, 2026: Luanti is killed as the main visual-client candidate.
The fixed overhead screenshot proved the board can be generated, but the native
mouse/camera interaction still feels like fighting a sandbox engine instead of
testing a CS2 tactics client. Do not ask users to continue Luanti playtesting
as a main-client candidate.

The product question is narrow:

- Can a code-generated Banana -> B-site slice read like an intentional tactical
  whitebox board?
- Can CT/T units, movement preview, planned path, and LOS/danger overlays remain
  readable at a tactical camera distance?
- Can future agents safely add walls, floors, and props by editing data instead
  of inventing art direction?

The answer for the main-client decision is no: the data-generation path is
useful, but the interaction feel is not acceptable for the product bar.

## Current Spike Artifact

Files:

- `spikes/luanti-banana-b-site/README.md`
- `spikes/luanti-banana-b-site/cstactics_spike_game/game.conf`
- `spikes/luanti-banana-b-site/cstactics_spike_game/mods/cstactics_spike/mod.conf`
- `spikes/luanti-banana-b-site/cstactics_spike_game/mods/cstactics_spike/init.lua`
- `spikes/luanti-banana-b-site/cstactics_spike_game/mods/cstactics_spike/banana_b_site.json`
- `spikes/luanti-banana-b-site/luanti-runtime-overhead.png`
- `scripts/validate-luanti-spike.mjs`

The spike currently generates:

- a 30x30 Banana -> B-site slice from JSON data;
- warm clay/whitebox floor nodes;
- taller wall blocks with cap contrast;
- crates, barrels/logs, sandbags, fountain, coffins, oranges, CT crates, and a
  B-site marker;
- five red T markers and five blue CT markers;
- unit selection by right-click;
- cyan movement range, blue planned path, and red authored danger/LOS floor
  band;
- a simple delayed unit move after choosing a highlighted movement tile;
- a fixed overhead observer view with the native hotbar, hearts, minimap, and
  wielded item hidden;
- a neutral tabletop/sky setup so first load shows the board instead of the
  default Luanti sky;
- a long-range selector tool so right-click raycasts work from the overhead
  camera;
- `/cs_spike_view`, `/cs_spike_free`, `/cs_spike_reset`, and `/cs_spike_help`
  chat commands.

## Source Of Truth Rule

Do not port the full game into Luanti during this spike.

React/TypeScript remains the source of truth for:

- AP, movement rules, combat, LOS, cover math, utility, bomb logic, economy, AI,
  match state, and validation.

Luanti is only allowed to answer:

- visual readability;
- data-authored map generation;
- tactical camera feasibility;
- basic click/select/move feel;
- whether voxel/nodebox whitebox gives agents a safer visual grammar.

## Validation

Run:

```powershell
npm run luanti:validate
```

The validator checks:

- map is still 30x30;
- floor/wall/prop rectangles stay in bounds;
- prop and floor types are supported;
- there are exactly five T and five CT units;
- units are on walkable, unblocked, non-overlapping tiles;
- selected unit exists;
- path and danger tiles reference real floor cells;
- danger tiles do not silently overlap blocked cover/wall cells without warning.

## Acceptance Checklist

Data/authoring:

- Passed: map is generated from `banana_b_site.json`.
- Passed: adding a wall/prop/floor is a data edit plus validation.
- Optional reference-only task: add one new room/cover prop in Luanti and
  confirm a second agent can do it safely without touching Lua.

Visual:

- Passed in code: constrained clay/whitebox palette and primitive props exist.
- Passed in runtime on May 17, 2026: the first-load Luanti view is now a fixed
  overhead tactical board instead of a first-person sandbox view. Proof:
  `spikes/luanti-banana-b-site/luanti-runtime-overhead.png`.
- Failed for main-client use on May 17, 2026: even after the overhead-camera
  fix, the runtime presentation remains far below the reference image target
  at `public/concepts/isometric-duel-target.png`.
- Optional only: tune nodebox proportions, walls, unit scale, and floor bands if
  Luanti is being used as a map-authoring/reference sandbox.

Interaction:

- Passed in code: right-click selection, movement range, path preview, delayed
  move, and danger overlay exist.
- Passed in runtime on May 17, 2026: Luanti joins directly into the fixed
  overhead observer view, hides survival HUD chrome, and can recover the camera
  with `/cs_spike_view`.
- Failed for main-client use on May 17, 2026: mouse/camera/right-click control
  feel is unacceptable for a tactical client test. More selected/path/moved
  screenshots are not required before making the Luanti decision.

## Kill Criteria

Kill Luanti as the main visual client if:

- camera/HUD interaction cannot be made tactical in a few focused passes;
- generated maps still read as generic block worlds after constrained nodebox
  proportions and lighting;
- selection, movement range, path preview, and LOS/danger overlays are awkward
  or brittle;
- iteration becomes slower than React/Three for the same visual outcome.

If killed as the main client, keep this spike as a map-authoring/reference
sandbox if it helps reason about whitebox geometry.

## Next Specialist Task

Do not continue Luanti as a main visual-client candidate. If a future task
touches this folder, keep it scoped to map data/reference experiments and run
`npm run luanti:validate`.

If Luanti is used only as a reference sandbox, answer:

- Does Banana -> B-site read without labels?
- Are five CT and five T units visible from the default tactical inspection
  angle?
- What exact data/nodebox changes would make the next screenshot meaningfully
  better?
