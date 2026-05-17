# S&box Visual Spike

## Purpose

This is Spike B from the original external-engine comparison. Spike A is the
Luanti voxel/whitebox route. Spike B tests whether S&box can deliver a more
modern Source-2-adjacent tactical board without pulling the project back into a
full art-production trap.

The goal is not to port CS2 Tactics yet. The goal is to run the same Banana ->
B-site slice in S&box and decide whether its camera, lighting, primitives,
materials, and C# workflow produce a better visual-client base than Luanti or
the current React/Three renderer.

## Current Status

S&box is available on the current Windows machine through the public source
build:

- Source checkout:
  `C:\Users\Mohsin Dingankar\Downloads\sbox-public`
- `Bootstrap.bat` completed successfully after installing `.NET 10 SDK`.
- `game\sbox-dev.exe` launched and left a visible launcher window titled
  `Welcome to the s&box editor`.

This repo still does not include a verified runnable CS Tactics S&box project.
The spike is scaffolded as a first-class handoff:

- `spikes/sbox-banana-b-site/banana_b_site.json`
- `spikes/sbox-banana-b-site/README.md`
- `npm run sbox:validate`

The S&box data intentionally mirrors the Luanti spike data so the comparison is
fair: same 30x30 Banana/B slice, same units, same props, same path, same
danger/LOS overlay.

Next proof step: create the first S&box project/addon from
`spikes/sbox-banana-b-site/banana_b_site.json`, generate the Banana/B board,
and capture the same first-load/selection/movement screenshots as Luanti.

## Product Question

S&box only wins if it proves all of this quickly:

- a first screenshot looks significantly better than Luanti and the current
  Three.js board;
- the camera can be locked into a tactical, non-FPS-feeling view;
- generated map geometry from data is straightforward;
- selection, movement preview, path overlays, LOS/danger cones, and unit markers
  are easier or more polished than in Three.js;
- iteration is fast enough for agents to modify safely.

## Hard Constraints

- Do not port combat, economy, bomb logic, utility, AI, or match state.
- Do not chase realistic CS map art.
- Do not use imported assets for the first spike.
- Generate the board from `banana_b_site.json`.
- Keep the visual language constrained: white/clay architecture, red/blue units,
  strong tactical overlays.
- Keep React/Three as the source of gameplay truth until a runtime S&box
  screenshot and interaction check pass.

## Runtime Target

The first S&box implementation should create:

- off-white floor slabs;
- taller wall blocks with subtle gray side/cap contrast;
- primitive crates, barrels/logs, sandbags, fountain, coffins, oranges, CT
  crates, and B marker;
- five red T markers and five blue CT markers;
- an orthographic or tactical locked camera, if available;
- click or ray-select unit markers;
- movement range overlay;
- authored blue path overlay;
- red danger/LOS overlay;
- optional one-step unit movement.

## Suggested Component Shape

Create an empty S&box game project from the editor, then implement additive
components along these lines:

- `SpikeMapGenerator`: loads the JSON data and instantiates board geometry.
- `SpikeTacticalCamera`: owns the locked tactical view and any camera tuning.
- `SpikeUnitMarker`: represents CT/T unit markers and selection state.
- `SpikeOverlayRenderer`: movement range, planned path, and danger/LOS overlays.
- `SpikeInputController`: click/raycast selection and move-preview behavior.

Keep these components independent from the React/Three store. The S&box spike
only needs enough local state to prove presentation and interaction feel.

## Validation

Run before opening the S&box project:

```powershell
npm run sbox:validate
```

This uses the same visual-spike map contract as Luanti:

- 30x30 slice;
- supported floor/prop types;
- valid wall/prop rectangles;
- five units per side;
- units on walkable unblocked tiles;
- no overlapping unit/prop/wall cells;
- contiguous initial path;
- danger/LOS tiles on valid unblocked floor cells.

## Kill Criteria

Kill S&box as the main visual-client route if:

- programmatic map generation is awkward or editor-dependent;
- the camera defaults fight tactical board play;
- agent iteration requires too much manual editor work;
- platform/distribution constraints are too risky for the MVP;
- the screenshot does not produce a clear visual lift over Luanti/Three.js.

If killed, keep the spike as reference for lighting, primitive proportions, and
Source-2-style tactical staging.

