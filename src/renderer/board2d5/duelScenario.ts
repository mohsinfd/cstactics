import type { Board2d5Event, Board2d5EventType } from './types';

export type BoardDuelPhase =
  | 'ready'
  | 'move-select'
  | 'moving'
  | 'aiming'
  | 'invalid'
  | 'firing'
  | 'impact'
  | 'down';

export type BoardDuelMode = 'idle' | 'move' | 'shoot';

export const BOARD_DUEL_TIMING = {
  moveMs: 520,
  invalidMs: 680,
  aimRaiseMs: 180,
  shotToImpactMs: 300,
  casualtySettleMs: 680,
} as const;

export const boardDuelPhaseCopy: Record<BoardDuelPhase, string> = {
  ready: 'CT anchor ready. Choose move or shot.',
  'move-select': 'Pick a blue floor tile.',
  moving: 'CT shifts into the angle.',
  aiming: 'Target lock: 70%. Click the T.',
  invalid: 'Invalid command.',
  firing: 'AWP fired through B lane.',
  impact: 'Hit confirmed.',
  down: 'Entry down. B lane held.',
};

let sequence = 0;

export function createBoard2d5Event(
  type: Board2d5EventType,
  label: string,
  details: Omit<Board2d5Event, 'id' | 'type' | 'createdAt' | 'label'> = {}
): Board2d5Event {
  sequence += 1;
  return {
    id: `${Date.now()}:${sequence}:${type}`,
    type,
    createdAt: Date.now() + sequence / 1000,
    label,
    ...details,
  };
}

