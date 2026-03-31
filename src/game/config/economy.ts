// Ported from CS2_GameRules.ini [Economy] — all values preserved exactly.

export const ECONOMY = {
  pistolRoundMoney: 800,
  startingMoney: 800,

  roundWinBonus: 3250,
  lossBonus: [1400, 1900, 2400, 2900, 3400], // indexed by consecutive losses (0-4+)

  bombPlantBonus: 300,     // per surviving T if bomb was planted

  killReward: {
    rifle: 300,
    sniper: 100,
    smg: 600,
    pistol: 300,
    melee: 1500,
  },

  weaponPrices: {
    glock: 0, usp: 0, deagle: 700,
    ak47: 2700, m4a4: 3100, galil: 1800, famas: 2050,
    awp: 4750,
    mp9: 1250, mac10: 1050,
  },

  utilityPrices: {
    smoke: 300, flash: 200, molotov: 400, incendiary: 400,
    heGrenade: 300, decoy: 50, defuseKit: 400,
  },

  maxMoney: 16000,
} as const;

export function getLossBonus(consecutiveLosses: number): number {
  const index = Math.min(consecutiveLosses, ECONOMY.lossBonus.length - 1);
  return ECONOMY.lossBonus[Math.max(0, index)];
}
