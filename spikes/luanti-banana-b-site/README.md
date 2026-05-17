# CS2 Tactics Luanti Visual Spike

This is a contained Luanti/Minetest-style spike for the dual-track visual plan.
It does not port the React/Three gameplay. It proves whether a code-generated
voxel/whitebox tactical board can carry the visual direction better.

## What It Builds

- A 30x30 Banana -> B-site slice generated from `banana_b_site.json`.
- Warm clay floor, taller whitebox walls, B-site surface, crates, barrels,
  sandbags, fountain, coffins, oranges, and simple team markers.
- Five T units and five CT units as readable red/blue nodebox miniatures.
- A fixed overhead observer view with Luanti's survival HUD chrome hidden.
- Right-click a unit to select it.
- Right-click a highlighted move tile to preview a blue path and move the unit.
- Red danger/LOS floor band is generated from data.
- Runtime proof screenshot: `luanti-runtime-overhead.png`.

## Run In Luanti

1. Install Luanti.
2. Copy or symlink `spikes/luanti-banana-b-site/cstactics_spike_game` into your
   Luanti `games/` folder.
3. Start Luanti, choose the `CS2 Tactics Luanti Spike` game, create a new world,
   and enter singleplayer.
4. Use `/cs_spike_view` if the camera is moved and you need the clean overhead
   view again.
5. Use `/cs_spike_reset` if you need to regenerate the board.
6. Use `/cs_spike_help` for interaction notes.

On this Windows test machine the installed game folder is:

```powershell
C:\Users\Mohsin Dingankar\AppData\Roaming\Minetest\games\cstactics_spike_game
```

The existing test world can be launched directly without using the menu:

```powershell
& 'C:\Users\Mohsin Dingankar\AppData\Local\luanti\5.16.1\bin\luanti.exe' --go --world 'C:\Users\Mohsin Dingankar\AppData\Roaming\Minetest\worlds\CS2 spoike' --gameid cstactics_spike --name Tester
```

Luanti may show a Windows Firewall prompt because local singleplayer starts a
local server. Dismissing the prompt is enough for local visual testing.

The player is spawned above the board in a fixed tactical observer view. This
is not intended to be a final camera solution; it is a kill-criteria check for
whether Luanti can support tactical readability and click interaction.

## Validate

From the React repo root:

```bash
npm run luanti:validate
```

The validator checks that the slice stays 30x30, units are on walkable tiles,
there are five units per side, objects stay in bounds, and tactical overlays
reference real floor cells.

## Spike Rules

- Keep map edits in `banana_b_site.json`.
- Keep the visual language constrained: clay/whitebox nodes, simple team colors,
  no realism chase.
- Do not port economy, AI, bomb rules, or combat in this spike.
- If camera/HUD interaction is bad after a few focused passes, kill Luanti as
  the main client path and keep it only as a map-authoring/reference sandbox.
