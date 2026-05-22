# CS2 Tactics

A browser-based tactical prototype inspired by Counter-Strike positioning,
utility, economy, and contact trades. The project explores how real-time shooter
decisions can be translated into a readable turn-based tactics layer.

This repo is intended as a public engineering showcase: game-state modeling,
pathfinding, line-of-sight checks, combat resolution, map tooling, and a React
Three Fiber renderer.

## Highlights

- Turn-based tactical loop with movement, aim, shots, reaction fire, and utility
- Grid/pathfinding logic with walkable ranges and map masks
- Line-of-sight and smoke-blocking checks
- Weapon, role, economy, and rules configuration
- Isometric 3D scene rendered with React Three Fiber and Three.js
- Map-generation and validation scripts for the Inferno prototype
- Route-aware locomotion with generated placeholder unit animation frames

## Tech Stack

- React
- TypeScript
- Vite
- Three.js
- React Three Fiber
- Zustand

## Local Development

```powershell
npm install
npm run dev -- --host 127.0.0.1 --port 5174
```

## Build

```powershell
npm run build
```

## Useful Scripts

```powershell
npm run lint
npm run map:generate
npm run map:validate
npm run sprites:generate
npm run sprites:validate
```

## Unit Sprite Export Pipeline

The current generated SVG locomotion frames are placeholder programmer art. They
prove the runtime animation plumbing only. Production unit frames should follow
`docs/unit-sprite-asset-contract.md`.

To regenerate the placeholder frames:

```powershell
npm run sprites:generate
```

To export authored PNG frames from Blender, use the stub manually. Blender is
not required for normal builds.

```powershell
blender --background art/blender/units/cs2-tactics-unit.blend --python scripts/blender/export-unit-sprite-sheet.py -- --team ct
blender --background art/blender/units/cs2-tactics-unit.blend --python scripts/blender/export-unit-sprite-sheet.py -- --team t
```

The export script writes manifest-compatible files to:

- `public/board2d5/units/exported/ct/`
- `public/board2d5/units/exported/t/`

Switch the relevant team in
`src/renderer/locomotion/unitAnimationManifest.ts` from `generated` to
`exported` only after the exported folder contains the full required clip set.

## Repository Notes

This is a prototype rather than a packaged game. The public branch keeps design
notes, roadmap notes, and implementation docs that help explain the architecture.
