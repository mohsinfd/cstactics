import { useEffect, useRef } from 'react';
import { useGameStore } from '../game/store';
import type { CombatEvent, FeedbackEvent } from '../game/types';
import { getShotPresentation } from '../game/shotPresentation';
import { FEEDBACK_CUE_BUS, clampAudioIntensity, mixGain } from './audioPresentation';

type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  const AudioContextCtor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  if (!AudioContextCtor) return null;

  sharedAudioContext ??= new AudioContextCtor();
  return sharedAudioContext;
}

function playNoiseBurst(ctx: AudioContext, when: number, duration: number, gainValue: number): void {
  const samples = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < samples; i++) {
    const decay = 1 - i / samples;
    data[i] = (Math.random() * 2 - 1) * decay * decay;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(900, when);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(gainValue, when + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  source.start(when);
  source.stop(when + duration);
}

function playTone(
  ctx: AudioContext,
  when: number,
  frequency: number,
  duration: number,
  gainValue: number,
  type: OscillatorType
): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, when);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(35, frequency * 0.48), when + duration);

  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(gainValue, when + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(when);
  oscillator.stop(when + duration);
}

function playUiTick(ctx: AudioContext, when: number, frequency: number, gainValue: number): void {
  playTone(ctx, when, frequency, 0.045, gainValue, 'triangle');
}

function playReactionSting(
  ctx: AudioContext,
  when: number,
  event: CombatEvent,
  shot: ReturnType<typeof getShotPresentation>
): void {
  const weight = shot.audioGainScale;
  const hitWeight = event.hit ? 1 : 0.62;

  playTone(ctx, when + 0.012, shot.shotToneHz * 1.55, 0.07, mixGain('reaction', 0.018, weight * hitWeight), 'triangle');
  playNoiseBurst(ctx, when + 0.025, shot.noiseDurationSeconds + 0.06, mixGain('reaction', 0.045, weight * hitWeight));

  if (event.hit) {
    playTone(ctx, when + 0.055, Math.max(42, shot.impactToneHz * 0.72), 0.2, mixGain('impact', 0.052, weight), 'sawtooth');
    playTone(ctx, when + 0.085, 240 + shot.impactToneHz, 0.075, mixGain('impact', 0.022, weight), 'triangle');
  }

  if (event.killed) {
    playTone(ctx, when + 0.12, 44, 0.34, mixGain('impact', 0.082, weight), 'sawtooth');
    playNoiseBurst(ctx, when + 0.14, 0.18, mixGain('impact', 0.052, weight));
  }
}

function playCombatCue(event: CombatEvent, scheduleOffsetSeconds = 0): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  void ctx.resume();

  const now = ctx.currentTime + 0.015 + scheduleOffsetSeconds;
  const isReaction = event.type === 'reaction_fire';
  const shot = getShotPresentation(event.weaponCategory);
  const baseGain = isReaction ? 0.12 : 0.095;
  const shotBus = isReaction ? 'reaction' : 'combat';

  playNoiseBurst(
    ctx,
    now,
    shot.noiseDurationSeconds + (isReaction ? 0.025 : 0),
    mixGain(shotBus, event.hit ? baseGain : baseGain * 0.7, shot.audioGainScale)
  );
  playTone(
    ctx,
    now,
    isReaction ? shot.shotToneHz * 0.82 : shot.shotToneHz,
    isReaction ? 0.12 : 0.09,
    mixGain(shotBus, event.hit ? 0.035 : 0.02, shot.audioGainScale),
    event.weaponCategory === 'sniper' ? 'sawtooth' : 'square'
  );
  if (isReaction) {
    playReactionSting(ctx, now, event, shot);
  }

  if (event.hit) {
    playTone(ctx, now + 0.045, event.damage >= 45 ? shot.impactToneHz : Math.max(70, shot.impactToneHz * 1.18), 0.16, mixGain('impact', 0.055, shot.audioGainScale), 'sine');
    if (event.critical) {
      playTone(ctx, now + 0.025, 720, 0.09, mixGain('impact', 0.035), 'triangle');
      playTone(ctx, now + 0.07, 420, 0.12, mixGain('impact', 0.026), 'square');
    }
    if (event.killed) {
      playTone(ctx, now + 0.12, 48, 0.24, mixGain('impact', 0.06), 'sawtooth');
      playNoiseBurst(ctx, now + 0.1, 0.15, mixGain('impact', 0.035));
    }
  } else {
    playTone(ctx, now + 0.055, 310, 0.07, mixGain('combat', 0.018), 'triangle');
  }
}

function playFeedbackCue(event: FeedbackEvent, scheduleOffsetSeconds = 0): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  void ctx.resume();

  const now = ctx.currentTime + 0.01 + scheduleOffsetSeconds;
  const intensity = clampAudioIntensity(event.intensity);
  const gain = (gainValue: number) => mixGain(FEEDBACK_CUE_BUS[event.type], gainValue, intensity);

  if (event.type === 'move_step') {
    playNoiseBurst(ctx, now, 0.038, gain(0.018));
    playTone(ctx, now, event.team === 'CT' ? 96 : 116, 0.055, gain(0.012), 'sine');
    return;
  }

  if (event.type === 'move_complete') {
    playUiTick(ctx, now, 185, gain(0.022));
    playUiTick(ctx, now + 0.035, 245, gain(0.016));
    return;
  }

  if (event.type === 'select_unit') {
    playUiTick(ctx, now, event.team === 'CT' ? 360 : 430, gain(0.012));
    return;
  }

  if (event.type === 'plan_add') {
    playUiTick(ctx, now, 280, gain(0.016));
    playUiTick(ctx, now + 0.045, 410, gain(0.011));
    return;
  }

  if (event.type === 'hold_angle') {
    playTone(ctx, now, 150, 0.075, gain(0.018), 'sawtooth');
    playUiTick(ctx, now + 0.055, 320, gain(0.01));
    return;
  }

  if (event.type === 'smoke_throw') {
    playNoiseBurst(ctx, now, 0.12, gain(0.04));
    playTone(ctx, now + 0.02, 85, 0.11, gain(0.018), 'sine');
    return;
  }

  if (event.type === 'flash_throw') {
    playUiTick(ctx, now, 620, gain(0.018));
    playTone(ctx, now + 0.02, 1240, 0.09, gain(0.018), 'triangle');
    playNoiseBurst(ctx, now + 0.035, 0.05, gain(0.025));
    return;
  }

  if (event.type === 'turn_change' || event.type === 'ai_start' || event.type === 'ai_end') {
    playUiTick(ctx, now, event.type === 'ai_end' ? 260 : 210, gain(0.02));
    playUiTick(ctx, now + 0.055, event.type === 'ai_end' ? 360 : 300, gain(0.014));
  }
}

export function AudioFeedback() {
  const combatEvents = useGameStore((state) => state.combatLog);
  const feedbackEvents = useGameStore((state) => state.feedbackEvents);
  const playedCombatIds = useRef<Set<string>>(new Set());
  const playedFeedbackIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const newEvents = combatEvents
      .filter((event) => !playedCombatIds.current.has(event.id))
      .sort((a, b) => a.createdAt - b.createdAt);

    newEvents.forEach((event, index) => {
      playedCombatIds.current.add(event.id);
      playCombatCue(event, index * 0.055);
    });
  }, [combatEvents]);

  useEffect(() => {
    const newEvents = feedbackEvents
      .filter((event) => !playedFeedbackIds.current.has(event.id))
      .sort((a, b) => a.createdAt - b.createdAt);

    newEvents.forEach((event, index) => {
      playedFeedbackIds.current.add(event.id);
      playFeedbackCue(event, index * 0.035);
    });
  }, [feedbackEvents]);

  return null;
}
