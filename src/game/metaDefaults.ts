import type { MapData, Team, TileCoord, Unit } from './types';

type MetaLane = 'banana' | 'mid' | 'apps' | 'a' | 'b' | 'rotator';

export interface MetaDefault {
  id: '2-1-2' | '2-2-1' | '3-2' | '1-3-1';
  team: Team;
  label: string;
  slots: MetaLane[];
}

export const META_DEFAULTS: Record<Team, MetaDefault[]> = {
  T: [
    { id: '2-1-2', team: 'T', label: '2 Banana / 1 Mid / 2 Apps', slots: ['banana', 'banana', 'mid', 'apps', 'apps'] },
    { id: '2-2-1', team: 'T', label: '2 Banana / 2 Mid / 1 Apps', slots: ['banana', 'banana', 'mid', 'mid', 'apps'] },
    { id: '3-2', team: 'T', label: '3 Banana / 2 Mid', slots: ['banana', 'banana', 'banana', 'mid', 'apps'] },
    { id: '1-3-1', team: 'T', label: '1 Banana / 3 Mid / 1 Apps', slots: ['banana', 'mid', 'mid', 'mid', 'apps'] },
  ],
  CT: [
    { id: '2-1-2', team: 'CT', label: '2 A / 1 Rotator / 2 B', slots: ['a', 'a', 'rotator', 'b', 'b'] },
    { id: '2-2-1', team: 'CT', label: '2 A / 2 Rotator / 1 B', slots: ['a', 'a', 'rotator', 'rotator', 'b'] },
    { id: '3-2', team: 'CT', label: '3 A / 2 B', slots: ['a', 'a', 'rotator', 'b', 'b'] },
    { id: '1-3-1', team: 'CT', label: '1 A / 3 Rotator / 1 B', slots: ['a', 'rotator', 'rotator', 'rotator', 'b'] },
  ],
};

const LANE_ANCHORS: Record<Team, Record<MetaLane, TileCoord[]>> = {
  T: {
    banana: [
      { x: 34, y: 45 },
      { x: 37, y: 50 },
      { x: 40, y: 56 },
      { x: 43, y: 62 },
      { x: 44, y: 66 },
    ],
    mid: [
      { x: 36, y: 35 },
      { x: 43, y: 39 },
      { x: 50, y: 45 },
      { x: 55, y: 50 },
      { x: 62, y: 53 },
    ],
    apps: [
      { x: 29, y: 25 },
      { x: 38, y: 26 },
      { x: 50, y: 25 },
      { x: 58, y: 24 },
      { x: 64, y: 28 },
    ],
    a: [],
    b: [],
    rotator: [],
  },
  CT: {
    a: [
      { x: 70, y: 27 },
      { x: 73, y: 32 },
      { x: 76, y: 36 },
      { x: 79, y: 42 },
      { x: 76, y: 50 },
    ],
    b: [
      { x: 43, y: 74 },
      { x: 45, y: 79 },
      { x: 48, y: 75 },
      { x: 50, y: 80 },
      { x: 57, y: 75 },
    ],
    rotator: [
      { x: 62, y: 55 },
      { x: 68, y: 53 },
      { x: 73, y: 50 },
      { x: 76, y: 57 },
      { x: 80, y: 64 },
    ],
    banana: [],
    mid: [],
    apps: [],
  },
};

const DEFAULT_FACING: Record<Team, Record<MetaLane, TileCoord>> = {
  T: {
    banana: { x: 1, y: 1 },
    mid: { x: 1, y: 1 },
    apps: { x: 1, y: 0 },
    a: { x: 1, y: 0 },
    b: { x: 1, y: 1 },
    rotator: { x: 1, y: 0 },
  },
  CT: {
    a: { x: -1, y: -1 },
    b: { x: -1, y: -1 },
    rotator: { x: -1, y: 0 },
    banana: { x: -1, y: -1 },
    mid: { x: -1, y: -1 },
    apps: { x: -1, y: 0 },
  },
};

function positionKey(tile: TileCoord): string {
  return `${tile.x},${tile.y}`;
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffled<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

function isAvailableWalkable(map: MapData, tile: TileCoord, occupied: ReadonlySet<string>): boolean {
  return Boolean(map.grid[tile.y]?.[tile.x]?.walkable && !occupied.has(positionKey(tile)));
}

function nearbyCandidates(origin: TileCoord, radius: number): TileCoord[] {
  const candidates: TileCoord[] = [];
  for (let y = origin.y - radius; y <= origin.y + radius; y++) {
    for (let x = origin.x - radius; x <= origin.x + radius; x++) {
      candidates.push({ x, y });
    }
  }
  return shuffled(candidates).sort((a, b) => {
    const da = Math.abs(a.x - origin.x) + Math.abs(a.y - origin.y);
    const db = Math.abs(b.x - origin.x) + Math.abs(b.y - origin.y);
    return da - db;
  });
}

function findAvailableWalkableNear(map: MapData, preferred: TileCoord, occupied: Set<string>): TileCoord {
  for (const candidate of nearbyCandidates(preferred, 3)) {
    if (isAvailableWalkable(map, candidate, occupied)) return candidate;
  }

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const candidate = { x, y };
      if (isAvailableWalkable(map, candidate, occupied)) return candidate;
    }
  }

  return preferred;
}

export function applyRandomSpawnPositions(map: MapData, units: Unit[]): Unit[] {
  let nextUnits = units.map((unit) => ({ ...unit, position: { ...unit.position }, facing: { ...unit.facing } }));

  (['T', 'CT'] as const).forEach((team) => {
    const spawnType = team === 'T' ? 'spawn_t' : 'spawn_ct';
    const spawnTiles: TileCoord[] = [];
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.grid[y]?.[x];
        if (tile?.walkable && tile.type === spawnType) spawnTiles.push({ x, y });
      }
    }

    const shuffledSpawns = shuffled(spawnTiles);
    const teamUnits = nextUnits.filter((unit) => unit.team === team);
    teamUnits.forEach((unit, index) => {
      const spawn = shuffledSpawns[index % shuffledSpawns.length] ?? map.spawns[team][index % map.spawns[team].length];
      nextUnits = nextUnits.map((candidate) => (
        candidate.id === unit.id
          ? { ...candidate, position: { ...spawn } }
          : candidate
      ));
    });
  });

  return nextUnits;
}

export function pickRandomMetaDefault(team: Team): MetaDefault {
  return pick(META_DEFAULTS[team]);
}

export function applyMetaDefault(
  map: MapData,
  units: Unit[],
  team: Team,
  metaDefault: MetaDefault = pickRandomMetaDefault(team),
): { units: Unit[]; metaDefault: MetaDefault } {
  const occupied = new Set(
    units
      .filter((unit) => unit.alive && unit.team !== team)
      .map((unit) => positionKey(unit.position))
  );
  let nextUnits = units.map((unit) => ({ ...unit, position: { ...unit.position }, facing: { ...unit.facing } }));
  const teamUnits = nextUnits.filter((unit) => unit.team === team && unit.alive);

  teamUnits.forEach((unit, index) => {
    const slot = metaDefault.slots[index % metaDefault.slots.length];
    const anchors = LANE_ANCHORS[team][slot];
    const preferred = anchors.length > 0 ? pick(anchors) : unit.position;
    const position = findAvailableWalkableNear(map, preferred, occupied);
    occupied.add(positionKey(position));

    nextUnits = nextUnits.map((candidate) => (
      candidate.id === unit.id
        ? {
          ...candidate,
          position,
          facing: { ...DEFAULT_FACING[team][slot] },
        }
        : candidate
    ));
  });

  return { units: nextUnits, metaDefault };
}

export function applyRandomMetaDefaults(
  map: MapData,
  units: Unit[],
  teams: Team[] = ['T', 'CT'],
): { units: Unit[]; metaDefaults: MetaDefault[] } {
  return teams.reduce<{ units: Unit[]; metaDefaults: MetaDefault[] }>((current, team) => {
    const result = applyMetaDefault(map, current.units, team);
    return {
      units: result.units,
      metaDefaults: [...current.metaDefaults, result.metaDefault],
    };
  }, { units, metaDefaults: [] });
}
