// ============================================================
// Inferno Map Data
//
// The walkable silhouette is generated from a top-down Inferno radar/reference
// image with scripts/generate-map-mask.mjs. Callouts, spawns, bomb zones, and
// cover are authored gameplay data layered on top of that silhouette.
//
// Coordinate convention:
//   X increases left-to-right on the radar.
//   Y=0 is the T-side/bottom edge of the radar.
// ============================================================
import type { MapData, Tile, TileType, CoverObject } from '../types';
import { INFERNO_WALKABLE_MASK } from './infernoWalkable';

const W = 90;
const H = 100;
const TILE_SIZE = 1.5;

export interface CalloutZone {
  name: string;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  tileType: TileType;
  elevation?: number;
}

// Zones are checked in order. Specific landmarks come before broad areas.
const ZONES: CalloutZone[] = [
  // Objective and spawn anchors.
  { name: 'T Spawn', xMin: 5, xMax: 13, yMin: 27, yMax: 39, tileType: 'spawn_t' },
  { name: 'CT Spawn', xMin: 77, xMax: 84, yMin: 57, yMax: 72, tileType: 'spawn_ct' },

  { name: 'Pit', xMin: 68, xMax: 76, yMin: 18, yMax: 28, tileType: 'bombsite_a', elevation: -1 },
  { name: 'Balcony', xMin: 63, xMax: 74, yMin: 25, yMax: 35, tileType: 'floor', elevation: 1 },
  { name: 'A Site', xMin: 69, xMax: 78, yMin: 25, yMax: 38, tileType: 'bombsite_a' },

  { name: 'Coffins', xMin: 39, xMax: 44, yMin: 77, yMax: 84, tileType: 'bombsite_b' },
  { name: 'Oranges', xMin: 44, xMax: 50, yMin: 73, yMax: 80, tileType: 'bombsite_b' },
  { name: 'B Site', xMin: 39, xMax: 49, yMin: 72, yMax: 84, tileType: 'bombsite_b' },

  // Banana and B rotation.
  { name: 'Bottom Banana', xMin: 25, xMax: 38, yMin: 34, yMax: 47, tileType: 'floor' },
  { name: 'Lower Banana', xMin: 31, xMax: 44, yMin: 45, yMax: 58, tileType: 'floor' },
  { name: 'Top Banana', xMin: 36, xMax: 49, yMin: 67, yMax: 77, tileType: 'floor' },
  { name: 'Upper Banana', xMin: 35, xMax: 48, yMin: 57, yMax: 72, tileType: 'floor' },
  { name: 'Construction', xMin: 49, xMax: 63, yMin: 70, yMax: 84, tileType: 'floor' },

  // Mid and A rotation.
  { name: 'T Ramp', xMin: 13, xMax: 28, yMin: 26, yMax: 39, tileType: 'floor' },
  { name: 'Second Mid', xMin: 22, xMax: 44, yMin: 18, yMax: 34, tileType: 'floor' },
  { name: 'T Mid', xMin: 29, xMax: 45, yMin: 29, yMax: 42, tileType: 'floor' },
  { name: 'Mid', xMin: 40, xMax: 57, yMin: 33, yMax: 53, tileType: 'floor' },
  { name: 'Top Mid', xMin: 50, xMax: 66, yMin: 45, yMax: 58, tileType: 'floor' },
  { name: 'Arch', xMin: 58, xMax: 73, yMin: 50, yMax: 64, tileType: 'floor' },
  { name: 'Library', xMin: 73, xMax: 84, yMin: 38, yMax: 56, tileType: 'floor' },
  { name: 'Moto', xMin: 76, xMax: 85, yMin: 32, yMax: 44, tileType: 'floor' },
  { name: 'A Short', xMin: 62, xMax: 73, yMin: 32, yMax: 45, tileType: 'floor' },

  // Apartments pressure.
  { name: 'Boiler', xMin: 46, xMax: 59, yMin: 20, yMax: 33, tileType: 'floor' },
  { name: 'Apartments', xMin: 52, xMax: 70, yMin: 16, yMax: 32, tileType: 'floor', elevation: 1 },
];

const COVER: CoverObject[] = [
  // A site.
  { x: 72, y: 31, width: 2, height: 2, coverType: 'full', label: 'Truck' },
  { x: 75, y: 28, width: 1, height: 2, coverType: 'half', label: 'Default Box' },
  { x: 70, y: 23, width: 3, height: 1, coverType: 'full', label: 'Pit Wall' },
  { x: 73, y: 21, width: 2, height: 1, coverType: 'half', label: 'Graveyard' },
  { x: 70, y: 28, width: 1, height: 3, coverType: 'half', label: 'Balcony Rail' },
  { x: 71, y: 36, width: 2, height: 1, coverType: 'half', label: 'Short Box' },
  { x: 76, y: 35, width: 1, height: 2, coverType: 'full', label: 'Ninja' },

  // B site.
  { x: 43, y: 78, width: 2, height: 2, coverType: 'half', label: 'Fountain' },
  { x: 39, y: 79, width: 2, height: 2, coverType: 'full', label: 'Coffins' },
  { x: 45, y: 74, width: 1, height: 2, coverType: 'full', label: 'First Oranges' },
  { x: 47, y: 76, width: 1, height: 2, coverType: 'full', label: 'Second Oranges' },
  { x: 47, y: 81, width: 1, height: 1, coverType: 'full', label: 'New Box' },
  { x: 41, y: 83, width: 2, height: 1, coverType: 'half', label: 'Back Site' },
  { x: 49, y: 79, width: 1, height: 2, coverType: 'half', label: 'Dark Boxes' },

  // Banana and mid.
  { x: 38, y: 51, width: 4, height: 2, coverType: 'full', label: 'Banana Car' },
  { x: 37, y: 61, width: 3, height: 1, coverType: 'half', label: 'Logs' },
  { x: 43, y: 68, width: 2, height: 1, coverType: 'half', label: 'Sandbags' },
  { x: 42, y: 71, width: 2, height: 1, coverType: 'half', label: 'Half Wall' },
  { x: 61, y: 45, width: 2, height: 1, coverType: 'half', label: 'Top Mid Cart' },
  { x: 68, y: 51, width: 1, height: 2, coverType: 'half', label: 'Porch' },
  { x: 66, y: 55, width: 1, height: 1, coverType: 'full', label: 'Arch Pillar' },
  { x: 76, y: 54, width: 1, height: 2, coverType: 'full', label: 'Library Shelf' },
];

function getZone(x: number, y: number): CalloutZone | null {
  for (const zone of ZONES) {
    if (x >= zone.xMin && x <= zone.xMax && y >= zone.yMin && y <= zone.yMax) {
      return zone;
    }
  }
  return null;
}

function getCoverAt(x: number, y: number): CoverObject | null {
  for (const cover of COVER) {
    const withinX = x >= cover.x && x < cover.x + cover.width;
    const withinY = y >= cover.y && y < cover.y + cover.height;
    if (withinX && withinY) return cover;
  }
  return null;
}

function isRadarWalkable(x: number, y: number): boolean {
  return INFERNO_WALKABLE_MASK[y]?.[x] === '1';
}

function buildGrid(): Tile[][] {
  const grid: Tile[][] = [];

  for (let y = 0; y < H; y++) {
    grid[y] = [];

    for (let x = 0; x < W; x++) {
      const zone = getZone(x, y);
      const cover = getCoverAt(x, y);

      let type: TileType = 'wall';
      let walkable = false;
      let coverValue = 0;
      const elevation = zone?.elevation ?? 0;

      if (!isRadarWalkable(x, y)) {
        type = 'wall';
      } else if (cover) {
        type = cover.coverType === 'half' ? 'cover_half' : 'cover_full';
        coverValue = cover.coverType === 'half' ? 20 : 40;
      } else {
        type = zone?.tileType ?? 'floor';
        walkable = true;
      }

      grid[y][x] = {
        x,
        y,
        type,
        walkable,
        elevation,
        coverValue,
        label: zone?.name,
      };
    }
  }

  return grid;
}

export function getCalloutLabels(): { name: string; x: number; y: number }[] {
  return ZONES.map((zone) => ({
    name: zone.name,
    x: Math.floor((zone.xMin + zone.xMax) / 2),
    y: Math.floor((zone.yMin + zone.yMax) / 2),
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
      T: [
        { x: 8, y: 31 }, { x: 10, y: 31 }, { x: 8, y: 34 },
        { x: 10, y: 34 }, { x: 9, y: 37 },
      ],
      CT: [
        { x: 80, y: 62 }, { x: 82, y: 62 }, { x: 80, y: 66 },
        { x: 82, y: 66 }, { x: 81, y: 70 },
      ],
    },
    bombsites: {
      A: { min: { x: 69, y: 25 }, max: { x: 78, y: 38 } },
      B: { min: { x: 39, y: 72 }, max: { x: 49, y: 84 } },
    },
    plantZones: {
      A: { min: { x: 70, y: 26 }, max: { x: 76, y: 36 } },
      B: { min: { x: 40, y: 73 }, max: { x: 47, y: 82 } },
    },
    sightlines: [
      { from: { x: 34, y: 50 }, to: { x: 41, y: 72 }, distance: 23, obstructed: false, label: 'Banana Long' },
      { from: { x: 54, y: 44 }, to: { x: 70, y: 34 }, distance: 19, obstructed: false, label: 'Mid to A' },
      { from: { x: 62, y: 55 }, to: { x: 80, y: 62 }, distance: 20, obstructed: false, label: 'Arch to CT' },
      { from: { x: 50, y: 76 }, to: { x: 80, y: 66 }, distance: 32, obstructed: false, label: 'Construction to CT' },
    ],
  };
}
