// ============================================================
// Zustand Game Store — single source of truth for CS2 Tactics.
//
// Current command layer:
//   - Each unit has 2 AP per turn
//   - 1 AP = move up to (mobility / 2) tiles
//   - Setup phase (turns 1-2): sprint bonus +6 tiles per AP
//   - Moving deducts AP based on distance moved
//   - Planning mode can queue move orders before resolving them together
//   - Planned moves resolve in short synchronized ticks and freeze on contact
//   - LOS, shooting, held angles, and reaction fire are implemented as the
//     first contact vertical slice
//   - "End Turn" advances to next team / next turn
//
// Missing: generic action pipeline, utility, plant/defuse, AI, and economy.
// ============================================================
import { create } from 'zustand';
import type {
  GameState,
  Unit,
  TileCoord,
  Team,
  RoleId,
  MovementTile,
  RoundState,
  PlannedAction,
  HeldAngle,
  InputMode,
  CombatEvent,
  SmokeCloud,
} from './types';
import { createInfernoMap } from './maps/inferno';
import { ROLES, T_ROSTER, CT_ROSTER } from './config/roles';
import { getDefaultWeapon } from './config/weapons';
import { RULES } from './config/rules';
import { findPath, getMovementTiles } from './pathfinding';
import { getWatchedLane } from './los';
import { getCrossingHeldAngles, getFirstCrossingTile } from './threats';
import { getShotPreview, resolveReactionFire, resolveShot, tileDistance } from './combat';

const EXECUTION_STEP_MS = 165;
const SMOKE_THROW_RANGE = 12;
const SMOKE_RADIUS = 2;
const SMOKE_DURATION_TURNS = 4;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

// Movement range per AP point
function getMoveRangePerAP(unit: Unit, isSetupPhase: boolean): number {
  const base = Math.floor(unit.role.mobility / 2);
  const sprint = isSetupPhase ? Math.floor(RULES.setupSprintBonus / 2) : 0;
  return base + sprint;
}

function getMovementState(unit: Unit, map: GameState['map'], isSetupPhase: boolean): {
  movementTiles: MovementTile[];
  walkableTiles: TileCoord[];
} {
  const rangePerAp = getMoveRangePerAP(unit, isSetupPhase);
  const movementTiles = getMovementTiles(map, unit.position, rangePerAp, unit.ap);
  return {
    movementTiles,
    walkableTiles: movementTiles.map(({ x, y }) => ({ x, y })),
  };
}

function getNextAvailableUnitId(units: Unit[], activeTeam: Team, currentUnitId: number): number | null {
  const teamUnits = units.filter((u) => u.team === activeTeam && u.alive);
  if (teamUnits.length === 0) return null;

  const currentIndex = Math.max(0, teamUnits.findIndex((u) => u.id === currentUnitId));
  for (let offset = 1; offset <= teamUnits.length; offset++) {
    const candidate = teamUnits[(currentIndex + offset) % teamUnits.length];
    if (candidate.ap > 0) return candidate.id;
  }

  return null;
}

function getFirstAvailableUnitId(units: Unit[], activeTeam: Team): number | null {
  return units.find((u) => u.team === activeTeam && u.alive && u.ap > 0)?.id ?? null;
}

function getNextUnplannedUnitId(
  units: Unit[],
  activeTeam: Team,
  currentUnitId: number,
  plannedActions: PlannedAction[]
): number | null {
  const plannedUnitIds = new Set(plannedActions.map((action) => action.unitId));
  const teamUnits = units.filter((u) => u.team === activeTeam && u.alive && u.ap > 0);
  if (teamUnits.length === 0) return null;

  const currentIndex = Math.max(0, teamUnits.findIndex((u) => u.id === currentUnitId));
  for (let offset = 1; offset <= teamUnits.length; offset++) {
    const candidate = teamUnits[(currentIndex + offset) % teamUnits.length];
    if (!plannedUnitIds.has(candidate.id)) return candidate.id;
  }

  return null;
}

function getMovementForSelection(
  units: Unit[],
  unitId: number | null,
  map: GameState['map'],
  round: RoundState
): {
  movementTiles: MovementTile[];
  walkableTiles: TileCoord[];
} {
  if (unitId === null) return { movementTiles: [], walkableTiles: [] };
  const unit = units.find((u) => u.id === unitId);
  if (!unit || !unit.alive || unit.ap <= 0) return { movementTiles: [], walkableTiles: [] };
  return getMovementState(unit, map, round.phase === 'setup');
}

function findNearestWalkable(map: GameState['map'], preferred: TileCoord): TileCoord {
  if (map.grid[preferred.y]?.[preferred.x]?.walkable) return preferred;
  const queue = [{ ...preferred }];
  const seen = new Set([`${preferred.x},${preferred.y}`]);
  const dirs = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const dir of dirs) {
      const next = { x: current.x + dir.x, y: current.y + dir.y };
      const key = `${next.x},${next.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (next.x < 0 || next.x >= map.width || next.y < 0 || next.y >= map.height) continue;
      if (map.grid[next.y]?.[next.x]?.walkable) return next;
      queue.push(next);
    }
  }

  return preferred;
}

function advanceTurn(round: RoundState, units: Unit[], smokes: SmokeCloud[] = []): {
  round: RoundState;
  units: Unit[];
  smokes: SmokeCloud[];
} {
  let nextTeam: Team;
  let nextTurn = round.turn;
  let nextPhase = round.phase;

  if (round.activeTeam === 'T') {
    nextTeam = 'CT';
  } else {
    nextTeam = 'T';
    nextTurn = round.turn + 1;

    if (nextTurn > RULES.setupPhaseTurns && round.phase === 'setup') {
      nextPhase = 'combat';
    }
  }

  const newUnits = units.map((u) => {
    if (u.team === nextTeam && u.alive) {
      return { ...u, ap: u.maxAp, hasMoved: false, shotsFiredThisTurn: 0 };
    }
    return u;
  });

  const nextSmokes = nextTeam === 'T'
    ? smokes
      .map((smoke) => ({ ...smoke, remainingTurns: smoke.remainingTurns - 1 }))
      .filter((smoke) => smoke.remainingTurns > 0)
    : smokes;

  return {
    units: newUnits,
    smokes: nextSmokes,
    round: {
      ...round,
      activeTeam: nextTeam,
      turn: nextTurn,
      phase: nextPhase,
      roundTimer: round.phase === 'setup' ? round.roundTimer : round.roundTimer - 1,
    },
  };
}

function createUnits(): Unit[] {
  const map = createInfernoMap();
  const units: Unit[] = [];
  let id = 0;

  const makeUnit = (team: Team, roleId: RoleId, spawn: TileCoord): Unit => {
    const role = ROLES[roleId];
    return {
      id: id++,
      team,
      role,
      name: role.referencePro,
      hp: role.hp,
      maxHp: role.hp,
      position: { ...spawn },
      weapon: getDefaultWeapon(team),
      money: 800,
      ap: RULES.baseAp,
      maxAp: RULES.baseAp,
      alive: true,
      shotsFiredThisTurn: 0,
      hasMoved: false,
      hasBomb: false,
      hasDefuseKit: false,
      smokeGrenades: roleId === 'support' ? 2 : (roleId === 'igl' || roleId === 'lurker' ? 1 : 0),
      facing: { x: 0, y: team === 'T' ? 1 : -1 },
    };
  };

  T_ROSTER.forEach((roleId, i) => {
    units.push(makeUnit('T', roleId, map.spawns.T[i]));
  });
  CT_ROSTER.forEach((roleId, i) => {
    units.push(makeUnit('CT', roleId, map.spawns.CT[i]));
  });

  // Bomb carrier = first T (entry fragger)
  units[0].hasBomb = true;

  return units;
}

interface GameStore extends GameState {
  selectUnit: (id: number | null) => void;
  hoverTile: (tile: TileCoord | null) => void;
  moveUnit: (targetTile: TileCoord) => void;
  setInputMode: (mode: InputMode) => void;
  holdAngle: (targetTile: TileCoord) => void;
  throwSmoke: (targetTile: TileCoord) => void;
  shootUnit: (targetId: number) => void;
  queueMove: (targetTile: TileCoord) => void;
  commitPlannedActions: () => void;
  clearPlannedActions: () => void;
  setPlanningMode: (enabled: boolean) => void;
  finishUnit: () => void;
  endTurn: () => void;
  initGame: () => void;
  startContactDrill: () => void;
}

export const useGameStore = create<GameStore>((set, get) => {
  const map = createInfernoMap();
  const units = createUnits();

  return {
    map,
    units,
    round: {
      phase: 'setup',
      turn: 1,
      activeTeam: 'T',
      bombPlanted: false,
      bombDefused: false,
      bombPosition: null,
      bombTimer: RULES.bombTimerTurns,
      bombCarrierId: 0,
      roundTimer: RULES.roundTimeLimitTurns,
    },
    match: {
      scoreT: 0,
      scoreCT: 0,
      currentRound: 1,
      maxRounds: RULES.roundsPerHalf * 2,
      isOvertime: false,
      halfSwapped: false,
    },
    economy: {
      moneyT: [800, 800, 800, 800, 800],
      moneyCT: [800, 800, 800, 800, 800],
      lossStreakT: 0,
      lossStreakCT: 0,
    },
    selectedUnitId: null,
    hoveredTile: null,
    walkableTiles: [],
    movementTiles: [],
    pathPreview: [],
    planningMode: false,
    plannedActions: [],
    isExecuting: false,
    inputMode: 'move',
    heldAngles: [],
    smokes: [],
    combatLog: [],

    selectUnit: (id) => {
      const state = get();
      if (id === null) {
        set({ selectedUnitId: null, walkableTiles: [], movementTiles: [], pathPreview: [] });
        return;
      }

      const unit = state.units.find((u) => u.id === id);
      if (!unit || !unit.alive) {
        set({ selectedUnitId: null, walkableTiles: [], movementTiles: [], pathPreview: [] });
        return;
      }

      // Only select units from the active team
      if (unit.team !== state.round.activeTeam) {
        set({ selectedUnitId: null, walkableTiles: [], movementTiles: [], pathPreview: [] });
        return;
      }

      // No AP left? Can still select but no walkable tiles
      if (unit.ap <= 0) {
        set({ selectedUnitId: id, walkableTiles: [], movementTiles: [], pathPreview: [] });
        return;
      }

      const isSetup = state.round.phase === 'setup';
      const { movementTiles, walkableTiles } = getMovementState(unit, state.map, isSetup);

      set({ selectedUnitId: id, movementTiles, walkableTiles, pathPreview: [] });
    },

    hoverTile: (tile) => {
      if (!tile) {
        set({ hoveredTile: null, pathPreview: [] });
        return;
      }

      const state = get();
      if (
        state.hoveredTile?.x === tile.x &&
        state.hoveredTile?.y === tile.y
      ) {
        return;
      }

      if (state.selectedUnitId === null) {
        set({ hoveredTile: tile });
        return;
      }

      const unit = state.units.find((u) => u.id === state.selectedUnitId);
      if (!unit || unit.ap <= 0) {
        set({ hoveredTile: tile });
        return;
      }

      if (state.inputMode === 'smoke' || state.inputMode === 'hold_angle') {
        set({ hoveredTile: tile, pathPreview: [] });
        return;
      }

      const isInRange = state.walkableTiles.some(
        (t) => t.x === tile.x && t.y === tile.y
      );
      if (isInRange) {
        const path = findPath(state.map, unit.position, tile);
        set({ hoveredTile: tile, pathPreview: path });
      } else {
        set({ hoveredTile: tile, pathPreview: [] });
      }
    },

    moveUnit: async (targetTile) => {
      const state = get();
      if (state.isExecuting) return;
      const { selectedUnitId, units, map: mapData, round } = state;

      if (selectedUnitId === null) return;

      const unitIdx = units.findIndex((u) => u.id === selectedUnitId);
      if (unitIdx === -1) return;

      const unit = units[unitIdx];
      if (!unit.alive || unit.ap <= 0) return;
      if (unit.team !== round.activeTeam) return;

      const isInRange = state.walkableTiles.some(
        (t) => t.x === targetTile.x && t.y === targetTile.y
      );
      if (!isInRange) return;

      // Check no other unit on that tile
      const occupied = units.some(
        (u) => u.alive && u.id !== unit.id &&
               u.position.x === targetTile.x && u.position.y === targetTile.y
      );
      if (occupied) return;

      // Compute path and AP cost
      const path = findPath(mapData, unit.position, targetTile);
      if (path.length === 0) return;

      const isSetup = round.phase === 'setup';
      const rangePerAP = getMoveRangePerAP(unit, isSetup);
      const apCost = Math.ceil(path.length / rangePerAP);

      if (apCost > unit.ap) return; // shouldn't happen if walkable range is correct

      const canTriggerHeldAngles = round.phase !== 'setup' || RULES.setupOverwatchAllowed;
      const crossedAngle = canTriggerHeldAngles
        ? getCrossingHeldAngles(state.heldAngles, path, unit.team)[0] ?? null
        : null;
      const contactTile = crossedAngle ? getFirstCrossingTile(crossedAngle, path) : null;
      const contactIndex = contactTile
        ? path.findIndex((tile) => tile.x === contactTile.x && tile.y === contactTile.y)
        : -1;
      const pathToTravel = contactIndex >= 0 ? path.slice(0, contactIndex + 1) : path;

      let nextUnits = [...units];
      let tilesMoved = 0;
      let contactEvent: CombatEvent | null = null;
      let consumedHeldAngleId: string | null = null;

      set({
        isExecuting: true,
        hoveredTile: null,
        movementTiles: [],
        walkableTiles: [],
        pathPreview: [],
        inputMode: 'move',
      });

      for (const step of pathToTravel) {
        const currentUnitIdx = nextUnits.findIndex((candidate) => candidate.id === unit.id);
        if (currentUnitIdx === -1) break;

        const movingUnit = nextUnits[currentUnitIdx];
        if (!movingUnit.alive) break;

        const dx = step.x - movingUnit.position.x;
        const dy = step.y - movingUnit.position.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;

        nextUnits = [...nextUnits];
        nextUnits[currentUnitIdx] = {
          ...movingUnit,
          position: { ...step },
          hasMoved: true,
          facing: { x: Math.round(dx / len), y: Math.round(dy / len) },
        };
        tilesMoved += 1;

        set({
          units: nextUnits,
          selectedUnitId: unit.id,
          hoveredTile: null,
          movementTiles: [],
          walkableTiles: [],
          pathPreview: [],
        });
        await wait(EXECUTION_STEP_MS);

        if (
          crossedAngle &&
          contactTile &&
          step.x === contactTile.x &&
          step.y === contactTile.y
        ) {
          const targetIdx = nextUnits.findIndex((candidate) => candidate.id === unit.id);
          const target = targetIdx === -1 ? null : nextUnits[targetIdx];
          const attacker = nextUnits.find((candidate) => candidate.id === crossedAngle.unitId);
          if (target?.alive && attacker?.alive) {
            const reactionPreview = getShotPreview(mapData, attacker, target, crossedAngle.aimBonus, contactTile, state.smokes);
            if (reactionPreview.hasLineOfSight && reactionPreview.inRange) {
              contactEvent = resolveReactionFire(mapData, attacker, target, contactTile, crossedAngle, state.smokes);
              consumedHeldAngleId = crossedAngle.id;
              if (contactEvent.hit) {
                const newHp = Math.max(0, target.hp - contactEvent.damage);
                nextUnits[targetIdx] = {
                  ...target,
                  hp: newHp,
                  alive: newHp > 0,
                };
              }
              break;
            }
          }
        }
      }

      const finalUnitIdx = nextUnits.findIndex((candidate) => candidate.id === unit.id);
      if (finalUnitIdx === -1 || tilesMoved === 0) {
        set({ isExecuting: false });
        return;
      }

      const spentAp = Math.max(1, Math.min(apCost, Math.ceil(tilesMoved / rangePerAP)));
      const finalUnit = nextUnits[finalUnitIdx];
      const newAp = Math.max(0, finalUnit.ap - spentAp);
      nextUnits = [...nextUnits];
      nextUnits[finalUnitIdx] = {
        ...finalUnit,
        ap: newAp,
        hasMoved: true,
      };

      let nextSelectedUnitId: number | null = contactEvent
        ? (nextUnits[finalUnitIdx].alive ? unit.id : getFirstAvailableUnitId(nextUnits, round.activeTeam))
        : selectedUnitId;
      let movementTiles: MovementTile[] = [];
      let walkableTiles: TileCoord[] = [];
      let nextRound = round;
      let nextSmokes = state.smokes;

      if (contactEvent) {
        const contactMovement = getMovementForSelection(nextUnits, nextSelectedUnitId, mapData, nextRound);
        movementTiles = contactMovement.movementTiles;
        walkableTiles = contactMovement.walkableTiles;
      } else if (newAp > 0) {
        movementTiles = getMovementTiles(mapData, nextUnits[finalUnitIdx].position, rangePerAP, newAp);
        walkableTiles = movementTiles.map(({ x, y }) => ({ x, y }));
      } else {
        nextSelectedUnitId = getNextAvailableUnitId(nextUnits, round.activeTeam, unit.id);
        if (nextSelectedUnitId === null) {
          const advanced = advanceTurn(round, nextUnits, state.smokes);
          nextUnits = advanced.units;
          nextRound = advanced.round;
          nextSmokes = advanced.smokes;
          nextSelectedUnitId = getFirstAvailableUnitId(nextUnits, nextRound.activeTeam);
        }

        if (nextSelectedUnitId !== null) {
          const nextUnit = nextUnits.find((u) => u.id === nextSelectedUnitId);
          if (nextUnit) {
            const nextMovement = getMovementState(nextUnit, mapData, nextRound.phase === 'setup');
            movementTiles = nextMovement.movementTiles;
            walkableTiles = nextMovement.walkableTiles;
          }
        }
      }

      set({
        units: nextUnits,
        round: nextRound,
        selectedUnitId: nextSelectedUnitId,
        hoveredTile: null,
        movementTiles,
        walkableTiles,
        pathPreview: [],
        isExecuting: false,
        inputMode: contactEvent ? 'shoot' : 'move',
        plannedActions: [],
        heldAngles: state.heldAngles.filter((angle) => (
          angle.unitId !== unit.id &&
          angle.id !== consumedHeldAngleId
        )),
        smokes: nextSmokes,
        combatLog: contactEvent ? [contactEvent, ...state.combatLog].slice(0, 8) : state.combatLog,
      });
    },

    setInputMode: (mode) => {
      set({ inputMode: mode, pathPreview: [] });
    },

    holdAngle: (targetTile) => {
      const state = get();
      if (state.isExecuting) return;
      const { selectedUnitId, units, map: mapData, round } = state;
      if (selectedUnitId === null) return;

      const unitIdx = units.findIndex((u) => u.id === selectedUnitId);
      if (unitIdx === -1) return;

      const unit = units[unitIdx];
      if (!unit.alive || unit.ap <= 0 || unit.team !== round.activeTeam) return;
      if (unit.position.x === targetTile.x && unit.position.y === targetTile.y) return;

      const maxTiles = Math.max(4, Math.min(unit.weapon.rangeMax, 24));
      const laneTiles = getWatchedLane(mapData, unit.position, targetTile, maxTiles);
      if (laneTiles.length === 0) return;

      const dx = targetTile.x - unit.position.x;
      const dy = targetTile.y - unit.position.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;

      let nextUnits = [...units];
      const newAp = Math.max(0, unit.ap - 1);
      nextUnits[unitIdx] = {
        ...unit,
        ap: newAp,
        hasMoved: true,
        facing: { x: Math.round(dx / len), y: Math.round(dy / len) },
      };

      const heldAngle: HeldAngle = {
        id: `${unit.id}:hold`,
        unitId: unit.id,
        team: unit.team,
        origin: { ...unit.position },
        target: { ...targetTile },
        laneTiles,
        remainingShots: 1,
        aimBonus: unit.role.id === 'awper' ? 15 : 5,
      };

      let nextRound = round;
      let nextSelectedUnitId: number | null = selectedUnitId;
      let movementTiles: MovementTile[] = [];
      let walkableTiles: TileCoord[] = [];
      let nextSmokes = state.smokes;

      if (newAp > 0) {
        const movement = getMovementState(nextUnits[unitIdx], mapData, round.phase === 'setup');
        movementTiles = movement.movementTiles;
        walkableTiles = movement.walkableTiles;
      } else {
        nextSelectedUnitId = getNextAvailableUnitId(nextUnits, round.activeTeam, unit.id);
        if (nextSelectedUnitId === null) {
          const advanced = advanceTurn(round, nextUnits, state.smokes);
          nextUnits = advanced.units;
          nextRound = advanced.round;
          nextSmokes = advanced.smokes;
          nextSelectedUnitId = getFirstAvailableUnitId(nextUnits, nextRound.activeTeam);
        }
        const movement = getMovementForSelection(nextUnits, nextSelectedUnitId, mapData, nextRound);
        movementTiles = movement.movementTiles;
        walkableTiles = movement.walkableTiles;
      }

      set({
        units: nextUnits,
        round: nextRound,
        selectedUnitId: nextSelectedUnitId,
        hoveredTile: null,
        movementTiles,
        walkableTiles,
        pathPreview: [],
        inputMode: 'move',
        heldAngles: [
          ...state.heldAngles.filter((angle) => angle.unitId !== unit.id),
          heldAngle,
        ],
        smokes: nextSmokes,
      });
    },

    throwSmoke: (targetTile) => {
      const state = get();
      if (state.isExecuting) return;
      const { selectedUnitId, units, map: mapData, round } = state;
      if (selectedUnitId === null) return;

      const unitIdx = units.findIndex((u) => u.id === selectedUnitId);
      if (unitIdx === -1) return;

      const unit = units[unitIdx];
      if (!unit.alive || unit.ap <= 0 || unit.team !== round.activeTeam || unit.smokeGrenades <= 0) return;
      if (round.phase === 'setup' && !RULES.setupUtilityAllowed) return;
      if (!mapData.grid[targetTile.y]?.[targetTile.x]?.walkable) return;
      if (tileDistance(unit.position, targetTile) > SMOKE_THROW_RANGE) return;

      const dx = targetTile.x - unit.position.x;
      const dy = targetTile.y - unit.position.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;

      let nextUnits = [...units];
      const newAp = Math.max(0, unit.ap - 1);
      nextUnits[unitIdx] = {
        ...unit,
        ap: newAp,
        smokeGrenades: Math.max(0, unit.smokeGrenades - 1),
        hasMoved: true,
        facing: { x: Math.round(dx / len), y: Math.round(dy / len) },
      };

      const smoke: SmokeCloud = {
        id: `${Date.now()}:${unit.id}:smoke`,
        ownerId: unit.id,
        team: unit.team,
        position: { ...targetTile },
        radius: SMOKE_RADIUS,
        remainingTurns: SMOKE_DURATION_TURNS,
      };

      let nextRound = round;
      let nextSelectedUnitId: number | null = newAp > 0
        ? unit.id
        : getNextAvailableUnitId(nextUnits, round.activeTeam, unit.id);
      let nextSmokes = [...state.smokes, smoke];

      if (nextSelectedUnitId === null) {
        const advanced = advanceTurn(round, nextUnits, nextSmokes);
        nextUnits = advanced.units;
        nextRound = advanced.round;
        nextSmokes = advanced.smokes;
        nextSelectedUnitId = getFirstAvailableUnitId(nextUnits, nextRound.activeTeam);
      }

      const movement = getMovementForSelection(nextUnits, nextSelectedUnitId, mapData, nextRound);

      set({
        units: nextUnits,
        round: nextRound,
        selectedUnitId: nextSelectedUnitId,
        hoveredTile: null,
        movementTiles: movement.movementTiles,
        walkableTiles: movement.walkableTiles,
        pathPreview: [],
        inputMode: 'move',
        smokes: nextSmokes,
      });
    },

    shootUnit: (targetId) => {
      const state = get();
      if (state.isExecuting) return;
      const { selectedUnitId, units, map: mapData, round } = state;
      if (selectedUnitId === null || selectedUnitId === targetId) return;

      const shooterIdx = units.findIndex((unit) => unit.id === selectedUnitId);
      const targetIdx = units.findIndex((unit) => unit.id === targetId);
      if (shooterIdx === -1 || targetIdx === -1) return;

      const shooter = units[shooterIdx];
      const target = units[targetIdx];
      if (!shooter.alive || !target.alive || shooter.ap <= 0) return;
      if (shooter.team !== round.activeTeam || target.team === shooter.team) return;
      if (round.phase === 'setup' && !RULES.setupFiringAllowed) return;

      const shotPreview = getShotPreview(mapData, shooter, target, 0, target.position, state.smokes);
      if (!shotPreview.hasLineOfSight || !shotPreview.inRange) return;

      const event = resolveShot(mapData, shooter, target, target.position, 0, 'direct_fire', state.smokes);
      const distance = tileDistance(shooter.position, target.position);
      let nextUnits = [...units];
      const newTargetHp = event.hit ? Math.max(0, target.hp - event.damage) : target.hp;
      nextUnits[targetIdx] = {
        ...target,
        hp: newTargetHp,
        alive: newTargetHp > 0,
      };
      nextUnits[shooterIdx] = {
        ...shooter,
        ap: Math.max(0, shooter.ap - 1),
        shotsFiredThisTurn: shooter.shotsFiredThisTurn + 1,
        facing: {
          x: Math.round((target.position.x - shooter.position.x) / (distance || 1)),
          y: Math.round((target.position.y - shooter.position.y) / (distance || 1)),
        },
      };

      let nextRound = round;
      let nextSmokes = state.smokes;
      let nextSelectedUnitId = nextUnits[shooterIdx].ap > 0
        ? shooter.id
        : getNextAvailableUnitId(nextUnits, round.activeTeam, shooter.id);
      if (nextSelectedUnitId === null) {
        const advanced = advanceTurn(round, nextUnits, state.smokes);
        nextUnits = advanced.units;
        nextRound = advanced.round;
        nextSmokes = advanced.smokes;
        nextSelectedUnitId = getFirstAvailableUnitId(nextUnits, nextRound.activeTeam);
      }

      const movement = getMovementForSelection(nextUnits, nextSelectedUnitId, mapData, nextRound);

      set({
        units: nextUnits,
        round: nextRound,
        selectedUnitId: nextSelectedUnitId,
        movementTiles: movement.movementTiles,
        walkableTiles: movement.walkableTiles,
        hoveredTile: null,
        pathPreview: [],
        inputMode: 'move',
        smokes: nextSmokes,
        combatLog: [event, ...state.combatLog].slice(0, 8),
      });
    },

    queueMove: (targetTile) => {
      const state = get();
      if (state.isExecuting) return;
      const { selectedUnitId, units, map: mapData, round } = state;
      if (selectedUnitId === null) return;

      const unit = units.find((u) => u.id === selectedUnitId);
      if (!unit || !unit.alive || unit.ap <= 0 || unit.team !== round.activeTeam) return;

      const isInRange = state.walkableTiles.some(
        (t) => t.x === targetTile.x && t.y === targetTile.y
      );
      if (!isInRange) return;

      const existingPlans = state.plannedActions.filter((action) => action.unitId !== unit.id);
      const plannedMovingUnitIds = new Set(existingPlans.map((action) => action.unitId));
      const duplicateTarget = existingPlans.some(
        (action) => action.target.x === targetTile.x && action.target.y === targetTile.y
      );
      const occupiedByStationaryUnit = units.some(
        (other) => other.alive &&
          other.id !== unit.id &&
          other.position.x === targetTile.x &&
          other.position.y === targetTile.y &&
          !plannedMovingUnitIds.has(other.id)
      );
      if (duplicateTarget || occupiedByStationaryUnit) return;

      const path = findPath(mapData, unit.position, targetTile);
      if (path.length === 0) return;

      const rangePerAP = getMoveRangePerAP(unit, round.phase === 'setup');
      const apCost = Math.ceil(path.length / rangePerAP);
      if (apCost > unit.ap) return;

      const plannedAction: PlannedAction = {
        id: `${unit.id}:move`,
        unitId: unit.id,
        team: unit.team,
        kind: 'move',
        from: { ...unit.position },
        target: { ...targetTile },
        path,
        apCost,
        summary: `${unit.name} move to ${mapData.grid[targetTile.y]?.[targetTile.x]?.label ?? 'tile'}`,
      };

      const plannedActions = [...existingPlans, plannedAction];
      const nextSelectedUnitId = getNextUnplannedUnitId(
        units,
        round.activeTeam,
        unit.id,
        plannedActions
      ) ?? unit.id;
      const movement = getMovementForSelection(units, nextSelectedUnitId, mapData, round);

      set({
        plannedActions,
        selectedUnitId: nextSelectedUnitId,
        movementTiles: movement.movementTiles,
        walkableTiles: movement.walkableTiles,
        hoveredTile: null,
        pathPreview: [],
        inputMode: 'move',
      });
    },

    commitPlannedActions: async () => {
      const state = get();
      if (state.isExecuting) return;

      const { round, map: mapData } = state;
      const activePlans = state.plannedActions.filter((action) => action.team === round.activeTeam);
      if (activePlans.length === 0) return;

      const movingUnitIds = new Set(activePlans.map((action) => action.unitId));
      const claimedTargets = new Set<string>();
      let nextUnits = [...state.units];
      let contactEvent: CombatEvent | null = null;
      let consumedHeldAngleId: string | null = null;
      const runtimes: Array<{
        action: PlannedAction;
        pathToTravel: TileCoord[];
        crossedAngle: HeldAngle | null;
        contactTile: TileCoord | null;
        rangePerAP: number;
        tilesMoved: number;
        stopped: boolean;
      }> = [];

      for (const action of activePlans) {
        const unitIdx = nextUnits.findIndex((unit) => unit.id === action.unitId);
        if (unitIdx === -1) continue;

        const unit = nextUnits[unitIdx];
        if (!unit.alive || unit.ap < action.apCost) continue;

        const targetKey = `${action.target.x},${action.target.y}`;
        const duplicateTarget = claimedTargets.has(targetKey);
        const occupiedByStationaryUnit = nextUnits.some(
          (other) => other.alive &&
            other.id !== unit.id &&
            other.position.x === action.target.x &&
            other.position.y === action.target.y &&
            !movingUnitIds.has(other.id)
        );
        if (duplicateTarget || occupiedByStationaryUnit) continue;
        claimedTargets.add(targetKey);

        const canTriggerHeldAngles = round.phase !== 'setup' || RULES.setupOverwatchAllowed;
        const crossedAngle = canTriggerHeldAngles
          ? getCrossingHeldAngles(state.heldAngles, action.path, unit.team)[0] ?? null
          : null;
        const contactTile = crossedAngle ? getFirstCrossingTile(crossedAngle, action.path) : null;
        const rangePerAP = getMoveRangePerAP(unit, round.phase === 'setup');
        const contactIndex = contactTile
          ? action.path.findIndex((tile) => tile.x === contactTile.x && tile.y === contactTile.y)
          : -1;
        const pathToTravel = contactIndex >= 0
          ? action.path.slice(0, contactIndex + 1)
          : action.path;

        runtimes.push({
          action,
          pathToTravel,
          crossedAngle,
          contactTile,
          rangePerAP,
          tilesMoved: 0,
          stopped: false,
        });
      }

      if (runtimes.length === 0) {
        set({
          planningMode: false,
          plannedActions: [],
          pathPreview: [],
          isExecuting: false,
        });
        return;
      }

      set({
        planningMode: false,
        isExecuting: true,
        hoveredTile: null,
        movementTiles: [],
        walkableTiles: [],
        pathPreview: [],
        inputMode: 'move',
      });

      const maxSteps = Math.max(...runtimes.map((runtime) => runtime.pathToTravel.length));
      for (let step = 0; step < maxSteps; step++) {
        let movedThisStep = false;
        let stepSelectedUnitId = state.selectedUnitId;

        for (const runtime of runtimes) {
          if (runtime.stopped || step >= runtime.pathToTravel.length) continue;

          const unitIdx = nextUnits.findIndex((unit) => unit.id === runtime.action.unitId);
          if (unitIdx === -1) {
            runtime.stopped = true;
            continue;
          }

          const unit = nextUnits[unitIdx];
          if (!unit.alive) {
            runtime.stopped = true;
            continue;
          }

          const destination = runtime.pathToTravel[step];
          const dx = destination.x - unit.position.x;
          const dy = destination.y - unit.position.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;

          nextUnits = [...nextUnits];
          nextUnits[unitIdx] = {
            ...unit,
            position: { ...destination },
            hasMoved: true,
            facing: { x: Math.round(dx / len), y: Math.round(dy / len) },
          };
          runtime.tilesMoved = step + 1;
          stepSelectedUnitId = runtime.action.unitId;
          movedThisStep = true;
        }

        if (movedThisStep) {
          set({
            units: nextUnits,
            selectedUnitId: stepSelectedUnitId,
            hoveredTile: null,
            movementTiles: [],
            walkableTiles: [],
            pathPreview: [],
          });
          await wait(EXECUTION_STEP_MS);
        }

        for (const runtime of runtimes) {
          if (!runtime.crossedAngle || !runtime.contactTile || runtime.stopped) continue;
          const unit = nextUnits.find((candidate) => candidate.id === runtime.action.unitId);
          if (!unit || !unit.alive) {
            runtime.stopped = true;
            continue;
          }
          const atContact = unit.position.x === runtime.contactTile.x && unit.position.y === runtime.contactTile.y;
          if (!atContact) continue;

          const attacker = nextUnits.find((candidate) => candidate.id === runtime.crossedAngle!.unitId);
          if (!attacker?.alive) {
            runtime.stopped = true;
            continue;
          }

          const reactionPreview = getShotPreview(mapData, attacker, unit, runtime.crossedAngle.aimBonus, runtime.contactTile, state.smokes);
          if (reactionPreview.hasLineOfSight && reactionPreview.inRange) {
            contactEvent = resolveReactionFire(mapData, attacker, unit, runtime.contactTile, runtime.crossedAngle, state.smokes);
            consumedHeldAngleId = runtime.crossedAngle.id;
            const targetIdx = nextUnits.findIndex((candidate) => candidate.id === unit.id);
            if (targetIdx !== -1 && contactEvent.hit) {
              const newHp = Math.max(0, nextUnits[targetIdx].hp - contactEvent.damage);
              nextUnits = [...nextUnits];
              nextUnits[targetIdx] = {
                ...nextUnits[targetIdx],
                hp: newHp,
                alive: newHp > 0,
              };
            }
            runtime.stopped = true;
            break;
          }
        }

        if (contactEvent) break;
      }

      for (const runtime of runtimes) {
        if (runtime.tilesMoved <= 0) continue;
        const unitIdx = nextUnits.findIndex((unit) => unit.id === runtime.action.unitId);
        if (unitIdx === -1) continue;
        const unit = nextUnits[unitIdx];
        const apCost = Math.max(
          1,
          Math.min(runtime.action.apCost, Math.ceil(runtime.tilesMoved / runtime.rangePerAP))
        );
        nextUnits = [...nextUnits];
        nextUnits[unitIdx] = {
          ...unit,
          ap: Math.max(0, unit.ap - apCost),
          hasMoved: true,
        };
      }

      let nextRound = round;
      let nextSmokes = state.smokes;
      let selectedUnitId = contactEvent
        ? (nextUnits.find((unit) => unit.id === contactEvent!.targetId && unit.alive)?.id ?? getFirstAvailableUnitId(nextUnits, round.activeTeam))
        : getFirstAvailableUnitId(nextUnits, round.activeTeam);
      if (!contactEvent && selectedUnitId === null) {
        const advanced = advanceTurn(round, nextUnits, state.smokes);
        nextUnits = advanced.units;
        nextRound = advanced.round;
        nextSmokes = advanced.smokes;
        selectedUnitId = getFirstAvailableUnitId(nextUnits, nextRound.activeTeam);
      }

      const movement = getMovementForSelection(nextUnits, selectedUnitId, mapData, nextRound);
      const combatLog = contactEvent
        ? [contactEvent, ...state.combatLog].slice(0, 8)
        : state.combatLog;

      set({
        units: nextUnits,
        round: nextRound,
        selectedUnitId,
        hoveredTile: null,
        movementTiles: movement.movementTiles,
        walkableTiles: movement.walkableTiles,
        pathPreview: [],
        plannedActions: [],
        isExecuting: false,
        inputMode: contactEvent ? 'shoot' : 'move',
        heldAngles: state.heldAngles.filter((angle) => (
          !movingUnitIds.has(angle.unitId) &&
          angle.id !== consumedHeldAngleId
        )),
        smokes: nextSmokes,
        combatLog,
      });
    },

    clearPlannedActions: () => {
      set({ plannedActions: [], pathPreview: [] });
    },

    setPlanningMode: (enabled) => {
      if (get().isExecuting) return;
      set({
        planningMode: enabled,
        plannedActions: enabled ? get().plannedActions : [],
        inputMode: 'move',
        pathPreview: [],
      });
    },

    finishUnit: () => {
      const state = get();
      if (state.isExecuting) return;
      const { selectedUnitId, units, round, map: mapData } = state;
      if (selectedUnitId === null) return;

      const unitIdx = units.findIndex((u) => u.id === selectedUnitId);
      if (unitIdx === -1) return;

      const unit = units[unitIdx];
      if (!unit.alive || unit.team !== round.activeTeam) return;

      let nextUnits = [...units];
      nextUnits[unitIdx] = {
        ...unit,
        ap: 0,
        hasMoved: true,
      };

      let nextRound = round;
      let nextSmokes = state.smokes;
      let nextSelectedUnitId = getNextAvailableUnitId(nextUnits, round.activeTeam, unit.id);
      if (nextSelectedUnitId === null) {
        const advanced = advanceTurn(round, nextUnits, state.smokes);
        nextUnits = advanced.units;
        nextRound = advanced.round;
        nextSmokes = advanced.smokes;
        nextSelectedUnitId = getFirstAvailableUnitId(nextUnits, nextRound.activeTeam);
      }

      let movementTiles: MovementTile[] = [];
      let walkableTiles: TileCoord[] = [];
      if (nextSelectedUnitId !== null) {
        const nextUnit = nextUnits.find((u) => u.id === nextSelectedUnitId);
        if (nextUnit) {
          const movement = getMovementState(nextUnit, mapData, nextRound.phase === 'setup');
          movementTiles = movement.movementTiles;
          walkableTiles = movement.walkableTiles;
        }
      }

      set({
        units: nextUnits,
        round: nextRound,
        selectedUnitId: nextSelectedUnitId,
        hoveredTile: null,
        movementTiles,
        walkableTiles,
        pathPreview: [],
        inputMode: 'move',
        smokes: nextSmokes,
      });
    },

    endTurn: () => {
      const state = get();
      if (state.isExecuting) return;
      const advanced = advanceTurn(state.round, state.units, state.smokes);
      const selectedUnitId = getFirstAvailableUnitId(advanced.units, advanced.round.activeTeam);
      let movementTiles: MovementTile[] = [];
      let walkableTiles: TileCoord[] = [];

      if (selectedUnitId !== null) {
        const unit = advanced.units.find((u) => u.id === selectedUnitId);
        if (unit) {
          const movement = getMovementState(unit, state.map, advanced.round.phase === 'setup');
          movementTiles = movement.movementTiles;
          walkableTiles = movement.walkableTiles;
        }
      }

      set({
        units: advanced.units,
        round: advanced.round,
        selectedUnitId,
        hoveredTile: null,
        walkableTiles,
        movementTiles,
        pathPreview: [],
        plannedActions: [],
        isExecuting: false,
        inputMode: 'move',
        smokes: advanced.smokes,
      });
    },

    initGame: () => {
      const newMap = createInfernoMap();
      const newUnits = createUnits();
      set({
        map: newMap,
        units: newUnits,
        round: {
          phase: 'setup',
          turn: 1,
          activeTeam: 'T',
          bombPlanted: false,
          bombDefused: false,
          bombPosition: null,
          bombTimer: RULES.bombTimerTurns,
          bombCarrierId: 0,
          roundTimer: RULES.roundTimeLimitTurns,
        },
        selectedUnitId: null,
        hoveredTile: null,
        walkableTiles: [],
        movementTiles: [],
        pathPreview: [],
        planningMode: false,
        plannedActions: [],
        isExecuting: false,
        inputMode: 'move',
        heldAngles: [],
        smokes: [],
        combatLog: [],
      });
    },

    startContactDrill: () => {
      if (get().isExecuting) return;
      const mapData = createInfernoMap();
      const nextUnits = createUnits();
      const tEntryId = 0;
      const ctAnchorId = 5;
      const tStart = findNearestWalkable(mapData, { x: 43, y: 57 });
      const ctHold = findNearestWalkable(mapData, { x: 43, y: 67 });
      const holdTarget = findNearestWalkable(mapData, { x: 43, y: 57 });

      nextUnits[tEntryId] = {
        ...nextUnits[tEntryId],
        position: tStart,
        ap: nextUnits[tEntryId].maxAp,
        smokeGrenades: 1,
        facing: { x: 1, y: 1 },
      };
      nextUnits[ctAnchorId] = {
        ...nextUnits[ctAnchorId],
        position: ctHold,
        ap: 0,
        facing: { x: -1, y: -1 },
      };

      const heldAngle: HeldAngle = {
        id: `${ctAnchorId}:hold`,
        unitId: ctAnchorId,
        team: 'CT',
        origin: { ...ctHold },
        target: { ...holdTarget },
        laneTiles: getWatchedLane(
          mapData,
          ctHold,
          holdTarget,
          Math.max(4, Math.min(nextUnits[ctAnchorId].weapon.rangeMax, 24))
        ),
        remainingShots: 1,
        aimBonus: 5,
      };

      const round: RoundState = {
        phase: 'combat',
        turn: RULES.setupPhaseTurns + 1,
        activeTeam: 'T',
        bombPlanted: false,
        bombDefused: false,
        bombPosition: null,
        bombTimer: RULES.bombTimerTurns,
        bombCarrierId: tEntryId,
        roundTimer: RULES.roundTimeLimitTurns,
      };
      const movement = getMovementForSelection(nextUnits, tEntryId, mapData, round);

      set({
        map: mapData,
        units: nextUnits,
        round,
        selectedUnitId: tEntryId,
        hoveredTile: null,
        walkableTiles: movement.walkableTiles,
        movementTiles: movement.movementTiles,
        pathPreview: [],
        planningMode: true,
        plannedActions: [],
        isExecuting: false,
        inputMode: 'move',
        heldAngles: [heldAngle],
        smokes: [],
        combatLog: [],
      });
    },
  };
});
