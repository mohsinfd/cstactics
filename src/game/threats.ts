import type { HeldAngle, Team, TileCoord } from './types';

function tileKey(tile: TileCoord): string {
  return `${tile.x},${tile.y}`;
}

export function getCrossingHeldAngles(
  heldAngles: HeldAngle[],
  path: TileCoord[],
  movingTeam: Team
): HeldAngle[] {
  if (path.length === 0) return [];
  const pathTiles = new Set(path.map(tileKey));
  return heldAngles.filter((angle) => (
    angle.team !== movingTeam &&
    angle.remainingShots > 0 &&
    angle.laneTiles.some((tile) => pathTiles.has(tileKey(tile)))
  ));
}

export function getFirstCrossingTile(angle: HeldAngle, path: TileCoord[]): TileCoord | null {
  const laneTiles = new Set(angle.laneTiles.map(tileKey));
  return path.find((tile) => laneTiles.has(tileKey(tile))) ?? null;
}
