# CS2 Tactics Luanti Visual Spike

This is a contained Luanti/Minetest-style spike for the dual-track visual plan.
It does not port the React/Three gameplay. It proves whether a code-generated
voxel/whitebox tactical board can carry the visual direction better.

## What It Builds

- A 30x30 Banana -> B-site slice generated from `banana_b_site.json`.
- Warm clay floor, taller whitebox walls, B-site surface, crates, barrels,
  sandbags, fountain, coffins, oranges, and simple team markers.
- Five T units and five CT units as readable red/blue nodebox miniatures.
- Right-click a unit to select it.
- Right-click a highlighted move tile to preview a blue path and move the unit.
- Red danger/LOS floor band is generated from data.

## Run In Luanti

1. Install Luanti.
2. Copy or symlink `spikes/luanti-banana-b-site/cstactics_spike_game` into your
   Luanti `games/` folder.
3. Start Luanti, choose the `CS2 Tactics Luanti Spike` game, create a new world,
   and enter singleplayer.
4. Use `/cs_spike_reset` if you need to regenerate the board.
5. Use `/cs_spike_help` for interaction notes.

The player is spawned above the board for a tactical inspection angle. This is
not intended to be a final camera solution; it is a kill-criteria check for
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
