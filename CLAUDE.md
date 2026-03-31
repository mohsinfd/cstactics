# CS2 Tactics — Browser Game (React Three Fiber)

## What This Is
A round-based tactical shooter simulation inspired by CS2, rendered as a 2.5D isometric browser game. NOT an XCOM mod (originally planned as one, pivoted to standalone web game).

## Tech Stack
- **React + TypeScript + Vite** (localhost:5173)
- **React Three Fiber** (R3F) for 3D rendering
- **@react-three/drei** for helpers (Text, OrthographicCamera, MapControls)
- **Zustand** for state management
- **Three.js** InstancedMesh for performant tile rendering
- **tsconfig**: `verbatimModuleSyntax` is ON — use `import type` for type-only imports

## Project Structure
```
src/
  game/
    types.ts           — All interfaces (Unit, Tile, MapData, GameState, etc.)
    store.ts           — Zustand store: movement, turn system, AP, selection
    pathfinding.ts     — A* pathfinding + BFS flood fill for walkable range
    maps/
      inferno.ts       — MAP DATA: zones, cover, spawns, bombsites (NEEDS REBUILD)
    config/
      rules.ts         — Game rules (AP, phases, bomb timer, cover values)
      roles.ts         — 5 roles: AWPer, Entry, IGL, Support, Lurker
      weapons.ts       — All weapon stats (AK, M4, AWP, SMGs, pistols, knife)
      economy.ts       — Economy rules
    systems/           — (placeholder for combat, abilities)
  renderer/
    IsometricScene.tsx — Canvas, orthographic camera, lighting, fog
    MapRenderer.tsx    — Floor tiles, walls, cover, bombsite markers, callout labels,
                         walkable highlights, path preview, interactive click plane
    UnitRenderer.tsx   — 3D soldier models with role distinction, selection ring,
                         AP dots, HP bar, team colors (CT navy / T olive)
    effects/           — (placeholder for visual effects)
  ui/
    HUD.tsx            — Top bar (scores), team roster, selected unit panel,
                         end turn button, phase announcement, tile info tooltip
  styles/
    global.css         — Dark theme, Inter + JetBrains Mono fonts
```

## Game Rules (from rules.ts)
- 2 AP per unit per turn
- Setup phase: turns 1-2, sprint bonus +12 tiles, no firing
- Combat phase: turn 3+, standard rules
- Turn order: T acts → CT acts → next turn
- Bomb: 2 AP to plant, 8 turn timer, 15-tile blast radius
- Win: eliminate all enemies OR bomb detonates/defuses OR time expires
- MR12 format (first to 13, side swap at 12)

## 5 Player Roles
| Role    | Pro     | Mob | Aim | Ability                                    |
|---------|---------|-----|-----|--------------------------------------------|
| AWPer   | m0NESY  | 18  | 75  | FlickShot: move + shoot with +40% Aim      |
| Entry   | donk    | 16  | 80  | SprayTransfer: kill triggers free shot      |
| IGL     | Karrigan| 14  | 65  | ExecuteCall: +1 AP to nearby allies         |
| Support | Aleksib | 15  | 70  | PopFlash: blind enemies, boost ally aim     |
| Lurker  | ropz    | 17  | 78  | GhostRotate: silent move, bypass overwatch  |

## Map: Inferno
- Grid: 90 wide x 100 tall, 1 tile = 1.5m
- THE MAP TILE DATA IS WRONG. See MAP_REBUILD_GUIDE.md for the fix approach.
- Reference image: VGp3Yed.png in this folder

## What Works
- Tile rendering with InstancedMesh (floor, walls, cover objects)
- Unit rendering with role-specific 3D models and team colors
- Click-to-select units (via InteractiveFloor tile detection)
- AP-based movement with A* pathfinding and BFS flood fill
- Walkable range highlight and path preview on hover
- Turn system (T → CT alternation, turn counter, phase transitions)
- End Turn button, phase announcements
- HUD with scores, roster, selected unit panel, tile info tooltip
- Callout labels floating above map zones
- Bombsite markers with plant zone indicators

## What Does NOT Work / Needs Fixing
1. **MAP LAYOUT IS WRONG** — the tile coordinates in inferno.ts do not match real CS2 Inferno. Multiple attempts to hand-code coordinates have failed. See MAP_REBUILD_GUIDE.md for the recommended automated approach.
2. **Camera orientation** — needs verification after map rebuild (A-site should appear LEFT, B-site RIGHT from CT perspective)
3. **Combat system** — not implemented (shooting, damage, abilities)
4. **Buy phase** — not implemented
5. **Economy** — not implemented beyond initial $800
6. **Abilities** — not implemented (FlickShot, SprayTransfer, etc.)
7. **Utility items** — not implemented (smoke, flash, molotov)
8. **Round win conditions** — not implemented (elimination, bomb, timer)
9. **Player models could be better** — current box-based models work but lack polish

## Forbidden Patterns
- Do NOT use XCOM "Concealment" or "Pod" mechanics
- Do NOT make cover destructible
- Do NOT use procedural map generation (Inferno is a static map)
- Do NOT give any role more than 100 HP
- Do NOT use 8-digit hex colors in Three.js (e.g. `#aaaaaa55` — use `fillOpacity` instead)

## Development Priority
1. Fix the map (see MAP_REBUILD_GUIDE.md)
2. Verify camera + unit selection work with correct map
3. Implement combat (shooting with aim calculation, damage, death)
4. Implement bomb plant/defuse
5. Implement round win conditions
6. Implement economy + buy phase
7. Implement abilities
