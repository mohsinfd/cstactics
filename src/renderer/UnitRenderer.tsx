// ============================================================
// UnitRenderer: primitive tactical unit miniatures.
//
// Each role has a distinct silhouette:
//   AWPer - tallest, long rifle barrel, scope glint
//   Entry - bulky vest, short rifle, aggressive stance
//   IGL - radio antenna on back, tablet/map indicator
//   Support - utility belt visible, thicker torso
//   Lurker - slimmer build, suppressed weapon
//
// Teams distinguished by:
//   CT - solid blue miniature + hard helmet
//   T  - solid red miniature + headwrap/soft helmet
//
// Current scope:
//   Selected = pulsing ring + HP bar
//   Hovered units get a readable base ring
//   Active team units glow subtly, inactive team dimmed
//   Units bob/step while moving between tiles
//   Firing recoil and muzzle scale vary by weapon class
//
// Missing: final authored rig/model assets.
// ============================================================
import { Suspense, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { Line, Text } from '@react-three/drei';
import { useFrame, useLoader } from '@react-three/fiber';
import { useGameStore } from '../game/store';
import type { MovementPresentationRoute, TileCoord, Unit, RoleId, WeaponCategory } from '../game/types';
import { getShotPreview } from '../game/combat';
import { getShotPresentation } from '../game/shotPresentation';
import { isUnitVisibleToTeam } from '../game/visibility';
import { DEFAULT_MOVEMENT_TIMING } from './movementEasing';
import {
  ROUTE_LOCOMOTION,
  advanceMovementClip,
  classifyLocomotionPose,
  createMovementClip,
  type LocomotionPose,
  type MovementClip,
} from './locomotion/LocomotionController';
import {
  getAllUnitAnimationUrls,
  resolveUnitAnimationUrl,
  type UnitAnimationPose,
} from './locomotion/unitAnimationManifest';
import {
  getWeaponVisualProfile,
  ROLE_VISUAL_IDENTITIES,
  TEAM_VISUAL_IDENTITIES,
  type RoleVisualIdentity,
  type TeamVisualIdentity,
} from './unitVisualIdentity';

type TeamPalette = TeamVisualIdentity & {
  helmet: TeamVisualIdentity['headgear'];
  helmetRim: TeamVisualIdentity['headgearDark'];
};

const TEAM_RENDER_PALETTES = {
  CT: {
    ...TEAM_VISUAL_IDENTITIES.CT,
    vest: '#206cff',
    vestDark: '#0b347d',
    pants: '#1552c7',
    headgear: '#2d7dff',
    headgearDark: '#0b2f70',
    skin: '#78adff',
    armband: '#e8f3ff',
    accent: '#51a5ff',
    weapon: '#151a22',
    base: '#0a3287',
    helmet: '#2d7dff',
    helmetRim: '#0b2f70',
  },
  T: {
    ...TEAM_VISUAL_IDENTITIES.T,
    vest: '#d82333',
    vestDark: '#7d101a',
    pants: '#a91522',
    headgear: '#f0444f',
    headgearDark: '#8b111b',
    skin: '#ff887f',
    armband: '#ffd4d0',
    accent: '#ff4053',
    weapon: '#171317',
    base: '#81111d',
    helmet: '#f0444f',
    helmetRim: '#8b111b',
  },
} satisfies Record<Unit['team'], TeamPalette>;

type RoleRenderConfig = RoleVisualIdentity & {
  baseShape: RoleVisualIdentity['baseGlyph'];
};

const ROLE_RENDER_CONFIG = {
  awper: {
    ...ROLE_VISUAL_IDENTITIES.awper,
    baseShape: ROLE_VISUAL_IDENTITIES.awper.baseGlyph,
  },
  entry: {
    ...ROLE_VISUAL_IDENTITIES.entry,
    baseShape: ROLE_VISUAL_IDENTITIES.entry.baseGlyph,
  },
  igl: {
    ...ROLE_VISUAL_IDENTITIES.igl,
    baseShape: ROLE_VISUAL_IDENTITIES.igl.baseGlyph,
  },
  support: {
    ...ROLE_VISUAL_IDENTITIES.support,
    baseShape: ROLE_VISUAL_IDENTITIES.support.baseGlyph,
  },
  lurker: {
    ...ROLE_VISUAL_IDENTITIES.lurker,
    baseShape: ROLE_VISUAL_IDENTITIES.lurker.baseGlyph,
  },
} satisfies Record<RoleId, RoleRenderConfig>;

function SafeText(props: ComponentProps<typeof Text>) {
  return (
    <Suspense fallback={null}>
      <Text {...props} />
    </Suspense>
  );
}

const TELEPORT_TILE_DISTANCE = 2.4;
const CLICK_DRAG_THRESHOLD_PX = 4;
const DEFAULT_CAMERA_READABLE_YAW = 2.45;
const MINIATURE_ROOT_SCALE = 1.88;
const WEAPON_REST_Z = 0.5;
const WEAPON_PRESENTATION_SCALE = 0.94;
const MAX_MOVEMENT_FRAME_SECONDS = 0.05;
type QueuedMovementTarget = {
  key: string;
  position: THREE.Vector3;
  routeId?: string;
};

type ContinuousMovementState = {
  from: THREE.Vector3;
  to: THREE.Vector3;
  targetKey: string;
  activeKey: string;
  elapsed: number;
  duration: number;
  queue: QueuedMovementTarget[];
  isRunning: boolean;
  routeId: string;
  clip: MovementClip | null;
  pose: LocomotionPose;
  speedTilesPerSecond: number;
  routeProgress: number;
  endpointErrorTiles: number;
  moveDirection: THREE.Vector3;
  runBlend: number;
  lastMovedAt: number;
  lastPosition: THREE.Vector3;
  strideDistance: number;
  stopPoseUntil: number;
  lastCompletedRouteId: string;
};

type UnitSpriteAnimationState = {
  pose: UnitAnimationPose;
  strideDistance: number;
  movementIntensity: number;
  hitPulse: number;
  currentFrameUrl: string;
};

function tileKey(tile: TileCoord): string {
  return `${tile.x}:${tile.y}`;
}

function tileToUnitWorld(mapWidth: number, tileSize: number, tile: TileCoord): THREE.Vector3 {
  return new THREE.Vector3(
    (mapWidth - 1 - tile.x) * tileSize + tileSize / 2,
    0,
    tile.y * tileSize + tileSize / 2
  );
}

function getMovementRouteTargets(
  route: MovementPresentationRoute | null,
  mapWidth: number,
  tileSize: number
): QueuedMovementTarget[] {
  if (!route) return [];
  return route.path.map((tile) => ({
    key: tileKey(tile),
    position: tileToUnitWorld(mapWidth, tileSize, tile),
    routeId: route.id,
  }));
}

function getRouteClipPointsFromCurrent(
  targets: QueuedMovementTarget[],
  currentPosition: THREE.Vector3,
  tileSize: number
): THREE.Vector3[] {
  if (targets.length === 0) return [];

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  targets.forEach((target, index) => {
    const distance = currentPosition.distanceTo(target.position);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  const startIndex = nearestDistance < tileSize * 0.48
    ? nearestIndex + 1
    : nearestIndex;
  const points = [currentPosition.clone()];

  for (const target of targets.slice(startIndex)) {
    const last = points.at(-1);
    if (!last || last.distanceTo(target.position) > tileSize * 0.04) {
      points.push(target.position.clone());
    }
  }

  return points;
}

function getAimWorldDirection(unit: Unit): THREE.Vector3 {
  const aim = new THREE.Vector3(-unit.facing.x, 0, unit.facing.y);
  if (aim.lengthSq() <= 0.000001) return new THREE.Vector3(0, 0, unit.team === 'T' ? 1 : -1);
  return aim.normalize();
}

type RoleMiniatureProfile = {
  torsoWidth: number;
  torsoHeight: number;
  torsoDepth: number;
  shoulderWidth: number;
  shoulderHeight: number;
  headScale: number;
  stanceWidth: number;
  lean: number;
};

const ROLE_MINIATURE_PROFILES = {
  awper: {
    torsoWidth: 0.34,
    torsoHeight: 0.64,
    torsoDepth: 0.27,
    shoulderWidth: 0.48,
    shoulderHeight: 0.16,
    headScale: 1.02,
    stanceWidth: 0.32,
    lean: -0.03,
  },
  entry: {
    torsoWidth: 0.48,
    torsoHeight: 0.58,
    torsoDepth: 0.31,
    shoulderWidth: 0.66,
    shoulderHeight: 0.2,
    headScale: 1.08,
    stanceWidth: 0.42,
    lean: 0.08,
  },
  igl: {
    torsoWidth: 0.4,
    torsoHeight: 0.6,
    torsoDepth: 0.28,
    shoulderWidth: 0.56,
    shoulderHeight: 0.16,
    headScale: 1,
    stanceWidth: 0.34,
    lean: 0.01,
  },
  support: {
    torsoWidth: 0.46,
    torsoHeight: 0.61,
    torsoDepth: 0.33,
    shoulderWidth: 0.62,
    shoulderHeight: 0.18,
    headScale: 1.04,
    stanceWidth: 0.38,
    lean: 0.03,
  },
  lurker: {
    torsoWidth: 0.3,
    torsoHeight: 0.54,
    torsoDepth: 0.25,
    shoulderWidth: 0.42,
    shoulderHeight: 0.14,
    headScale: 0.96,
    stanceWidth: 0.28,
    lean: -0.05,
  },
} satisfies Record<RoleId, RoleMiniatureProfile>;

type UnitStateVisualProfile = {
  color: string;
  textColor: string;
  outlineColor: string;
  ringInner: number;
  ringOuter: number;
  ringOpacity: number;
  bracketRadius: number;
  bracketLength: number;
  bracketOpacity: number;
  facingOpacity: number;
  roleOpacity: number;
  roleTagColor: string;
  baseEmissive: string;
  baseEmissiveIntensity: number;
  vestEmissive: string;
  vestEmissiveIntensity: number;
};

const UNIT_STATE_VISUALS = {
  selected: {
    color: '#fff2a8',
    textColor: '#fff8d6',
    outlineColor: '#251704',
    ringInner: 0.6,
    ringOuter: 0.98,
    ringOpacity: 0.52,
    bracketRadius: 0.98,
    bracketLength: 0.38,
    bracketOpacity: 1,
    facingOpacity: 0.82,
    roleOpacity: 0.36,
    roleTagColor: '#fff8d6',
    baseEmissive: '#fff2a8',
    baseEmissiveIntensity: 0.82,
    vestEmissive: '#fff2a8',
    vestEmissiveIntensity: 0.24,
  },
  selectedSpent: {
    color: '#98a3b3',
    textColor: '#d3d9e3',
    outlineColor: '#07090d',
    ringInner: 0.62,
    ringOuter: 0.98,
    ringOpacity: 0.46,
    bracketRadius: 0.96,
    bracketLength: 0.3,
    bracketOpacity: 0.74,
    facingOpacity: 0.34,
    roleOpacity: 0.14,
    roleTagColor: '#c3cad5',
    baseEmissive: '#4d5662',
    baseEmissiveIntensity: 0.18,
    vestEmissive: '#4d5662',
    vestEmissiveIntensity: 0.08,
  },
  hover: {
    color: '#f7f2df',
    textColor: '#f7f2df',
    outlineColor: '#09090f',
    ringInner: 0.66,
    ringOuter: 0.84,
    ringOpacity: 0.58,
    bracketRadius: 0.86,
    bracketLength: 0.28,
    bracketOpacity: 0.74,
    facingOpacity: 0.44,
    roleOpacity: 0.44,
    roleTagColor: '#f7f2df',
    baseEmissive: '#f7f2df',
    baseEmissiveIntensity: 0.22,
    vestEmissive: '#f7f2df',
    vestEmissiveIntensity: 0.13,
  },
  targetable: {
    color: '#ff365c',
    textColor: '#ffe0e6',
    outlineColor: '#22030a',
    ringInner: 0.86,
    ringOuter: 1.16,
    ringOpacity: 0.82,
    bracketRadius: 1.04,
    bracketLength: 0.42,
    bracketOpacity: 0.96,
    facingOpacity: 0.5,
    roleOpacity: 0.24,
    roleTagColor: '#ffd7dd',
    baseEmissive: '#ff365c',
    baseEmissiveIntensity: 0.38,
    vestEmissive: '#ff365c',
    vestEmissiveIntensity: 0.13,
  },
  outOfRange: {
    color: '#8a7a62',
    textColor: '#d4c19d',
    outlineColor: '#120d08',
    ringInner: 0.84,
    ringOuter: 1.03,
    ringOpacity: 0.34,
    bracketRadius: 0.94,
    bracketLength: 0.3,
    bracketOpacity: 0.52,
    facingOpacity: 0.28,
    roleOpacity: 0.18,
    roleTagColor: '#b9a883',
    baseEmissive: '#5d5140',
    baseEmissiveIntensity: 0.08,
    vestEmissive: '#5d5140',
    vestEmissiveIntensity: 0.04,
  },
  spent: {
    color: '#8f9baa',
    textColor: '#c4cbd4',
    outlineColor: '#07090d',
    ringInner: 0.68,
    ringOuter: 0.94,
    ringOpacity: 0.46,
    bracketRadius: 0.84,
    bracketLength: 0.2,
    bracketOpacity: 0.46,
    facingOpacity: 0.2,
    roleOpacity: 0.16,
    roleTagColor: '#aeb6c1',
    baseEmissive: '#48515d',
    baseEmissiveIntensity: 0.1,
    vestEmissive: '#48515d',
    vestEmissiveIntensity: 0.05,
  },
  live: {
    color: '#f6f8fb',
    textColor: '#f6f8fb',
    outlineColor: '#07080d',
    ringInner: 0.62,
    ringOuter: 0.8,
    ringOpacity: 0,
    bracketRadius: 0.84,
    bracketLength: 0.26,
    bracketOpacity: 0,
    facingOpacity: 0,
    roleOpacity: 0.42,
    roleTagColor: '#f6f8fb',
    baseEmissive: '#000000',
    baseEmissiveIntensity: 0,
    vestEmissive: '#000000',
    vestEmissiveIntensity: 0,
  },
  inactive: {
    color: '#9ca3af',
    textColor: '#a1a1aa',
    outlineColor: '#050507',
    ringInner: 0.62,
    ringOuter: 0.78,
    ringOpacity: 0,
    bracketRadius: 0.84,
    bracketLength: 0.26,
    bracketOpacity: 0,
    facingOpacity: 0,
    roleOpacity: 0.12,
    roleTagColor: '#a3a3a3',
    baseEmissive: '#000000',
    baseEmissiveIntensity: 0,
    vestEmissive: '#000000',
    vestEmissiveIntensity: 0,
  },
} satisfies Record<string, UnitStateVisualProfile>;

function getUnitStateVisualProfile({
  isSelected,
  isHovered,
  isVisibleTarget,
  isShootableTarget,
  isSpent,
  isActiveTeam,
}: {
  isSelected: boolean;
  isHovered: boolean;
  isVisibleTarget: boolean;
  isShootableTarget: boolean;
  isSpent: boolean;
  isActiveTeam: boolean;
}): UnitStateVisualProfile {
  if (isSelected && isSpent) return UNIT_STATE_VISUALS.selectedSpent;
  if (isSelected) return UNIT_STATE_VISUALS.selected;
  if (isVisibleTarget) return isShootableTarget
    ? UNIT_STATE_VISUALS.targetable
    : UNIT_STATE_VISUALS.outOfRange;
  if (isHovered) return UNIT_STATE_VISUALS.hover;
  if (isSpent) return UNIT_STATE_VISUALS.spent;
  return isActiveTeam ? UNIT_STATE_VISUALS.live : UNIT_STATE_VISUALS.inactive;
}

function dampAngle(current: number, target: number, lambda: number, delta: number): number {
  const angleDelta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + angleDelta * (1 - Math.exp(-lambda * delta));
}

function TacticalBaseBrackets({
  color,
  opacity = 0.9,
  radius = 0.84,
  length = 0.26,
  y = 0.082,
}: {
  color: string;
  opacity?: number;
  radius?: number;
  length?: number;
  y?: number;
}) {
  const points = useMemo(() => {
    const r = radius;
    const l = length;
    return [
      [[-r, y, -r], [-r + l, y, -r]],
      [[-r, y, -r], [-r, y, -r + l]],
      [[r, y, -r], [r - l, y, -r]],
      [[r, y, -r], [r, y, -r + l]],
      [[-r, y, r], [-r + l, y, r]],
      [[-r, y, r], [-r, y, r - l]],
      [[r, y, r], [r - l, y, r]],
      [[r, y, r], [r, y, r - l]],
    ] as Array<[[number, number, number], [number, number, number]]>;
  }, [length, radius, y]);

  return (
    <group>
      {points.map((segment, index) => (
        <Line
          key={`bracket-${index}`}
          points={segment}
          color={color}
          lineWidth={2.2}
          transparent
          opacity={opacity}
        />
      ))}
    </group>
  );
}

function FacingArc({
  color,
  opacity = 0.62,
}: {
  color: string;
  opacity?: number;
}) {
  const arc = useMemo(() => {
    const radius = 1.08;
    const y = 0.088;
    const start = -0.55;
    const end = 0.55;
    return Array.from({ length: 18 }, (_, index): [number, number, number] => {
      const t = start + ((end - start) * index) / 17;
      return [Math.sin(t) * radius, y, Math.cos(t) * radius];
    });
  }, []);

  const leftRay: Array<[number, number, number]> = [[0, 0.086, 0.36], arc[0]];
  const rightRay: Array<[number, number, number]> = [[0, 0.086, 0.36], arc[arc.length - 1]];

  return (
    <group>
      <Line points={arc} color={color} lineWidth={1.8} transparent opacity={opacity} />
      <Line points={leftRay} color={color} lineWidth={1.1} transparent opacity={opacity * 0.7} />
      <Line points={rightRay} color={color} lineWidth={1.1} transparent opacity={opacity * 0.7} />
    </group>
  );
}

function TeamIdentityBase({
  team,
  palette,
  roleAccent,
}: {
  team: Unit['team'];
  palette: TeamPalette;
  roleAccent: string;
}) {
  if (team === 'CT') {
    return (
      <group>
        <mesh position={[0, 0.082, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]} raycast={() => null}>
          <ringGeometry args={[0.72, 0.84, 4]} />
          <meshBasicMaterial color={palette.accent} transparent opacity={0.54} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 0.095, 0]} raycast={() => null}>
          <boxGeometry args={[0.5, 0.018, 0.11]} />
          <meshBasicMaterial color="#e9eef7" transparent opacity={0.68} />
        </mesh>
        <mesh position={[0, 0.096, 0]} raycast={() => null}>
          <boxGeometry args={[0.11, 0.018, 0.5]} />
          <meshBasicMaterial color="#e9eef7" transparent opacity={0.68} />
        </mesh>
        <mesh position={[0, 0.104, 0.56]} raycast={() => null}>
          <boxGeometry args={[0.3, 0.02, 0.06]} />
          <meshBasicMaterial color={roleAccent} transparent opacity={0.9} />
        </mesh>
      </group>
    );
  }

  return (
    <group>
      <mesh position={[0, 0.083, 0.08]} rotation={[-Math.PI / 2, 0, Math.PI]} raycast={() => null}>
        <circleGeometry args={[0.38, 3]} />
        <meshBasicMaterial color={palette.accent} transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.099, 0]} rotation={[0, Math.PI / 4, 0]} raycast={() => null}>
        <boxGeometry args={[0.78, 0.018, 0.12]} />
        <meshBasicMaterial color="#c43232" transparent opacity={0.76} />
      </mesh>
      <mesh position={[0.27, 0.104, 0.22]} raycast={() => null}>
        <boxGeometry args={[0.18, 0.018, 0.08]} />
        <meshBasicMaterial color={roleAccent} transparent opacity={0.86} />
      </mesh>
    </group>
  );
}

function TeamChestBadge({
  team,
  scale,
  roleAccent,
}: {
  team: Unit['team'];
  scale: number;
  roleAccent: string;
}) {
  return (
    <group position={[0, 0.92 * scale, 0.235 * scale]}>
      <mesh castShadow>
        <boxGeometry args={[0.28 * scale, 0.15 * scale, 0.024]} />
        <meshStandardMaterial
          color={team === 'CT' ? '#dcecff' : '#ffd2d2'}
          roughness={0.48}
          emissive={roleAccent}
          emissiveIntensity={0.06}
        />
      </mesh>
      <mesh position={[0, 0, 0.018]} castShadow>
        <boxGeometry args={[0.14 * scale, 0.035 * scale, 0.014]} />
        <meshBasicMaterial color={team === 'CT' ? '#1b65f2' : '#d61f30'} />
      </mesh>
    </group>
  );
}

function RoleVestGlyph({ roleId, accent, scale }: { roleId: RoleId; accent: string; scale: number }) {
  const cfg = ROLE_RENDER_CONFIG[roleId];
  const materialProps = {
    color: '#f7f8fb',
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
  };

  return (
    <group position={[0, 0.86 * scale, 0.194 * scale]} scale={[scale, scale, scale]} raycast={() => null}>
      {cfg.baseShape === 'long' && (
        <>
          <mesh rotation={[0, 0, -0.58]}>
            <boxGeometry args={[0.034, 0.26, 0.012]} />
            <meshBasicMaterial {...materialProps} />
          </mesh>
          <mesh position={[0.045, 0.02, 0.006]}>
            <torusGeometry args={[0.038, 0.007, 6, 14]} />
            <meshBasicMaterial color={accent} transparent opacity={0.9} depthWrite={false} />
          </mesh>
        </>
      )}

      {cfg.baseShape === 'wedge' && (
        <>
          <mesh position={[-0.055, 0, 0]} rotation={[0, 0, -0.56]}>
            <boxGeometry args={[0.034, 0.22, 0.012]} />
            <meshBasicMaterial {...materialProps} />
          </mesh>
          <mesh position={[0.055, 0, 0]} rotation={[0, 0, 0.56]}>
            <boxGeometry args={[0.034, 0.22, 0.012]} />
            <meshBasicMaterial {...materialProps} />
          </mesh>
          <mesh position={[0, -0.058, 0.004]}>
            <boxGeometry args={[0.11, 0.024, 0.012]} />
            <meshBasicMaterial color={accent} transparent opacity={0.88} depthWrite={false} />
          </mesh>
        </>
      )}

      {cfg.baseShape === 'command' && (
        <>
          <mesh>
            <boxGeometry args={[0.21, 0.13, 0.012]} />
            <meshBasicMaterial color={accent} transparent opacity={0.82} depthWrite={false} />
          </mesh>
          <mesh position={[0, 0, 0.006]}>
            <boxGeometry args={[0.15, 0.076, 0.012]} />
            <meshBasicMaterial color="#151922" transparent opacity={0.9} depthWrite={false} />
          </mesh>
        </>
      )}

      {cfg.baseShape === 'utility' && (
        [-0.07, 0, 0.07].map((x) => (
          <mesh key={x} position={[x, 0, 0]}>
            <boxGeometry args={[0.042, 0.13, 0.012]} />
            <meshBasicMaterial color={accent} transparent opacity={0.9} depthWrite={false} />
          </mesh>
        ))
      )}

      {cfg.baseShape === 'stealth' && (
        <>
          <mesh position={[-0.035, 0, 0]} rotation={[0, 0, -0.72]}>
            <boxGeometry args={[0.032, 0.22, 0.012]} />
            <meshBasicMaterial {...materialProps} />
          </mesh>
          <mesh position={[0.045, 0, 0.004]} rotation={[0, 0, -0.72]}>
            <boxGeometry args={[0.025, 0.14, 0.012]} />
            <meshBasicMaterial color={accent} transparent opacity={0.82} depthWrite={false} />
          </mesh>
        </>
      )}
    </group>
  );
}

function RoleSilhouette({ roleId, accent, opacity = 0.42 }: { roleId: RoleId; accent: string; opacity?: number }) {
  const cfg = ROLE_RENDER_CONFIG[roleId];
  const solidOpacity = Math.min(0.9, opacity + 0.18);

  return (
    <group>
      <mesh position={[0, 0.075, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.58, 0.68, 36]} />
        <meshBasicMaterial color={accent} transparent opacity={opacity} side={THREE.DoubleSide} />
      </mesh>

      {cfg.baseShape === 'long' && (
        <>
          <mesh position={[0, 0.09, 0.18]} rotation={[-Math.PI / 2, 0, 0]}>
            <boxGeometry args={[0.16, 0.95, 0.01]} />
            <meshBasicMaterial color={accent} transparent opacity={opacity} />
          </mesh>
          <mesh position={[0, 0.1, 0.68]}>
            <sphereGeometry args={[0.075, 12, 8]} />
            <meshBasicMaterial color={accent} transparent opacity={solidOpacity} />
          </mesh>
        </>
      )}

      {cfg.baseShape === 'wedge' && (
        <>
          <mesh position={[0, 0.09, 0.44]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
            <coneGeometry args={[0.22, 0.45, 3]} />
            <meshBasicMaterial color={accent} transparent opacity={solidOpacity} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[-0.22, 0.09, 0.22]} rotation={[-Math.PI / 2, 0, 0.7]}>
            <boxGeometry args={[0.08, 0.34, 0.01]} />
            <meshBasicMaterial color={accent} transparent opacity={solidOpacity} />
          </mesh>
          <mesh position={[0.22, 0.09, 0.22]} rotation={[-Math.PI / 2, 0, -0.7]}>
            <boxGeometry args={[0.08, 0.34, 0.01]} />
            <meshBasicMaterial color={accent} transparent opacity={solidOpacity} />
          </mesh>
        </>
      )}

      {cfg.baseShape === 'command' && (
        <>
          <mesh position={[0, 0.09, 0.48]} rotation={[-Math.PI / 2, 0, 0]}>
            <boxGeometry args={[0.42, 0.25, 0.01]} />
            <meshBasicMaterial color={accent} transparent opacity={solidOpacity} />
          </mesh>
          <mesh position={[0, 0.105, 0.49]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.3, 0.14]} />
            <meshBasicMaterial color="#1b1d24" transparent opacity={Math.min(0.9, solidOpacity + 0.08)} />
          </mesh>
        </>
      )}

      {cfg.baseShape === 'utility' && (
        <>
          {[-0.28, 0, 0.28].map((x) => (
            <mesh key={x} position={[x, 0.1, 0.42]}>
              <boxGeometry args={[0.16, 0.1, 0.18]} />
              <meshBasicMaterial color={accent} transparent opacity={solidOpacity} />
            </mesh>
          ))}
        </>
      )}

      {cfg.baseShape === 'stealth' && (
        <>
          <mesh position={[0, 0.09, 0.08]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.36, 3]} />
            <meshBasicMaterial color={accent} transparent opacity={opacity} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 0.1, 0.54]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.08, 0.36, 12]} />
            <meshBasicMaterial color={accent} transparent opacity={solidOpacity} />
          </mesh>
        </>
      )}
    </group>
  );
}

function RoleGear({ roleId, accent, scale }: { roleId: RoleId; accent: string; scale: number }) {
  if (roleId === 'awper') {
    return (
      <group>
        <mesh position={[0.22 * scale, 0.98 * scale, -0.16]} rotation={[0.18, 0, 0]} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 0.46, 8]} />
          <meshStandardMaterial color={accent} roughness={0.25} metalness={0.65} emissive={accent} emissiveIntensity={0.12} />
        </mesh>
        <mesh position={[-0.22 * scale, 0.96 * scale, -0.17]} castShadow>
          <boxGeometry args={[0.13, 0.22, 0.08]} />
          <meshStandardMaterial color="#172033" roughness={0.62} metalness={0.18} />
        </mesh>
      </group>
    );
  }

  if (roleId === 'entry') {
    return (
      <group>
        <mesh position={[0, 1.03 * scale, 0.18]} rotation={[Math.PI / 2, 0, Math.PI / 4]} castShadow>
          <coneGeometry args={[0.13, 0.34, 3]} />
          <meshStandardMaterial color={accent} roughness={0.44} emissive={accent} emissiveIntensity={0.08} />
        </mesh>
        {[-0.22, 0.22].map((x) => (
          <mesh key={x} position={[x * scale, 0.66 * scale, 0.16]} castShadow>
            <boxGeometry args={[0.11, 0.28, 0.065]} />
            <meshStandardMaterial color="#241614" roughness={0.72} />
          </mesh>
        ))}
      </group>
    );
  }

  if (roleId === 'igl') {
    return (
      <group>
        <mesh position={[0, 0.74 * scale, 0.2]} rotation={[Math.PI * 0.08, 0, 0]} castShadow>
          <boxGeometry args={[0.28, 0.17, 0.035]} />
          <meshStandardMaterial color="#171b20" roughness={0.45} metalness={0.18} />
        </mesh>
        <mesh position={[0, 0.744 * scale, 0.222]} rotation={[Math.PI * 0.08, 0, 0]}>
          <planeGeometry args={[0.2, 0.09]} />
          <meshBasicMaterial color={accent} transparent opacity={0.85} />
        </mesh>
      </group>
    );
  }

  if (roleId === 'support') {
    return (
      <group>
        {[-0.24, 0, 0.24].map((x, index) => (
          <mesh key={x} position={[x * scale, 0.6 * scale, 0.19]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.045, 0.045, 0.14, 10]} />
            <meshStandardMaterial
              color={index === 1 ? '#f7f8fb' : accent}
              roughness={0.48}
              metalness={0.15}
              transparent
              opacity={index === 1 ? 0.82 : 0.72}
            />
          </mesh>
        ))}
        <mesh position={[0, 0.91 * scale, -0.19]} castShadow>
          <boxGeometry args={[0.34, 0.36, 0.12]} />
          <meshStandardMaterial color="#243028" roughness={0.86} />
        </mesh>
      </group>
    );
  }

  return (
    <group>
      <mesh position={[0, 0.95 * scale, -0.2]} castShadow>
        <boxGeometry args={[0.34, 0.44, 0.08]} />
        <meshStandardMaterial color="#17131f" roughness={0.92} transparent opacity={0.88} />
      </mesh>
      <mesh position={[0.2 * scale, 0.82 * scale, 0.13]} rotation={[0, 0.25, 0]} castShadow>
        <boxGeometry args={[0.06, 0.2, 0.055]} />
        <meshStandardMaterial color={accent} roughness={0.56} emissive={accent} emissiveIntensity={0.1} />
      </mesh>
    </group>
  );
}

function TeamHeadgear({ team, scale, mats, palette }: {
  team: Unit['team'];
  scale: number;
  mats: {
    helmet: THREE.MeshStandardMaterial;
    skin: THREE.MeshStandardMaterial;
  };
  palette: TeamPalette;
}) {
  if (team === 'CT') {
    return (
      <group>
        <mesh position={[0, 1.34 * scale, 0]} castShadow material={mats.helmet}>
          <sphereGeometry args={[0.19 * scale, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.66]} />
        </mesh>
        <mesh position={[0, 1.28 * scale, 0.13 * scale]} castShadow>
          <boxGeometry args={[0.31 * scale, 0.07 * scale, 0.07 * scale]} />
          <meshStandardMaterial color="#070b12" roughness={0.28} metalness={0.35} emissive="#1a5b91" emissiveIntensity={0.12} />
        </mesh>
        <mesh position={[0, 1.39 * scale, 0.012 * scale]} castShadow>
          <boxGeometry args={[0.2 * scale, 0.035 * scale, 0.18 * scale]} />
          <meshStandardMaterial color="#dfeaff" roughness={0.4} emissive="#8ec5ff" emissiveIntensity={0.1} />
        </mesh>
        {[-0.13, 0.13].map((x) => (
          <mesh key={x} position={[x * scale, 1.26 * scale, 0.005]} castShadow>
            <boxGeometry args={[0.058 * scale, 0.15 * scale, 0.14 * scale]} />
            <meshStandardMaterial color={palette.helmetRim} roughness={0.66} metalness={0.08} />
          </mesh>
        ))}
        <mesh position={[0, 1.21 * scale, -0.08 * scale]} castShadow>
          <boxGeometry args={[0.29 * scale, 0.17 * scale, 0.06 * scale]} />
          <meshStandardMaterial color={palette.helmetRim} roughness={0.62} metalness={0.1} />
        </mesh>
      </group>
    );
  }

  return (
    <group>
      <mesh position={[0, 1.34 * scale, 0]} castShadow material={mats.helmet}>
        <sphereGeometry args={[0.18 * scale, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
      </mesh>
      <mesh position={[0, 1.29 * scale, 0.09 * scale]} castShadow>
        <boxGeometry args={[0.32 * scale, 0.07 * scale, 0.06 * scale]} />
        <meshStandardMaterial color="#ffd4d0" roughness={0.72} emissive="#4a0808" emissiveIntensity={0.08} />
      </mesh>
      <mesh position={[0, 1.36 * scale, 0.025 * scale]} rotation={[0, 0, 0.1]} castShadow>
        <boxGeometry args={[0.28 * scale, 0.06 * scale, 0.15 * scale]} />
        <meshStandardMaterial color={palette.helmetRim} roughness={0.78} emissive="#3a0606" emissiveIntensity={0.08} />
      </mesh>
      <mesh position={[0.16 * scale, 1.24 * scale, -0.17 * scale]} rotation={[0.15, 0.3, -0.35]} castShadow>
        <boxGeometry args={[0.09 * scale, 0.24 * scale, 0.04 * scale]} />
        <meshStandardMaterial color={palette.headgear} roughness={0.8} />
      </mesh>
      <mesh position={[-0.13 * scale, 1.23 * scale, -0.16 * scale]} rotation={[0.05, -0.25, 0.42]} castShadow>
        <boxGeometry args={[0.074 * scale, 0.2 * scale, 0.036 * scale]} />
        <meshStandardMaterial color={palette.helmetRim} roughness={0.82} />
      </mesh>
    </group>
  );
}

function TeamBodySilhouette({ team, scale, palette }: {
  team: Unit['team'];
  scale: number;
  palette: TeamPalette;
}) {
  if (team === 'CT') {
    return (
      <group raycast={() => null}>
        <mesh position={[0, 0.94 * scale, 0.215 * scale]} castShadow>
          <boxGeometry args={[0.46 * scale, 0.34 * scale, 0.04 * scale]} />
          <meshStandardMaterial color="#dbeaff" roughness={0.48} metalness={0.05} emissive={palette.accent} emissiveIntensity={0.04} />
        </mesh>
        <mesh position={[0, 1.03 * scale, 0.246 * scale]} castShadow>
          <boxGeometry args={[0.28 * scale, 0.055 * scale, 0.032 * scale]} />
          <meshStandardMaterial color="#0d2f72" roughness={0.62} metalness={0.08} />
        </mesh>
        {[-0.28, 0.28].map((x) => (
          <mesh key={x} position={[x * scale, 0.46 * scale, 0.1 * scale]} rotation={[0.18, 0, x > 0 ? -0.08 : 0.08]} castShadow>
            <boxGeometry args={[0.12 * scale, 0.18 * scale, 0.09 * scale]} />
            <meshStandardMaterial color="#dbeaff" roughness={0.52} metalness={0.05} />
          </mesh>
        ))}
      </group>
    );
  }

  return (
    <group raycast={() => null}>
      <mesh position={[0, 0.98 * scale, 0.235 * scale]} rotation={[0, 0, -0.34]} castShadow>
        <boxGeometry args={[0.5 * scale, 0.085 * scale, 0.05 * scale]} />
        <meshStandardMaterial color="#ffd2d2" roughness={0.74} emissive="#501016" emissiveIntensity={0.08} />
      </mesh>
      <mesh position={[0, 0.86 * scale, 0.245 * scale]} rotation={[0, 0, 0.34]} castShadow>
        <boxGeometry args={[0.42 * scale, 0.07 * scale, 0.045 * scale]} />
        <meshStandardMaterial color={palette.headgearDark} roughness={0.82} />
      </mesh>
      <mesh position={[0.22 * scale, 1.16 * scale, -0.18 * scale]} rotation={[0.12, 0.24, -0.42]} castShadow>
        <boxGeometry args={[0.1 * scale, 0.34 * scale, 0.052 * scale]} />
        <meshStandardMaterial color={palette.headgear} roughness={0.82} />
      </mesh>
    </group>
  );
}

function RoleBodyModule({ roleId, accent, scale }: {
  roleId: RoleId;
  accent: string;
  scale: number;
}) {
  if (roleId === 'awper') {
    return (
      <group raycast={() => null}>
        <mesh position={[0.28 * scale, 1.28 * scale, -0.16 * scale]} rotation={[0.12, 0, -0.18]} castShadow>
          <boxGeometry args={[0.06 * scale, 0.6 * scale, 0.08 * scale]} />
          <meshStandardMaterial color={accent} roughness={0.32} metalness={0.25} emissive={accent} emissiveIntensity={0.16} />
        </mesh>
        <mesh position={[0.28 * scale, 1.56 * scale, -0.16 * scale]} castShadow>
          <sphereGeometry args={[0.08 * scale, 10, 6]} />
          <meshStandardMaterial color="#effbff" roughness={0.28} metalness={0.18} emissive={accent} emissiveIntensity={0.14} />
        </mesh>
      </group>
    );
  }

  if (roleId === 'entry') {
    return (
      <group raycast={() => null}>
        <mesh position={[0, 1.02 * scale, 0.27 * scale]} rotation={[Math.PI / 2, 0, Math.PI / 4]} castShadow>
          <coneGeometry args={[0.2 * scale, 0.42 * scale, 3]} />
          <meshStandardMaterial color={accent} roughness={0.48} emissive={accent} emissiveIntensity={0.1} />
        </mesh>
        <mesh position={[0, 0.78 * scale, 0.27 * scale]} castShadow>
          <boxGeometry args={[0.48 * scale, 0.06 * scale, 0.05 * scale]} />
          <meshStandardMaterial color="#fff0e8" roughness={0.72} emissive={accent} emissiveIntensity={0.06} />
        </mesh>
      </group>
    );
  }

  if (roleId === 'igl') {
    return (
      <group raycast={() => null}>
        <mesh position={[0.28 * scale, 1.18 * scale, -0.12 * scale]} castShadow>
          <boxGeometry args={[0.13 * scale, 0.42 * scale, 0.08 * scale]} />
          <meshStandardMaterial color="#171b20" roughness={0.5} metalness={0.12} />
        </mesh>
        <mesh position={[0.28 * scale, 1.18 * scale, -0.071 * scale]} castShadow>
          <planeGeometry args={[0.09 * scale, 0.3 * scale]} />
          <meshBasicMaterial color={accent} transparent opacity={0.88} depthWrite={false} />
        </mesh>
        <mesh position={[-0.24 * scale, 1.43 * scale, -0.16 * scale]} rotation={[0.1, 0, -0.22]} castShadow>
          <cylinderGeometry args={[0.014 * scale, 0.014 * scale, 0.54 * scale, 5]} />
          <meshStandardMaterial color="#1a1f27" roughness={0.32} metalness={0.5} />
        </mesh>
      </group>
    );
  }

  if (roleId === 'support') {
    return (
      <group raycast={() => null}>
        {[-0.34, 0.34].map((x) => (
          <mesh key={x} position={[x * scale, 0.86 * scale, -0.17 * scale]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.09 * scale, 0.09 * scale, 0.38 * scale, 12]} />
            <meshStandardMaterial color={accent} roughness={0.5} metalness={0.1} emissive={accent} emissiveIntensity={0.08} />
          </mesh>
        ))}
        <mesh position={[0, 1.02 * scale, -0.22 * scale]} castShadow>
          <boxGeometry args={[0.36 * scale, 0.5 * scale, 0.14 * scale]} />
          <meshStandardMaterial color="#e7ede8" roughness={0.82} />
        </mesh>
      </group>
    );
  }

  return (
    <group raycast={() => null}>
      <mesh position={[0, 1.02 * scale, -0.2 * scale]} rotation={[0.08, 0, -0.04]} castShadow>
        <boxGeometry args={[0.34 * scale, 0.54 * scale, 0.08 * scale]} />
        <meshStandardMaterial color="#1a1622" roughness={0.92} transparent opacity={0.9} emissive={accent} emissiveIntensity={0.04} />
      </mesh>
      <mesh position={[0.24 * scale, 0.82 * scale, 0.22 * scale]} rotation={[0.1, 0.38, -0.22]} castShadow>
        <boxGeometry args={[0.06 * scale, 0.26 * scale, 0.055 * scale]} />
        <meshStandardMaterial color={accent} roughness={0.56} emissive={accent} emissiveIntensity={0.12} />
      </mesh>
    </group>
  );
}

function SelectedCommandMarker({
  color,
  outlineColor,
  scale,
  spent,
}: {
  color: string;
  outlineColor: string;
  scale: number;
  spent: boolean;
}) {
  const opacity = spent ? 0.66 : 0.96;

  return (
    <group position={[0, 2.86 * scale, 0]} raycast={() => null}>
      <mesh position={[0, 0.01 * scale, 0]} rotation={[Math.PI, 0, Math.PI / 3]}>
        <coneGeometry args={[0.18 * scale, 0.32 * scale, 3]} />
        <meshBasicMaterial color={outlineColor} transparent opacity={opacity} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.012 * scale, 0]} rotation={[Math.PI, 0, Math.PI / 3]}>
        <coneGeometry args={[0.13 * scale, 0.25 * scale, 3]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
      </mesh>
    </group>
  );
}

function AnimatedUnitSpriteBody({
  unit,
  roleAccent,
  roleTagColor,
  roleTag,
  isSelected,
  isSpent,
  stateColor,
  outlineColor,
  scale,
  animationStateRef,
}: {
  unit: Unit;
  roleAccent: string;
  roleTagColor: string;
  roleTag: string;
  isSelected: boolean;
  isSpent: boolean;
  stateColor: string;
  outlineColor: string;
  scale: number;
  animationStateRef: MutableRefObject<UnitSpriteAnimationState>;
}) {
  const animationUrls = useMemo(() => getAllUnitAnimationUrls(unit.team), [unit.team]);
  const textures = useLoader(THREE.TextureLoader, animationUrls) as THREE.Texture[];
  const textureByUrl = useMemo(
    () => new Map(animationUrls.map((url, index) => [url, textures[index]] as const)),
    [animationUrls, textures]
  );
  const spriteRef = useRef<THREE.Sprite>(null);
  const spriteMaterialRef = useRef<THREE.SpriteMaterial>(null);
  const shadowRef = useRef<THREE.Mesh>(null);
  const shadowMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const currentPoseRef = useRef<UnitAnimationPose>('idle');
  const poseStartedAtRef = useRef(0);

  useFrame((state) => {
    const animation = animationStateRef.current;
    if (currentPoseRef.current !== animation.pose) {
      currentPoseRef.current = animation.pose;
      poseStartedAtRef.current = state.clock.elapsedTime;
    }

    const textureUrl = resolveUnitAnimationUrl({
      team: unit.team,
      pose: animation.pose,
      strideDistance: animation.strideDistance,
      elapsedSeconds: state.clock.elapsedTime - poseStartedAtRef.current,
      isAlive: unit.alive,
      hitPulse: animation.hitPulse,
    });
    animation.currentFrameUrl = textureUrl;
    const texture = textureByUrl.get(textureUrl);

    if (spriteRef.current) {
      spriteRef.current.position.set(0, 1.42 * scale, 0.14 * scale);
      spriteRef.current.scale.set(2.08 * scale, 2.62 * scale, 1);
    }
    if (spriteMaterialRef.current) {
      if (texture && spriteMaterialRef.current.map !== texture) {
        spriteMaterialRef.current.map = texture;
        spriteMaterialRef.current.needsUpdate = true;
      }
      spriteMaterialRef.current.color.set('#ffffff');
      spriteMaterialRef.current.opacity = isSpent ? 0.72 : 1;
    }
    if (shadowRef.current) {
      shadowRef.current.position.x = 0;
      shadowRef.current.scale.set(1, 0.46, 1);
    }
    if (shadowMaterialRef.current) {
      shadowMaterialRef.current.opacity = 0.32 + animation.movementIntensity * 0.05;
    }
  });

  return (
    <group raycast={() => null}>
      <mesh
        ref={shadowRef}
        position={[0, 0.108 * scale, -0.05 * scale]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[1, 0.46, 1]}
        renderOrder={42}
        raycast={() => null}
      >
        <circleGeometry args={[0.76 * scale, 36]} />
        <meshBasicMaterial
          ref={shadowMaterialRef}
          color="#020810"
          transparent
          opacity={0.34}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
      <sprite
        ref={spriteRef}
        position={[0, 1.42 * scale, 0.14 * scale]}
        scale={[2.08 * scale, 2.62 * scale, 1]}
        renderOrder={82}
        raycast={() => null}
      >
        <spriteMaterial
          ref={spriteMaterialRef}
          map={textures[0]}
          transparent
          color="#ffffff"
          opacity={1}
          alphaTest={0.04}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </sprite>
      <SafeText
        position={[0, 0.14 * scale, -0.82 * scale]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.26 * scale}
        color={roleTagColor}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.025}
        outlineColor="#07080d"
        font={undefined}
      >
        {roleTag}
      </SafeText>
      {isSelected && (
        <SelectedCommandMarker
          color={stateColor}
          outlineColor={outlineColor}
          scale={scale}
          spent={isSpent}
        />
      )}
      {unit.hasBomb && (
        <mesh position={[0.56 * scale, 0.72 * scale, 0.16 * scale]}>
          <boxGeometry args={[0.24 * scale, 0.17 * scale, 0.09 * scale]} />
          <meshStandardMaterial color="#882200" roughness={0.5} emissive="#882200" emissiveIntensity={0.15} />
        </mesh>
      )}
      {unit.hasDefuseKit && (
        <mesh position={[-0.56 * scale, 0.72 * scale, 0.16 * scale]}>
          <boxGeometry args={[0.2 * scale, 0.16 * scale, 0.08 * scale]} />
          <meshStandardMaterial color="#4488cc" roughness={0.5} />
        </mesh>
      )}
      <mesh position={[0, 0.16 * scale, 0.64 * scale]} raycast={() => null}>
        <boxGeometry args={[0.68 * scale, 0.052 * scale, 0.022 * scale]} />
        <meshBasicMaterial color={roleAccent} transparent opacity={0.9} depthWrite={false} depthTest={false} />
      </mesh>
    </group>
  );
}

function UnitSpriteLoadFallback({
  unit,
  roleAccent,
  scale,
}: {
  unit: Unit;
  roleAccent: string;
  scale: number;
}) {
  const palette = TEAM_RENDER_PALETTES[unit.team];

  return (
    <group raycast={() => null}>
      <mesh
        position={[0, 0.108 * scale, -0.05 * scale]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[1, 0.46, 1]}
        renderOrder={36}
      >
        <circleGeometry args={[0.68 * scale, 32]} />
        <meshBasicMaterial color="#020810" transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.96 * scale, 0.08 * scale]} castShadow>
        <boxGeometry args={[0.72 * scale, 1.22 * scale, 0.26 * scale]} />
        <meshStandardMaterial
          color={palette.vest}
          roughness={0.72}
          emissive={palette.accent}
          emissiveIntensity={0.16}
        />
      </mesh>
      <mesh position={[0, 1.74 * scale, 0.08 * scale]} castShadow>
        <sphereGeometry args={[0.25 * scale, 12, 8]} />
        <meshStandardMaterial color={palette.helmet} roughness={0.58} />
      </mesh>
      <mesh position={[0.42 * scale, 1.08 * scale, 0.22 * scale]} rotation={[0.08, 0, -0.2]} castShadow>
        <boxGeometry args={[0.12 * scale, 0.16 * scale, 1.02 * scale]} />
        <meshStandardMaterial color="#080b0f" roughness={0.38} metalness={0.32} />
      </mesh>
      <mesh position={[0, 0.2 * scale, 0.6 * scale]}>
        <boxGeometry args={[0.58 * scale, 0.055 * scale, 0.026 * scale]} />
        <meshBasicMaterial color={roleAccent} transparent opacity={0.82} depthWrite={false} />
      </mesh>
    </group>
  );
}

function MovementDebugOverlay({ unitId, angle }: { unitId: number; angle: number }) {
  const [label, setLabel] = useState<string | null>(null);
  const lastUpdateRef = useRef(-1);

  useFrame((state) => {
    const tick = Math.floor(state.clock.elapsedTime * 4);
    if (tick === lastUpdateRef.current) return;
    lastUpdateRef.current = tick;

    const debugWindow = window as unknown as {
      __CS_TACTICS_SHOW_MOVEMENT_DEBUG__?: boolean;
      __CS_TACTICS_MOVEMENT_DEBUG__?: Record<number, {
        activeRouteId: string;
        progress: number;
        speedTilesPerSecond: number;
        pose: LocomotionPose;
        endpointErrorTiles: number;
        currentFrameUrl: string;
      }>;
    };
    if (!debugWindow.__CS_TACTICS_SHOW_MOVEMENT_DEBUG__) {
      if (label !== null) setLabel(null);
      return;
    }

    const debug = debugWindow.__CS_TACTICS_MOVEMENT_DEBUG__?.[unitId];
    if (!debug) {
      setLabel('movement debug: no route');
      return;
    }

    const frameName = debug.currentFrameUrl.split('/').at(-1) ?? 'none';
    setLabel([
      `route ${debug.activeRouteId || 'idle'}`,
      `${debug.pose} ${frameName}`,
      `p ${debug.progress.toFixed(2)} spd ${debug.speedTilesPerSecond.toFixed(2)}`,
      `err ${debug.endpointErrorTiles.toFixed(3)}`,
    ].join('\n'));
  });

  if (!label) return null;

  return (
    <group position={[0, 2.95, 0]} rotation={[0, -angle, 0]} raycast={() => null}>
      <mesh position={[0, 0, -0.012]}>
        <planeGeometry args={[1.95, 0.72]} />
        <meshBasicMaterial color="#05070b" transparent opacity={0.78} depthWrite={false} />
      </mesh>
      <SafeText
        position={[0, 0, 0]}
        fontSize={0.105}
        color="#dce9ff"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.008}
        outlineColor="#000000"
        font={undefined}
      >
        {label}
      </SafeText>
    </group>
  );
}

function SoldierFigure({ unit }: { unit: Unit }) {
  const [isHovered, setIsHovered] = useState(false);
  const selectedUnitId = useGameStore((s) => s.selectedUnitId);
  const selectUnit = useGameStore((s) => s.selectUnit);
  const shootUnit = useGameStore((s) => s.shootUnit);
  const inputMode = useGameStore((s) => s.inputMode);
  const activeTeam = useGameStore((s) => s.round.activeTeam);
  const phase = useGameStore((s) => s.round.phase);
  const units = useGameStore((s) => s.units);
  const map = useGameStore((s) => s.map);
  const movementRoute = useGameStore((s) => (
    s.movementRoutes.find((route) => route.unitId === unit.id) ?? null
  ));
  const latestCombatEvent = useGameStore((s) =>
    s.combatLog.find((event) => event.attackerId === unit.id || event.targetId === unit.id)
  );
  const ts = map.tileSize;
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Mesh>(null);
  const rightLegRef = useRef<THREE.Mesh>(null);
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);
  const weaponRef = useRef<THREE.Group>(null);
  const muzzleFlashRef = useRef<THREE.Group>(null);
  const muzzleMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const muzzleLightRef = useRef<THREE.PointLight>(null);
  const hitFlashRef = useRef<THREE.Group>(null);
  const hitMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const hitRingMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const hasInitialPosition = useRef(false);
  const combatFxRef = useRef({
    id: '',
    startedAt: 0,
    isAttacker: false,
    isTarget: false,
    wasHit: false,
    wasCritical: false,
    weaponCategory: unit.weapon.category as WeaponCategory,
  });
  const movementRef = useRef<ContinuousMovementState>({
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
    targetKey: '',
    activeKey: '',
    elapsed: 0,
    duration: DEFAULT_MOVEMENT_TIMING.tileSeconds,
    queue: [],
    isRunning: false,
    routeId: '',
    clip: null,
    pose: 'idle',
    speedTilesPerSecond: 0,
    routeProgress: 0,
    endpointErrorTiles: 0,
    moveDirection: new THREE.Vector3(0, 0, 1),
    runBlend: 0,
    lastMovedAt: 0,
    lastPosition: new THREE.Vector3(),
    strideDistance: 0,
    stopPoseUntil: 0,
    lastCompletedRouteId: '',
  });
  const animationStateRef = useRef<UnitSpriteAnimationState>({
    pose: 'idle',
    strideDistance: 0,
    movementIntensity: 0,
    hitPulse: 0,
    currentFrameUrl: '',
  });

  const isSelected = selectedUnitId === unit.id;
  const isActiveTeam = unit.team === activeTeam;
  const selectedUnit = selectedUnitId !== null
    ? units.find((candidate) => candidate.id === selectedUnitId)
    : null;
  const shotPreview = selectedUnit &&
    inputMode === 'shoot' &&
    phase !== 'setup' &&
    selectedUnit.team !== unit.team &&
    selectedUnit.ap > 0 &&
    selectedUnit.ammoInClip > 0
      ? getShotPreview(map, selectedUnit, unit)
      : null;
  const isVisibleTarget = Boolean(shotPreview?.hasLineOfSight);
  const isShootableTarget = Boolean(shotPreview?.hasLineOfSight && shotPreview.inRange);
  const isSpent = isActiveTeam && unit.ap <= 0;
  const p = TEAM_RENDER_PALETTES[unit.team];
  const rc = ROLE_RENDER_CONFIG[unit.role.id];
  const rm = ROLE_MINIATURE_PROFILES[unit.role.id];
  const stateVisual = getUnitStateVisualProfile({
    isSelected,
    isHovered,
    isVisibleTarget,
    isShootableTarget,
    isSpent,
    isActiveTeam,
  });
  const baseEmissive = stateVisual === UNIT_STATE_VISUALS.live ? p.accent : stateVisual.baseEmissive;
  const baseEmissiveIntensity = stateVisual === UNIT_STATE_VISUALS.live ? 0.18 : stateVisual.baseEmissiveIntensity;
  const weaponProfile = getWeaponVisualProfile(unit.weapon.category);

  const wx = (map.width - 1 - unit.position.x) * ts + ts / 2;
  const wz = unit.position.y * ts + ts / 2;
  const angle = Math.atan2(-unit.facing.x, unit.facing.y);
  const targetPosition = useMemo(() => new THREE.Vector3(wx, 0, wz), [wx, wz]);
  const targetKey = `${unit.position.x}:${unit.position.y}`;
  const movementRouteTargets = useMemo(
    () => getMovementRouteTargets(movementRoute, map.width, ts),
    [map.width, movementRoute, ts]
  );

  useLayoutEffect(() => {
    if (groupRef.current && !hasInitialPosition.current) {
      groupRef.current.position.copy(targetPosition);
      groupRef.current.rotation.y = angle;
      movementRef.current.from.copy(targetPosition);
      movementRef.current.to.copy(targetPosition);
      movementRef.current.targetKey = targetKey;
      movementRef.current.activeKey = targetKey;
      movementRef.current.queue = [];
      movementRef.current.elapsed = 0;
      movementRef.current.duration = 0;
      movementRef.current.isRunning = false;
      movementRef.current.routeId = '';
      movementRef.current.runBlend = 0;
      movementRef.current.lastPosition.copy(targetPosition);
      movementRef.current.stopPoseUntil = 0;
      movementRef.current.lastCompletedRouteId = '';
      hasInitialPosition.current = true;
    }
  }, [angle, targetKey, targetPosition]);

  useFrame((state, delta) => {
    let shotPulse = 0;
    let hitPulse = 0;
    if (latestCombatEvent && combatFxRef.current.id !== latestCombatEvent.id) {
      combatFxRef.current = {
        id: latestCombatEvent.id,
        startedAt: state.clock.elapsedTime,
        isAttacker: latestCombatEvent.attackerId === unit.id,
        isTarget: latestCombatEvent.targetId === unit.id,
        wasHit: latestCombatEvent.hit,
        wasCritical: latestCombatEvent.critical,
        weaponCategory: latestCombatEvent.weaponCategory,
      };
    }

    const shotPresentation = getShotPresentation(combatFxRef.current.weaponCategory);
    if (combatFxRef.current.id) {
      const elapsed = state.clock.elapsedTime - combatFxRef.current.startedAt;
      if (combatFxRef.current.isAttacker) {
        shotPulse = Math.max(0, 1 - elapsed / (0.22 + shotPresentation.noiseDurationSeconds));
      }
      if (combatFxRef.current.isTarget && combatFxRef.current.wasHit) {
        hitPulse = Math.max(0, 1 - elapsed / (0.52 + shotPresentation.impactScale * 0.08));
      }
    }

    let movementIntensity = 0;
    if (groupRef.current) {
      const movement = movementRef.current;
      const aimDir = getAimWorldDirection(unit);
      const cappedDelta = Math.min(delta, MAX_MOVEMENT_FRAME_SECONDS);
      const routeReady = movementRoute
        ? Date.now() >= movementRoute.createdAt + movementRoute.delayMs
        : false;

      if (movementRoute && routeReady && movement.routeId !== movementRoute.id) {
        const routePoints = getRouteClipPointsFromCurrent(
          movementRouteTargets,
          groupRef.current.position,
          ts
        );

        movement.routeId = movementRoute.id;
        movement.queue = [];
        movement.isRunning = false;
        movement.stopPoseUntil = 0;
        if (routePoints.length >= 2) {
          movement.clip = createMovementClip({
            id: movementRoute.id,
            unitId: unit.id,
            points: routePoints,
            tileSize: ts,
            durationSeconds: Math.max(ROUTE_LOCOMOTION.minMoveSeconds, movementRoute.durationMs / 1000),
          });
        }
      }

      if (movement.targetKey !== targetKey) {
        const tileDistance = groupRef.current.position.distanceTo(targetPosition) / ts;
        const isFollowingSeededRoute = Boolean(movement.clip && movement.routeId);
        movement.targetKey = targetKey;

        if (tileDistance > TELEPORT_TILE_DISTANCE) {
          groupRef.current.position.copy(targetPosition);
          movement.from.copy(targetPosition);
          movement.to.copy(targetPosition);
          movement.activeKey = targetKey;
          movement.queue = [];
          movement.clip = null;
          movement.elapsed = 0;
          movement.duration = 0;
          movement.isRunning = false;
          movement.routeId = '';
          movement.pose = 'idle';
          movement.speedTilesPerSecond = 0;
          movement.routeProgress = 0;
          movement.endpointErrorTiles = 0;
          movement.lastPosition.copy(targetPosition);
          movement.stopPoseUntil = 0;
          movement.lastCompletedRouteId = '';
        } else if (!isFollowingSeededRoute && tileDistance > ROUTE_LOCOMOTION.endpointSnapTiles) {
          movement.clip = createMovementClip({
            id: `fallback:${unit.id}:${targetKey}:${state.clock.elapsedTime.toFixed(3)}`,
            unitId: unit.id,
            points: [groupRef.current.position.clone(), targetPosition.clone()],
            tileSize: ts,
          });
          movement.routeId = '';
          movement.queue = [];
          movement.isRunning = false;
        }
      }

      if (movement.clip) {
        const sample = advanceMovementClip(movement.clip, cappedDelta, ts);
        groupRef.current.position.copy(sample.position);
        movement.moveDirection.copy(sample.moveDirection);
        movement.speedTilesPerSecond = sample.speedTilesPerSecond;
        movement.routeProgress = sample.progress;
        movement.endpointErrorTiles = sample.endpointErrorTiles;
        movement.pose = classifyLocomotionPose(
          sample.moveDirection,
          aimDir,
          sample.phase,
          sample.speedTilesPerSecond
        );

        if (sample.phase === 'done') {
          const completedRouteId = movement.routeId || movement.clip.id;
          movement.stopPoseUntil = state.clock.elapsedTime + 0.18;
          movement.lastCompletedRouteId = completedRouteId;
          movement.pose = 'stop_brace';
          movement.clip = null;
          movement.routeId = '';
          movement.isRunning = false;
          movement.queue = [];
        }
      } else {
        movement.speedTilesPerSecond = 0;
        movement.routeProgress = 0;
        movement.endpointErrorTiles = groupRef.current.position.distanceTo(targetPosition) / ts;
        if (state.clock.elapsedTime < movement.stopPoseUntil) {
          movement.pose = 'stop_brace';
        } else {
          movement.pose = movement.endpointErrorTiles < ROUTE_LOCOMOTION.endpointSnapTiles ? 'idle' : movement.pose;
        }
      }

      const movedDistance = movement.lastPosition.distanceTo(groupRef.current.position);
      movement.strideDistance += movedDistance / ts;
      movement.lastPosition.copy(groupRef.current.position);

      if (movedDistance > 0.0001 || movement.clip) {
        movement.lastMovedAt = state.clock.elapsedTime;
        const speedBlend = THREE.MathUtils.clamp(
          movement.speedTilesPerSecond / ROUTE_LOCOMOTION.maxSpeedTilesPerSecond,
          0,
          1
        );
        movement.runBlend = THREE.MathUtils.damp(movement.runBlend, Math.max(0.28, speedBlend), 18, delta);
        movementIntensity = movement.runBlend;
      } else {
        const sinceMove = state.clock.elapsedTime - movement.lastMovedAt;
        const settleTarget = sinceMove < DEFAULT_MOVEMENT_TIMING.settleSeconds ? 0.24 : 0;
        movement.runBlend = THREE.MathUtils.damp(movement.runBlend, settleTarget, 11, delta);
        movementIntensity = movement.runBlend;
        if (groupRef.current.position.distanceTo(targetPosition) < ts * 0.02) {
          groupRef.current.position.copy(targetPosition);
        }
      }

      groupRef.current.rotation.y = dampAngle(
        groupRef.current.rotation.y,
        angle,
        movementIntensity > 0 ? 15 : 10,
        delta
      );

      if (import.meta.env.DEV) {
        const debugWindow = window as unknown as {
          __CS_TACTICS_MOVEMENT_DEBUG__?: Record<number, {
            activeRouteId: string;
            progress: number;
            speedTilesPerSecond: number;
            pose: LocomotionPose;
            endpointErrorTiles: number;
            currentFrameUrl: string;
          }>;
        };
        debugWindow.__CS_TACTICS_MOVEMENT_DEBUG__ = {
          ...(debugWindow.__CS_TACTICS_MOVEMENT_DEBUG__ ?? {}),
          [unit.id]: {
            activeRouteId: movement.routeId,
            progress: movement.routeProgress,
            speedTilesPerSecond: movement.speedTilesPerSecond,
            pose: movement.pose,
            endpointErrorTiles: movement.endpointErrorTiles,
            currentFrameUrl: animationStateRef.current.currentFrameUrl,
          },
        };
      }
    }

    const walkPhase = movementRef.current.strideDistance * Math.PI * 2.25;
    const locomotionPose = movementRef.current.pose;
    const poseStrideScale = 1;
    animationStateRef.current.pose = hitPulse > 0.04 ? 'hit' : locomotionPose;
    animationStateRef.current.strideDistance = movementRef.current.strideDistance;
    animationStateRef.current.movementIntensity = movementIntensity;
    animationStateRef.current.hitPulse = hitPulse;
    if (bodyRef.current) {
      const rootYaw = groupRef.current?.rotation.y ?? angle;
      bodyRef.current.rotation.y = dampAngle(
        bodyRef.current.rotation.y,
        DEFAULT_CAMERA_READABLE_YAW - rootYaw,
        movementIntensity > 0 ? 8 : 12,
        delta
      );
      bodyRef.current.position.x = THREE.MathUtils.damp(
        bodyRef.current.position.x,
        0,
        15,
        delta
      );
      bodyRef.current.position.y = THREE.MathUtils.damp(
        bodyRef.current.position.y,
        0,
        16,
        delta
      );
      bodyRef.current.rotation.x = THREE.MathUtils.damp(
        bodyRef.current.rotation.x,
        rm.lean,
        14,
        delta
      );
    }
    if (leftLegRef.current) {
      leftLegRef.current.rotation.x = THREE.MathUtils.damp(
        leftLegRef.current.rotation.x,
        -0.06 + movementIntensity * Math.sin(walkPhase) * 0.62 * poseStrideScale,
        18,
        delta
      );
    }
    if (rightLegRef.current) {
      rightLegRef.current.rotation.x = THREE.MathUtils.damp(
        rightLegRef.current.rotation.x,
        -0.06 + movementIntensity * -Math.sin(walkPhase) * 0.62 * poseStrideScale,
        18,
        delta
      );
    }
    if (leftArmRef.current) {
      leftArmRef.current.rotation.x = THREE.MathUtils.damp(
        leftArmRef.current.rotation.x,
        -0.58 + movementIntensity * -Math.sin(walkPhase) * 0.24 * poseStrideScale,
        18,
        delta
      );
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.x = THREE.MathUtils.damp(
        rightArmRef.current.rotation.x,
        -0.52 + movementIntensity * Math.sin(walkPhase) * 0.24 * poseStrideScale,
        18,
        delta
      );
    }
    if (weaponRef.current) {
      weaponRef.current.rotation.x = THREE.MathUtils.damp(
        weaponRef.current.rotation.x,
        movementIntensity * Math.sin(walkPhase + 0.8) * 0.055 - shotPulse * 0.22 * shotPresentation.recoilScale,
        14,
        delta
      );
      weaponRef.current.rotation.y = THREE.MathUtils.damp(
        weaponRef.current.rotation.y,
        movementIntensity * Math.sin(walkPhase * 0.5) * 0.025,
        14,
        delta
      );
      weaponRef.current.position.z = THREE.MathUtils.damp(
        weaponRef.current.position.z,
        WEAPON_REST_Z - shotPulse * 0.12 * shotPresentation.recoilScale,
        22,
        delta
      );
    }

    if (bodyRef.current && hitPulse > 0) {
      bodyRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 54) * hitPulse * 0.055;
    } else if (bodyRef.current) {
      bodyRef.current.rotation.z = THREE.MathUtils.damp(bodyRef.current.rotation.z, 0, 18, delta);
    }

    if (muzzleFlashRef.current) {
      muzzleFlashRef.current.visible = shotPulse > 0.02;
      muzzleFlashRef.current.scale.setScalar(
        0.35 + shotPulse * shotPresentation.muzzleScale * weaponProfile.muzzleScale * (combatFxRef.current.wasCritical ? 1.28 : 1)
      );
    }
    if (muzzleMaterialRef.current) {
      muzzleMaterialRef.current.opacity = Math.min(0.92, shotPulse);
      muzzleMaterialRef.current.color.set(combatFxRef.current.wasCritical ? '#ffffff' : shotPresentation.secondaryColor);
    }
    if (muzzleLightRef.current) {
      muzzleLightRef.current.intensity = shotPulse * shotPresentation.muzzleScale * weaponProfile.muzzleScale * (combatFxRef.current.wasCritical ? 2.15 : 1.25);
    }

    if (hitFlashRef.current) {
      hitFlashRef.current.visible = hitPulse > 0.02;
      hitFlashRef.current.scale.setScalar(0.7 + hitPulse * (combatFxRef.current.wasCritical ? 1.2 : 0.78));
    }
    if (hitMaterialRef.current) {
      hitMaterialRef.current.opacity = Math.min(0.58, hitPulse * 0.58);
      hitMaterialRef.current.color.set(combatFxRef.current.wasCritical ? '#ffffff' : '#ff4e6a');
    }
    if (hitRingMaterialRef.current) {
      hitRingMaterialRef.current.opacity = Math.min(0.82, hitPulse * 0.82);
      hitRingMaterialRef.current.color.set(combatFxRef.current.wasCritical ? '#ffffff' : '#ff6b82');
    }

    if (glowRef.current && isSelected) {
      const pulse = 0.3 + Math.sin(state.clock.elapsedTime * 3.5) * 0.15;
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = pulse;
    }
  });

  const mats = useMemo(() => ({
    vest: new THREE.MeshStandardMaterial({
      color: p.vest, roughness: 0.7, metalness: 0.05,
      emissive: stateVisual.vestEmissive,
      emissiveIntensity: stateVisual.vestEmissiveIntensity,
    }),
    vestDark: new THREE.MeshStandardMaterial({ color: p.vestDark, roughness: 0.8 }),
    pants: new THREE.MeshStandardMaterial({ color: p.pants, roughness: 0.85 }),
    helmet: new THREE.MeshStandardMaterial({ color: p.helmet, roughness: 0.5, metalness: 0.15 }),
    skin: new THREE.MeshStandardMaterial({ color: p.skin, roughness: 0.9 }),
    weapon: new THREE.MeshStandardMaterial({ color: p.weapon, roughness: 0.3, metalness: 0.7 }),
    armband: new THREE.MeshStandardMaterial({ color: p.armband, roughness: 0.6 }),
    roleAccent: new THREE.MeshStandardMaterial({
      color: rc.accent,
      roughness: 0.55,
      metalness: 0.12,
      emissive: rc.accent,
      emissiveIntensity: isActiveTeam && !isVisibleTarget && !isSpent ? 0.14 : 0.03,
    }),
    boot: new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.9 }),
  }), [p, rc.accent, stateVisual, isActiveTeam, isVisibleTarget, isSpent]);

  const s = rc.bodyScale;
  const muzzleAnchorZ = weaponProfile.muzzleOffset + (weaponProfile.suppressorVisible ? 0.11 : 0);
  const barrelCenterZ = weaponProfile.bodyLength * 0.5 + weaponProfile.barrelLength * 0.42;

  return (
    <group
      ref={groupRef}
      onClick={(e) => {
        e.stopPropagation();
        if (e.delta > CLICK_DRAG_THRESHOLD_PX) return;
        if (inputMode === 'shoot') {
          shootUnit(unit.id);
        } else {
          selectUnit(unit.id);
        }
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setIsHovered(true);
        document.body.style.cursor = isShootableTarget ? 'crosshair' : 'pointer';
      }}
      onPointerOut={() => {
        setIsHovered(false);
        document.body.style.cursor = 'default';
      }}
    >
      {/* Camera-readable primitive miniature root. */}
      <group scale={[MINIATURE_ROOT_SCALE, MINIATURE_ROOT_SCALE, MINIATURE_ROOT_SCALE]}>

        {/* === BASE DISC === */}
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[0.66, 32]} />
          <meshStandardMaterial
            color={p.base}
            roughness={0.8}
            emissive={baseEmissive}
            emissiveIntensity={baseEmissiveIntensity}
          />
        </mesh>

        <TeamIdentityBase team={unit.team} palette={p} roleAccent={rc.accent} />
        <RoleSilhouette roleId={unit.role.id} accent={rc.accent} opacity={stateVisual.roleOpacity} />

        {(isSelected || isHovered || isVisibleTarget) && (
          <FacingArc
            color={stateVisual.color}
            opacity={stateVisual.facingOpacity}
          />
        )}

        {(isSelected || isHovered || isVisibleTarget) && (
          <TacticalBaseBrackets
            color={stateVisual.color}
            opacity={stateVisual.bracketOpacity}
            radius={stateVisual.bracketRadius}
            length={stateVisual.bracketLength}
          />
        )}

        {/* === SELECTION RING === */}
        {isSelected && (
          <group>
            <mesh ref={glowRef} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[stateVisual.ringInner, stateVisual.ringOuter, 48]} />
              <meshBasicMaterial color={stateVisual.color} transparent opacity={stateVisual.ringOpacity} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[0, 0.073, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
              <ringGeometry args={[1.02, 1.08, 52]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.82} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
          </group>
        )}

        {isHovered && !isSelected && (
          <mesh position={[0, 0.055, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[stateVisual.ringInner, stateVisual.ringOuter, 40]} />
            <meshBasicMaterial color={stateVisual.color} transparent opacity={stateVisual.ringOpacity} side={THREE.DoubleSide} />
          </mesh>
        )}

        {isSpent && (
          <group>
            <mesh position={[0, 0.061, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
              <ringGeometry args={[stateVisual.ringInner, stateVisual.ringOuter, 40]} />
              <meshBasicMaterial color={stateVisual.color} transparent opacity={stateVisual.ringOpacity} side={THREE.DoubleSide} />
            </mesh>
            <Line
              points={[[-0.48, 0.09, -0.48], [0.48, 0.09, 0.48]]}
              color={stateVisual.color}
              lineWidth={1.8}
            />
            <SafeText
              position={[0, 0.13, 0.72]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.18}
              color={stateVisual.textColor}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.018}
              outlineColor={stateVisual.outlineColor}
              font={undefined}
            >
              DONE
            </SafeText>
          </group>
        )}

        {isVisibleTarget && (
          <>
            <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[stateVisual.ringInner, stateVisual.ringOuter, 48]} />
              <meshBasicMaterial color={stateVisual.color} transparent opacity={stateVisual.ringOpacity} side={THREE.DoubleSide} />
            </mesh>
            {isShootableTarget && (
              <mesh position={[0, 0.075, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[0.3, 28]} />
                <meshBasicMaterial color={stateVisual.color} transparent opacity={0.22} side={THREE.DoubleSide} />
              </mesh>
            )}
            <SafeText
              position={[0, 0.13, 0.84]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.22}
              color={stateVisual.textColor}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.025}
              outlineColor={stateVisual.outlineColor}
              font={undefined}
            >
              {isShootableTarget ? `${shotPreview!.hitChance}%` : 'OOR'}
            </SafeText>
          </>
        )}

        {/* === AP INDICATOR (small dots around base) === */}
        {isActiveTeam && Array.from({ length: unit.maxAp }, (_, i) => (
          <mesh
            key={`ap-${i}`}
            position={[
              Math.cos((i / unit.maxAp) * Math.PI * 2 - Math.PI / 2) * 0.55,
              0.08,
              Math.sin((i / unit.maxAp) * Math.PI * 2 - Math.PI / 2) * 0.55,
            ]}
          >
            <sphereGeometry args={[0.055, 8, 6]} />
            <meshBasicMaterial color={i < unit.ap ? '#44ee66' : '#333333'} />
          </mesh>
        ))}

        <group ref={bodyRef}>
          <Suspense fallback={<UnitSpriteLoadFallback unit={unit} roleAccent={rc.accent} scale={s} />}>
            <AnimatedUnitSpriteBody
              unit={unit}
              roleAccent={rc.accent}
              roleTagColor={stateVisual.roleTagColor}
              roleTag={rc.shortTag}
              isSelected={isSelected}
              isSpent={isSpent}
              stateColor={stateVisual.color}
              outlineColor={stateVisual.outlineColor}
              scale={s}
              animationStateRef={animationStateRef}
            />
          </Suspense>
        </group>

        <group visible={false} raycast={() => null}>
        {/* === BOOTS === */}
        <mesh position={[-rm.stanceWidth * s, 0.075, 0.1 * s]} rotation={[0, 0.18, -0.08]} castShadow material={mats.boot}>
          <boxGeometry args={[0.28 * s, 0.11, 0.34 * s]} />
        </mesh>
        <mesh position={[rm.stanceWidth * s, 0.075, -0.04 * s]} rotation={[0, -0.18, 0.08]} castShadow material={mats.boot}>
          <boxGeometry args={[0.28 * s, 0.11, 0.34 * s]} />
        </mesh>

        {/* === LEGS === */}
        <mesh ref={leftLegRef} position={[-rm.stanceWidth * 0.72 * s, 0.36 * s, 0.04 * s]} rotation={[0.08, 0, -0.1]} castShadow material={mats.pants}>
          <boxGeometry args={[0.16 * s, 0.56 * s, 0.18 * s]} />
        </mesh>
        <mesh ref={rightLegRef} position={[rm.stanceWidth * 0.72 * s, 0.36 * s, -0.02 * s]} rotation={[-0.04, 0, 0.1]} castShadow material={mats.pants}>
          <boxGeometry args={[0.16 * s, 0.56 * s, 0.18 * s]} />
        </mesh>

        {/* === TORSO / STRATBOARD BUST === */}
        <mesh position={[0, 0.72 * s, -0.02 * s]} rotation={[0, 0, 0.03]} castShadow material={mats.vestDark}>
          <boxGeometry args={[rm.torsoWidth * 0.86 * s, 0.26 * s, rm.torsoDepth * 0.88 * s]} />
        </mesh>
        <mesh position={[0, 1.0 * s, 0.03 * s]} rotation={[0.04, 0, 0]} castShadow material={mats.vest}>
          <boxGeometry args={[rm.torsoWidth * s, rm.torsoHeight * s, rm.torsoDepth * s]} />
        </mesh>

        {/* === CHEST PLATE / TEAM GEOMETRY === */}
        <mesh position={[0, 1.02 * s, (rm.torsoDepth * 0.5 + 0.035) * s]} castShadow material={mats.roleAccent}>
          <boxGeometry args={[rm.torsoWidth * 0.58 * s, 0.12 * s, 0.055 * s]} />
        </mesh>
        <TeamBodySilhouette team={unit.team} scale={s} palette={p} />
        <RoleVestGlyph roleId={unit.role.id} accent={rc.accent} scale={s} />
        <RoleBodyModule roleId={unit.role.id} accent={rc.accent} scale={s} />
        <RoleGear roleId={unit.role.id} accent={rc.accent} scale={s} />

        {/* === TEAM MARKING === */}
        {unit.team === 'CT' ? (
          <mesh position={[0, 0.98 * s, -0.19 * s]} castShadow>
            <boxGeometry args={[0.48 * s, 0.2 * s, 0.07 * s]} />
            <meshStandardMaterial color="#e9eef7" roughness={0.48} emissive="#224c84" emissiveIntensity={0.08} />
          </mesh>
        ) : (
          <mesh position={[0, 0.98 * s, 0.28 * s]} rotation={[0, 0, -0.18]} castShadow>
            <boxGeometry args={[0.48 * s, 0.095 * s, 0.065 * s]} />
            <meshStandardMaterial color="#ffd4d0" roughness={0.72} emissive="#4b0907" emissiveIntensity={0.08} />
          </mesh>
        )}
        <TeamChestBadge team={unit.team} scale={s} roleAccent={rc.accent} />

        {/* === TEAM ARMBAND (left upper arm) === */}
        <mesh position={[-(rm.shoulderWidth * 0.54) * s, 0.95 * s, 0.16 * s]} rotation={[0.1, 0, 0.28]} material={mats.armband}>
          <boxGeometry args={[0.08 * s, 0.18 * s, 0.08 * s]} />
        </mesh>

        {/* === SHOULDERS + ARMS === */}
        <mesh position={[-(rm.shoulderWidth * 0.5) * s, 1.16 * s, 0.02 * s]} rotation={[0, 0, -0.18]} castShadow material={mats.vest}>
          <boxGeometry args={[0.22 * s, rm.shoulderHeight * s, 0.23 * s]} />
        </mesh>
        <mesh position={[(rm.shoulderWidth * 0.5) * s, 1.16 * s, 0.02 * s]} rotation={[0, 0, 0.18]} castShadow material={mats.vest}>
          <boxGeometry args={[0.22 * s, rm.shoulderHeight * s, 0.23 * s]} />
        </mesh>

        {/* Braced arms, readable from the default camera. */}
        <mesh ref={leftArmRef} position={[-(rm.shoulderWidth * 0.48) * s, 0.92 * s, 0.2 * s]} rotation={[-0.58, 0.08, -0.32]} castShadow material={mats.vestDark}>
          <boxGeometry args={[0.12 * s, 0.42 * s, 0.11 * s]} />
        </mesh>
        <mesh ref={rightArmRef} position={[(rm.shoulderWidth * 0.48) * s, 0.92 * s, 0.2 * s]} rotation={[-0.52, -0.08, 0.32]} castShadow material={mats.vestDark}>
          <boxGeometry args={[0.12 * s, 0.42 * s, 0.11 * s]} />
        </mesh>

        {/* === IGL ANTENNA === */}
        {rc.hasAntenna && (
          <group position={[0.15 * s, 1.25 * s, -0.1]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.01, 0.01, 0.35, 4]} />
              <meshStandardMaterial color="#333333" roughness={0.5} metalness={0.5} />
            </mesh>
            <mesh position={[0, 0.18, 0]}>
              <sphereGeometry args={[0.02, 4, 4]} />
              <meshBasicMaterial color={rc.accent} />
            </mesh>
          </group>
        )}

        {/* === NECK === */}
        <mesh position={[0, 1.12 * s, 0]} castShadow material={mats.skin}>
          <cylinderGeometry args={[0.07 * s, 0.08 * s, 0.08 * s, 8]} />
        </mesh>

        {/* === HEAD === */}
        <mesh position={[0, 1.25 * s, 0]} castShadow material={mats.skin}>
          <sphereGeometry args={[0.16 * s * rm.headScale, 10, 7]} />
        </mesh>

        {/* === HELMET / HEADGEAR === */}
        <TeamHeadgear team={unit.team} scale={s} mats={mats} palette={p} />

        {isSelected && (
          <SelectedCommandMarker
            color={stateVisual.color}
            outlineColor={stateVisual.outlineColor}
            scale={s}
            spent={isSpent}
          />
        )}

        {/* === ROLE TAG === */}
        <SafeText
          position={[0, 0.115, -0.68]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.28}
          color={stateVisual.roleTagColor}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.035}
          outlineColor="#07080d"
          font={undefined}
        >
          {rc.shortTag}
        </SafeText>

        {/* === BOMB (T carrier) === */}
        {unit.hasBomb && (
          <group position={[0, 0.7 * s, -0.16]}>
            <mesh castShadow>
              <boxGeometry args={[0.18, 0.12, 0.08]} />
              <meshStandardMaterial color="#882200" roughness={0.5} emissive="#882200" emissiveIntensity={0.15} />
            </mesh>
            <mesh position={[0.06, 0.07, 0]}>
              <sphereGeometry args={[0.015, 4, 4]} />
              <meshBasicMaterial color="#ff2222" />
            </mesh>
          </group>
        )}

        {/* === DEFUSE KIT (CT) === */}
        {unit.hasDefuseKit && (
          <mesh position={[-0.18 * s, 0.7 * s, -0.1]} castShadow>
            <boxGeometry args={[0.08, 0.1, 0.06]} />
            <meshStandardMaterial color="#4488cc" roughness={0.5} />
          </mesh>
        )}
        </group>

        {/* Rifle stays on the gameplay-facing root while the body is biased to the camera. */}
        <group
          ref={weaponRef}
          visible={false}
          position={[0, 1.02 * s, WEAPON_REST_Z]}
          scale={[WEAPON_PRESENTATION_SCALE, WEAPON_PRESENTATION_SCALE, WEAPON_PRESENTATION_SCALE]}
        >
          <mesh rotation={[Math.PI * 0.03, 0, 0]} castShadow material={mats.weapon}>
            <boxGeometry args={[weaponProfile.bodyWidth, weaponProfile.bodyHeight, weaponProfile.bodyLength]} />
          </mesh>
          <mesh position={[0, weaponProfile.bodyHeight * 0.62, weaponProfile.bodyLength * 0.08]} castShadow>
            <boxGeometry args={[weaponProfile.bodyWidth * 0.55, 0.018, weaponProfile.bodyLength * 0.58]} />
            <meshStandardMaterial color={rc.accent} roughness={0.36} metalness={0.12} emissive={rc.accent} emissiveIntensity={0.08} />
          </mesh>
          <mesh position={[0, -weaponProfile.bodyHeight * 0.62, weaponProfile.bodyLength * 0.18]} castShadow material={mats.weapon}>
            <boxGeometry args={[weaponProfile.bodyWidth * 0.72, 0.055, weaponProfile.bodyLength * 0.18]} />
          </mesh>
          {weaponProfile.stockScale > 0 && (
            <mesh position={[0, 0, -weaponProfile.bodyLength * 0.45]} castShadow material={mats.weapon}>
              <boxGeometry args={[0.04 * weaponProfile.stockScale, 0.09, 0.12 * weaponProfile.stockScale]} />
            </mesh>
          )}
          {weaponProfile.magazineVisible && (
            <mesh position={[0, -0.07, -weaponProfile.bodyLength * 0.04]} castShadow material={mats.weapon}>
              <boxGeometry args={[0.03, 0.1, 0.04]} />
            </mesh>
          )}
          {weaponProfile.barrelLength > 0 && (
            <mesh position={[0, 0, barrelCenterZ]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[weaponProfile.barrelRadius, weaponProfile.barrelRadius * 0.86, weaponProfile.barrelLength, 8]} />
              <meshStandardMaterial color="#090909" roughness={0.25} metalness={0.7} />
            </mesh>
          )}
          <mesh position={[0, 0, muzzleAnchorZ]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[weaponProfile.barrelRadius * 1.35, weaponProfile.barrelRadius, 0.055, 8]} />
            <meshStandardMaterial color="#050505" roughness={0.22} metalness={0.82} />
          </mesh>
          {weaponProfile.scopeVisible && (
            <>
              <mesh position={[0, 0.06, 0.15]} castShadow>
                <cylinderGeometry args={[0.025, 0.03, 0.32, 8]} />
                <meshStandardMaterial color={rc.accent} roughness={0.2} metalness={0.9} emissive={rc.accent} emissiveIntensity={0.16} />
              </mesh>
              <mesh position={[0, 0.03, weaponProfile.bodyLength * 0.3]} castShadow>
                <boxGeometry args={[0.09, 0.035, 0.18]} />
                <meshStandardMaterial color="#15191f" roughness={0.22} metalness={0.65} />
              </mesh>
            </>
          )}
          {weaponProfile.suppressorVisible && (
            <mesh position={[0, 0, weaponProfile.muzzleOffset]} castShadow>
              <cylinderGeometry args={[0.035, 0.025, 0.22, 8]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.3} metalness={0.6} />
            </mesh>
          )}
          <group ref={muzzleFlashRef} position={[0, 0, muzzleAnchorZ]} visible={false} raycast={() => null}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.16, 0.34, 8]} />
              <meshBasicMaterial
                ref={muzzleMaterialRef}
                color="#ffd166"
                transparent
                opacity={0}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>
            <pointLight ref={muzzleLightRef} color="#ffd166" intensity={0} distance={2.3} decay={2} />
          </group>
        </group>

        <group ref={hitFlashRef} visible={false} raycast={() => null}>
          <mesh position={[0, 0.88 * s, 0]}>
            <sphereGeometry args={[0.38 * s, 14, 8]} />
            <meshBasicMaterial
              ref={hitMaterialRef}
              color="#ff4e6a"
              transparent
              opacity={0}
              wireframe
              depthWrite={false}
            />
          </mesh>
          <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.44, 0.72, 34]} />
            <meshBasicMaterial
              ref={hitRingMaterialRef}
              color="#ff6b82"
              transparent
              opacity={0}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </group>

        {/* === HP BAR (selected only) === */}
        {isSelected && (
          <group position={[0, 1.78 * s, 0]} rotation={[0, -angle, 0]}>
            <mesh>
              <planeGeometry args={[0.5, 0.045]} />
              <meshBasicMaterial color="#222222" transparent opacity={0.8} />
            </mesh>
            <mesh position={[(unit.hp / unit.maxHp - 1) * 0.25, 0, 0.001]}>
              <planeGeometry args={[0.5 * (unit.hp / unit.maxHp), 0.035]} />
              <meshBasicMaterial
                color={unit.hp > 60 ? '#22cc44' : unit.hp > 30 ? '#ccbb22' : '#cc2222'}
              />
            </mesh>
          </group>
        )}

        {import.meta.env.DEV && isSelected && (
          <MovementDebugOverlay unitId={unit.id} angle={angle} />
        )}
      </group>
    </group>
  );
}

function CasualtyMarker({ unit }: { unit: Unit }) {
  const map = useGameStore((s) => s.map);
  const latestCombatEvent = useGameStore((s) => s.combatLog[0]);
  const ts = map.tileSize;
  const wx = (map.width - 1 - unit.position.x) * ts + ts / 2;
  const wz = unit.position.y * ts + ts / 2;
  const palette = TEAM_RENDER_PALETTES[unit.team];
  const accent = ROLE_RENDER_CONFIG[unit.role.id].accent;
  const angle = Math.atan2(-unit.facing.x, unit.facing.y);
  const deathPulseRef = useRef({ id: '', startedAt: 0, critical: false });
  const deathRingRef = useRef<THREE.MeshBasicMaterial>(null);
  const deathShockRef = useRef<THREE.MeshBasicMaterial>(null);
  const deathGroupRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (
      latestCombatEvent?.killed &&
      latestCombatEvent.targetId === unit.id &&
      deathPulseRef.current.id !== latestCombatEvent.id
    ) {
      deathPulseRef.current = {
        id: latestCombatEvent.id,
        startedAt: state.clock.elapsedTime,
        critical: latestCombatEvent.critical,
      };
    }

    const elapsed = state.clock.elapsedTime - deathPulseRef.current.startedAt;
    const pulse = deathPulseRef.current.id ? Math.max(0, 1 - elapsed / 1.15) : 0;
    const color = deathPulseRef.current.critical ? '#ffffff' : '#ff4e6a';

    if (deathGroupRef.current) {
      deathGroupRef.current.scale.setScalar(0.7 + (1 - pulse) * 1.35);
      deathGroupRef.current.visible = pulse > 0.02;
    }
    if (deathRingRef.current) {
      deathRingRef.current.opacity = pulse * 0.72;
      deathRingRef.current.color.set(color);
    }
    if (deathShockRef.current) {
      deathShockRef.current.opacity = pulse * 0.28;
      deathShockRef.current.color.set(color);
    }
  });

  return (
    <group position={[wx, 0.055, wz]} rotation={[0, angle, 0]} raycast={() => null}>
      <group ref={deathGroupRef} visible={false}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.58, 0.88, 42]} />
          <meshBasicMaterial
            ref={deathRingRef}
            color="#ff4e6a"
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.72, 42]} />
          <meshBasicMaterial
            ref={deathShockRef}
            color="#ff4e6a"
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ts * 0.22, ts * 0.36, 28]} />
        <meshBasicMaterial color={palette.accent} transparent opacity={0.38} side={THREE.DoubleSide} />
      </mesh>

      <Suspense fallback={null}>
        <StaticUnitSpritePose unit={unit} pose="dead" scale={0.42} />
      </Suspense>

      <Line
        points={[
          [-0.36, 0.09, -0.36],
          [0.36, 0.09, 0.36],
        ]}
        color="#ff6b82"
        lineWidth={2}
      />
      <Line
        points={[
          [-0.36, 0.09, 0.36],
          [0.36, 0.09, -0.36],
        ]}
        color="#ff6b82"
        lineWidth={2}
      />

      <SafeText
        position={[0, 0.1, -0.55]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.18}
        color={accent}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.025}
        outlineColor="#09090f"
        font={undefined}
      >
        {ROLE_RENDER_CONFIG[unit.role.id].shortTag || 'OUT'}
      </SafeText>
    </group>
  );
}

export function UnitRenderer() {
  const units = useGameStore((s) => s.units);
  const map = useGameStore((s) => s.map);
  const activeTeam = useGameStore((s) => s.round.activeTeam);
  const smokes = useGameStore((s) => s.smokes);
  const visibleLiveUnits = useMemo(
    () => units.filter((unit) => unit.alive && isUnitVisibleToTeam(map, units, activeTeam, unit, smokes)),
    [activeTeam, map, smokes, units],
  );

  return (
    <group>
      {units.filter((u) => !u.alive).map((unit) => (
        <CasualtyMarker key={`dead-${unit.id}`} unit={unit} />
      ))}
      {visibleLiveUnits.map((unit) => (
        <SoldierFigure key={unit.id} unit={unit} />
      ))}
    </group>
  );
}

function StaticUnitSpritePose({
  unit,
  pose,
  scale,
}: {
  unit: Unit;
  pose: UnitAnimationPose;
  scale: number;
}) {
  const textureUrl = resolveUnitAnimationUrl({
    team: unit.team,
    pose,
    strideDistance: 0,
    elapsedSeconds: 0,
    isAlive: pose !== 'dead',
    hitPulse: 0,
  });
  const texture = useLoader(THREE.TextureLoader, textureUrl);

  return (
    <group raycast={() => null}>
      <mesh
        position={[0, 0.04 * scale, -0.05 * scale]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[1.28, 0.62, 1]}
        renderOrder={42}
      >
        <circleGeometry args={[0.76 * scale, 36]} />
        <meshBasicMaterial
          color="#020810"
          transparent
          opacity={0.44}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
      <sprite
        position={[0, 0.72 * scale, 0.1 * scale]}
        scale={[2.08 * scale, 2.62 * scale, 1]}
        renderOrder={82}
        raycast={() => null}
      >
        <spriteMaterial
          map={texture}
          transparent
          color="#ffffff"
          opacity={0.96}
          alphaTest={0.04}
          depthWrite={false}
          depthTest={false}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}
