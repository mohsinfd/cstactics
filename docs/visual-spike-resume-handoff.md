# Visual Spike Resume Handoff

Use this when resuming from another machine with Luanti and/or S&box installed.

## Branch And PR

- Branch: `codex/cs2-xcom-roadmap-slice`
- Draft PR: https://github.com/mohsinfd/cstactics/pull/1
- Latest pushed commits for this session:
  - `459acda Harden roster usability after visual spike pull`
  - `71f14fc Add visual spike resume handoff`
  - `e481f83 Add Luanti visual spike`
  - `cf28943 Scaffold Sbox visual spike`

## Why This Exists

The current React/Three renderer has useful gameplay systems, but the visual
quality is not acceptable as the long-term presentation base. The active
decision is now a two-spike external-client comparison:

1. **Spike A: Luanti** for constrained voxel/nodebox whitebox map generation.
2. **Spike B: S&box** for Source-2-adjacent C# tooling and a potentially higher
   fidelity tactical board.

React/Three remains the gameplay rules prototype. Neither spike should port the
full game until its visual/client viability is proven.

## Spike A: Luanti

Primary files:

- `docs/luanti-visual-spike.md`
- `spikes/luanti-banana-b-site/README.md`
- `spikes/luanti-banana-b-site/cstactics_spike_game/game.conf`
- `spikes/luanti-banana-b-site/cstactics_spike_game/mods/cstactics_spike/init.lua`
- `spikes/luanti-banana-b-site/cstactics_spike_game/mods/cstactics_spike/banana_b_site.json`

Validate data:

```powershell
npm run luanti:validate
```

Expected current result:

- `ok: true`
- `size: 30x30`
- `walkableTiles: 357`
- `blockedTiles: 187`
- `units: { T: 5, CT: 5 }`
- `dangerTiles: 22`
- `warnings: []`

How to test:

1. Install Luanti.
2. Open Luanti once.
3. Open the Luanti user data directory.
4. Copy `spikes/luanti-banana-b-site/cstactics_spike_game` into the Luanti
   `games/` folder.
5. Restart Luanti.
6. Select `CS2 Tactics Luanti Spike`.
7. Create a new singleplayer world.
8. Use:
   - right-click red/blue unit nodes to select;
   - right-click cyan floor tiles to move;
   - `/cs_spike_reset` to rebuild the board;
   - `/cs_spike_help` for controls.

What to capture:

- first-load screenshot;
- selected unit screenshot;
- movement-range/path screenshot;
- one moved unit screenshot.

Decision gate:

- If the screenshot reads like intentional tactical whitebox, improve Luanti
  nodeboxes/camera/overlays.
- If it reads like generic block chaos or the camera fights tactical play, kill
  Luanti as the main visual client and keep it only as a map-authoring/reference
  sandbox.

## Spike B: S&box

Primary files:

- `docs/sbox-visual-spike.md`
- `spikes/sbox-banana-b-site/README.md`
- `spikes/sbox-banana-b-site/banana_b_site.json`

Validate data:

```powershell
npm run sbox:validate
```

Expected current result matches Luanti:

- `ok: true`
- `size: 30x30`
- `walkableTiles: 357`
- `blockedTiles: 187`
- `units: { T: 5, CT: 5 }`
- `dangerTiles: 22`
- `warnings: []`

Current status:

- S&box source build is now installed at
  `C:\Users\Mohsin Dingankar\Downloads\sbox-public`.
- `Bootstrap.bat` completed successfully after installing `.NET 10 SDK`
  through winget.
- `game\sbox-dev.exe` launched and left a visible launcher window titled
  `Welcome to the s&box editor`.
- No runnable CS Tactics `.sbproj` has been generated or verified yet. The next
  step is still to create the S&box spike project from the same authored
  Banana/B data as Luanti.

Implementation target:

- Create an empty S&box Game project.
- Load `spikes/sbox-banana-b-site/banana_b_site.json`.
- Generate off-white floor slabs, taller walls, primitive props, five red T
  units, five blue CT units, movement range, planned path, and danger/LOS
  overlays.
- Add a locked tactical camera.
- Add click/raycast selection and optional one-step movement.

Decision gate:

- S&box only wins if a first screenshot and camera feel are clearly better than
  Luanti/React while remaining data-generated and agent-editable.
- Kill S&box if programmatic generation is awkward, editor workflow is too
  manual, platform risk is too high, or the screenshot does not justify the
  complexity.

## Checks Already Run This Session

Passed after the Luanti spike:

```powershell
npm run luanti:validate
npm run build
npm run lint
npm run map:validate
npm run test:browser
```

Browser regression result:

- 20 passed
- 4 expected skips
- Existing Three.js deprecation warnings only:
  - `THREE.Clock`
  - `PCFSoftShadowMap`

Passed after the S&box scaffold:

```powershell
npm run luanti:validate
npm run sbox:validate
npm run lint
npm run build
```

May 16, 2026 pull/resume check on this Windows machine:

```powershell
npm run luanti:validate
npm run sbox:validate
```

Both validators still pass with `walkableTiles: 357`, `blockedTiles: 187`,
five units per side, `dangerTiles: 22`, and no warnings. Luanti/Minetest and
S&box were not found on PATH, in common Program Files locations, or under the
local Steam `steamapps/common` folder, so the runtime screenshot gate remains
blocked until one of those clients is installed or the branch is resumed on a
machine that already has them.

May 17, 2026 runtime setup update on this Windows machine:

- Luanti 5.16.1 was opened by the user and its profile path resolved to
  `C:\Users\Mohsin Dingankar\AppData\Roaming\Minetest`.
- The Luanti spike game was copied to
  `C:\Users\Mohsin Dingankar\AppData\Roaming\Minetest\games\cstactics_spike_game`.
  Restart Luanti and choose `CS2 Tactics Luanti Spike` on the `Start Game` tab.
- S&box source was cloned to
  `C:\Users\Mohsin Dingankar\Downloads\sbox-public`, bootstrapped successfully,
  and launched with `game\sbox-dev.exe`.
- The S&box runtime/editor is available now, but the CS Tactics Spike B project
  still needs to be created before a Banana/B screenshot can be captured.

## What Not To Do Next

- Do not port combat, economy, bomb logic, AI, or match rules into Luanti/S&box
  yet.
- Do not chase realistic CS map art.
- Do not hand-dress scenes in an editor as the primary pipeline.
- Do not decide the client base from theory. Decide from screenshots,
  interaction feel, and data-authoring speed.

## Immediate Next Move

On the next machine:

1. Pull `codex/cs2-xcom-roadmap-slice`.
2. Run `npm install` if needed.
3. Run `npm run luanti:validate` and `npm run sbox:validate`.
4. Run the Luanti spike and capture screenshots.
5. Create the S&box project from the scaffold and capture the same Banana/B
   screenshots.
6. Compare Luanti vs S&box vs current React/Three, then choose the next visual
   milestone.

