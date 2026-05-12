import type { MapData, SmokeCloud, TileCoord } from './types';

export function getLineTiles(from: TileCoord, to: TileCoord): TileCoord[] {
  const tiles: TileCoord[] = [];
  let x0 = from.x;
  let y0 = from.y;
  const x1 = to.x;
  const y1 = to.y;

  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;

  while (!(x0 === x1 && y0 === y1)) {
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
    tiles.push({ x: x0, y: y0 });
  }

  return tiles;
}

function tileDistance(a: TileCoord, b: TileCoord): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function smokeBlocksSight(smokes: SmokeCloud[], tile: TileCoord): boolean {
  return smokes.some((smoke) => tileDistance(smoke.position, tile) <= smoke.radius);
}

function blocksSight(map: MapData, tile: TileCoord, smokes: SmokeCloud[] = []): boolean {
  const mapTile = map.grid[tile.y]?.[tile.x];
  if (!mapTile) return true;
  return mapTile.type === 'wall' || mapTile.type === 'cover_full' || smokeBlocksSight(smokes, tile);
}

export function hasLineOfSight(
  map: MapData,
  from: TileCoord,
  to: TileCoord,
  smokes: SmokeCloud[] = []
): boolean {
  const tiles = getLineTiles(from, to);
  if (tiles.length === 0) return true;

  return tiles.every((tile, index) => {
    const isTarget = index === tiles.length - 1;
    return isTarget || !blocksSight(map, tile, smokes);
  });
}

export function getWatchedLane(
  map: MapData,
  from: TileCoord,
  to: TileCoord,
  maxTiles: number,
  smokes: SmokeCloud[] = []
): TileCoord[] {
  const line = getLineTiles(from, to).slice(0, maxTiles);
  const lane: TileCoord[] = [];

  for (const tile of line) {
    if (tile.x < 0 || tile.x >= map.width || tile.y < 0 || tile.y >= map.height) break;
    lane.push(tile);
    if (blocksSight(map, tile, smokes)) break;
  }

  return lane;
}
