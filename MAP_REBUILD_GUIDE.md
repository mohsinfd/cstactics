# How to Fix the Inferno Map — Automated Radar Trace Approach

## The Problem
The map tile data in `src/game/maps/inferno.ts` has been hand-coded multiple times and keeps coming out wrong. Human-estimated rectangle coordinates cannot accurately capture Inferno's curved corridors, angled walls, and irregular room shapes.

## The Solution: Trace from the Official Radar Image
The CS2 game files contain a top-down radar overview of every map. For Inferno, this is `de_inferno_radar.dds` (converted to PNG). This image IS the ground truth for the 2D layout. Code can read it pixel-by-pixel and convert it to tile data.

## Step-by-Step Plan

### Step 1: Get the Radar Image
Option A: Extract from CS2 game files at:
`Steam/steamapps/common/Counter-Strike Global Offensive/csgo/resource/overviews/de_inferno_radar.dds`
Convert DDS to PNG using any image tool.

Option B: Download from the CSGO-Analysis GitHub repo:
`https://github.com/CSGO-Analysis/csgo-maps-overviews`

Option C: Use the reference image already in this folder (`VGp3Yed.png`) as structural reference, combined with any top-down Inferno callout image from Google.

### Step 2: Write a Tile Generation Script
Create a Node.js script (`scripts/generate-tilemap.ts`) that:

1. Loads the radar PNG (1024x1024 pixels typically)
2. For each pixel, determines if it's walkable (light gray/colored) or wall (dark/black)
3. Maps pixel coordinates to the 90x100 tile grid using:
   - `tileX = Math.floor((pixelX / imageWidth) * 90)`
   - `tileY = Math.floor(((imageHeight - pixelY) / imageHeight) * 100)` (flip Y)
4. For each tile, sets walkable = true if >50% of corresponding pixels are light
5. Outputs a 2D boolean grid: `walkable[y][x]`

### Step 3: Assign Tile Types and Callout Labels
After generating the walkable grid, overlay the callout zones:
- Use the de_inferno.txt radar config for anchor points:
  - `pos_x: -2087, pos_y: 3870, scale: 4.9`
  - CT Spawn: normalized (0.9, 0.35)
  - T Spawn: normalized (0.1, 0.67)
  - Bomb A: normalized (0.81, 0.69)
  - Bomb B: normalized (0.49, 0.22)
- Define callout zones as rough rectangles around known positions
- For each walkable tile, assign the callout label from the nearest/enclosing zone
- Assign tile types: spawn_t, spawn_ct, bombsite_a, bombsite_b, floor

### Step 4: Generate Cover Objects
Place cover objects at known positions (Truck, Car, Fountain, Coffins, etc.) using the callout zone centers as reference points. These are specific gameplay elements, not derived from the radar image.

### Step 5: Export to inferno.ts
The script outputs the complete zone definitions, cover objects, spawn positions, bombsite bounds, and plant zones. Replace the contents of `src/game/maps/inferno.ts`.

### Step 6: Verify
Run `npm run dev` and visually compare the rendered map against the reference image. The silhouette should match.

## Alternative: Manual Trace with Visual Feedback
If the radar image approach is too complex, an alternative is:
1. Display the radar image as a textured plane in the Three.js scene
2. Overlay the tile grid on top with transparency
3. Visually align zones to match the radar image
4. Adjust coordinates with immediate visual feedback

## Key Reference: de_inferno.txt Config
```
"material" "overviews/de_inferno"
"pos_x" "-2087"
"pos_y" "3870"
"scale" "4.9"
// Normalized positions on radar image (0-1):
CTSpawn_x  0.9    CTSpawn_y  0.35
TSpawn_x   0.1    TSpawn_y   0.67
BombA_x    0.81   BombA_y    0.69
BombB_x    0.49   BombB_y    0.22
```

## Files to Modify
- `src/game/maps/inferno.ts` — replace ZONES, COVER, spawns, bombsites
- `src/renderer/IsometricScene.tsx` — may need camera adjustment after map changes
