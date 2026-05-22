import type { MovementPresentationIntent } from './types';

export type MovementTimingProfile = {
  maxSpeedTilesPerSecond: number;
  accelTilesPerSecond2: number;
  decelTilesPerSecond2: number;
  minMoveMs: number;
  cornerRadiusTiles: number;
  cornerSamples: number;
  stopBraceMs: number;
  lookaheadTiles: number;
  stopDistanceTiles: number;
  endpointSnapTiles: number;
};

export const MOVEMENT_TIMING_PROFILES: Record<MovementPresentationIntent, MovementTimingProfile> = {
  fast_reposition: {
    maxSpeedTilesPerSecond: 11.0,
    accelTilesPerSecond2: 95,
    decelTilesPerSecond2: 125,
    minMoveMs: 120,
    cornerRadiusTiles: 0.26,
    cornerSamples: 4,
    stopBraceMs: 120,
    lookaheadTiles: 0.92,
    stopDistanceTiles: 0.38,
    endpointSnapTiles: 0.03,
  },
  cautious_hold_aim: {
    maxSpeedTilesPerSecond: 7.4,
    accelTilesPerSecond2: 58,
    decelTilesPerSecond2: 82,
    minMoveMs: 150,
    cornerRadiusTiles: 0.28,
    cornerSamples: 4,
    stopBraceMs: 190,
    lookaheadTiles: 0.82,
    stopDistanceTiles: 0.58,
    endpointSnapTiles: 0.03,
  },
  move_to_hold_target: {
    maxSpeedTilesPerSecond: 8.2,
    accelTilesPerSecond2: 68,
    decelTilesPerSecond2: 95,
    minMoveMs: 145,
    cornerRadiusTiles: 0.28,
    cornerSamples: 4,
    stopBraceMs: 170,
    lookaheadTiles: 0.86,
    stopDistanceTiles: 0.52,
    endpointSnapTiles: 0.03,
  },
};

export function getMovementTimingProfile(
  intent: MovementPresentationIntent | undefined
): MovementTimingProfile {
  return MOVEMENT_TIMING_PROFILES[intent ?? 'fast_reposition'];
}

// Deprecated compatibility aliases. New code should use getMovementTimingProfile(intent).
export const MOVEMENT_TIMING_PROFILE = MOVEMENT_TIMING_PROFILES.fast_reposition;
export const MOVEMENT_STOP_BRACE_MS = MOVEMENT_TIMING_PROFILES.fast_reposition.stopBraceMs;
export const MOVEMENT_PRESENTATION_PROFILE = {
  ...MOVEMENT_TIMING_PROFILES.fast_reposition,
  minMoveSeconds: MOVEMENT_TIMING_PROFILES.fast_reposition.minMoveMs / 1000,
} as const;
