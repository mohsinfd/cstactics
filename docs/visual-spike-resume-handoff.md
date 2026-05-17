# Visual Spike Resume Handoff

Use this when resuming from another machine with Luanti and/or S&box installed.

## Branch And PR

- Branch: `codex/cs2-xcom-roadmap-slice`
- Draft PR: https://github.com/mohsinfd/cstactics/pull/1
- Latest pushed commits for this session:
  - `9eef08a Fix Luanti visual spike overhead view`
  - `42374ec Add runnable Sbox visual spike proof`
  - `ba4f42d Update visual spike runtime setup handoff`
  - `6025cba Update visual spike handoff tip commits`

## Why This Exists

The current React/Three renderer has useful gameplay systems, but the visual
quality is not acceptable as the long-term presentation base. The active
decision has moved from a two-spike external-client comparison to a narrower
evidence gate:

1. **Spike A: Luanti** is killed as the main visual-client candidate after the
   May 17, 2026 mouse/camera/control test.
2. **Spike B: S&box** is also killed as the main visual-client candidate. It
   has a first playable selection/movement proof, but the visual result is not
   enough better than Three.js/browser to justify the platform/editor cost.

React/Three remains the gameplay rules prototype. Neither spike should port the
full game. The active path returns to a browser presentation rebuild around the
`/duel-2-5d` concept-image bridge and
`public/concepts/isometric-duel-target.png`.

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

Verdict:

- First-load screenshot was captured on May 17, 2026 at
  `spikes/luanti-banana-b-site/luanti-runtime-overhead.png`.
- The overhead camera/HUD fix passed mechanically, but the mouse/camera and
  right-click interaction still felt wrong enough to kill Luanti as the main
  visual-client candidate.
- Do not capture more Luanti selected/path/moved screenshots for the
  main-client decision.
- Keep Luanti only as a map-authoring/reference sandbox if a future task needs
  its data-generation experiment. In that case, run `npm run luanti:validate`.

## Spike B: S&box

Primary files:

- `docs/sbox-visual-spike.md`
- `spikes/sbox-banana-b-site/README.md`
- `spikes/sbox-banana-b-site/banana_b_site.json`
- `spikes/sbox-banana-b-site/cstactics_spike/cstactics_spike.sbproj`
- `spikes/sbox-banana-b-site/cstactics_spike/Code/SpikeMapGenerator.cs`
- `spikes/sbox-banana-b-site/cstactics_spike/Assets/scenes/cstactics_spike.scene`
- `spikes/sbox-banana-b-site/sbox-playmode.png`
- `spikes/sbox-banana-b-site/sbox-playable.png`
- `spikes/sbox-banana-b-site/sbox-playable-moved.png`

Validate data:

```powershell
npm run sbox:validate
```

Archived S&box data still mirrors the Luanti reference data:

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
- A runnable local CS Tactics addon exists in the S&box checkout at
  `C:\Users\Mohsin Dingankar\Downloads\sbox-public\game\addons\cstactics_spike`.
- The repo-backed copy lives at
  `spikes/sbox-banana-b-site/cstactics_spike`.
- The public source build was patched locally to Steam app id `480`
  (`engine\Sandbox.Engine\Application.cs` and `game\steam_appid.txt`) because
  this machine does not have S&box installed as app id `590830`.
- `SteamAPI_Init` now succeeds, and the editor runs in offline mode.
- Pressing `F5` after dismissing the first-run welcome modal starts Play Mode.
- Verified play-mode log:
  `CS2 Tactics S&box Spike: generated Banana to B Site Whitebox Slice (30x30) with 10 units.`
- Verified movement log:
  `CS2 Tactics S&box Spike: Moved T_ENT to (16, 6).`
- Screenshot captured at:
  `spikes/sbox-banana-b-site/sbox-playmode.png`.
- Playable proof screenshots captured at:
  `spikes/sbox-banana-b-site/sbox-playable.png`
  and `spikes/sbox-banana-b-site/sbox-playable-moved.png`.
- Product verdict on May 17, 2026: S&box is killed as the main visual-client
  candidate. It works mechanically, but it does not create enough visual lift
  over the current browser prototype.

Implementation target:

- Implemented first pass: load `Assets/data/banana_b_site.json`, generate
  off-white floor slabs, taller walls, primitive props, five red T units, five
  blue CT units, movement range, planned path, danger/LOS overlays, and a locked
  orthographic tactical camera.
- Implemented first playable pass: visible cursor, left-click unit selection,
  cyan movement range, hover path preview, click-to-move, `N` next-unit, `R`
  reset, and on-screen status text.

Decision gate:

- The S&box decision is closed for the current proof: do not continue S&box as a
  main-client candidate.
- Keep S&box only as reference evidence unless an explicit new product decision
  reopens external-engine work.

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

Passed after the S&box playable interaction patch:

```powershell
npm run sbox:validate
npm run luanti:validate
npm run lint
npm run build
git diff --check
```

Runtime proof after the same patch:

- S&box Play Mode displayed the instruction overlay and cyan reachable tiles.
- A clicked reachable tile moved `T_ENT` to `(16, 6)`.
- Screenshots captured:
  `spikes/sbox-banana-b-site/sbox-playable.png`
  and `spikes/sbox-banana-b-site/sbox-playable-moved.png`.

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
  This is now reference-only; do not restart Luanti as a main-client candidate.
- The first runtime attempt exposed the default Luanti failure mode: sky view,
  hearts/hotbar, and first-person camera, despite the board being generated.
- The Luanti spike was fixed to force a 36-unit-high overhead observer view,
  hide the survival HUD chrome, equip a long-range selector, add a neutral
  tabletop/sky, and provide `/cs_spike_view` plus `/cs_spike_free`.
- The fixed Luanti runtime screenshot is:
  `spikes/luanti-banana-b-site/luanti-runtime-overhead.png`.
- Windows Firewall can display a prompt because Luanti singleplayer starts a
  local server. Dismissing it is enough for local visual testing.
- S&box source was cloned to
  `C:\Users\Mohsin Dingankar\Downloads\sbox-public`, bootstrapped successfully,
  and launched with `game\sbox-dev.exe`.
- A local S&box addon was created at
  `C:\Users\Mohsin Dingankar\Downloads\sbox-public\game\addons\cstactics_spike`
  and copied back into this repo under
  `spikes/sbox-banana-b-site/cstactics_spike`.
- Initial `Steam Not Found` was fixed by patching the public source build to
  app id `480` and writing `game\steam_appid.txt = 480`.
- S&box compiles and mounts `local.cstactics_spike`; backend account lookup
  returns `406`, so the editor runs in offline mode.
- The first-run welcome modal blocks `F5` until dismissed.
- After `F5`, Play Mode generated the Banana/B board and logged:
  `CS2 Tactics S&box Spike: generated Banana to B Site Whitebox Slice (30x30) with 10 units.`
- Screenshot proof:
  `spikes/sbox-banana-b-site/sbox-playmode.png`.
- After clicking a reachable tile, Play Mode logged:
  `CS2 Tactics S&box Spike: Moved T_ENT to (16, 6).`
- Playable screenshots:
  `spikes/sbox-banana-b-site/sbox-playable.png`
  and `spikes/sbox-banana-b-site/sbox-playable-moved.png`.
- User/product review after the playable proof: S&box is as bad as the current
  Three.js route visually, so it fails the visual-lift gate.

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
3. Do not continue Luanti or S&box main-client testing. Run
   `npm run luanti:validate` or `npm run sbox:validate` only if touching their
   archived spike data.
4. Continue the browser presentation rebuild from `/duel-2-5d` and
   `public/concepts/isometric-duel-target.png`.
5. The next proof should be a playable browser slice that looks materially
   closer to the reference image, not another external-engine setup pass.

