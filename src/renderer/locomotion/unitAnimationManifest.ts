import type { Team } from '../../game/types';
import type { LocomotionPose } from './LocomotionController';

export type UnitAnimationPose = LocomotionPose | 'hit' | 'dead';

export type UnitAnimationClip = {
  fps: number;
  loop: boolean;
  distanceFrames?: boolean;
  frames: string[];
};

const ct = (frame: string) => `/board2d5/units/ct/${frame}.svg`;
const t = (frame: string) => `/board2d5/units/t/${frame}.svg`;

const frames = (prefix: string, count: number, urlFor: (frame: string) => string): string[] => (
  Array.from({ length: count }, (_, index) => urlFor(`${prefix}_${index}`))
);

const teamManifest = (urlFor: (frame: string) => string): Record<UnitAnimationPose, UnitAnimationClip> => ({
  idle: {
    fps: 1,
    loop: true,
    frames: [urlFor('idle_0')],
  },
  run_forward: {
    fps: 12,
    loop: true,
    distanceFrames: true,
    frames: frames('run_forward', 6, urlFor),
  },
  diagonal_left: {
    fps: 10,
    loop: true,
    distanceFrames: true,
    frames: frames('diagonal_left', 4, urlFor),
  },
  diagonal_right: {
    fps: 10,
    loop: true,
    distanceFrames: true,
    frames: frames('diagonal_right', 4, urlFor),
  },
  strafe_left: {
    fps: 10,
    loop: true,
    distanceFrames: true,
    frames: frames('strafe_left', 4, urlFor),
  },
  strafe_right: {
    fps: 10,
    loop: true,
    distanceFrames: true,
    frames: frames('strafe_right', 4, urlFor),
  },
  backpedal: {
    fps: 8,
    loop: true,
    distanceFrames: true,
    frames: frames('backpedal', 4, urlFor),
  },
  stop_brace: {
    fps: 8,
    loop: false,
    frames: frames('stop_brace', 3, urlFor),
  },
  hit: {
    fps: 12,
    loop: false,
    frames: frames('hit', 2, urlFor),
  },
  dead: {
    fps: 1,
    loop: false,
    frames: [urlFor('dead_0')],
  },
});

export const UNIT_ANIMATION_MANIFEST: Record<Team, Record<UnitAnimationPose, UnitAnimationClip>> = {
  CT: teamManifest(ct),
  T: teamManifest(t),
};

export function getAllUnitAnimationUrls(team: Team): string[] {
  return Array.from(
    new Set(
      Object.values(UNIT_ANIMATION_MANIFEST[team]).flatMap((clip) => clip.frames)
    )
  );
}

export function resolveUnitAnimationUrl(args: {
  team: Team;
  pose: UnitAnimationPose;
  strideDistance: number;
  elapsedSeconds: number;
  isAlive: boolean;
  hitPulse: number;
}): string {
  const pose = !args.isAlive
    ? 'dead'
    : args.hitPulse > 0.08
      ? 'hit'
      : args.pose;

  const clip = UNIT_ANIMATION_MANIFEST[args.team][pose] ??
    UNIT_ANIMATION_MANIFEST[args.team].idle;

  if (clip.frames.length <= 1) return clip.frames[0];

  const index = clip.distanceFrames
    ? Math.floor(Math.abs(args.strideDistance) * 2.2) % clip.frames.length
    : Math.min(clip.frames.length - 1, Math.floor(args.elapsedSeconds * clip.fps));

  return clip.frames[index] ?? clip.frames[0];
}
