// ============================================================
// CS2 Tactics: Core Type Definitions
// All game interfaces — no rendering imports here.
// ============================================================

// --- Teams ---
export type Team = 'T' | 'CT';

// --- Round Phases ---
export type Phase = 'buy' | 'setup' | 'combat' | 'postplant' | 'roundend';

// --- Win Conditions ---
export type WinReason = 'elimination' | 'detonation' | 'defuse' | 'timeexpiry';

// --- Tile Grid ---
export interface TileCoord {
  x: number;
  y: number;
}

export interface MovementTile extends TileCoord {
  apCost: number;
}

export type PlannedActionKind = 'move' | 'smoke' | 'flash';
export type InputMode = 'move' | 'shoot' | 'hold_angle' | 'smoke' | 'flash';

export interface PlannedAction {
  id: string;
  unitId: number;
  team: Team;
  kind: PlannedActionKind;
  executeAtMs: number;
  from: TileCoord;
  target: TileCoord;
  path: TileCoord[];
  apCost: number;
  summary: string;
}

export interface HeldAngle {
  id: string;
  unitId: number;
  team: Team;
  origin: TileCoord;
  target: TileCoord;
  laneTiles: TileCoord[];
  remainingShots: number;
  aimBonus: number;
}

export type CoverLabel = 'open' | 'half' | 'full';
export type CoverState = 'protected' | 'flanked' | 'exposed';
export type CoverQuality = 'none' | 'direct' | 'corner';

export interface CombatEvent {
  id: string;
  createdAt: number;
  type: 'reaction_fire' | 'direct_fire';
  attackerId: number;
  targetId: number;
  attackerName: string;
  targetName: string;
  hitChance: number;
  hit: boolean;
  critical: boolean;
  critChance: number;
  damage: number;
  targetHpBefore: number;
  targetHpAfter: number;
  killed: boolean;
  distance: number;
  rangePenalty: number;
  coverPenalty: number;
  flashPenalty: number;
  coverLabel: CoverLabel;
  coverState: CoverState;
  coverQuality: CoverQuality;
  aimBonus: number;
  tile: TileCoord;
  summary: string;
}

export interface ExecuteInterruptTradeShot {
  shooterId: number;
  shooterName: string;
  targetId: number;
  targetName: string;
  hitChance: number;
  damage: number;
  critChance: number;
  critDamage: number;
  coverLabel: CoverLabel;
  coverState: CoverState;
  coverQuality: CoverQuality;
}

export interface ExecuteInterruptBombPressure {
  bombPlanted: boolean;
  bombDropped: boolean;
  bombTimer: number;
  bombPosition: TileCoord | null;
  bombCarrierId: number | null;
}

export interface ExecuteInterrupt {
  id: string;
  createdAt: number;
  source: 'direct_move' | 'planned_execute';
  beatTimeMs: number;
  beatLabel: string;
  phaseLabel: string;
  contactTile: TileCoord;
  event: CombatEvent;
  shooterId: number;
  stoppedUnitId: number;
  tradeShot: ExecuteInterruptTradeShot | null;
  bombPressure: ExecuteInterruptBombPressure;
}

export type FeedbackEventType =
  | 'select_unit'
  | 'plan_add'
  | 'move_step'
  | 'move_complete'
  | 'hold_angle'
  | 'smoke_throw'
  | 'flash_throw'
  | 'turn_change'
  | 'ai_start'
  | 'ai_end';

export interface FeedbackEvent {
  id: string;
  createdAt: number;
  type: FeedbackEventType;
  team?: Team;
  unitId?: number;
  intensity?: number;
}

export interface AiStatus {
  team: Team;
  message: string;
}

export interface SmokeCloud {
  id: string;
  ownerId: number;
  team: Team;
  position: TileCoord;
  radius: number;
  remainingTurns: number;
}

export interface FlashBurst {
  id: string;
  ownerId: number;
  team: Team;
  position: TileCoord;
  radius: number;
  affectedUnitIds: number[];
  createdAt: number;
}

export type TileType = 'floor' | 'wall' | 'cover_half' | 'cover_full' | 'bombsite_a' | 'bombsite_b' | 'spawn_t' | 'spawn_ct' | 'out_of_bounds';

export interface Tile {
  x: number;
  y: number;
  type: TileType;
  walkable: boolean;
  elevation: number;       // 0 = ground, +1 = balcony, -1 = pit
  coverValue: number;      // 0 = none, 20 = half, 40 = full
  label?: string;          // "Banana", "A-site", "Mid", etc.
}

// --- Cover Objects (placed on the map, distinct from wall tiles) ---
export interface CoverObject {
  x: number;
  y: number;
  width: number;           // tiles
  height: number;          // tiles
  coverType: 'half' | 'full';
  label: string;           // "Truck", "Car", "Fountain", etc.
}

// --- Map Data ---
export interface MapData {
  name: string;
  width: number;           // tiles
  height: number;          // tiles
  tileSize: number;        // world units per tile
  grid: Tile[][];          // [y][x] access
  walls: WallSegment[];
  openings: WallOpening[];
  coverObjects: CoverObject[];
  spawns: {
    T: TileCoord[];        // 5 spawn positions
    CT: TileCoord[];
  };
  bombsites: {
    A: { min: TileCoord; max: TileCoord };
    B: { min: TileCoord; max: TileCoord };
  };
  plantZones: {
    A: { min: TileCoord; max: TileCoord };
    B: { min: TileCoord; max: TileCoord };
  };
  sightlines: Sightline[];
}

export interface WallSegment {
  from: TileCoord;
  to: TileCoord;
  orientation: 'vertical' | 'horizontal';
  label?: string;
}

export interface WallOpening {
  position: TileCoord;
  width: number;
  connects: string;
}

export interface Sightline {
  from: TileCoord;
  to: TileCoord;
  distance: number;
  obstructed: boolean;
  label: string;
}

// --- Weapons ---
export type WeaponCategory = 'rifle' | 'sniper' | 'smg' | 'pistol' | 'melee';
export type WeaponSide = 'T' | 'CT' | 'Both';

export interface WeaponData {
  id: string;
  name: string;
  category: WeaponCategory;
  side: WeaponSide;
  price: number;
  baseDamage: number;
  critDamage: number;
  critChance: number;
  baseAim: number;
  clipSize: number;
  rangeOptimal: number;
  rangeMax: number;
  damageFalloffPerTile: number;
  recoilPenalty: number;
  armorPiercing: number;
  killReward: number;
  // Weapon-specific flags
  runAndGun?: boolean;
  scopeAimBonus?: number;
  movementPenalty?: number;
  backstabMultiplier?: number;
}

// --- Roles ---
export type RoleId = 'awper' | 'entry' | 'igl' | 'support' | 'lurker';

export interface RoleData {
  id: RoleId;
  displayName: string;
  referencePro: string;
  hp: number;
  mobility: number;
  baseAim: number;
  utilitySlots: number;
  defaultWeapon: string;
  abilityName: string;
  abilityDescription: string;
}

// --- Units ---
export interface Unit {
  id: number;
  team: Team;
  role: RoleData;
  name: string;             // e.g. "m0NESY"
  hp: number;
  maxHp: number;
  position: TileCoord;
  weapon: WeaponData;
  money: number;
  ap: number;               // action points remaining this turn
  maxAp: number;
  alive: boolean;
  shotsFiredThisTurn: number;
  hasMoved: boolean;
  hasBomb: boolean;
  hasDefuseKit: boolean;
  smokeGrenades: number;
  flashbangs: number;
  flashTurns: number;
  ammoInClip: number;
  reserveAmmo: number;
  // Visual state
  facing: TileCoord;        // direction unit is looking
}

// --- Game State ---
export interface RoundState {
  phase: Phase;
  turn: number;
  activeTeam: Team;
  bombPlanted: boolean;
  bombDefused: boolean;
  bombPosition: TileCoord | null;
  bombTimer: number;
  bombCarrierId: number | null;
  roundTimer: number;        // turns remaining
  roundWinner: Team | null;
  winReason: WinReason | null;
}

export interface MatchState {
  scoreT: number;
  scoreCT: number;
  currentRound: number;
  maxRounds: number;
  isOvertime: boolean;
  halfSwapped: boolean;
}

export interface EconomyState {
  moneyT: number[];          // per-player money (5 entries)
  moneyCT: number[];
  lossStreakT: number;
  lossStreakCT: number;
}

export interface GameState {
  map: MapData;
  units: Unit[];
  round: RoundState;
  match: MatchState;
  economy: EconomyState;
  selectedUnitId: number | null;
  hoveredTile: TileCoord | null;
  walkableTiles: TileCoord[];
  movementTiles: MovementTile[];
  pathPreview: TileCoord[];
  planningMode: boolean;
  plannedActions: PlannedAction[];
  isExecuting: boolean;
  inputMode: InputMode;
  heldAngles: HeldAngle[];
  smokes: SmokeCloud[];
  flashBursts: FlashBurst[];
  combatLog: CombatEvent[];
  executeInterrupt: ExecuteInterrupt | null;
  feedbackEvents: FeedbackEvent[];
  aiStatus: AiStatus | null;
}
