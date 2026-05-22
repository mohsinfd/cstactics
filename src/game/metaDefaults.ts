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
    { id: '3-2', team: 'T', label: '3 Banana / 2 Mid', slots: ['banana', 'banana', 'banana', 'mid', 'mid'] },
    { id: '1-3-1', team: 'T', label: '1 Banana / 3 Mid / 1 Apps', slots: ['banana', 'mid', 'mid', 'mid', 'apps'] },
  ],
  CT: [
    { id: '2-1-2', team: 'CT', label: '2 A / 1 Rotator / 2 B', slots: ['a', 'a', 'rotator', 'b', 'b'] },
    { id: '2-2-1', team: 'CT', label: '2 A / 2 Rotator / 1 B', slots: ['a', 'a', 'rotator', 'rotator', 'b'] },
    { id: '3-2', team: 'CT', label: '3 A / 2 B', slots: ['a', 'a', 'a', 'b', 'b'] },
    { id: '1-3-1', team: 'CT', label: '1 A / 3 Rotator / 1 B', slots: ['a', 'rotator', 'rotator', 'rotator', 'b'] },
  ],
};

export interface AppliedMetaDefault {
  units: Unit[];
  metaDefault: MetaDefault;
  spawnSummary: string;
  awperBestPeek: boolean;
}

const AWP_BEST_PEEK_CHANCE = 0.2;

// Meta defaults are spawn assignments, not lane teleports. These preference
// lists keep opening shape tied to the actual spawn roll: fast Banana/A players
// get the spawn slots nearest their lane, but everyone still starts in spawn.
const SPAWN_SLOT_PREFERENCES: Record<Team, Record<MetaLane, TileCoord[]>> = {
  T: {
    banana: [
      { x: 12, y: 34 },
      { x: 12, y: 29 },
      { x: 9, y: 39 },
      { x: 6, y: 34 },
      { x: 7, y: 28 },
    ],
    mid: [
      { x: 9, y: 39 },
      { x: 12, y: 34 },
      { x: 12, y: 29 },
      { x: 6, y: 34 },
      { x: 7, y: 28 },
    ],
    apps: [
      { x: 7, y: 28 },
      { x: 6, y: 34 },
      { x: 12, y: 29 },
      { x: 9, y: 39 },
      { x: 12, y: 34 },
    ],
    a: [],
    b: [],
    rotator: [],
  },
  CT: {
    a: [
      { x: 78, y: 58 },
      { x: 83, y: 59 },
      { x: 78, y: 65 },
      { x: 83, y: 68 },
      { x: 80, y: 72 },
    ],
    b: [
      { x: 80, y: 72 },
      { x: 83, y: 68 },
      { x: 78, y: 65 },
      { x: 83, y: 59 },
      { x: 78, y: 58 },
    ],
    rotator: [
      { x: 83, y: 68 },
      { x: 78, y: 65 },
      { x: 83, y: 59 },
      { x: 80, y: 72 },
      { x: 78, y: 58 },
    ],
    banana: [],
    mid: [],
    apps: [],
  },
};

const AWP_BEST_PEEK_SPAWNS: Record<Team, TileCoord[]> = {
  T: [
    { x: 12, y: 29 },
    { x: 12, y: 34 },
  ],
  CT: [
    { x: 80, y: 72 },
    { x: 78, y: 65 },
  ],
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

function isSpawnSlot(tile: TileCoord, spawnSlots: readonly TileCoord[]): boolean {
  return spawnSlots.some((spawn) => spawn.x === tile.x && spawn.y === tile.y);
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

function findAvailableSpawnSlot(
  map: MapData,
  preferred: TileCoord,
  spawnSlots: readonly TileCoord[],
  occupied: Set<string>,
): TileCoord | null {
  for (const candidate of nearbyCandidates(preferred, 2)) {
    if (isSpawnSlot(candidate, spawnSlots) && isAvailableWalkable(map, candidate, occupied)) {
      return candidate;
    }
  }

  return null;
}

function chooseSpawnSlot(
  map: MapData,
  team: Team,
  slot: MetaLane,
  occupied: Set<string>,
  preferAwperPeek: boolean,
): TileCoord {
  const spawnSlots = map.spawns[team];
  const preferences = [
    ...(preferAwperPeek ? AWP_BEST_PEEK_SPAWNS[team] : []),
    ...SPAWN_SLOT_PREFERENCES[team][slot],
    ...shuffled(spawnSlots),
  ];

  for (const preferred of preferences) {
    const spawn = findAvailableSpawnSlot(map, preferred, spawnSlots, occupied);
    if (spawn) return spawn;
  }

  return findAvailableWalkableNear(map, spawnSlots[0] ?? { x: 0, y: 0 }, occupied);
}

export function applyRandomSpawnPositions(map: MapData, units: Unit[]): Unit[] {
  let nextUnits = units.map((unit) => ({ ...unit, position: { ...unit.position }, facing: { ...unit.facing } }));

  (['T', 'CT'] as const).forEach((team) => {
    const shuffledSpawns = shuffled(map.spawns[team]);
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
): AppliedMetaDefault {
  const occupied = new Set(
    units
      .filter((unit) => unit.alive && unit.team !== team)
      .map((unit) => positionKey(unit.position))
  );
  let nextUnits = units.map((unit) => ({ ...unit, position: { ...unit.position }, facing: { ...unit.facing } }));
  const teamUnits = nextUnits.filter((unit) => unit.team === team && unit.alive);
  const assignments = teamUnits.map((unit, index) => ({
    unit,
    slot: metaDefault.slots[index % metaDefault.slots.length],
    preferAwperPeek: unit.role.id === 'awper' && Math.random() < AWP_BEST_PEEK_CHANCE,
  })).sort((a, b) => Number(b.preferAwperPeek) - Number(a.preferAwperPeek));
  let awperBestPeek = false;

  assignments.forEach(({ unit, slot, preferAwperPeek }) => {
    const position = chooseSpawnSlot(map, team, slot, occupied, preferAwperPeek);
    occupied.add(positionKey(position));
    awperBestPeek = awperBestPeek || preferAwperPeek;

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

  return {
    units: nextUnits,
    metaDefault,
    spawnSummary: `${metaDefault.label}. Spawn slots weighted by lane; no free lane teleport.${awperBestPeek ? ' AWPer got the best-peek spawn roll.' : ''}`,
    awperBestPeek,
  };
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
