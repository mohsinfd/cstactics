import type { FeedbackEventType } from '../game/types';

export type AudioCueBus = 'combat' | 'reaction' | 'impact' | 'utility' | 'movement' | 'ui';

export interface AudioMixProfile {
  masterGain: number;
  cueGain: Record<AudioCueBus, number>;
  maxGain: Record<AudioCueBus, number>;
}

export const AUDIO_MIX: AudioMixProfile = {
  masterGain: 0.82,
  cueGain: {
    combat: 1,
    reaction: 1.12,
    impact: 0.96,
    utility: 0.72,
    movement: 0.42,
    ui: 0.34,
  },
  maxGain: {
    combat: 0.14,
    reaction: 0.15,
    impact: 0.09,
    utility: 0.055,
    movement: 0.024,
    ui: 0.024,
  },
};

export const FEEDBACK_CUE_BUS: Record<FeedbackEventType, AudioCueBus> = {
  select_unit: 'ui',
  plan_add: 'ui',
  move_step: 'movement',
  move_complete: 'movement',
  hold_angle: 'utility',
  reload_weapon: 'utility',
  smoke_throw: 'utility',
  smoke_bloom: 'utility',
  flash_throw: 'utility',
  flash_pop: 'utility',
  bomb_pickup: 'utility',
  bomb_plant: 'utility',
  bomb_tick: 'utility',
  bomb_defuse: 'utility',
  turn_change: 'ui',
  ai_start: 'ui',
  ai_end: 'ui',
};

export function clampAudioIntensity(intensity: number | undefined): number {
  if (intensity === undefined) return 1;
  if (!Number.isFinite(intensity)) return 1;
  return Math.max(0.25, Math.min(1.35, intensity));
}

export function mixGain(bus: AudioCueBus, gainValue: number, localScale = 1): number {
  const mixedGain = gainValue * AUDIO_MIX.cueGain[bus] * AUDIO_MIX.masterGain * localScale;
  return Math.max(0.0001, Math.min(AUDIO_MIX.maxGain[bus], mixedGain));
}
