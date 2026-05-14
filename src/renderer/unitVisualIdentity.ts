import type { RoleId, Team, WeaponCategory } from '../game/types';

export type UnitBaseGlyph = 'long' | 'wedge' | 'command' | 'utility' | 'stealth';
export type SpriteHeadgearMark = 'helmet-stripe' | 'headwrap-tails';
export type SpriteRoleGearLayer = 'long-gun' | 'assault-tabs' | 'command-kit' | 'utility-belt' | 'stealth-cloak';

export interface SpritePoint {
  x: number;
  y: number;
}

export interface SpriteRoleWeaponLayer {
  start: SpritePoint;
  end: SpritePoint;
  width: number;
  accentAlpha: number;
  scopeVisible: boolean;
  scopeAccent: string;
}

export interface SpriteTeamLayerProfile {
  vest: string;
  vestDark: string;
  pants: string;
  headgear: string;
  headgearDark: string;
  skin: string;
  armband: string;
  chestMark: string;
  chestText: string;
  chestTextColor: string;
  chestOutline: string;
  faceShield: string;
  headgearMark: SpriteHeadgearMark;
  headgearAccent: string;
  headgearAccentDark: string;
  inactiveOpacity: number;
}

export interface SpriteRoleLayerProfile {
  shortTag: string;
  accent: string;
  baseGlyph: UnitBaseGlyph;
  glyphCenter: SpritePoint;
  glyphScale: number;
  glyphStroke: string;
  gearLayer: SpriteRoleGearLayer;
  weapon: SpriteRoleWeaponLayer;
}

export interface SpriteVisualProfile {
  team: SpriteTeamLayerProfile;
  role: SpriteRoleLayerProfile;
}

export interface WeaponVisualProfile {
  category: WeaponCategory;
  bodyLength: number;
  bodyWidth: number;
  bodyHeight: number;
  barrelLength: number;
  barrelRadius: number;
  muzzleOffset: number;
  muzzleScale: number;
  magazineVisible: boolean;
  scopeVisible: boolean;
  suppressorVisible: boolean;
  stockScale: number;
}

export interface TeamVisualIdentity {
  id: Team;
  label: string;
  vest: string;
  vestDark: string;
  pants: string;
  headgear: string;
  headgearDark: string;
  skin: string;
  armband: string;
  accent: string;
  weapon: string;
  base: string;
  dimFactor: number;
  boardShape: 'diamond-cross' | 'chevron-band';
  primaryMark: string;
}

export interface RoleVisualIdentity {
  id: RoleId;
  shortTag: string;
  accent: string;
  baseGlyph: UnitBaseGlyph;
  bodyScale: number;
  weaponLength: number;
  weaponCategories: readonly WeaponCategory[];
  hasScope: boolean;
  hasAntenna: boolean;
  primaryRead: string;
  secondaryRead: string;
}

export interface UnitVisualIdentity {
  team: TeamVisualIdentity;
  role: RoleVisualIdentity;
  label: string;
  teamAccent: string;
  roleAccent: string;
  baseColor: string;
}

export const TEAM_VISUAL_IDENTITIES = {
  CT: {
    id: 'CT',
    label: 'Counter-Terrorist',
    vest: '#1e3f7a',
    vestDark: '#0f2040',
    pants: '#1a2535',
    headgear: '#2a4e8a',
    headgearDark: '#1a3060',
    skin: '#d4a574',
    armband: '#ffffff',
    accent: '#5599ee',
    weapon: '#2a2a2a',
    base: '#0e1e3a',
    dimFactor: 0.4,
    boardShape: 'diamond-cross',
    primaryMark: 'white armor cross and hard helmet',
  },
  T: {
    id: 'T',
    label: 'Terrorist',
    vest: '#5c5030',
    vestDark: '#3a3420',
    pants: '#3a3528',
    headgear: '#8a7050',
    headgearDark: '#5c4a30',
    skin: '#c8a882',
    armband: '#cc3333',
    accent: '#e8b630',
    weapon: '#333333',
    base: '#3a2a10',
    dimFactor: 0.4,
    boardShape: 'chevron-band',
    primaryMark: 'red cloth band and headwrap',
  },
} satisfies Record<Team, TeamVisualIdentity>;

export const TEAM_SPRITE_LAYER_PROFILES = {
  CT: {
    vest: '#224c88',
    vestDark: '#10233f',
    pants: '#1b2738',
    headgear: '#324f7f',
    headgearDark: '#1a3060',
    skin: '#c99870',
    armband: '#eef4ff',
    chestMark: '#e9eef7',
    chestText: 'CT',
    chestTextColor: '#0f2040',
    chestOutline: '#dfeaff',
    faceShield: '#09111f',
    headgearMark: 'helmet-stripe',
    headgearAccent: '#dfeaff',
    headgearAccentDark: '#09111f',
    inactiveOpacity: TEAM_VISUAL_IDENTITIES.CT.dimFactor,
  },
  T: {
    vest: '#6b5b35',
    vestDark: '#332d1e',
    pants: '#3b3426',
    headgear: '#8a6b4e',
    headgearDark: '#5c4a30',
    skin: '#c99870',
    armband: '#cc3333',
    chestMark: '#c43232',
    chestText: 'T',
    chestTextColor: '#ffe2b5',
    chestOutline: '#4a0808',
    faceShield: '#2b160d',
    headgearMark: 'headwrap-tails',
    headgearAccent: '#cc3333',
    headgearAccentDark: '#8e2424',
    inactiveOpacity: TEAM_VISUAL_IDENTITIES.T.dimFactor,
  },
} satisfies Record<Team, SpriteTeamLayerProfile>;

export const ROLE_VISUAL_IDENTITIES = {
  awper: {
    id: 'awper',
    shortTag: 'AWP',
    accent: '#70d6ff',
    baseGlyph: 'long',
    bodyScale: 1.04,
    weaponLength: 1.55,
    weaponCategories: ['sniper'],
    hasScope: true,
    hasAntenna: false,
    primaryRead: 'long scoped rifle',
    secondaryRead: 'tall precision silhouette',
  },
  entry: {
    id: 'entry',
    shortTag: 'ENT',
    accent: '#ff5a4f',
    baseGlyph: 'wedge',
    bodyScale: 1.18,
    weaponLength: 0.98,
    weaponCategories: ['rifle', 'smg'],
    hasScope: false,
    hasAntenna: false,
    primaryRead: 'forward wedge stance',
    secondaryRead: 'broad torso and aggressive tabs',
  },
  igl: {
    id: 'igl',
    shortTag: 'IGL',
    accent: '#f6d365',
    baseGlyph: 'command',
    bodyScale: 1.04,
    weaponLength: 0.82,
    weaponCategories: ['rifle', 'pistol'],
    hasScope: false,
    hasAntenna: true,
    primaryRead: 'radio and command tablet',
    secondaryRead: 'compact yellow planning badge',
  },
  support: {
    id: 'support',
    shortTag: 'SUP',
    accent: '#6ee7b7',
    baseGlyph: 'utility',
    bodyScale: 1.12,
    weaponLength: 0.78,
    weaponCategories: ['rifle', 'smg', 'pistol'],
    hasScope: false,
    hasAntenna: false,
    primaryRead: 'utility belt and canisters',
    secondaryRead: 'pack-heavy service silhouette',
  },
  lurker: {
    id: 'lurker',
    shortTag: 'LRK',
    accent: '#c084fc',
    baseGlyph: 'stealth',
    bodyScale: 0.96,
    weaponLength: 0.9,
    weaponCategories: ['rifle', 'pistol'],
    hasScope: false,
    hasAntenna: false,
    primaryRead: 'slim suppressed weapon profile',
    secondaryRead: 'dark cloak-like back plate',
  },
} satisfies Record<RoleId, RoleVisualIdentity>;

export const ROLE_SPRITE_LAYER_PROFILES = {
  awper: {
    shortTag: ROLE_VISUAL_IDENTITIES.awper.shortTag,
    accent: ROLE_VISUAL_IDENTITIES.awper.accent,
    baseGlyph: ROLE_VISUAL_IDENTITIES.awper.baseGlyph,
    glyphCenter: { x: 96, y: 131 },
    glyphScale: 0.72,
    glyphStroke: '#f7f8fb',
    gearLayer: 'long-gun',
    weapon: {
      start: { x: 42, y: 132 },
      end: { x: 152, y: 70 },
      width: 10,
      accentAlpha: 0.55,
      scopeVisible: true,
      scopeAccent: '#9ee8ff',
    },
  },
  entry: {
    shortTag: ROLE_VISUAL_IDENTITIES.entry.shortTag,
    accent: ROLE_VISUAL_IDENTITIES.entry.accent,
    baseGlyph: ROLE_VISUAL_IDENTITIES.entry.baseGlyph,
    glyphCenter: { x: 96, y: 131 },
    glyphScale: 0.72,
    glyphStroke: '#f7f8fb',
    gearLayer: 'assault-tabs',
    weapon: {
      start: { x: 52, y: 140 },
      end: { x: 140, y: 90 },
      width: 12,
      accentAlpha: 0.36,
      scopeVisible: false,
      scopeAccent: ROLE_VISUAL_IDENTITIES.entry.accent,
    },
  },
  igl: {
    shortTag: ROLE_VISUAL_IDENTITIES.igl.shortTag,
    accent: ROLE_VISUAL_IDENTITIES.igl.accent,
    baseGlyph: ROLE_VISUAL_IDENTITIES.igl.baseGlyph,
    glyphCenter: { x: 96, y: 131 },
    glyphScale: 0.72,
    glyphStroke: '#f7f8fb',
    gearLayer: 'command-kit',
    weapon: {
      start: { x: 52, y: 140 },
      end: { x: 140, y: 90 },
      width: 12,
      accentAlpha: 0.36,
      scopeVisible: false,
      scopeAccent: ROLE_VISUAL_IDENTITIES.igl.accent,
    },
  },
  support: {
    shortTag: ROLE_VISUAL_IDENTITIES.support.shortTag,
    accent: ROLE_VISUAL_IDENTITIES.support.accent,
    baseGlyph: ROLE_VISUAL_IDENTITIES.support.baseGlyph,
    glyphCenter: { x: 96, y: 131 },
    glyphScale: 0.72,
    glyphStroke: '#f7f8fb',
    gearLayer: 'utility-belt',
    weapon: {
      start: { x: 52, y: 140 },
      end: { x: 140, y: 90 },
      width: 12,
      accentAlpha: 0.36,
      scopeVisible: false,
      scopeAccent: ROLE_VISUAL_IDENTITIES.support.accent,
    },
  },
  lurker: {
    shortTag: ROLE_VISUAL_IDENTITIES.lurker.shortTag,
    accent: ROLE_VISUAL_IDENTITIES.lurker.accent,
    baseGlyph: ROLE_VISUAL_IDENTITIES.lurker.baseGlyph,
    glyphCenter: { x: 96, y: 131 },
    glyphScale: 0.72,
    glyphStroke: '#f7f8fb',
    gearLayer: 'stealth-cloak',
    weapon: {
      start: { x: 52, y: 140 },
      end: { x: 140, y: 90 },
      width: 12,
      accentAlpha: 0.36,
      scopeVisible: false,
      scopeAccent: ROLE_VISUAL_IDENTITIES.lurker.accent,
    },
  },
} satisfies Record<RoleId, SpriteRoleLayerProfile>;

export const WEAPON_VISUAL_PROFILES = {
  sniper: {
    category: 'sniper',
    bodyLength: 1.54,
    bodyWidth: 0.045,
    bodyHeight: 0.075,
    barrelLength: 0.24,
    barrelRadius: 0.017,
    muzzleOffset: 0.88,
    muzzleScale: 1.16,
    magazineVisible: true,
    scopeVisible: true,
    suppressorVisible: false,
    stockScale: 1.12,
  },
  rifle: {
    category: 'rifle',
    bodyLength: 1.04,
    bodyWidth: 0.068,
    bodyHeight: 0.075,
    barrelLength: 0.18,
    barrelRadius: 0.023,
    muzzleOffset: 0.63,
    muzzleScale: 1,
    magazineVisible: true,
    scopeVisible: false,
    suppressorVisible: false,
    stockScale: 1,
  },
  smg: {
    category: 'smg',
    bodyLength: 0.78,
    bodyWidth: 0.074,
    bodyHeight: 0.072,
    barrelLength: 0.13,
    barrelRadius: 0.022,
    muzzleOffset: 0.48,
    muzzleScale: 0.84,
    magazineVisible: true,
    scopeVisible: false,
    suppressorVisible: false,
    stockScale: 0.82,
  },
  pistol: {
    category: 'pistol',
    bodyLength: 0.44,
    bodyWidth: 0.06,
    bodyHeight: 0.07,
    barrelLength: 0.08,
    barrelRadius: 0.017,
    muzzleOffset: 0.28,
    muzzleScale: 0.68,
    magazineVisible: false,
    scopeVisible: false,
    suppressorVisible: false,
    stockScale: 0,
  },
  melee: {
    category: 'melee',
    bodyLength: 0.34,
    bodyWidth: 0.035,
    bodyHeight: 0.052,
    barrelLength: 0,
    barrelRadius: 0.012,
    muzzleOffset: 0.2,
    muzzleScale: 0.46,
    magazineVisible: false,
    scopeVisible: false,
    suppressorVisible: false,
    stockScale: 0,
  },
} satisfies Record<WeaponCategory, WeaponVisualProfile>;

export function getTeamVisualIdentity(team: Team): TeamVisualIdentity {
  return TEAM_VISUAL_IDENTITIES[team];
}

export function getRoleVisualIdentity(roleId: RoleId): RoleVisualIdentity {
  return ROLE_VISUAL_IDENTITIES[roleId];
}

export function getSpriteVisualProfile(team: Team, roleId: RoleId): SpriteVisualProfile {
  return {
    team: TEAM_SPRITE_LAYER_PROFILES[team],
    role: ROLE_SPRITE_LAYER_PROFILES[roleId],
  };
}

export function getWeaponVisualProfile(category: WeaponCategory): WeaponVisualProfile {
  return WEAPON_VISUAL_PROFILES[category] ?? WEAPON_VISUAL_PROFILES.rifle;
}

export function getUnitVisualIdentity(team: Team, roleId: RoleId): UnitVisualIdentity {
  const teamIdentity = getTeamVisualIdentity(team);
  const roleIdentity = getRoleVisualIdentity(roleId);

  return {
    team: teamIdentity,
    role: roleIdentity,
    label: `${team}:${roleIdentity.shortTag}`,
    teamAccent: teamIdentity.accent,
    roleAccent: roleIdentity.accent,
    baseColor: teamIdentity.base,
  };
}
