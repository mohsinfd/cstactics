import type { RoleId, Team, WeaponCategory } from '../game/types';

export type UnitBaseGlyph = 'long' | 'wedge' | 'command' | 'utility' | 'stealth';

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

export function getTeamVisualIdentity(team: Team): TeamVisualIdentity {
  return TEAM_VISUAL_IDENTITIES[team];
}

export function getRoleVisualIdentity(roleId: RoleId): RoleVisualIdentity {
  return ROLE_VISUAL_IDENTITIES[roleId];
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
