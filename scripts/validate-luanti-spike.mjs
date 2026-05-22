import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const defaultDataPath = path.join(
  repoRoot,
  'spikes',
  'luanti-banana-b-site',
  'cstactics_spike_game',
  'mods',
  'cstactics_spike',
  'banana_b_site.json'
);
const dataPath = process.argv[2] ? path.resolve(repoRoot, process.argv[2]) : defaultDataPath;

const map = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const errors = [];
const warnings = [];
const propTypes = new Set(['crate', 'sandbag', 'barrel', 'fountain', 'coffin', 'orange', 'b_marker']);
const floorSurfaces = new Set(['floor', 'site_b', 'spawn_t', 'spawn_ct']);

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function key(x, z) {
  return `${x},${z}`;
}

function inBounds(x, z) {
  return Number.isInteger(x) &&
    Number.isInteger(z) &&
    x >= 0 &&
    z >= 0 &&
    x < map.size.width &&
    z < map.size.depth;
}

function eachRect(rect, cb) {
  for (let x = rect.x; x < rect.x + rect.w; x += 1) {
    for (let z = rect.z; z < rect.z + rect.d; z += 1) {
      cb(x, z);
    }
  }
}

function validateRect(kind, rect) {
  for (const field of ['x', 'z', 'w', 'd']) {
    if (!Number.isInteger(rect[field])) fail(`${kind} ${rect.id ?? '<missing id>'} has invalid ${field}`);
  }
  if (rect.w <= 0 || rect.d <= 0) fail(`${kind} ${rect.id ?? '<missing id>'} must have positive size`);
  if (!inBounds(rect.x, rect.z) || !inBounds(rect.x + rect.w - 1, rect.z + rect.d - 1)) {
    fail(`${kind} ${rect.id ?? '<missing id>'} is outside ${map.size.width}x${map.size.depth}`);
  }
}

if (map.version !== 1) fail('map.version must be 1');
if (map.size?.width !== 30 || map.size?.depth !== 30) fail('Luanti spike must remain a 30x30 slice');
if (!Array.isArray(map.floors) || map.floors.length === 0) fail('floors must be a non-empty array');
if (!Array.isArray(map.walls)) fail('walls must be an array');
if (!Array.isArray(map.props)) fail('props must be an array');
if (!Array.isArray(map.units)) fail('units must be an array');
if (!map.tactical || typeof map.tactical !== 'object') fail('tactical must be an object');
if (!Array.isArray(map.tactical?.initialPath)) fail('tactical.initialPath must be an array');
if (!Array.isArray(map.tactical?.dangerCone)) fail('tactical.dangerCone must be an array');
if (!Number.isInteger(map.tactical?.movePoints) || map.tactical.movePoints < 1) {
  fail('tactical.movePoints must be a positive integer');
}

const walkable = new Set();
const blocked = new Set();
const wallBlocked = new Set();
const propBlocked = new Set();

for (const floor of map.floors ?? []) {
  validateRect('floor', floor);
  if (!floorSurfaces.has(floor.surface)) fail(`floor ${floor.id} has unsupported surface ${floor.surface}`);
  eachRect(floor, (x, z) => walkable.add(key(x, z)));
}

for (const wall of map.walls ?? []) {
  validateRect('wall', wall);
  if (!Number.isInteger(wall.h) || wall.h < 2) fail(`wall ${wall.id} must have h >= 2`);
  eachRect(wall, (x, z) => {
    wallBlocked.add(key(x, z));
    blocked.add(key(x, z));
  });
}

for (const prop of map.props ?? []) {
  validateRect('prop', prop);
  if (!propTypes.has(prop.type)) fail(`prop ${prop.id} has unsupported type ${prop.type}`);
  if (!Number.isInteger(prop.h) || prop.h < 1) fail(`prop ${prop.id} must have h >= 1`);
  eachRect(prop, (x, z) => {
    const tileKey = key(x, z);
    if (!walkable.has(tileKey)) fail(`prop ${prop.id} is not on a floor tile at ${tileKey}`);
    if (wallBlocked.has(tileKey)) fail(`prop ${prop.id} overlaps wall at ${tileKey}`);
    if (propBlocked.has(tileKey)) fail(`prop ${prop.id} overlaps another prop at ${tileKey}`);
    propBlocked.add(tileKey);
    blocked.add(tileKey);
  });
}

const unitIds = new Set();
const unitTiles = new Set();
const unitsById = new Map();
const teamCounts = { T: 0, CT: 0 };
for (const unit of map.units ?? []) {
  if (unitIds.has(unit.id)) fail(`duplicate unit id ${unit.id}`);
  unitIds.add(unit.id);
  unitsById.set(unit.id, unit);
  const unitTile = key(unit.x, unit.z);
  if (unitTiles.has(unitTile)) fail(`multiple units overlap at ${unitTile}`);
  unitTiles.add(unitTile);
  if (!['T', 'CT'].includes(unit.team)) fail(`unit ${unit.id} has invalid team ${unit.team}`);
  if (typeof unit.role !== 'string' || unit.role.length === 0) fail(`unit ${unit.id} must have a role`);
  if (!unit.facing || !Number.isInteger(unit.facing.x) || !Number.isInteger(unit.facing.z)) {
    fail(`unit ${unit.id} must have integer facing.x and facing.z`);
  }
  if (teamCounts[unit.team] !== undefined) teamCounts[unit.team] += 1;
  if (!inBounds(unit.x, unit.z)) fail(`unit ${unit.id} is outside map bounds`);
  if (!walkable.has(unitTile)) fail(`unit ${unit.id} is not on a floor tile`);
  if (blocked.has(unitTile)) fail(`unit ${unit.id} overlaps wall/prop at ${unit.x},${unit.z}`);
}

if (teamCounts.T !== 5) fail(`expected 5 T units, found ${teamCounts.T}`);
if (teamCounts.CT !== 5) fail(`expected 5 CT units, found ${teamCounts.CT}`);
if (!unitIds.has(map.tactical?.selectedUnit)) fail(`selectedUnit ${map.tactical?.selectedUnit} does not exist`);
if ((map.tactical?.initialPath?.length ?? 0) === 0) fail('tactical.initialPath must contain at least one tile');

let previousPathTile = null;
for (const tile of map.tactical?.initialPath ?? []) {
  if (!inBounds(tile.x, tile.z)) fail(`initialPath tile ${key(tile.x, tile.z)} is outside map bounds`);
  if (!walkable.has(key(tile.x, tile.z))) fail(`initialPath tile ${key(tile.x, tile.z)} is not walkable`);
  if (blocked.has(key(tile.x, tile.z))) fail(`initialPath tile ${key(tile.x, tile.z)} overlaps cover/wall`);
  if (previousPathTile) {
    const distance = Math.abs(tile.x - previousPathTile.x) + Math.abs(tile.z - previousPathTile.z);
    if (distance !== 1) {
      fail(`initialPath jumps from ${key(previousPathTile.x, previousPathTile.z)} to ${key(tile.x, tile.z)}`);
    }
  }
  previousPathTile = tile;
}

const selectedUnit = unitsById.get(map.tactical?.selectedUnit);
const firstPathTile = map.tactical?.initialPath?.[0];
if (selectedUnit && firstPathTile && key(selectedUnit.x, selectedUnit.z) !== key(firstPathTile.x, firstPathTile.z)) {
  fail(`initialPath must start at selectedUnit ${map.tactical.selectedUnit}`);
}

for (const tile of map.tactical?.dangerCone ?? []) {
  if (!inBounds(tile.x, tile.z)) fail(`dangerCone tile ${key(tile.x, tile.z)} is outside map bounds`);
  if (!walkable.has(key(tile.x, tile.z))) warn(`dangerCone tile ${key(tile.x, tile.z)} is not on a floor tile`);
  if (blocked.has(key(tile.x, tile.z))) fail(`dangerCone tile ${key(tile.x, tile.z)} overlaps cover/wall`);
}

const summary = {
  map: map.name,
  size: `${map.size.width}x${map.size.depth}`,
  floorRects: map.floors?.length ?? 0,
  wallRects: map.walls?.length ?? 0,
  props: map.props?.length ?? 0,
  walkableTiles: walkable.size,
  blockedTiles: blocked.size,
  units: teamCounts,
  dangerTiles: map.tactical?.dangerCone?.length ?? 0,
  warnings,
};

if (errors.length > 0) {
  console.error(JSON.stringify({ ok: false, errors, summary }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, summary }, null, 2));
