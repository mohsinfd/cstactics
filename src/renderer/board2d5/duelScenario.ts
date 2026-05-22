import type { Board2d5Event, Board2d5EventType } from './types';

export type BoardDuelPhase =
  | 'ready'
  | 'move-select'
  | 'moving'
  | 'contact'
  | 'aiming'
  | 'invalid'
  | 'firing'
  | 'impact'
  | 'trading'
  | 'trade-impact'
  | 'down';

export type BoardDuelMode = 'idle' | 'move' | 'shoot';

export const BOARD_DUEL_TIMING = {
  moveMs: 520,
  contactSettleMs: 460,
  invalidMs: 680,
  aimRaiseMs: 180,
  shotToImpactMs: 300,
  casualtySettleMs: 680,
  tradeImpactMs: 320,
  tradeSettleMs: 620,
} as const;

export const boardDuelPhaseCopy: Record<BoardDuelPhase, string> = {
  ready: 'CT entry ready. Move into the B contact.',
  'move-select': 'Pick a blue contact tile.',
  moving: 'CT entry swings into the held angle.',
  contact: 'Contact! Entry down. Trade is available.',
  aiming: 'Target lock: 70%. Click the T.',
  invalid: 'Invalid command.',
  firing: 'T anchor fires through B lane.',
  impact: 'Entry hit.',
  trading: 'Second CT takes the trade.',
  'trade-impact': 'T anchor hit.',
  down: 'Trade secured. Site pressure cracked.',
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
