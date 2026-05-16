# Luanti Visual Spike

## Purpose

This is a contained dual-track visual-production spike. The React/Three client
remains the tactical rules reference. Luanti is being used only to test whether
a generated voxel/whitebox tactical board can solve the current visual
production problem faster than continuing to hand-roll every presentation layer
in Three.js.

The product question is narrow:

- Can a code-generated Banana -> B-site slice read like an intentional tactical
  whitebox board?
- Can CT/T units, movement preview, planned path, and LOS/danger overlays remain
  readable at a tactical camera distance?
- Can future agents safely add walls, floors, and props by editing data instead
  of inventing art direction?

## Current Spike Artifact

Files:

- `spikes/luanti-banana-b-site/README.md`
- `spikes/luanti-banana-b-site/cstactics_spike_game/game.conf`
- `spikes/luanti-banana-b-site/cstactics_spike_game/mods/cstactics_spike/mod.conf`
- `spikes/luanti-banana-b-site/cstactics_spike_game/mods/cstactics_spike/init.lua`
- `spikes/luanti-banana-b-site/cstactics_spike_game/mods/cstactics_spike/banana_b_site.json`
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
- `/cs_spike_reset` and `/cs_spike_help` chat commands.

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
- Pending: add one new room/cover prop in Luanti and confirm a second agent can
  do it safely without touching Lua.

Visual:

- Passed in code: constrained clay/whitebox palette and primitive props exist.
- Pending in runtime: capture a real Luanti screenshot and judge whether it
  reads as an intentional tactical board instead of blocky chaos.
- Pending in runtime: tune nodebox proportions, walls, and floor bands after
  seeing the actual engine lighting/camera.

Interaction:

- Passed in code: right-click selection, movement range, path preview, delayed
  move, and danger overlay exist.
- Pending in runtime: confirm camera/HUD interaction can feel tactical rather
  than first-person or sandbox-native.

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

Run Luanti locally with this game installed, capture a first-load screenshot,
and answer:

- Does Banana -> B-site read without labels?
- Are five CT and five T units visible from the default tactical inspection
  angle?
- Does right-click selection/movement feel plausible?
- Does the default camera fight the tactical use case?
- What exact data/nodebox changes would make the next screenshot meaningfully
  better?
