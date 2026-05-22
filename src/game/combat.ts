import { RULES } from './config/rules';
import { hasLineOfSight } from './los';
import type { CombatEvent, CoverLabel, CoverQuality, CoverState, HeldAngle, MapData, SmokeCloud, TileCoord, Unit } from './types';

export interface ShotPreview {
  hasLineOfSight: boolean;
  inRange: boolean;
  distance: number;
  hitChance: number;
  critChance: number;
  critDamage: number;
  damage: number;
  baseAim: number;
  weaponAim: number;
  aimBonus: number;
  rangePenalty: number;
  coverPenalty: number;
  flashPenalty: number;
  coverLabel: CoverLabel;
  coverState: CoverState;
  coverQuality: CoverQuality;
  staticCoverPenalty: number;
  directionalCoverPenalty: number;
  unclampedHitChance: number;
  reasons: string[];
}

export interface CoverProfile {
  staticCoverPenalty: number;
  directionalCoverPenalty: number;
  effectiveCoverPenalty: number;
  coverLabel: CoverLabel;
  coverState: CoverState;
  coverQuality: CoverQuality;
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

const CARDINAL_COVER_DIRECTIONS: TileCoord[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

interface DirectionalCoverResult {
  penalty: number;
  label: CoverLabel;
  quality: CoverQuality;
}

function getDirectionalCover(
  map: MapData,
  attacker: TileCoord,
  target: TileCoord
): DirectionalCoverResult {
  const dx = attacker.x - target.x;
  const dy = attacker.y - target.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length === 0) return { penalty: 0, label: 'open', quality: 'none' };

  const facing = { x: dx / length, y: dy / length };
  let weightedPenalty = 0;
  let strongestRawPenalty = 0;
  let directCover = false;

  for (const dir of CARDINAL_COVER_DIRECTIONS) {
    const facingDot = dir.x * facing.x + dir.y * facing.y;
    if (facingDot < 0.38) continue;

    const coverTile = { x: target.x + dir.x, y: target.y + dir.y };
    const rawPenalty = getCoverPenaltyAt(map, coverTile);
    if (rawPenalty <= 0) continue;

    const isDirect = facingDot >= 0.82;
    const angleWeight = isDirect ? 1 : 0.65;
    weightedPenalty += rawPenalty * angleWeight;
    strongestRawPenalty = Math.max(strongestRawPenalty, rawPenalty);
    directCover ||= isDirect;
  }

  if (weightedPenalty <= 0) return { penalty: 0, label: 'open', quality: 'none' };

  return {
    penalty: Math.min(RULES.fullCoverAimPenalty, weightedPenalty),
    label: getCoverLabel(strongestRawPenalty),
    quality: directCover ? 'direct' : 'corner',
  };
}

function getCoverLabel(coverPenalty: number): CoverLabel {
  if (coverPenalty >= RULES.fullCoverAimPenalty) return 'full';
  if (coverPenalty >= RULES.halfCoverAimPenalty) return 'half';
  return 'open';
}

export function getCoverProfile(
  map: MapData,
  attackerTile: TileCoord,
  targetTile: TileCoord
): CoverProfile {
  const staticCoverPenalty = getStaticCoverPenalty(map, targetTile);
  const directionalCover = getDirectionalCover(map, attackerTile, targetTile);
  const coverState: CoverState = directionalCover.penalty > 0
    ? 'protected'
    : staticCoverPenalty > 0
      ? 'flanked'
      : 'exposed';

  return {
    staticCoverPenalty,
    directionalCoverPenalty: directionalCover.penalty,
    effectiveCoverPenalty: directionalCover.penalty * 0.5,
    coverLabel: directionalCover.label,
    coverState,
    coverQuality: directionalCover.quality,
  };
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
  const cover = getCoverProfile(map, attacker.position, targetTile);
  const flashPenalty = attacker.flashTurns > 0 ? RULES.flashAimPenalty : 0;
  const unclampedHitChance = Math.round(
    attacker.role.baseAim +
    attacker.weapon.baseAim -
    70 +
    aimBonus -
    rangePenalty -
    cover.effectiveCoverPenalty -
    flashPenalty
  );
  const hitChance = clamp(
    unclampedHitChance,
    5,
    95
  );
  const damage = Math.max(
    1,
    Math.round(attacker.weapon.baseDamage - Math.max(0, distance - attacker.weapon.rangeOptimal) * attacker.weapon.damageFalloffPerTile)
  );
  const critDamage = Math.max(damage, attacker.weapon.critDamage);
  const reasons: string[] = [];
  if (!hasLos) reasons.push('No line of sight');
  if (!inRange) reasons.push('Out of range');
  if (flashPenalty > 0) reasons.push('Attacker flashed');

  return {
    hasLineOfSight: hasLos,
    inRange,
    distance,
    hitChance,
    critChance: attacker.weapon.critChance,
    critDamage,
    damage,
    baseAim: attacker.role.baseAim,
    weaponAim: attacker.weapon.baseAim,
    aimBonus,
    rangePenalty,
    coverPenalty: cover.effectiveCoverPenalty,
    flashPenalty,
    coverLabel: cover.coverLabel,
    coverState: cover.coverState,
    coverQuality: cover.coverQuality,
    staticCoverPenalty: cover.staticCoverPenalty,
    directionalCoverPenalty: cover.directionalCoverPenalty,
    unclampedHitChance,
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
  const critical = hit && Math.random() * 100 < preview.critChance;
  const damage = hit ? (critical ? preview.critDamage : preview.damage) : 0;
  const targetHpBefore = target.hp;
  const targetHpAfter = hit ? Math.max(0, targetHpBefore - damage) : targetHpBefore;
  const killed = targetHpBefore > 0 && targetHpAfter === 0;
  const coverText = preview.coverState === 'protected'
    ? preview.coverQuality === 'corner'
      ? `${preview.coverLabel} corner`
      : `${preview.coverLabel} cover`
    : preview.coverState;
  const flashText = preview.flashPenalty > 0 ? ' while flashed' : '';
  const weaponText = attacker.weapon.name;
  let summary: string;
  if (killed && critical) {
    summary = `${attacker.name} headshots and eliminates ${target.name} with ${weaponText} through ${coverText}${flashText}`;
  } else if (killed) {
    summary = `${attacker.name} eliminates ${target.name} with ${weaponText} through ${coverText}${flashText}`;
  } else if (critical) {
    summary = `${attacker.name} headshots ${target.name} for ${damage} with ${weaponText} through ${coverText}${flashText}`;
  } else if (hit) {
    summary = `${attacker.name} hits ${target.name} for ${damage} with ${weaponText} through ${coverText}${flashText}`;
  } else {
    summary = `${attacker.name} misses ${target.name} with ${weaponText} through ${coverText}${flashText}`;
  }

  return {
    id: `${Date.now()}:${attacker.id}:${target.id}`,
    createdAt: Date.now(),
    type,
    attackerId: attacker.id,
    targetId: target.id,
    attackerName: attacker.name,
    targetName: target.name,
    weaponId: attacker.weapon.id,
    weaponName: attacker.weapon.name,
    weaponCategory: attacker.weapon.category,
    hitChance: preview.hitChance,
    hit,
    critical,
    critChance: preview.critChance,
    damage,
    targetHpBefore,
    targetHpAfter,
    killed,
    distance: preview.distance,
    rangePenalty: preview.rangePenalty,
    coverPenalty: preview.coverPenalty,
    flashPenalty: preview.flashPenalty,
    coverLabel: preview.coverLabel,
    coverState: preview.coverState,
    coverQuality: preview.coverQuality,
    aimBonus,
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
