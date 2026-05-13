# CS2 Tactics

A browser-based tactical prototype inspired by Counter-Strike positioning, utility, economy, and contact trades. The project explores how real-time shooter decisions can be translated into a readable turn-based tactics layer.

This repo is intended as a public engineering showcase: game-state modeling, pathfinding, line-of-sight checks, combat resolution, map tooling, and a React Three Fiber renderer.

## Highlights

- Turn-based tactical loop with movement, aim, shots, reaction fire, and utility
- Grid/pathfinding logic with walkable ranges and map masks
- Line-of-sight and smoke-blocking checks
- Weapon, role, economy, and rules configuration
- Isometric 3D scene rendered with React Three Fiber and Three.js
- Map-generation and validation scripts for the Inferno prototype

## Tech Stack

- React
- TypeScript
- Vite
- Three.js
- React Three Fiber
- Zustand

## Local Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Useful Scripts

```bash
npm run lint
npm run map:generate
npm run map:validate
```

## Repository Notes

This is a prototype rather than a packaged game. The public branch keeps design notes, roadmap notes, and implementation docs that help explain the architecture, but excludes raw AI handoff prompts and private scratch instructions.
