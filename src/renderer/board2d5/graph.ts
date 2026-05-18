import type { BoardPackage } from './types';

export function getBoardNode(board: BoardPackage, nodeId: string) {
  return board.nodes.find((node) => node.id === nodeId) ?? null;
}

function buildAdjacency(board: BoardPackage): Map<string, string[]> {
  const adjacency = new Map(board.nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of board.edges) {
    adjacency.get(edge.from)?.push(edge.to);
    adjacency.get(edge.to)?.push(edge.from);
  }

  return adjacency;
}

export function getReachableNodeIds(board: BoardPackage, startNodeId: string, maxSteps: number): string[] {
  const adjacency = buildAdjacency(board);
  const queue = [{ id: startNodeId, distance: 0 }];
  const seen = new Set([startNodeId]);
  const reachable: string[] = [];
  let cursor = 0;

  while (queue[cursor]) {
    const current = queue[cursor];
    cursor += 1;

    if (current.distance > 0) reachable.push(current.id);
    if (current.distance >= maxSteps) continue;

    for (const nextId of adjacency.get(current.id) ?? []) {
      if (seen.has(nextId)) continue;
      seen.add(nextId);
      queue.push({ id: nextId, distance: current.distance + 1 });
    }
  }

  return reachable;
}

export function findBoardPath(board: BoardPackage, startNodeId: string, goalNodeId: string): string[] {
  if (startNodeId === goalNodeId) return [startNodeId];

  const adjacency = buildAdjacency(board);
  const queue = [startNodeId];
  const seen = new Set([startNodeId]);
  const previous = new Map<string, string>();
  let cursor = 0;

  while (queue[cursor]) {
    const current = queue[cursor];
    cursor += 1;

    for (const nextId of adjacency.get(current) ?? []) {
      if (seen.has(nextId)) continue;
      seen.add(nextId);
      previous.set(nextId, current);
      if (nextId === goalNodeId) {
        const path = [goalNodeId];
        let walker = goalNodeId;
        while (previous.has(walker)) {
          walker = previous.get(walker)!;
          path.push(walker);
        }
        return path.reverse();
      }
      queue.push(nextId);
    }
  }

  return [];
}

