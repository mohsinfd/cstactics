import type { MapData, SmokeCloud, Team, TileCoord, Unit } from './types';
import { hasLineOfSight } from './los';

export const VISION_RADIUS_TILES = 15;
const CLOSE_REVEAL_RADIUS_TILES = 3.25;

export function visibilityTileKey(tile: TileCoord): string {
  return `${tile.x},${tile.y}`;
}

function distance(a: TileCoord, b: TileCoord): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function isTileVisibleToTeam(
  map: MapData,
  observers: Unit[],
  team: Team,
  tile: TileCoord,
  smokes: SmokeCloud[] = [],
  radius = VISION_RADIUS_TILES,
): boolean {
  const mapTile = map.grid[tile.y]?.[tile.x];
  if (!mapTile?.walkable) return false;

  return observers.some((unit) => {
    if (!unit.alive || unit.team !== team) return false;
    const tileDistance = distance(unit.position, tile);
    if (tileDistance > radius) return false;
    if (tileDistance <= CLOSE_REVEAL_RADIUS_TILES) return true;
    return hasLineOfSight(map, unit.position, tile, smokes);
  });
}

export function buildTeamVisibleTileKeys(
  map: MapData,
  units: Unit[],
  team: Team,
  smokes: SmokeCloud[] = [],
): Set<string> {
  const visible = new Set<string>();

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.grid[y]?.[x];
      if (!tile?.walkable) continue;
      if (isTileVisibleToTeam(map, units, team, tile, smokes)) {
        visible.add(visibilityTileKey(tile));
      }
    }
  }

  return visible;
}

export function isUnitVisibleToTeam(
  map: MapData,
  units: Unit[],
  viewerTeam: Team,
  unit: Unit,
  smokes: SmokeCloud[] = [],
): boolean {
  if (!unit.alive || unit.team === viewerTeam) return true;
  return isTileVisibleToTeam(map, units, viewerTeam, unit.position, smokes);
}
