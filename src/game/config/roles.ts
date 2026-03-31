// Ported from CS2_ClassData.ini — all values preserved exactly.
import type { RoleData, RoleId } from '../types';

export const ROLES: Record<RoleId, RoleData> = {
  awper: {
    id: 'awper',
    displayName: 'AWPer',
    referencePro: 'm0NESY',
    hp: 100, mobility: 18, baseAim: 75, utilitySlots: 2,
    defaultWeapon: 'awp',
    abilityName: 'FlickShot',
    abilityDescription: 'Move + shoot with +40% Aim. Bypasses AWP movement penalty.',
  },
  entry: {
    id: 'entry',
    displayName: 'Entry Fragger',
    referencePro: 'donk',
    hp: 100, mobility: 16, baseAim: 80, utilitySlots: 1,
    defaultWeapon: 'ak47',
    abilityName: 'SprayTransfer',
    abilityDescription: 'After a kill, free shot at another target within 3 tiles. -20% Aim.',
  },
  igl: {
    id: 'igl',
    displayName: 'In-Game Leader',
    referencePro: 'Karrigan',
    hp: 100, mobility: 14, baseAim: 65, utilitySlots: 3,
    defaultWeapon: 'm4a4',
    abilityName: 'ExecuteCall',
    abilityDescription: 'Allies within 8 tiles gain +1 AP. Utility costs halved.',
  },
  support: {
    id: 'support',
    displayName: 'Support',
    referencePro: 'Aleksib',
    hp: 100, mobility: 15, baseAim: 70, utilitySlots: 3,
    defaultWeapon: 'm4a4',
    abilityName: 'PopFlash',
    abilityDescription: 'Blind enemies -80% Aim. Peeking ally gets +30% Aim.',
  },
  lurker: {
    id: 'lurker',
    displayName: 'Lurker',
    referencePro: 'ropz',
    hp: 100, mobility: 17, baseAim: 78, utilitySlots: 2,
    defaultWeapon: 'ak47',
    abilityName: 'GhostRotate',
    abilityDescription: 'Move 6 tiles silently. Bypass overwatch. Reveal nearby enemies.',
  },
};

// Default team compositions
export const T_ROSTER: RoleId[] = ['entry', 'awper', 'igl', 'support', 'lurker'];
export const CT_ROSTER: RoleId[] = ['awper', 'entry', 'support', 'igl', 'lurker'];
