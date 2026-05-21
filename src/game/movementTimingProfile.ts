export const MOVEMENT_TIMING_PROFILE = {
  maxSpeedTilesPerSecond: 5.6,
  accelTilesPerSecond2: 28,
  decelTilesPerSecond2: 42,
  minMoveMs: 220,
  cornerRadiusTiles: 0.32,
  cornerSamples: 5,
} as const;

export const MOVEMENT_STOP_BRACE_MS = 220;

export const MOVEMENT_PRESENTATION_PROFILE = {
  ...MOVEMENT_TIMING_PROFILE,
  minMoveSeconds: MOVEMENT_TIMING_PROFILE.minMoveMs / 1000,
  lookaheadTiles: 0.78,
  stopDistanceTiles: 0.82,
  endpointSnapTiles: 0.03,
} as const;
