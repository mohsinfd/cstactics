export type BananaExecuteAudioSlot =
  | 'ui_confirm'
  | 'ui_deny'
  | 'movement_start'
  | 'movement_stop'
  | 'rifle_shot'
  | 'awp_shot'
  | 'hit'
  | 'kill'
  | 'flash_pop'
  | 'smoke_bloom'
  | 'plant_start'
  | 'contact_sting'
  | 'round_win'
  | 'round_loss';

export interface BananaExecuteAudioAssetSlot {
  slot: BananaExecuteAudioSlot;
  bus: 'ui' | 'movement' | 'utility' | 'combat' | 'reaction' | 'impact';
  fallback: 'procedural';
  assetUrl: string | null;
  notes: string;
}

export const BANANA_EXECUTE_AUDIO_MANIFEST: BananaExecuteAudioAssetSlot[] = [
  { slot: 'ui_confirm', bus: 'ui', fallback: 'procedural', assetUrl: null, notes: 'Short accepted-action click.' },
  { slot: 'ui_deny', bus: 'ui', fallback: 'procedural', assetUrl: null, notes: 'Short rejected-action click.' },
  { slot: 'movement_start', bus: 'movement', fallback: 'procedural', assetUrl: null, notes: 'Boot/gear start for one tile route.' },
  { slot: 'movement_stop', bus: 'movement', fallback: 'procedural', assetUrl: null, notes: 'Stop-brace cloth/boot settle.' },
  { slot: 'rifle_shot', bus: 'combat', fallback: 'procedural', assetUrl: null, notes: 'AK/M4/Galil/FAMAS single shot.' },
  { slot: 'awp_shot', bus: 'combat', fallback: 'procedural', assetUrl: null, notes: 'Reserved for future AWP scenario variants.' },
  { slot: 'hit', bus: 'impact', fallback: 'procedural', assetUrl: null, notes: 'Body armor impact.' },
  { slot: 'kill', bus: 'impact', fallback: 'procedural', assetUrl: null, notes: 'Downed-unit impact accent.' },
  { slot: 'flash_pop', bus: 'utility', fallback: 'procedural', assetUrl: null, notes: 'Pop flash bloom.' },
  { slot: 'smoke_bloom', bus: 'utility', fallback: 'procedural', assetUrl: null, notes: 'Smoke canister bloom.' },
  { slot: 'plant_start', bus: 'utility', fallback: 'procedural', assetUrl: null, notes: 'Bomb plant start/confirm.' },
  { slot: 'contact_sting', bus: 'reaction', fallback: 'procedural', assetUrl: null, notes: 'Held-angle contact accent.' },
  { slot: 'round_win', bus: 'ui', fallback: 'procedural', assetUrl: null, notes: 'Scenario success sting.' },
  { slot: 'round_loss', bus: 'ui', fallback: 'procedural', assetUrl: null, notes: 'Scenario failure sting.' },
];
