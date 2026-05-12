// Ported from CS2_GameRules.ini — all values preserved exactly.

export const RULES = {
  // Match structure
  roundsPerHalf: 12,
  maxRounds: 24,
  overtimeRounds: 6,
  sideSwapAfterRound: 12,

  // Phase timing
  setupPhaseTurns: 2,
  combatPhaseMaxTurns: 12,
  roundTimeLimitTurns: 14,

  // Setup phase
  setupDetectionRange: 2,
  setupSprintBonus: 12,
  setupFiringAllowed: false,
  setupUtilityAllowed: true,
  setupOverwatchAllowed: false,

  // Bomb
  bombTimerTurns: 8,
  bombDamageRadius: 15,
  plantActionCost: 2,
  defuseActionCost: 2,
  defuseWithKit: 1,
  defuseWithoutKit: 2,
  bombPickupCost: 1,

  // Unit
  baseHp: 100,
  baseAp: 2,

  // Cover
  halfCoverAimPenalty: 20,
  fullCoverAimPenalty: 40,

  // Utility
  flashAimPenalty: 45,
} as const;
