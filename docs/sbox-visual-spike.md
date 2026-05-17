# S&box Visual Spike

## Purpose

This is Spike B from the original external-engine comparison. Spike A, the
Luanti voxel/whitebox route, has now failed the main-client interaction bar.
Spike B tests whether S&box can deliver a more modern Source-2-adjacent
tactical board without pulling the project back into a full art-production
trap.

Verdict on May 17, 2026: S&box is also killed as the main visual-client
candidate. The Play Mode proof works mechanically, but the result does not
deliver meaningful visual lift over the current Three.js prototype. It is not
worth accepting S&box platform/editor risk for a board that still reads as bad
as the existing browser route.

The goal is not to port CS2 Tactics yet. The goal is to run the same Banana ->
B-site slice in S&box and decide whether its camera, lighting, primitives,
materials, interaction feel, and C# workflow produce a better visual-client base
than the current React/Three renderer. The answer is no for the current spike.

## Current Status

S&box Spike B now has a runnable local source-build proof on this Windows
machine:

- Source checkout:
  `C:\Users\Mohsin Dingankar\Downloads\sbox-public`
- `Bootstrap.bat` completed successfully after installing `.NET 10 SDK`.
- Public-source Steam bootstrap was patched locally to app id `480`:
  `engine\Sandbox.Engine\Application.cs` and `game\steam_appid.txt`.
- This avoids the `SteamAPI_Init not yet successful` / `Steam Not Found`
  blocker on machines where the Steam account does not have S&box installed as
  app id `590830`.
- The editor starts in offline mode because the backend account lookup rejects
  the dev/test app id; that is acceptable for local visual-spike testing.

Repo-backed spike files:

- `spikes/sbox-banana-b-site/README.md`
- `spikes/sbox-banana-b-site/banana_b_site.json`
- `spikes/sbox-banana-b-site/cstactics_spike/cstactics_spike.sbproj`
- `spikes/sbox-banana-b-site/cstactics_spike/Code/SpikeMapGenerator.cs`
- `spikes/sbox-banana-b-site/cstactics_spike/Assets/scenes/cstactics_spike.scene`
- `spikes/sbox-banana-b-site/sbox-playmode.png`
- `spikes/sbox-banana-b-site/sbox-playable.png`
- `spikes/sbox-banana-b-site/sbox-playable-moved.png`
- `npm run sbox:validate`

The S&box data intentionally mirrors the Luanti spike data so the comparison is
fair: same 30x30 Banana/B slice, same units, same props, same path, same
danger/LOS overlay.

Runtime proof on May 17, 2026:

- local addon path:
  `C:\Users\Mohsin Dingankar\Downloads\sbox-public\game\addons\cstactics_spike`
- launch command target:
  `game\sbox-dev.exe -project game\addons\cstactics_spike\cstactics_spike.sbproj`
- editor title:
  `Cstactics Spike - s&box editor - offline`
- play-mode log:
  `CS2 Tactics S&box Spike: generated Banana to B Site Whitebox Slice (30x30) with 10 units.`
- movement proof log:
  `CS2 Tactics S&box Spike: Moved T_ENT to (16, 6).`
- screenshots:
  `spikes/sbox-banana-b-site/sbox-playmode.png`
  `spikes/sbox-banana-b-site/sbox-playable.png`
  `spikes/sbox-banana-b-site/sbox-playable-moved.png`

The current S&box proof now supports visible-cursor play in Play Mode:

- left-click a unit to select it;
- hover reachable tiles for a blue path preview;
- left-click a reachable tile to move the selected unit;
- press `N` to select the next unit;
- press `R` to reset units;
- read the current state from the on-screen debug text.

Luanti has been killed as the main visual-client candidate after the fixed
overhead test still felt wrong at the mouse/camera/control level. S&box is also
killed as the main-client candidate because the playable proof did not create a
meaningful visual jump toward the reference target at
`public/concepts/isometric-duel-target.png`.

## Product Question

S&box would only have won if it proved all of this quickly:

- a first playable screenshot looks significantly better than the current
  Three.js board and moves toward the reference image target;
- the camera can be locked into a tactical, non-FPS-feeling view;
- generated map geometry from data is straightforward;
- selection, movement preview, path overlays, LOS/danger cones, and unit markers
  are easier or more polished than in Three.js;
- iteration is fast enough for agents to modify safely.

It did not meet the first bar. Keep this spike as reference evidence and do not
start a S&box port without an explicit new product decision.

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

The current S&box implementation creates:

- off-white floor slabs;
- taller wall blocks with subtle gray side/cap contrast;
- primitive crates, barrels/logs, sandbags, fountain, coffins, oranges, CT
  crates, and B marker;
- five red T markers and five blue CT markers;
- an orthographic or tactical locked camera, if available;
- click/ray-select unit markers;
- movement range overlay;
- hover path preview;
- red danger/LOS overlay;
- click-to-move unit movement.

## Runnable Project Shape

The first runnable project uses one compact component rather than the full
component split originally proposed:

- `SpikeMapGenerator`: loads `Assets/data/banana_b_site.json`, instantiates
  floor slabs, walls, props, unit markers, movement/path/danger overlays, and
  locks the camera.

Keep these components independent from the React/Three store. The S&box spike
only needs enough local state to prove presentation and interaction feel.

Future S&box work should be reference-only unless the product direction changes.
Do not split the generator or build a deeper S&box client from this proof.

## How To Test

Copy the repo-backed addon into the S&box source checkout:

```powershell
Copy-Item -Recurse -Force `
  "spikes\sbox-banana-b-site\cstactics_spike" `
  "C:\Users\Mohsin Dingankar\Downloads\sbox-public\game\addons\cstactics_spike"
```

Then launch:

```powershell
Start-Process `
  -FilePath "C:\Users\Mohsin Dingankar\Downloads\sbox-public\game\sbox-dev.exe" `
  -WorkingDirectory "C:\Users\Mohsin Dingankar\Downloads\sbox-public\game" `
  -ArgumentList @(
    "-project",
    "C:\Users\Mohsin Dingankar\Downloads\sbox-public\game\addons\cstactics_spike\cstactics_spike.sbproj"
  )
```

Dismiss the first-run welcome modal if it appears, then press `F5` or use
`Game -> Play`.

In Play Mode:

- left-click a red/blue unit marker to select it;
- hover cyan reachable tiles to preview the blue path;
- left-click a cyan reachable tile to move;
- press `N` for next unit;
- press `R` to reset.

The agent, not the user, should launch the editor, enter Play Mode, and capture
proof screenshots before asking for a product judgment.

## Validation

Run only when touching archived S&box spike data:

```powershell
npm run sbox:validate
```

This uses the same archived visual-spike map contract as Luanti:

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
- the playable screenshot does not produce a clear visual lift over current
  React/Three and does not move toward
  `public/concepts/isometric-duel-target.png`.

This kill criterion was met on May 17, 2026. Keep the spike only as reference
for what was tried and why the browser presentation rebuild remains the active
path.

