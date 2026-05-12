import { useEffect, useRef } from 'react';
import { useGameStore } from '../game/store';
import type { CombatEvent, FeedbackEvent } from '../game/types';

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

function playCombatCue(event: CombatEvent): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  void ctx.resume();

  const now = ctx.currentTime + 0.015;
  const isReaction = event.type === 'reaction_fire';
  const baseGain = isReaction ? 0.12 : 0.095;

  playNoiseBurst(ctx, now, isReaction ? 0.115 : 0.085, event.hit ? baseGain : baseGain * 0.7);
  playTone(ctx, now, isReaction ? 130 : 170, isReaction ? 0.12 : 0.09, event.hit ? 0.035 : 0.02, 'square');

  if (event.hit) {
    playTone(ctx, now + 0.045, event.damage >= 45 ? 70 : 92, 0.16, 0.055, 'sine');
    if (event.critical) {
      playTone(ctx, now + 0.025, 720, 0.09, 0.035, 'triangle');
      playTone(ctx, now + 0.07, 420, 0.12, 0.026, 'square');
    }
    if (event.killed) {
      playTone(ctx, now + 0.12, 48, 0.24, 0.06, 'sawtooth');
      playNoiseBurst(ctx, now + 0.1, 0.15, 0.035);
    }
  } else {
    playTone(ctx, now + 0.055, 310, 0.07, 0.018, 'triangle');
  }
}

function playFeedbackCue(event: FeedbackEvent): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  void ctx.resume();

  const now = ctx.currentTime + 0.01;
  const intensity = event.intensity ?? 1;

  if (event.type === 'move_step') {
    playNoiseBurst(ctx, now, 0.038, 0.018 * intensity);
    playTone(ctx, now, event.team === 'CT' ? 96 : 116, 0.055, 0.012 * intensity, 'sine');
    return;
  }

  if (event.type === 'move_complete') {
    playUiTick(ctx, now, 185, 0.022 * intensity);
    playUiTick(ctx, now + 0.035, 245, 0.016 * intensity);
    return;
  }

  if (event.type === 'select_unit') {
    playUiTick(ctx, now, event.team === 'CT' ? 360 : 430, 0.012 * intensity);
    return;
  }

  if (event.type === 'plan_add') {
    playUiTick(ctx, now, 280, 0.016 * intensity);
    playUiTick(ctx, now + 0.045, 410, 0.011 * intensity);
    return;
  }

  if (event.type === 'hold_angle') {
    playTone(ctx, now, 150, 0.075, 0.018 * intensity, 'sawtooth');
    playUiTick(ctx, now + 0.055, 320, 0.01 * intensity);
    return;
  }

  if (event.type === 'smoke_throw') {
    playNoiseBurst(ctx, now, 0.12, 0.04 * intensity);
    playTone(ctx, now + 0.02, 85, 0.11, 0.018 * intensity, 'sine');
    return;
  }

  if (event.type === 'flash_throw') {
    playUiTick(ctx, now, 620, 0.018 * intensity);
    playTone(ctx, now + 0.02, 1240, 0.09, 0.018 * intensity, 'triangle');
    playNoiseBurst(ctx, now + 0.035, 0.05, 0.025 * intensity);
    return;
  }

  if (event.type === 'turn_change' || event.type === 'ai_start' || event.type === 'ai_end') {
    playUiTick(ctx, now, event.type === 'ai_end' ? 260 : 210, 0.02 * intensity);
    playUiTick(ctx, now + 0.055, event.type === 'ai_end' ? 360 : 300, 0.014 * intensity);
  }
}

export function AudioFeedback() {
  const latestCombatEvent = useGameStore((state) => state.combatLog[0]);
  const latestFeedbackEvent = useGameStore((state) => state.feedbackEvents[0]);
  const lastCombatPlayedId = useRef<string | null>(null);
  const lastFeedbackPlayedId = useRef<string | null>(null);

  useEffect(() => {
    if (!latestCombatEvent || lastCombatPlayedId.current === latestCombatEvent.id) return;
    lastCombatPlayedId.current = latestCombatEvent.id;
    playCombatCue(latestCombatEvent);
  }, [latestCombatEvent]);

  useEffect(() => {
    if (!latestFeedbackEvent || lastFeedbackPlayedId.current === latestFeedbackEvent.id) return;
    lastFeedbackPlayedId.current = latestFeedbackEvent.id;
    playFeedbackCue(latestFeedbackEvent);
  }, [latestFeedbackEvent]);

  return null;
}
