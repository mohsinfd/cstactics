# Handoff Prompt for Claude Code

Copy-paste this into Claude Code when you start:

---

I'm building CS2 Tactics, a turn-based tactical shooter browser game in React Three Fiber. The repo is cloned from https://github.com/mohsinfd/cstactics.git. The main app is in `cs2-web/`.

Read `cs2-web/CLAUDE.md` for full project context, then read `cs2-web/MAP_REBUILD_GUIDE.md`.

**Immediate priority: The Inferno map layout is broken.** I've tried hand-coding tile coordinates 3 times and it never matches real CS2 Inferno. The corridors, proportions, and positions are all wrong.

**What I want you to do:**

1. Find or download a top-down CS2 Inferno radar overview image (the official `de_inferno_radar` from game files, or any clean top-down callout map PNG).

2. Write a Node script that reads that image and generates accurate tile data for a 90x100 grid by tracing walkable pixels (light = floor, dark = wall). Use the de_inferno.txt radar config values (pos_x: -2087, pos_y: 3870, scale: 4.9) for coordinate mapping.

3. Replace the ZONES array in `src/game/maps/inferno.ts` with the generated data. Keep the same interface (CalloutZone with name, xMin/yMin/xMax/yMax, tileType). Overlay callout names using known positions.

4. Verify by running `npm run dev` and checking that the rendered isometric map silhouette matches real Inferno: T Spawn bottom area, Banana curving left to B Site (top-left), Mid through center, Apartments on right to A Site (right side), CT Spawn top-right.

5. After the map is fixed, the camera in `IsometricScene.tsx` should show A-site on the LEFT and B-site on the RIGHT (CT's perspective). Adjust if needed.

There's a reference 3D isometric image of Inferno at `cs2-web/VGp3Yed.png` showing the correct structure.

After the map is working, the next priorities are: combat system (shooting/damage), bomb plant/defuse, round win conditions, then economy and buy phase.

---
