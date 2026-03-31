// ============================================================
// Inferno Map Data — Rebuilt from 3D isometric reference image.
//
// Grid: 90 wide (X) x 100 tall (Y)
// Scale: 1 tile = 1.5m
//
// LAYOUT (from reference image + de_inferno radar):
//   T Spawn:  center-BOTTOM (fountain)
//   CT Spawn: top-RIGHT (right of dark wall)
//   A Site:   RIGHT, mid-height
//   B Site:   top-LEFT (pillars)
//
// Map shape: inverted Y from T Spawn.
//   Left branch → Banana → B Site
//   Center → Mid → Arch/CT
//   Right → Alt Mid/Apps → A Site
//
// Corridors are narrow (4-6 tiles). Large wall masses between.
// Every connected pair overlaps by 2+ tiles for walkability.
// ============================================================
import type { MapData, Tile, TileType, CoverObject, TileCoord } from '../types';

const W = 90;
const H = 100;
const TILE_SIZE = 1.5;

export interface CalloutZone {
  name: string;
  xMin: number; yMin: number;
  xMax: number; yMax: number;
  tileType: TileType;
  elevation?: number;
}

// =================================================================
// ZONE DEFINITIONS
// Traced from isometric reference image structure.
// Zones checked in order; first match wins for labeling.
// =================================================================
const ZONES: CalloutZone[] = [
  // ===================== T SPAWN (center-bottom) =====================
  // Open courtyard with fountain, three exits fan out: left→Banana, center→Mid, right→AltMid
  { name: 'T Spawn', xMin: 28, xMax: 42, yMin: 2, yMax: 14, tileType: 'spawn_t' },

  // T Ramp — wide connector fanning out from T Spawn
  { name: 'T Ramp', xMin: 18, xMax: 44, yMin: 12, yMax: 20, tileType: 'floor' },

  // ===================== BANANA (left side, curves up to B) =====================
  // Narrow 4-6 tile corridor, shifts left as it goes north
  { name: 'Bottom Banana', xMin: 18, xMax: 24, yMin: 18, yMax: 30, tileType: 'floor' },
  { name: 'Car', xMin: 14, xMax: 20, yMin: 28, yMax: 32, tileType: 'floor' },
  { name: 'Lower Banana', xMin: 12, xMax: 18, yMin: 30, yMax: 42, tileType: 'floor' },
  { name: 'Sandbags', xMin: 12, xMax: 16, yMin: 40, yMax: 44, tileType: 'floor' },
  { name: 'Upper Banana', xMin: 10, xMax: 16, yMin: 42, yMax: 54, tileType: 'floor' },
  { name: 'Logs', xMin: 10, xMax: 14, yMin: 48, yMax: 52, tileType: 'floor' },
  { name: 'Wall Corner', xMin: 10, xMax: 14, yMin: 52, yMax: 58, tileType: 'floor' },
  { name: 'Top Banana', xMin: 10, xMax: 20, yMin: 56, yMax: 70, tileType: 'floor' },

  // ===================== B SITE (top-left, pillars area) =====================
  // Enclosed site with fountain, oranges, dark corner
  { name: 'Dark', xMin: 10, xMax: 14, yMin: 68, yMax: 74, tileType: 'bombsite_b' },
  { name: 'Coffin B', xMin: 10, xMax: 14, yMin: 76, yMax: 82, tileType: 'bombsite_b' },
  { name: 'New Box', xMin: 16, xMax: 20, yMin: 68, yMax: 72, tileType: 'bombsite_b' },
  { name: 'First Oranges', xMin: 22, xMax: 26, yMin: 68, yMax: 72, tileType: 'bombsite_b' },
  { name: 'Second Oranges', xMin: 22, xMax: 26, yMin: 72, yMax: 76, tileType: 'bombsite_b' },
  { name: 'Fountain', xMin: 18, xMax: 22, yMin: 74, yMax: 78, tileType: 'bombsite_b' },
  { name: 'Spools', xMin: 16, xMax: 20, yMin: 78, yMax: 82, tileType: 'bombsite_b' },
  { name: 'B Site', xMin: 10, xMax: 28, yMin: 68, yMax: 82, tileType: 'bombsite_b' },

  // ===================== MID (center, going north from T) =====================
  { name: 'T Mid', xMin: 34, xMax: 40, yMin: 18, yMax: 28, tileType: 'floor' },
  { name: 'Bottom Mid', xMin: 34, xMax: 44, yMin: 26, yMax: 36, tileType: 'floor' },
  { name: 'Mid', xMin: 38, xMax: 52, yMin: 34, yMax: 46, tileType: 'floor' },
  { name: 'Top Mid', xMin: 46, xMax: 56, yMin: 44, yMax: 54, tileType: 'floor' },

  // ===================== ALT MID / SECOND MID =====================
  { name: 'Alt Mid', xMin: 42, xMax: 52, yMin: 16, yMax: 24, tileType: 'floor' },
  { name: 'Underpass', xMin: 48, xMax: 54, yMin: 22, yMax: 28, tileType: 'floor' },

  // ===================== A SHORT (Mid → A Site) =====================
  { name: 'A Short', xMin: 54, xMax: 64, yMin: 44, yMax: 52, tileType: 'floor' },

  // ===================== APARTMENTS (right branch from Alt Mid → A) =====================
  { name: 'Boiler', xMin: 52, xMax: 58, yMin: 22, yMax: 30, tileType: 'floor' },
  { name: 'Apartments', xMin: 56, xMax: 68, yMin: 26, yMax: 36, tileType: 'floor' },
  { name: 'Living Room', xMin: 60, xMax: 66, yMin: 28, yMax: 34, tileType: 'floor' },
  { name: 'Balcony', xMin: 64, xMax: 72, yMin: 34, yMax: 42, tileType: 'floor', elevation: 1 },
  { name: 'Apps Drop', xMin: 68, xMax: 74, yMin: 40, yMax: 46, tileType: 'floor' },

  // ===================== A SITE (right, mid-height) =====================
  // Open area with truck, pit, graveyard, coffins
  { name: 'Truck', xMin: 74, xMax: 80, yMin: 42, yMax: 48, tileType: 'bombsite_a' },
  { name: 'Pit', xMin: 64, xMax: 70, yMin: 38, yMax: 42, tileType: 'bombsite_a', elevation: -1 },
  { name: 'Mini Pit', xMin: 62, xMax: 65, yMin: 40, yMax: 42, tileType: 'bombsite_a', elevation: -1 },
  { name: 'Graveyard', xMin: 62, xMax: 66, yMin: 50, yMax: 56, tileType: 'bombsite_a' },
  { name: 'Coffins', xMin: 66, xMax: 72, yMin: 52, yMax: 56, tileType: 'bombsite_a' },
  { name: 'Ninja', xMin: 78, xMax: 80, yMin: 54, yMax: 56, tileType: 'bombsite_a' },
  { name: 'Short Boxes', xMin: 62, xMax: 66, yMin: 44, yMax: 50, tileType: 'bombsite_a' },
  { name: 'A Site', xMin: 62, xMax: 80, yMin: 38, yMax: 56, tileType: 'bombsite_a' },

  // ===================== CT ROTATIONS =====================
  // Arch — connects Top Mid to CT Connector
  { name: 'Arch CT', xMin: 54, xMax: 66, yMin: 50, yMax: 58, tileType: 'floor' },
  // Library — CT path toward A
  { name: 'Library', xMin: 64, xMax: 74, yMin: 54, yMax: 66, tileType: 'floor' },
  // Moto — off Library, near A
  { name: 'Moto', xMin: 74, xMax: 80, yMin: 50, yMax: 56, tileType: 'floor' },
  // CT to A — direct route from CT area
  { name: 'CT to A', xMin: 76, xMax: 82, yMin: 54, yMax: 74, tileType: 'floor' },
  // CT Connector — main CT corridor
  { name: 'CT Connector', xMin: 64, xMax: 78, yMin: 62, yMax: 74, tileType: 'floor' },
  // Speedway — from Arch area toward B rotation
  { name: 'Speedway', xMin: 46, xMax: 56, yMin: 54, yMax: 64, tileType: 'floor' },
  // Kitchen — CT to B rotation path
  { name: 'Kitchen', xMin: 36, xMax: 52, yMin: 62, yMax: 74, tileType: 'floor' },
  // Construction — connects Kitchen area to B Site
  { name: 'Construction', xMin: 26, xMax: 38, yMin: 72, yMax: 82, tileType: 'floor' },

  // ===================== CT SPAWN (top-right, right of dark wall) =====================
  { name: 'CT Spawn', xMin: 68, xMax: 82, yMin: 72, yMax: 86, tileType: 'spawn_ct' },
];

// --- Cover objects positioned within their zones ---
const COVER: CoverObject[] = [
  // === A Site ===
  { x: 76, y: 44, width: 3, height: 2, coverType: 'full', label: 'Truck' },
  { x: 67, y: 39, width: 4, height: 1, coverType: 'full', label: 'Pit Wall' },
  { x: 63, y: 52, width: 2, height: 2, coverType: 'full', label: 'Graveyard Wall' },
  { x: 68, y: 54, width: 2, height: 1, coverType: 'half', label: 'Coffins' },
  { x: 63, y: 46, width: 2, height: 1, coverType: 'half', label: 'Short Boxes' },
  { x: 79, y: 55, width: 1, height: 1, coverType: 'full', label: 'Ninja' },

  // === B Site ===
  { x: 19, y: 75, width: 2, height: 2, coverType: 'half', label: 'Fountain' },
  { x: 11, y: 70, width: 1, height: 2, coverType: 'full', label: 'Dark Wall' },
  { x: 23, y: 69, width: 2, height: 1, coverType: 'half', label: 'First Oranges' },
  { x: 23, y: 73, width: 2, height: 1, coverType: 'half', label: 'Second Oranges' },
  { x: 17, y: 69, width: 1, height: 1, coverType: 'half', label: 'New Box' },
  { x: 11, y: 78, width: 1, height: 2, coverType: 'full', label: 'Coffin B' },
  { x: 17, y: 80, width: 2, height: 1, coverType: 'half', label: 'Spools' },
  { x: 27, y: 76, width: 1, height: 3, coverType: 'full', label: 'Construction Wall' },

  // === Banana ===
  { x: 16, y: 29, width: 3, height: 2, coverType: 'full', label: 'Car' },
  { x: 14, y: 35, width: 1, height: 1, coverType: 'half', label: 'Barrels' },
  { x: 13, y: 41, width: 2, height: 1, coverType: 'half', label: 'Sandbags' },
  { x: 11, y: 49, width: 2, height: 1, coverType: 'full', label: 'Logs' },
  { x: 11, y: 55, width: 1, height: 1, coverType: 'full', label: 'Wall Corner' },

  // === Mid ===
  { x: 36, y: 23, width: 2, height: 1, coverType: 'full', label: 'Dumpster' },
  { x: 44, y: 39, width: 2, height: 1, coverType: 'half', label: 'Cart' },
  { x: 56, y: 53, width: 1, height: 1, coverType: 'full', label: 'Arch Pillar' },
  { x: 50, y: 48, width: 2, height: 1, coverType: 'half', label: 'Window Sill' },
  { x: 38, y: 31, width: 1, height: 1, coverType: 'half', label: 'Bench' },
];

// --- Check which zone a tile belongs to (first match wins) ---
function getZone(x: number, y: number): CalloutZone | null {
  for (const z of ZONES) {
    if (x >= z.xMin && x <= z.xMax && y >= z.yMin && y <= z.yMax) {
      return z;
    }
  }
  return null;
}

// --- Check if tile is occupied by a cover object ---
function getCoverAt(x: number, y: number): CoverObject | null {
  for (const c of COVER) {
    if (x >= c.x && x < c.x + c.width && y >= c.y && y < c.y + c.height) {
      return c;
    }
  }
  return null;
}

// Full grid bounds — everything inside is a zone (walkable) or wall (building mass)
const BOUNDS = { xMin: 0, xMax: 89, yMin: 0, yMax: 99 };

function buildGrid(): Tile[][] {
  const grid: Tile[][] = [];

  for (let y = 0; y < H; y++) {
    grid[y] = [];
    for (let x = 0; x < W; x++) {
      const inBounds = x >= BOUNDS.xMin && x <= BOUNDS.xMax &&
                        y >= BOUNDS.yMin && y <= BOUNDS.yMax;
      const zone = getZone(x, y);
      const cover = getCoverAt(x, y);

      let type: TileType = 'out_of_bounds';
      let walkable = false;
      let coverValue = 0;
      let elevation = 0;

      if (!inBounds) {
        type = 'out_of_bounds';
      } else if (cover && zone) {
        type = cover.coverType === 'half' ? 'cover_half' : 'cover_full';
        walkable = false;
        coverValue = cover.coverType === 'half' ? 20 : 40;
        elevation = zone.elevation ?? 0;
      } else if (zone) {
        type = zone.tileType;
        walkable = true;
        elevation = zone.elevation ?? 0;
      } else if (inBounds) {
        type = 'wall';
        walkable = false;
      }

      grid[y][x] = {
        x, y, type, walkable, elevation, coverValue,
        label: zone?.name,
      };
    }
  }

  return grid;
}

export function getCalloutLabels(): { name: string; x: number; y: number }[] {
  return ZONES.map((z) => ({
    name: z.name,
    x: Math.floor((z.xMin + z.xMax) / 2),
    y: Math.floor((z.yMin + z.yMax) / 2),
  }));
}

export function createInfernoMap(): MapData {
  return {
    name: 'Inferno',
    width: W,
    height: H,
    tileSize: TILE_SIZE,
    grid: buildGrid(),
    walls: [],
    openings: [],
    coverObjects: COVER,
    spawns: {
      // T spawns around (35, 8) — center-bottom (fountain area)
      T: [
        { x: 33, y: 6 }, { x: 35, y: 6 }, { x: 37, y: 6 },
        { x: 34, y: 8 }, { x: 36, y: 8 },
      ],
      // CT spawns around (75, 78) — top-right (right of dark wall)
      CT: [
        { x: 73, y: 77 }, { x: 75, y: 77 }, { x: 77, y: 77 },
        { x: 74, y: 79 }, { x: 76, y: 79 },
      ],
    },
    bombsites: {
      A: { min: { x: 62, y: 38 }, max: { x: 80, y: 56 } },
      B: { min: { x: 10, y: 68 }, max: { x: 28, y: 82 } },
    },
    plantZones: {
      A: { min: { x: 68, y: 42 }, max: { x: 74, y: 48 } },
      B: { min: { x: 16, y: 74 }, max: { x: 22, y: 78 } },
    },
    sightlines: [
      { from: { x: 16, y: 30 }, to: { x: 14, y: 58 }, distance: 28, obstructed: false, label: 'Banana Long' },
      { from: { x: 76, y: 44 }, to: { x: 64, y: 48 }, distance: 14, obstructed: false, label: 'A Site Truck' },
      { from: { x: 36, y: 24 }, to: { x: 48, y: 48 }, distance: 28, obstructed: true, label: 'Mid Cross' },
      { from: { x: 58, y: 48 }, to: { x: 66, y: 42 }, distance: 10, obstructed: false, label: 'Short to A' },
      { from: { x: 16, y: 64 }, to: { x: 20, y: 76 }, distance: 14, obstructed: true, label: 'B Entry' },
      { from: { x: 58, y: 54 }, to: { x: 70, y: 60 }, distance: 14, obstructed: false, label: 'CT Arch' },
    ],
  };
}
