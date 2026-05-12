import { RULES } from './config/rules';
import { hasLineOfSight } from './los';
import type { CombatEvent, HeldAngle, MapData, SmokeCloud, TileCoord, Unit } from './types';

export interface ShotPreview {
  hasLineOfSight: boolean;
  inRange: boolean;
  distance: number;
  hitChance: number;
  damage: number;
  rangePenalty: number;
  coverPenalty: number;
  coverLabel: 'open' | 'half' | 'full';
  reasons: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function tileDistance(a: TileCoord, b: TileCoord): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function getStaticCoverPenalty(map: MapData, tile: TileCoord): number {
  const neighbors = [
    { x: tile.x, y: tile.y - 1 },
    { x: tile.x + 1, y: tile.y },
    { x: tile.x, y: tile.y + 1 },
    { x: tile.x - 1, y: tile.y },
  ];

  let bestCover = 0;
  for (const neighbor of neighbors) {
    const adjacent = map.grid[neighbor.y]?.[neighbor.x];
    if (!adjacent) continue;
    if (adjacent.type === 'cover_full' || adjacent.type === 'wall') bestCover = Math.max(bestCover, RULES.fullCoverAimPenalty);
    if (adjacent.type === 'cover_half') bestCover = Math.max(bestCover, RULES.halfCoverAimPenalty);
  }
  return bestCover;
}

function getCoverPenaltyAt(map: MapData, tile: TileCoord): number {
  const mapTile = map.grid[tile.y]?.[tile.x];
  if (!mapTile) return RULES.fullCoverAimPenalty;
  if (mapTile.type === 'cover_full' || mapTile.type === 'wall') return RULES.fullCoverAimPenalty;
  if (mapTile.type === 'cover_half') return RULES.halfCoverAimPenalty;
  return 0;
}

function getCoverDirections(attacker: TileCoord, target: TileCoord): TileCoord[] {
  const dx = attacker.x - target.x;
  const dy = attacker.y - target.y;
  if (dx === 0 && dy === 0) return [];

  if (Math.abs(dx) > Math.abs(dy) * 1.35) {
    return [{ x: Math.sign(dx), y: 0 }];
  }

  if (Math.abs(dy) > Math.abs(dx) * 1.35) {
    return [{ x: 0, y: Math.sign(dy) }];
  }

  return [
    { x: Math.sign(dx), y: 0 },
    { x: 0, y: Math.sign(dy) },
  ].filter((dir) => dir.x !== 0 || dir.y !== 0);
}

export function getDirectionalCoverPenalty(
  map: MapData,
  attackerTile: TileCoord,
  targetTile: TileCoord
): number {
  return getCoverDirections(attackerTile, targetTile).reduce((best, dir) => {
    const coverTile = { x: targetTile.x + dir.x, y: targetTile.y + dir.y };
    return Math.max(best, getCoverPenaltyAt(map, coverTile));
  }, 0);
}

function getCoverLabel(coverPenalty: number): ShotPreview['coverLabel'] {
  if (coverPenalty >= RULES.fullCoverAimPenalty) return 'full';
  if (coverPenalty >= RULES.halfCoverAimPenalty) return 'half';
  return 'open';
}

export function getShotPreview(
  map: MapData,
  attacker: Unit,
  target: Unit,
  aimBonus = 0,
  targetTile: TileCoord = target.position,
  smokes: SmokeCloud[] = []
): ShotPreview {
  const distance = tileDistance(attacker.position, targetTile);
  const hasLos = hasLineOfSight(map, attacker.position, targetTile, smokes);
  const inRange = distance <= attacker.weapon.rangeMax;
  const rangePenalty = Math.max(0, distance - attacker.weapon.rangeOptimal) * 4;
  const coverPenalty = getDirectionalCoverPenalty(map, attacker.position, targetTile) * 0.5;
  const hitChance = clamp(
    Math.round(attacker.role.baseAim + attacker.weapon.baseAim - 70 + aimBonus - rangePenalty - coverPenalty),
    5,
    95
  );
  const damage = Math.max(
    1,
    Math.round(attacker.weapon.baseDamage - Math.max(0, distance - attacker.weapon.rangeOptimal) * attacker.weapon.damageFalloffPerTile)
  );
  const reasons: string[] = [];
  if (!hasLos) reasons.push('No line of sight');
  if (!inRange) reasons.push('Out of range');

  return {
    hasLineOfSight: hasLos,
    inRange,
    distance,
    hitChance,
    damage,
    rangePenalty,
    coverPenalty,
    coverLabel: getCoverLabel(coverPenalty * 2),
    reasons,
  };
}

export function resolveShot(
  map: MapData,
  attacker: Unit,
  target: Unit,
  targetTile: TileCoord,
  aimBonus: number,
  type: CombatEvent['type'],
  smokes: SmokeCloud[] = []
): CombatEvent {
  const preview = getShotPreview(map, attacker, target, aimBonus, targetTile, smokes);
  const hit = Math.random() * 100 < preview.hitChance;
  const damage = hit ? preview.damage : 0;
  const summary = hit
    ? `${attacker.name} hits ${target.name} for ${damage}`
    : `${attacker.name} misses ${target.name}`;

  return {
    id: `${Date.now()}:${attacker.id}:${target.id}`,
    type,
    attackerId: attacker.id,
    targetId: target.id,
    attackerName: attacker.name,
    targetName: target.name,
    hitChance: preview.hitChance,
    hit,
    damage,
    tile: { ...targetTile },
    summary,
  };
}

export function resolveReactionFire(
  map: MapData,
  attacker: Unit,
  target: Unit,
  contactTile: TileCoord,
  heldAngle: HeldAngle,
  smokes: SmokeCloud[] = []
): CombatEvent {
  return resolveShot(map, attacker, target, contactTile, heldAngle.aimBonus, 'reaction_fire', smokes);
}
