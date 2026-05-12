// Ported from CS2_WeaponData.ini — all values preserved exactly.
import type { RoleId, Team, WeaponData } from '../types';

export const WEAPONS: Record<string, WeaponData> = {
  ak47: {
    id: 'ak47', name: 'AK-47', category: 'rifle', side: 'T',
    price: 2700, baseDamage: 34, critDamage: 100, critChance: 15,
    baseAim: 70, clipSize: 30, rangeOptimal: 8, rangeMax: 25,
    damageFalloffPerTile: 1, recoilPenalty: 30, armorPiercing: 2, killReward: 300,
  },
  m4a4: {
    id: 'm4a4', name: 'M4A4', category: 'rifle', side: 'CT',
    price: 3100, baseDamage: 28, critDamage: 85, critChance: 15,
    baseAim: 75, clipSize: 30, rangeOptimal: 10, rangeMax: 28,
    damageFalloffPerTile: 0.5, recoilPenalty: 20, armorPiercing: 1, killReward: 300,
  },
  galil: {
    id: 'galil', name: 'Galil AR', category: 'rifle', side: 'T',
    price: 1800, baseDamage: 26, critDamage: 80, critChance: 10,
    baseAim: 65, clipSize: 30, rangeOptimal: 7, rangeMax: 22,
    damageFalloffPerTile: 1.5, recoilPenalty: 25, armorPiercing: 1, killReward: 300,
  },
  famas: {
    id: 'famas', name: 'FAMAS', category: 'rifle', side: 'CT',
    price: 2050, baseDamage: 22, critDamage: 72, critChance: 10,
    baseAim: 70, clipSize: 25, rangeOptimal: 8, rangeMax: 24,
    damageFalloffPerTile: 1, recoilPenalty: 22, armorPiercing: 0, killReward: 300,
  },
  awp: {
    id: 'awp', name: 'AWP', category: 'sniper', side: 'Both',
    price: 4750, baseDamage: 100, critDamage: 200, critChance: 5,
    baseAim: 90, clipSize: 5, rangeOptimal: 15, rangeMax: 40,
    damageFalloffPerTile: 0, recoilPenalty: 60, armorPiercing: 4, killReward: 100,
    scopeAimBonus: 15, movementPenalty: 25,
  },
  mp9: {
    id: 'mp9', name: 'MP9', category: 'smg', side: 'CT',
    price: 1250, baseDamage: 18, critDamage: 55, critChance: 10,
    baseAim: 60, clipSize: 30, rangeOptimal: 5, rangeMax: 12,
    damageFalloffPerTile: 3, recoilPenalty: 10, armorPiercing: 0, killReward: 600,
    runAndGun: true,
  },
  mac10: {
    id: 'mac10', name: 'MAC-10', category: 'smg', side: 'T',
    price: 1050, baseDamage: 20, critDamage: 58, critChance: 10,
    baseAim: 55, clipSize: 30, rangeOptimal: 4, rangeMax: 10,
    damageFalloffPerTile: 4, recoilPenalty: 8, armorPiercing: 0, killReward: 600,
    runAndGun: true,
  },
  glock: {
    id: 'glock', name: 'Glock-18', category: 'pistol', side: 'T',
    price: 0, baseDamage: 12, critDamage: 45, critChance: 10,
    baseAim: 55, clipSize: 20, rangeOptimal: 4, rangeMax: 10,
    damageFalloffPerTile: 3, recoilPenalty: 5, armorPiercing: 0, killReward: 300,
  },
  usp: {
    id: 'usp', name: 'USP-S', category: 'pistol', side: 'CT',
    price: 0, baseDamage: 15, critDamage: 52, critChance: 12,
    baseAim: 65, clipSize: 12, rangeOptimal: 6, rangeMax: 14,
    damageFalloffPerTile: 2, recoilPenalty: 8, armorPiercing: 0, killReward: 300,
  },
  deagle: {
    id: 'deagle', name: 'Desert Eagle', category: 'pistol', side: 'Both',
    price: 700, baseDamage: 50, critDamage: 100, critChance: 12,
    baseAim: 50, clipSize: 7, rangeOptimal: 6, rangeMax: 18,
    damageFalloffPerTile: 2, recoilPenalty: 45, armorPiercing: 2, killReward: 300,
  },
  knife: {
    id: 'knife', name: 'Knife', category: 'melee', side: 'Both',
    price: 0, baseDamage: 40, critDamage: 100, critChance: 0,
    baseAim: 95, clipSize: 0, rangeOptimal: 1, rangeMax: 1,
    damageFalloffPerTile: 0, recoilPenalty: 0, armorPiercing: 0, killReward: 1500,
    backstabMultiplier: 2.5,
  },
};

export function getDefaultWeapon(team: 'T' | 'CT'): WeaponData {
  return team === 'T' ? WEAPONS.glock : WEAPONS.usp;
}

const ROLE_LOADOUTS: Record<Team, Record<RoleId, string>> = {
  T: {
    awper: 'awp',
    entry: 'ak47',
    igl: 'galil',
    support: 'galil',
    lurker: 'ak47',
  },
  CT: {
    awper: 'awp',
    entry: 'm4a4',
    igl: 'm4a4',
    support: 'famas',
    lurker: 'm4a4',
  },
};

export function getDefaultWeaponForRole(team: Team, roleId: RoleId): WeaponData {
  return WEAPONS[ROLE_LOADOUTS[team][roleId]] ?? getDefaultWeapon(team);
}

export function getWeaponShotApCost(weapon: WeaponData): number {
  if (weapon.category === 'pistol' || weapon.category === 'smg' || weapon.category === 'melee') {
    return 1;
  }

  return 2;
}
