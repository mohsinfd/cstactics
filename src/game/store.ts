// ============================================================
// Zustand Game Store — single source of truth for CS2 Tactics.
//
// Movement system:
//   - Each unit has 2 AP per turn
//   - 1 AP = move up to (mobility / 2) tiles
//   - Setup phase (turns 1-2): sprint bonus +6 tiles per AP
//   - Moving deducts AP based on distance moved
//   - When AP = 0, unit is done for the turn
//   - "End Turn" advances to next team / next turn
// ============================================================
import { create } from 'zustand';
import type { GameState, Unit, TileCoord, Team, RoleId } from './types';
import { createInfernoMap } from './maps/inferno';
import { ROLES, T_ROSTER, CT_ROSTER } from './config/roles';
import { getDefaultWeapon } from './config/weapons';
import { RULES } from './config/rules';
import { findPath, getWalkableRange } from './pathfinding';

// Movement range per AP point
function getMoveRangePerAP(unit: Unit, isSetupPhase: boolean): number {
  const base = Math.floor(unit.role.mobility / 2);
  const sprint = isSetupPhase ? Math.floor(RULES.setupSprintBonus / 2) : 0;
  return base + sprint;
}

// Total move range for remaining AP
function getTotalMoveRange(unit: Unit, isSetupPhase: boolean): number {
  return getMoveRangePerAP(unit, isSetupPhase) * unit.ap;
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
  endTurn: () => void;
  initGame: () => void;
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
    pathPreview: [],

    selectUnit: (id) => {
      const state = get();
      if (id === null) {
        set({ selectedUnitId: null, walkableTiles: [], pathPreview: [] });
        return;
      }

      const unit = state.units.find((u) => u.id === id);
      if (!unit || !unit.alive) {
        set({ selectedUnitId: null, walkableTiles: [], pathPreview: [] });
        return;
      }

      // Only select units from the active team
      if (unit.team !== state.round.activeTeam) {
        set({ selectedUnitId: null, walkableTiles: [], pathPreview: [] });
        return;
      }

      // No AP left? Can still select but no walkable tiles
      if (unit.ap <= 0) {
        set({ selectedUnitId: id, walkableTiles: [], pathPreview: [] });
        return;
      }

      const isSetup = state.round.phase === 'setup';
      const range = getTotalMoveRange(unit, isSetup);
      const walkable = getWalkableRange(state.map, unit.position, range);

      set({ selectedUnitId: id, walkableTiles: walkable, pathPreview: [] });
    },

    hoverTile: (tile) => {
      if (!tile) {
        set({ hoveredTile: null, pathPreview: [] });
        return;
      }

      const state = get();
      if (state.selectedUnitId === null) {
        set({ hoveredTile: tile });
        return;
      }

      const unit = state.units.find((u) => u.id === state.selectedUnitId);
      if (!unit || unit.ap <= 0) {
        set({ hoveredTile: tile });
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

    moveUnit: (targetTile) => {
      const state = get();
      const { selectedUnitId, units, map: mapData, walkableTiles, round } = state;

      if (selectedUnitId === null) return;

      const unitIdx = units.findIndex((u) => u.id === selectedUnitId);
      if (unitIdx === -1) return;

      const unit = units[unitIdx];
      if (!unit.alive || unit.ap <= 0) return;
      if (unit.team !== round.activeTeam) return;

      const isInRange = walkableTiles.some(
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

      // Facing direction
      const dx = targetTile.x - unit.position.x;
      const dy = targetTile.y - unit.position.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;

      const newUnits = [...units];
      const newAp = Math.max(0, unit.ap - apCost);
      newUnits[unitIdx] = {
        ...unit,
        position: { ...targetTile },
        ap: newAp,
        hasMoved: true,
        facing: { x: Math.round(dx / len), y: Math.round(dy / len) },
      };

      // Recompute walkable range with remaining AP
      let newWalkable: TileCoord[] = [];
      if (newAp > 0) {
        const remainingRange = rangePerAP * newAp;
        newWalkable = getWalkableRange(mapData, targetTile, remainingRange);
      }

      set({ units: newUnits, walkableTiles: newWalkable, pathPreview: [] });
    },

    endTurn: () => {
      const state = get();
      const { round, units } = state;

      let nextTeam: Team;
      let nextTurn = round.turn;
      let nextPhase = round.phase;

      if (round.activeTeam === 'T') {
        // T just finished, now CT's turn (same turn number)
        nextTeam = 'CT';
      } else {
        // CT just finished, advance turn number
        nextTeam = 'T';
        nextTurn = round.turn + 1;

        // Check phase transitions
        if (nextTurn > RULES.setupPhaseTurns && round.phase === 'setup') {
          nextPhase = 'combat';
        }
      }

      // Reset AP for the team that's about to play
      const newUnits = units.map((u) => {
        if (u.team === nextTeam && u.alive) {
          return { ...u, ap: u.maxAp, hasMoved: false, shotsFiredThisTurn: 0 };
        }
        return u;
      });

      set({
        units: newUnits,
        round: {
          ...round,
          activeTeam: nextTeam,
          turn: nextTurn,
          phase: nextPhase,
          roundTimer: round.phase === 'setup' ? round.roundTimer : round.roundTimer - 1,
        },
        selectedUnitId: null,
        walkableTiles: [],
        pathPreview: [],
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
        pathPreview: [],
      });
    },
  };
});
