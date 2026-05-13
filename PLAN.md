# CS2 Tactics: Web Edition — Implementation Plan

## What We're Building

A 2.5D isometric tactical game in the browser. Think Age of Empires 2's camera angle applied to CS2's competitive 5v5.  The game board is Inferno (and later any CS2 map), rendered as isometric tiles with walls that have real height, cover objects you can read at a glance, and unit figures that look like CS operators.

All game rules, weapon stats, role data, and map coordinates carry over directly from the XCOM phase — none of that design work is lost.

---

## Tech Stack

| Layer | Technology | Why |
|:------|:-----------|:----|
| Build | Vite + TypeScript | Fast hot-reload, modern tooling |
| UI Framework | React 19 | Component model for HUD, menus, overlays |
| 3D Rendering | Three.js via react-three-fiber | Isometric scene with real lighting and shadows |
| 3D Helpers | @react-three/drei | OrthographicCamera, shadows, helpers out of the box |
| State | Zustand | Lightweight, no boilerplate, perfect for game state |
| Pathfinding | Custom A* (tiny, ~80 lines) | No external dependency needed for grid pathfinding |
| Styling | Tailwind CSS | Fast UI styling without fighting CSS |
| Multiplayer (Phase 7) | Socket.io | WebSocket rooms for 2-player turns |

No game engine. No Unity. Just React + Three.js in a browser.

---

## Folder Structure

```
CS2Tactics/
├── (existing XCOM mod files stay untouched)
├── cs2-web/                         ← NEW: entire web game lives here
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── public/
│   │   └── maps/
│   │       └── inferno/
│   │           └── radar.png        ← Radar overview (floor texture reference)
│   └── src/
│       ├── main.tsx                 ← Entry point
│       ├── App.tsx                  ← Root component, routes game screens
│       │
│       ├── game/                    ← PURE LOGIC (no rendering)
│       │   ├── types.ts             ← All interfaces: Unit, Weapon, Tile, Phase, etc.
│       │   ├── GameEngine.ts        ← State machine: phases, turns, win conditions
│       │   ├── store.ts             ← Zustand store: the single source of truth
│       │   ├── config/
│       │   │   ├── weapons.ts       ← Ported from CS2_WeaponData.ini
│       │   │   ├── roles.ts         ← Ported from CS2_ClassData.ini
│       │   │   ├── rules.ts         ← Ported from CS2_GameRules.ini
│       │   │   └── economy.ts       ← Economy constants and loss-bonus ladder
│       │   ├── maps/
│       │   │   ├── types.ts         ← MapData interface: grid, walls, spawns, bombsites
│       │   │   └── inferno.ts       ← Full Inferno from CS2_Inferno_TileMap.md
│       │   └── systems/
│       │       ├── pathfinding.ts   ← A* on walkable tile grid
│       │       ├── los.ts           ← Bresenham line-of-sight through walls
│       │       ├── combat.ts        ← Hit calc: aim, cover, range, crit
│       │       ├── phase.ts         ← Setup → Combat → PostPlant → RoundEnd
│       │       └── bomb.ts          ← Plant, defuse, timer, detonation
│       │
│       ├── renderer/                ← THREE.JS VISUALS
│       │   ├── IsometricScene.tsx   ← Canvas, camera, lights, shadows
│       │   ├── MapRenderer.tsx      ← Floor tiles, walls, cover objects
│       │   ├── UnitRenderer.tsx     ← Player models (capsule + weapon shape)
│       │   ├── FogOfWar.tsx         ← Dark overlay on unseen tiles
│       │   ├── TileOverlay.tsx      ← Selection highlight, movement range, path
│       │   └── effects/
│       │       ├── MuzzleFlash.tsx  ← Shooting visual
│       │       ├── BombZone.tsx     ← Pulsing bombsite highlight
│       │       └── Tracer.tsx       ← Bullet path line
│       │
│       ├── ui/                      ← REACT HUD (overlays the 3D scene)
│       │   ├── HUD.tsx              ← Master HUD wrapper
│       │   ├── BuyPhase.tsx         ← Weapon/utility purchase screen
│       │   ├── RoundBar.tsx         ← Round counter, score, timer
│       │   ├── EconomyDisplay.tsx   ← Money for both teams
│       │   ├── UnitCard.tsx         ← Selected unit: HP, weapon, role, ability
│       │   ├── KillFeed.tsx         ← Kill notifications (top right, CS2 style)
│       │   ├── PhaseAnnounce.tsx    ← "SETUP PHASE" / "FIRST CONTACT!" overlay
│       │   └── ActionBar.tsx        ← Move, shoot, ability, plant, defuse buttons
│       │
│       └── styles/
│           └── global.css           ← Base styles, fonts, CSS variables
```

The split is intentional: `game/` has zero rendering imports. You could run the entire game engine in a test suite or on a server. `renderer/` is purely visual. `ui/` is purely React DOM. This matters for multiplayer — the engine runs on both client and server.

---

## Visual Design Direction

**Tone: Tactical noir — dark, contrasty, functional beauty.**

Not colorful AoE2 pastoral. Not flat 2D radar. Think: a military command table with miniature figures, lit by a single overhead lamp. Dark ground, sharp shadows, units that pop.

Specifics:
- **Floor**: Dark concrete tones. Bombsites get a subtle red/orange underglow. Spawn areas get team-color tinting (blue CT, gold T). Walkable tiles have a faint grid edge visible on hover.
- **Walls**: Matte dark grey boxes with height (2-3 units tall). Visible shadow cast. You read the corridors by the negative space between walls.
- **Cover objects**: Half cover = short blocks (sandy/brown tone). Full cover = tall blocks (darker). Distinct from walls by color and height.
- **Units**: Capsule body + small weapon silhouette. CT = dark blue with white accent. T = dark gold with black accent. Selected unit glows softly. Role icon floating above head.
- **Fog of War**: Tiles outside sight range are darkened (0.7 opacity black overlay). Tiles never seen are fully black. Previously-seen but currently-hidden tiles show map but no units (grey).
- **Lighting**: One warm directional light (sun, from top-right). Subtle ambient. Shadows enabled on all geometry. This alone sells the 2.5D depth.
- **UI**: Dark semi-transparent panels. Monospace font for numbers (ammo, money). Clean sans-serif for labels. CS2's signature yellow for T-side, blue for CT-side.
- **Camera**: Orthographic, classic isometric angle (rotated 45 degrees, tilted ~35 degrees down). Zoom and pan with mouse wheel + drag. No rotation (keeps the AoE2 readability).

---

## Implementation Phases

### Phase 1: "The Board" (foundation)
Get a playable Inferno visible in the browser.

1. Project scaffolding (Vite + React + r3f + TypeScript + Tailwind)
2. Isometric scene: OrthographicCamera, directional light, shadow plane
3. Inferno map data: convert CS2_Inferno_TileMap.md to TypeScript grid
4. Map renderer: floor tiles, walls (BoxGeometry with height), cover objects
5. 10 units placed: 5 CT (blue) at CT-Spawn, 5 T (gold) at T-Spawn
6. Camera controls: pan (drag), zoom (scroll), no rotate

**Deliverable**: You open localhost, see isometric Inferno with walls, cover, and 10 colored figures on it. You can pan and zoom.

### Phase 2: "Move" (interaction)
Make units selectable and movable.

1. Click unit to select → highlight tile, show unit card
2. Show walkable range (shaded tiles based on mobility stat)
3. A* pathfinding on walkable grid (respects walls)
4. Click destination → unit moves along path (animated)
5. Action point tracking (2 AP per unit per turn)
6. "End Turn" button → switch to other team's turn

**Deliverable**: You can select units, see where they can move, click to move, and alternate turns between T and CT.

### Phase 3: "Shoot" (combat)
Turn it into a game.

1. Line-of-sight (Bresenham ray through wall grid)
2. "Shoot" action: select weapon target in LOS → hit calculation
3. Hit formula: BaseAim + RoleBonus - CoverPenalty - RangePenalty - RecoilPenalty
4. Damage, crits (headshots), unit death
5. Shooting VFX: tracer line, muzzle flash, damage number popup
6. Cover system: half cover (-20 aim to attacker), full cover (-40 aim)
7. Kill feed UI

**Deliverable**: Units can shoot each other. Cover matters. Units die. A kill feed shows it.

### Phase 4: "Phases" (round structure)
Setup Phase and First Contact.

1. Round state machine: Buy → Setup → Combat → PostPlant → RoundEnd
2. Setup Phase (Turns 1-2): fog overlay (sight range = 2), sprint bonus (+12 mob), shooting disabled
3. Turn 3 transition: "FIRST CONTACT!" announcement, fog lifts
4. Phase-aware UI: turn counter, phase label, team indicator
5. Round timer (14 turns max)
6. Win conditions: elimination, time expiry

**Deliverable**: A round plays out with proper phase flow. Setup phase fog, then combat opens up.

### Phase 5: "The Bomb"
Core CS2 mechanic.

1. Bomb carrier assignment (one T unit)
2. Plant action (2 AP, must be in plant zone)
3. Bomb timer (8 turns)
4. Defuse action (2 AP for CT, must be adjacent to bomb)
5. Bomb detonation (visual explosion, 15-tile kill radius)
6. Win conditions: detonation (T wins), defuse (CT wins)
7. Bomb drop on carrier death, pickup mechanic

**Deliverable**: Full round with bomb plant/defuse. All 4 win conditions working.

### Phase 6: "Economy & Buy Phase"
Between-round system.

1. Money tracking per team
2. Loss bonus ladder (escalating with consecutive losses)
3. Kill rewards (rifle $300, AWP $100, SMG $600)
4. Buy phase UI: weapon grid, utility slots, budget display
5. Weapon purchase → unit loadout changes
6. Round reset: respawn all units, keep economy state
7. Multi-round match flow (up to MR12)

**Deliverable**: Multiple rounds with economy pressure. Eco rounds vs full buys matter.

### Phase 7: "Multiplayer Foundation"
Two humans, one game.

1. Socket.io server (simple Node.js)
2. Game rooms: create/join with code
3. Assign T/CT on join
4. Turn sync: actions sent as events, applied on both clients
5. Game engine runs on server (authoritative), clients are views
6. Reconnect handling

**Deliverable**: Two browser tabs (or two computers) playing against each other.

### Phase 8: "Abilities & Polish" (post-multiplayer)
Role-specific abilities, additional maps, visual refinement.

1. FlickShot (AWPer), SprayTransfer (Entry), ExecuteCall (IGL), PopFlash (Support), GhostRotate (Lurker)
2. Utility items (smoke, flash, molotov as area effects on tiles)
3. Additional maps: Dust2, Mirage (just new map data files + radar images)
4. Sound effects (gunshots, bomb plant/defuse beep, First Contact announcement)
5. Visual polish: better unit models, particle effects, post-processing

---

## What You Need Installed

On your Windows machine, you need ONE thing:

**Node.js** (v18 or higher)
- Download from https://nodejs.org (LTS version)
- This gives you both `node` and `npm`
- Everything else installs via npm

That's it. No game engine. No SDK. No Visual Studio. Just Node.js and a browser.

---

## What Carries Forward from XCOM

| XCOM Artifact | Web Equivalent | Status |
|:--------------|:---------------|:-------|
| CS2_GameRules.ini | `game/config/rules.ts` | Direct port, same values |
| CS2_WeaponData.ini | `game/config/weapons.ts` | Direct port, same values |
| CS2_ClassData.ini | `game/config/roles.ts` | Direct port, same values |
| CS2_Inferno_TileMap.md | `game/maps/inferno.ts` | Direct port, same coordinates |
| X2GameRuleset_CS2.uc phase logic | `game/systems/phase.ts` | Rewritten in TS, same behavior |
| X2MapBuilder_Inferno.uc bomb zones | `game/systems/bomb.ts` | Same tile math |
| Ability effects (.uc files) | `game/systems/abilities.ts` | Same formulas |
| Public design notes | Kept in `README.md`, `ROADMAP.md`, and `docs/` | Handoff prompts removed |

Nothing is thrown away. The design is the product. The renderer is replaceable.
