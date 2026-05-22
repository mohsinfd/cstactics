# CS2 Tactics S&box Visual Spike

This is Spike B from the original two-engine comparison:

- Spike A: Luanti/Minetest-style generated voxel whitebox.
- Spike B: S&box / Source-2-adjacent generated tactical board.

The purpose is to test whether S&box gives enough visual lift to justify its
platform and workflow risk. This is not a gameplay port.

Status on May 17, 2026: failed as the main visual-client candidate. The playable
proof works mechanically, but the screenshot does not create enough visual lift
over the current Three.js/browser route to justify S&box editor/platform risk.
Keep this folder as reference evidence unless a future task explicitly reopens
the S&box decision.

## Current State

This folder now contains the shared Banana -> B-site spike data plus a runnable
local S&box addon/project:

- `banana_b_site.json`
- `cstactics_spike/cstactics_spike.sbproj`
- `cstactics_spike/Code/SpikeMapGenerator.cs`
- `cstactics_spike/Assets/scenes/cstactics_spike.scene`
- `sbox-playmode.png`
- `sbox-playable.png`
- `sbox-playable-moved.png`

The data is validated by:

```powershell
npm run sbox:validate
```

Runtime proof captured on May 17, 2026:

- S&box public source checkout:
  `C:\Users\Mohsin Dingankar\Downloads\sbox-public`
- Local installed addon:
  `C:\Users\Mohsin Dingankar\Downloads\sbox-public\game\addons\cstactics_spike`
- Editor window title after launch:
  `Cstactics Spike - s&box editor - offline`
- Play-mode log line:
  `CS2 Tactics S&box Spike: generated Banana to B Site Whitebox Slice (30x30) with 10 units.`
- Movement proof log line:
  `CS2 Tactics S&box Spike: Moved T_ENT to (16, 6).`
- Screenshots:
  `spikes/sbox-banana-b-site/sbox-playmode.png`
  `spikes/sbox-banana-b-site/sbox-playable.png`
  `spikes/sbox-banana-b-site/sbox-playable-moved.png`

## Setup

1. Ensure the S&box public source build exists at
   `C:\Users\Mohsin Dingankar\Downloads\sbox-public`.
2. Copy this repo project folder into the S&box addon folder:

```powershell
Copy-Item -Recurse -Force `
  "spikes\sbox-banana-b-site\cstactics_spike" `
  "C:\Users\Mohsin Dingankar\Downloads\sbox-public\game\addons\cstactics_spike"
```

3. Launch the addon directly:

```powershell
Start-Process `
  -FilePath "C:\Users\Mohsin Dingankar\Downloads\sbox-public\game\sbox-dev.exe" `
  -WorkingDirectory "C:\Users\Mohsin Dingankar\Downloads\sbox-public\game" `
  -ArgumentList @(
    "-project",
    "C:\Users\Mohsin Dingankar\Downloads\sbox-public\game\addons\cstactics_spike\cstactics_spike.sbproj"
  )
```

4. If the first-run welcome modal appears, dismiss it.
5. Press `F5` or use `Game -> Play`.

In Play Mode:

- left-click a red/blue unit marker to select it;
- hover a cyan reachable tile to preview a blue path;
- left-click a cyan reachable tile to move;
- press `N` for the next unit;
- press `R` to reset units.

Do not make the user infer the editor flow. The agent should copy the addon,
launch S&box, enter Play Mode, prove movement, and capture screenshots before
asking for feedback.

The public source checkout used for this proof was patched locally from app id
`590830` to Steam's dev/test app id `480`, with
`game\steam_appid.txt = 480`, because this machine did not have S&box installed
as a Steam library app. The editor starts in offline mode; that is acceptable
for this local visual proof.

## Implemented Spike Surface

- off-white floor slabs;
- taller gray wall blocks;
- primitive props for car/crates/logs/sandbags/fountain/coffins/oranges;
- five red T unit markers;
- five blue CT unit markers;
- movement range, planned path, and danger/LOS overlays;
- left-click unit selection, hover path preview, and click-to-move movement;
- locked orthographic tactical camera;
- data-generated board from `Assets/data/banana_b_site.json`.

## Acceptance

- Playable screenshot is materially better than the current React/Three board
  and moves toward `public/concepts/isometric-duel-target.png`.
- Banana -> B-site reads without labels.
- Units are readable from the default camera.
- The camera feels tactical, not first-person.
- A user can test basic selection and movement without knowing S&box editor
  internals.
- A wall/cover edit is a data/code edit, not manual scene dressing.
- The implementation does not port combat, economy, bomb logic, utility, or AI.

## Kill Criteria

Kill S&box as a main-client candidate if the camera, editor workflow,
programmatic generation, or platform constraints make iteration slower than the
visual gain is worth.

That kill gate has been hit for the current proof: the visual gain is not worth
the switch.

