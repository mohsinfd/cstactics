import type { Unit } from '../../game/types';
import type { LocomotionPose } from './LocomotionController';

export type UnitAnimationPose = LocomotionPose | 'hit' | 'dead';

export type UnitAnimationFrame = {
  name: string;
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  rotationDeg: number;
  shadowScaleX: number;
  shadowScaleY: number;
  shadowOffsetX: number;
  shadowOpacity: number;
  tint: string;
};

export type UnitAnimationClip = {
  fps: number;
  loop: boolean;
  frames: UnitAnimationFrame[];
};

const NEUTRAL_TINT = '#ffffff';
const HIT_TINT = '#ffd4dc';

const frame = (
  name: string,
  overrides: Partial<Omit<UnitAnimationFrame, 'name'>> = {}
): UnitAnimationFrame => ({
  name,
  offsetX: 0,
  offsetY: 0,
  scaleX: 1,
  scaleY: 1,
  rotationDeg: 0,
  shadowScaleX: 1,
  shadowScaleY: 1,
  shadowOffsetX: 0,
  shadowOpacity: 0.34,
  tint: NEUTRAL_TINT,
  ...overrides,
});

const CLIPS = {
  idle: {
    fps: 1,
    loop: true,
    frames: [frame('idle')],
  },
  run_forward: {
    fps: 14,
    loop: true,
    frames: [
      frame('run_forward_0', { offsetY: 0.02, scaleX: 0.99, scaleY: 1.03, rotationDeg: -1.2, shadowScaleX: 1.04 }),
      frame('run_forward_1', { offsetX: -0.018, offsetY: -0.012, scaleX: 1.03, scaleY: 0.98, rotationDeg: 1.8, shadowScaleX: 1.1, shadowScaleY: 0.96 }),
      frame('run_forward_2', { offsetY: 0.018, scaleX: 0.99, scaleY: 1.025, rotationDeg: 1.1, shadowScaleX: 1.04 }),
      frame('run_forward_3', { offsetX: 0.018, offsetY: -0.014, scaleX: 1.03, scaleY: 0.98, rotationDeg: -1.8, shadowScaleX: 1.1, shadowScaleY: 0.96 }),
    ],
  },
  diagonal_left: {
    fps: 13,
    loop: true,
    frames: [
      frame('diagonal_left_0', { offsetX: -0.026, offsetY: 0.01, rotationDeg: -4.4, scaleY: 1.02, shadowOffsetX: -0.018 }),
      frame('diagonal_left_1', { offsetX: -0.048, offsetY: -0.012, rotationDeg: -6.5, scaleX: 1.03, scaleY: 0.985, shadowScaleX: 1.08, shadowOffsetX: -0.03 }),
      frame('diagonal_left_2', { offsetX: -0.026, offsetY: 0.012, rotationDeg: -4.1, scaleY: 1.02, shadowOffsetX: -0.018 }),
      frame('diagonal_left_3', { offsetX: -0.006, offsetY: -0.01, rotationDeg: -2.7, scaleX: 1.02, scaleY: 0.99, shadowScaleX: 1.06 }),
    ],
  },
  diagonal_right: {
    fps: 13,
    loop: true,
    frames: [
      frame('diagonal_right_0', { offsetX: 0.026, offsetY: 0.01, rotationDeg: 4.4, scaleY: 1.02, shadowOffsetX: 0.018 }),
      frame('diagonal_right_1', { offsetX: 0.048, offsetY: -0.012, rotationDeg: 6.5, scaleX: 1.03, scaleY: 0.985, shadowScaleX: 1.08, shadowOffsetX: 0.03 }),
      frame('diagonal_right_2', { offsetX: 0.026, offsetY: 0.012, rotationDeg: 4.1, scaleY: 1.02, shadowOffsetX: 0.018 }),
      frame('diagonal_right_3', { offsetX: 0.006, offsetY: -0.01, rotationDeg: 2.7, scaleX: 1.02, scaleY: 0.99, shadowScaleX: 1.06 }),
    ],
  },
  strafe_left: {
    fps: 12,
    loop: true,
    frames: [
      frame('strafe_left_0', { offsetX: -0.045, rotationDeg: -8.5, scaleX: 1.035, scaleY: 0.99, shadowScaleX: 1.12, shadowOffsetX: -0.04 }),
      frame('strafe_left_1', { offsetX: -0.074, offsetY: 0.012, rotationDeg: -10.5, scaleX: 1.02, scaleY: 1.015, shadowScaleX: 1.08, shadowOffsetX: -0.055 }),
      frame('strafe_left_2', { offsetX: -0.04, rotationDeg: -7.8, scaleX: 1.035, scaleY: 0.99, shadowScaleX: 1.12, shadowOffsetX: -0.04 }),
      frame('strafe_left_3', { offsetX: -0.014, offsetY: -0.012, rotationDeg: -5.2, scaleX: 1.05, scaleY: 0.98, shadowScaleX: 1.16, shadowOffsetX: -0.025 }),
    ],
  },
  strafe_right: {
    fps: 12,
    loop: true,
    frames: [
      frame('strafe_right_0', { offsetX: 0.045, rotationDeg: 8.5, scaleX: 1.035, scaleY: 0.99, shadowScaleX: 1.12, shadowOffsetX: 0.04 }),
      frame('strafe_right_1', { offsetX: 0.074, offsetY: 0.012, rotationDeg: 10.5, scaleX: 1.02, scaleY: 1.015, shadowScaleX: 1.08, shadowOffsetX: 0.055 }),
      frame('strafe_right_2', { offsetX: 0.04, rotationDeg: 7.8, scaleX: 1.035, scaleY: 0.99, shadowScaleX: 1.12, shadowOffsetX: 0.04 }),
      frame('strafe_right_3', { offsetX: 0.014, offsetY: -0.012, rotationDeg: 5.2, scaleX: 1.05, scaleY: 0.98, shadowScaleX: 1.16, shadowOffsetX: 0.025 }),
    ],
  },
  backpedal: {
    fps: 10,
    loop: true,
    frames: [
      frame('backpedal_0', { offsetY: -0.004, scaleX: 1.02, scaleY: 0.985, rotationDeg: 2.4, shadowScaleX: 1.08 }),
      frame('backpedal_1', { offsetX: 0.012, offsetY: -0.018, scaleX: 1.04, scaleY: 0.96, rotationDeg: -1.6, shadowScaleX: 1.12, shadowScaleY: 0.95 }),
      frame('backpedal_2', { offsetY: -0.004, scaleX: 1.02, scaleY: 0.985, rotationDeg: -2.4, shadowScaleX: 1.08 }),
      frame('backpedal_3', { offsetX: -0.012, offsetY: -0.018, scaleX: 1.04, scaleY: 0.96, rotationDeg: 1.6, shadowScaleX: 1.12, shadowScaleY: 0.95 }),
    ],
  },
  stop_brace: {
    fps: 9,
    loop: false,
    frames: [
      frame('stop_brace_0', { offsetY: -0.02, scaleX: 1.06, scaleY: 0.95, rotationDeg: 2.5, shadowScaleX: 1.16, shadowScaleY: 0.94 }),
      frame('stop_brace_1', { offsetY: -0.008, scaleX: 1.02, scaleY: 0.99, rotationDeg: 0.8, shadowScaleX: 1.08, shadowScaleY: 0.98 }),
    ],
  },
  hit: {
    fps: 16,
    loop: false,
    frames: [
      frame('hit_0', { offsetX: -0.035, offsetY: 0.018, scaleX: 1.04, scaleY: 0.98, rotationDeg: -7, tint: HIT_TINT, shadowScaleX: 1.16 }),
      frame('hit_1', { offsetX: 0.026, offsetY: -0.012, scaleX: 1.06, scaleY: 0.95, rotationDeg: 5, tint: HIT_TINT, shadowScaleX: 1.2, shadowOpacity: 0.4 }),
    ],
  },
  dead: {
    fps: 1,
    loop: false,
    frames: [
      frame('dead_0', {
        offsetY: -0.52,
        scaleX: 1.08,
        scaleY: 0.62,
        rotationDeg: -68,
        shadowScaleX: 1.36,
        shadowScaleY: 0.82,
        shadowOpacity: 0.44,
      }),
    ],
  },
} satisfies Record<UnitAnimationPose, UnitAnimationClip>;

export function getUnitAnimationClip(_team: Unit['team'], pose: UnitAnimationPose): UnitAnimationClip {
  return CLIPS[pose] ?? CLIPS.idle;
}

export function sampleUnitAnimationFrame({
  team,
  pose,
  strideDistance,
  elapsedSeconds,
}: {
  team: Unit['team'];
  pose: UnitAnimationPose;
  strideDistance: number;
  elapsedSeconds: number;
}): UnitAnimationFrame {
  const clip = getUnitAnimationClip(team, pose);
  if (clip.frames.length <= 1) return clip.frames[0];

  const frameProgress = clip.loop
    ? Math.abs(strideDistance) * clip.frames.length
    : elapsedSeconds * clip.fps;
  const index = clip.loop
    ? Math.floor(frameProgress) % clip.frames.length
    : Math.min(clip.frames.length - 1, Math.floor(frameProgress));

  return clip.frames[index] ?? clip.frames[0];
}
