import type { WeaponCategory } from './types';

export interface ShotPresentation {
  label: string;
  color: string;
  secondaryColor: string;
  missColor: string;
  tracerWidth: number;
  tracerCount: number;
  tracerSpread: number;
  impactScale: number;
  markerDurationSeconds: number;
  recoilScale: number;
  muzzleScale: number;
  noiseDurationSeconds: number;
  audioGainScale: number;
  shotToneHz: number;
  impactToneHz: number;
}

const SHOT_PRESENTATION: Record<WeaponCategory, ShotPresentation> = {
  sniper: {
    label: 'AWP',
    color: '#ffffff',
    secondaryColor: '#8bd3ff',
    missColor: '#d8e7ff',
    tracerWidth: 6,
    tracerCount: 1,
    tracerSpread: 0,
    impactScale: 1.42,
    markerDurationSeconds: 2.05,
    recoilScale: 1.58,
    muzzleScale: 1.5,
    noiseDurationSeconds: 0.16,
    audioGainScale: 1.35,
    shotToneHz: 92,
    impactToneHz: 58,
  },
  rifle: {
    label: 'RIFLE',
    color: '#ff6b82',
    secondaryColor: '#ffd7dd',
    missColor: '#f4c16d',
    tracerWidth: 4,
    tracerCount: 2,
    tracerSpread: 0.11,
    impactScale: 1.12,
    markerDurationSeconds: 1.65,
    recoilScale: 1.1,
    muzzleScale: 1.08,
    noiseDurationSeconds: 0.1,
    audioGainScale: 1,
    shotToneHz: 150,
    impactToneHz: 82,
  },
  smg: {
    label: 'BURST',
    color: '#ffd166',
    secondaryColor: '#fff1b5',
    missColor: '#d8c170',
    tracerWidth: 3,
    tracerCount: 3,
    tracerSpread: 0.15,
    impactScale: 0.96,
    markerDurationSeconds: 1.45,
    recoilScale: 0.78,
    muzzleScale: 0.88,
    noiseDurationSeconds: 0.075,
    audioGainScale: 0.9,
    shotToneHz: 230,
    impactToneHz: 105,
  },
  pistol: {
    label: 'TAP',
    color: '#d8c170',
    secondaryColor: '#fff1b5',
    missColor: '#b7a46a',
    tracerWidth: 2,
    tracerCount: 1,
    tracerSpread: 0,
    impactScale: 0.84,
    markerDurationSeconds: 1.35,
    recoilScale: 0.64,
    muzzleScale: 0.74,
    noiseDurationSeconds: 0.065,
    audioGainScale: 0.72,
    shotToneHz: 310,
    impactToneHz: 125,
  },
  melee: {
    label: 'MELEE',
    color: '#f2c94c',
    secondaryColor: '#fff1b5',
    missColor: '#9f8f58',
    tracerWidth: 2,
    tracerCount: 1,
    tracerSpread: 0,
    impactScale: 0.9,
    markerDurationSeconds: 1.35,
    recoilScale: 0.55,
    muzzleScale: 0.65,
    noiseDurationSeconds: 0.055,
    audioGainScale: 0.62,
    shotToneHz: 380,
    impactToneHz: 140,
  },
};

export function getShotPresentation(category: WeaponCategory): ShotPresentation {
  return SHOT_PRESENTATION[category] ?? SHOT_PRESENTATION.rifle;
}
