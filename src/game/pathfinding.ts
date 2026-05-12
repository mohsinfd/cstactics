// ============================================================
// A* Pathfinding for tile-based movement.
// Works on the MapData grid. Only walks through walkable tiles.
// Returns the path as an array of TileCoords (excluding start).
// ============================================================
import type { MapData, MovementTile, TileCoord } from './types';

interface Node {
  x: number;
  y: number;
  g: number;   // cost from start
  h: number;   // heuristic to goal
  f: number;   // g + h
  parent: Node | null;
}

// Manhattan distance heuristic (no diagonals)
function heuristic(a: TileCoord, b: TileCoord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// 4-directional neighbors
const DIRS = [
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: -1, y: 0 },
];

/**
 * Find shortest path from start to goal on the map grid.
 * Returns array of tile coords (excluding start, including goal).
 * Returns empty array if no path exists.
 */
export function findPath(map: MapData, start: TileCoord, goal: TileCoord): TileCoord[] {
  // Validate bounds
  if (
    goal.x < 0 || goal.x >= map.width ||
    goal.y < 0 || goal.y >= map.height ||
    !map.grid[goal.y]?.[goal.x]?.walkable
  ) {
    return [];
  }

  const key = (x: number, y: number) => `${x},${y}`;

  const open: Node[] = [];
  const closed = new Set<string>();

  const startNode: Node = {
    x: start.x, y: start.y,
    g: 0, h: heuristic(start, goal), f: 0, parent: null,
  };
  startNode.f = startNode.g + startNode.h;
  open.push(startNode);

  while (open.length > 0) {
    // Find node with lowest f
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIdx].f) bestIdx = i;
    }
    const current = open[bestIdx];
    open.splice(bestIdx, 1);

    // Reached goal?
    if (current.x === goal.x && current.y === goal.y) {
      // Reconstruct path
      const path: TileCoord[] = [];
      let node: Node | null = current;
      while (node && !(node.x === start.x && node.y === start.y)) {
        path.push({ x: node.x, y: node.y });
        node = node.parent;
      }
      return path.reverse();
    }

    closed.add(key(current.x, current.y));

    // Explore neighbors
    for (const dir of DIRS) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;
      const nKey = key(nx, ny);

      if (closed.has(nKey)) continue;
      if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) continue;

      const tile = map.grid[ny]?.[nx];
      if (!tile || !tile.walkable) continue;

      const g = current.g + 1;
      const existing = open.find((n) => n.x === nx && n.y === ny);

      if (existing) {
        if (g < existing.g) {
          existing.g = g;
          existing.f = g + existing.h;
          existing.parent = current;
        }
      } else {
        const h = heuristic({ x: nx, y: ny }, goal);
        open.push({ x: nx, y: ny, g, h, f: g + h, parent: current });
      }
    }
  }

  return []; // No path found
}

/**
 * Get all walkable tiles within a given movement range (BFS flood fill).
 * Returns array of reachable tile coords (excluding start).
 */
export function getWalkableRange(map: MapData, start: TileCoord, range: number): TileCoord[] {
  return getWalkableDistances(map, start, range).map(({ x, y }) => ({ x, y }));
}

/**
 * Get all walkable tiles within a range with their shortest tile distance.
 * Used by the UI to convert movement distance into AP bands.
 */
export function getWalkableDistances(
  map: MapData,
  start: TileCoord,
  range: number
): Array<TileCoord & { distance: number }> {
  const key = (x: number, y: number) => `${x},${y}`;
  const visited = new Set<string>();
  visited.add(key(start.x, start.y));

  const queue: { x: number; y: number; dist: number }[] = [
    { x: start.x, y: start.y, dist: 0 },
  ];
  const result: Array<TileCoord & { distance: number }> = [];

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const dir of DIRS) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;
      const nKey = key(nx, ny);

      if (visited.has(nKey)) continue;
      if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) continue;

      const tile = map.grid[ny]?.[nx];
      if (!tile || !tile.walkable) continue;

      visited.add(nKey);
      const newDist = current.dist + 1;

      if (newDist <= range) {
        result.push({ x: nx, y: ny, distance: newDist });
        queue.push({ x: nx, y: ny, dist: newDist });
      }
    }
  }

  return result;
}

export function getMovementTiles(
  map: MapData,
  start: TileCoord,
  rangePerAp: number,
  availableAp: number
): MovementTile[] {
  const totalRange = rangePerAp * availableAp;
  return getWalkableDistances(map, start, totalRange).map((tile) => ({
    x: tile.x,
    y: tile.y,
    apCost: Math.min(availableAp, Math.max(1, Math.ceil(tile.distance / rangePerAp))),
  }));
}
