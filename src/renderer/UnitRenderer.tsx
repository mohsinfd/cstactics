// ============================================================
// UnitRenderer: prototype tactical unit figures.
//
// Each role has a distinct silhouette:
//   AWPer - tallest, long rifle barrel, scope glint
//   Entry - bulky vest, short rifle, aggressive stance
//   IGL - radio antenna on back, tablet/map indicator
//   Support - utility belt visible, thicker torso
//   Lurker - slimmer build, suppressed weapon
//
// Teams distinguished by:
//   CT - Navy blue vest + white arm band + hard helmet
//   T  - Olive drab vest + red bandana/headwrap
//
// Current scope:
//   Selected = pulsing ring + HP bar
//   Hovered units get a readable base ring
//   Active team units glow subtly, inactive team dimmed
//   Units bob/step while moving between tiles
//   Firing recoil and muzzle scale vary by weapon class
//
// Missing: final authored sprite/model assets.
// ============================================================
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import * as THREE from 'three';
import { Line, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../game/store';
import type { Unit, RoleId, WeaponCategory } from '../game/types';
import { getShotPreview } from '../game/combat';
import { getShotPresentation } from '../game/shotPresentation';
import { DEFAULT_MOVEMENT_TIMING, getMovementSegmentDurationSeconds, getSegmentProgress } from './movementEasing';
import {
  getSpriteVisualProfile,
  getWeaponVisualProfile,
  ROLE_VISUAL_IDENTITIES,
  TEAM_VISUAL_IDENTITIES,
  type RoleVisualIdentity,
  type TeamVisualIdentity,
  type UnitBaseGlyph,
} from './unitVisualIdentity';

type TeamPalette = TeamVisualIdentity & {
  helmet: TeamVisualIdentity['headgear'];
  helmetRim: TeamVisualIdentity['headgearDark'];
};

const TEAM_RENDER_PALETTES = {
  CT: {
    ...TEAM_VISUAL_IDENTITIES.CT,
    helmet: TEAM_VISUAL_IDENTITIES.CT.headgear,
    helmetRim: TEAM_VISUAL_IDENTITIES.CT.headgearDark,
  },
  T: {
    ...TEAM_VISUAL_IDENTITIES.T,
    helmet: TEAM_VISUAL_IDENTITIES.T.headgear,
    helmetRim: TEAM_VISUAL_IDENTITIES.T.headgearDark,
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

function drawCanvasRoleGlyph(
  ctx: CanvasRenderingContext2D,
  glyph: UnitBaseGlyph,
  accent: string,
  stroke: string,
  cx: number,
  cy: number,
  scale = 1,
) {
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.fillStyle = accent;
  ctx.lineWidth = 4 * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 3 * scale;

  if (glyph === 'long') {
    ctx.beginPath();
    ctx.moveTo(cx - 20 * scale, cy + 10 * scale);
    ctx.lineTo(cx + 20 * scale, cy - 10 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + 6 * scale, cy - 3 * scale, 6 * scale, 0, Math.PI * 2);
    ctx.stroke();
  } else if (glyph === 'wedge') {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 14 * scale);
    ctx.lineTo(cx + 18 * scale, cy + 12 * scale);
    ctx.lineTo(cx, cy + 5 * scale);
    ctx.lineTo(cx - 18 * scale, cy + 12 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (glyph === 'command') {
    ctx.strokeRect(cx - 18 * scale, cy - 12 * scale, 36 * scale, 24 * scale);
    ctx.beginPath();
    ctx.moveTo(cx - 10 * scale, cy - 2 * scale);
    ctx.lineTo(cx - 2 * scale, cy + 6 * scale);
    ctx.lineTo(cx + 12 * scale, cy - 7 * scale);
    ctx.stroke();
  } else if (glyph === 'utility') {
    [-14, 0, 14].forEach((offset) => {
      ctx.fillRect(cx + offset * scale - 5 * scale, cy - 12 * scale, 10 * scale, 24 * scale);
      ctx.strokeRect(cx + offset * scale - 5 * scale, cy - 12 * scale, 10 * scale, 24 * scale);
    });
  } else {
    ctx.beginPath();
    ctx.moveTo(cx - 18 * scale, cy + 10 * scale);
    ctx.quadraticCurveTo(cx, cy - 18 * scale, cx + 18 * scale, cy + 10 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 8 * scale, cy + 8 * scale);
    ctx.lineTo(cx + 16 * scale, cy - 12 * scale);
    ctx.stroke();
  }

  ctx.restore();
}

function SafeText(props: ComponentProps<typeof Text>) {
  return (
    <Suspense fallback={null}>
      <Text {...props} />
    </Suspense>
  );
}

const TELEPORT_TILE_DISTANCE = 2.4;
const CLICK_DRAG_THRESHOLD_PX = 4;

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
  spriteOpacity: number;
  roleOpacity: number;
  roleTagColor: string;
  nameColor: string;
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
    spriteOpacity: 1,
    roleOpacity: 0.36,
    roleTagColor: '#fff8d6',
    nameColor: '#f7f1d2',
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
    spriteOpacity: 0.78,
    roleOpacity: 0.14,
    roleTagColor: '#c3cad5',
    nameColor: '#8b95a3',
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
    spriteOpacity: 0.98,
    roleOpacity: 0.44,
    roleTagColor: '#f7f2df',
    nameColor: '#d7d4ca',
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
    spriteOpacity: 0.94,
    roleOpacity: 0.24,
    roleTagColor: '#ffd7dd',
    nameColor: '#d9a6b0',
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
    spriteOpacity: 0.58,
    roleOpacity: 0.18,
    roleTagColor: '#b9a883',
    nameColor: '#847967',
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
    spriteOpacity: 0.72,
    roleOpacity: 0.16,
    roleTagColor: '#aeb6c1',
    nameColor: '#7d8793',
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
    spriteOpacity: 0.98,
    roleOpacity: 0.42,
    roleTagColor: '#f6f8fb',
    nameColor: '#cccccc',
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
    spriteOpacity: 0.58,
    roleOpacity: 0.12,
    roleTagColor: '#a3a3a3',
    nameColor: '#5f636b',
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

function createUnitSpriteTexture(team: Unit['team'], roleId: RoleId): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  const spriteScale = 4;
  canvas.width = 192 * spriteScale;
  canvas.height = 256 * spriteScale;

  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.scale(spriteScale, spriteScale);

  const spriteProfile = getSpriteVisualProfile(team, roleId);
  const { team: teamSprite, role: roleSprite } = spriteProfile;
  const accent = roleSprite.accent;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(96, 220, 52, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  const gradient = ctx.createLinearGradient(58, 44, 134, 214);
  gradient.addColorStop(0, accent);
  gradient.addColorStop(0.28, teamSprite.vest);
  gradient.addColorStop(1, teamSprite.vestDark);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Legs and boots.
  ctx.fillStyle = teamSprite.pants;
  ctx.fillRect(70, 150, 20, 55);
  ctx.fillRect(103, 150, 20, 55);
  ctx.fillStyle = '#08090d';
  ctx.fillRect(64, 198, 31, 12);
  ctx.fillRect(98, 198, 31, 12);

  // Weapon silhouette behind the chest.
  ctx.strokeStyle = '#111318';
  ctx.lineWidth = roleSprite.weapon.width;
  ctx.beginPath();
  ctx.moveTo(roleSprite.weapon.start.x, roleSprite.weapon.start.y);
  ctx.lineTo(roleSprite.weapon.end.x, roleSprite.weapon.end.y);
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.globalAlpha = roleSprite.weapon.accentAlpha;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(roleSprite.weapon.start.x + 2, roleSprite.weapon.start.y - 2);
  ctx.lineTo(roleSprite.weapon.end.x - 2, roleSprite.weapon.end.y + 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (roleSprite.weapon.scopeVisible) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(116, 78, 24, 10);
    ctx.strokeStyle = roleSprite.weapon.scopeAccent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(138, 82, 7, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Body armor.
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(64, 86);
  ctx.lineTo(128, 86);
  ctx.lineTo(141, 154);
  ctx.lineTo(119, 178);
  ctx.lineTo(73, 178);
  ctx.lineTo(51, 154);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(75, 99, 42, 13);
  ctx.fillStyle = accent;
  ctx.fillRect(76, 101, 40, 5);
  ctx.fillStyle = teamSprite.chestMark;
  ctx.fillRect(111, 116, 22, 14);
  ctx.font = '900 10px system-ui, Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = teamSprite.chestTextColor;
  ctx.strokeStyle = teamSprite.chestOutline;
  ctx.lineWidth = 2;
  ctx.strokeText(teamSprite.chestText, 122, 127);
  ctx.fillText(teamSprite.chestText, 122, 127);

  if (roleSprite.gearLayer === 'utility-belt') {
    ['#6ee7b7', '#f6d365', '#ff8a3d'].forEach((color, index) => {
      ctx.fillStyle = color;
      ctx.fillRect(66 + index * 22, 150, 13, 20);
    });
  }

  if (roleSprite.gearLayer === 'command-kit') {
    ctx.strokeStyle = '#8fffa2';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(120, 83);
    ctx.lineTo(134, 45);
    ctx.stroke();
    ctx.fillStyle = '#172033';
    ctx.fillRect(75, 126, 42, 25);
    ctx.fillStyle = '#f6d365';
    ctx.fillRect(81, 132, 30, 10);
  }

  if (roleSprite.gearLayer === 'stealth-cloak') {
    ctx.fillStyle = 'rgba(192,132,252,0.28)';
    ctx.beginPath();
    ctx.moveTo(96, 74);
    ctx.lineTo(139, 157);
    ctx.lineTo(53, 157);
    ctx.closePath();
    ctx.fill();
  }

  drawCanvasRoleGlyph(
    ctx,
    roleSprite.baseGlyph,
    accent,
    roleSprite.glyphStroke,
    roleSprite.glyphCenter.x,
    roleSprite.glyphCenter.y,
    roleSprite.glyphScale
  );

  // Arms and team marker.
  ctx.strokeStyle = teamSprite.vestDark;
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.moveTo(58, 104);
  ctx.lineTo(42, 150);
  ctx.moveTo(134, 104);
  ctx.lineTo(150, 150);
  ctx.stroke();
  ctx.strokeStyle = teamSprite.armband;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(46, 137);
  ctx.lineTo(58, 143);
  ctx.moveTo(134, 143);
  ctx.lineTo(146, 137);
  ctx.stroke();

  // Neck, face, and helmet/headwrap.
  ctx.fillStyle = teamSprite.skin;
  ctx.fillRect(85, 70, 22, 18);
  ctx.fillStyle = teamSprite.skin;
  ctx.beginPath();
  ctx.ellipse(96, 58, 21, 24, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = teamSprite.headgear;
  ctx.beginPath();
  ctx.ellipse(96, 46, 27, 20, 0, Math.PI, Math.PI * 2);
  ctx.lineTo(123, 58);
  ctx.lineTo(69, 58);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = teamSprite.armband;
  ctx.fillRect(72, 56, 48, 6);
  if (teamSprite.headgearMark === 'helmet-stripe') {
    ctx.fillStyle = teamSprite.faceShield;
    ctx.fillRect(78, 61, 36, 6);
    ctx.fillStyle = teamSprite.headgearAccent;
    ctx.fillRect(88, 34, 16, 5);
    ctx.fillStyle = teamSprite.headgear;
    ctx.fillRect(65, 54, 8, 22);
    ctx.fillRect(119, 54, 8, 22);
  } else {
    ctx.fillStyle = teamSprite.headgearAccent;
    ctx.beginPath();
    ctx.moveTo(119, 58);
    ctx.lineTo(139, 70);
    ctx.lineTo(122, 74);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = teamSprite.headgearAccentDark;
    ctx.fillRect(76, 43, 42, 7);
    ctx.beginPath();
    ctx.moveTo(74, 48);
    ctx.lineTo(58, 62);
    ctx.lineTo(75, 67);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(96, 28, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = '900 21px system-ui, Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f7f8fb';
  ctx.strokeStyle = '#07080d';
  ctx.lineWidth = 5;
  const tag = roleSprite.shortTag;
  ctx.strokeText(tag, 96, 236);
  ctx.fillText(tag, 96, 236);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
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
        <boxGeometry args={[0.2 * scale, 0.13 * scale, 0.018]} />
        <meshStandardMaterial
          color={team === 'CT' ? '#e9eef7' : '#c43232'}
          roughness={0.48}
          emissive={roleAccent}
          emissiveIntensity={0.08}
        />
      </mesh>
      <SafeText
        position={[0, 0, 0.012]}
        fontSize={0.105 * scale}
        color={team === 'CT' ? '#0f2040' : '#ffe2b5'}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.004}
        outlineColor={team === 'CT' ? '#dfeaff' : '#4a0808'}
        font={undefined}
      >
        {team}
      </SafeText>
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
            <meshStandardMaterial color={['#6ee7b7', '#f6d365', '#ff8a3d'][index]} roughness={0.48} metalness={0.15} />
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
        <mesh position={[0, 1.32 * scale, 0]} castShadow material={mats.helmet}>
          <sphereGeometry args={[0.145, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
        </mesh>
        <mesh position={[0, 1.27 * scale, 0.105]} castShadow>
          <boxGeometry args={[0.25, 0.055, 0.055]} />
          <meshStandardMaterial color="#070b12" roughness={0.28} metalness={0.35} emissive="#1a5b91" emissiveIntensity={0.12} />
        </mesh>
        <mesh position={[0, 1.365 * scale, 0.012]} castShadow>
          <boxGeometry args={[0.17, 0.025, 0.16]} />
          <meshStandardMaterial color="#dfeaff" roughness={0.4} emissive="#8ec5ff" emissiveIntensity={0.1} />
        </mesh>
        {[-0.13, 0.13].map((x) => (
          <mesh key={x} position={[x * scale, 1.26 * scale, 0.005]} castShadow>
            <boxGeometry args={[0.045, 0.12, 0.12]} />
            <meshStandardMaterial color={palette.helmetRim} roughness={0.66} metalness={0.08} />
          </mesh>
        ))}
        <mesh position={[0, 1.22 * scale, -0.07]} castShadow>
          <boxGeometry args={[0.25, 0.16, 0.05]} />
          <meshStandardMaterial color={palette.helmetRim} roughness={0.62} metalness={0.1} />
        </mesh>
      </group>
    );
  }

  return (
    <group>
      <mesh position={[0, 1.32 * scale, 0]} castShadow material={mats.helmet}>
        <sphereGeometry args={[0.14, 9, 5, 0, Math.PI * 2, 0, Math.PI * 0.58]} />
      </mesh>
      <mesh position={[0, 1.28 * scale, 0.07]} castShadow>
        <boxGeometry args={[0.28, 0.055, 0.05]} />
        <meshStandardMaterial color="#c43232" roughness={0.72} emissive="#4a0808" emissiveIntensity={0.1} />
      </mesh>
      <mesh position={[0, 1.335 * scale, 0.02]} rotation={[0, 0, 0.1]} castShadow>
        <boxGeometry args={[0.24, 0.045, 0.13]} />
        <meshStandardMaterial color="#8e2424" roughness={0.78} emissive="#3a0606" emissiveIntensity={0.08} />
      </mesh>
      <mesh position={[0.14, 1.25 * scale, -0.16]} rotation={[0.15, 0.3, -0.35]} castShadow>
        <boxGeometry args={[0.08, 0.22, 0.035]} />
        <meshStandardMaterial color="#c43232" roughness={0.8} />
      </mesh>
      <mesh position={[-0.12, 1.24 * scale, -0.15]} rotation={[0.05, -0.25, 0.42]} castShadow>
        <boxGeometry args={[0.065, 0.18, 0.032]} />
        <meshStandardMaterial color="#8e2424" roughness={0.82} />
      </mesh>
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
  const latestCombatEvent = useGameStore((s) =>
    s.combatLog.find((event) => event.attackerId === unit.id || event.targetId === unit.id)
  );
  const ts = map.tileSize;
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Mesh>(null);
  const rightLegRef = useRef<THREE.Mesh>(null);
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
  const movementRef = useRef({
    from: new THREE.Vector3(),
    to: new THREE.Vector3(),
    startedAt: 0,
    duration: DEFAULT_MOVEMENT_TIMING.tileSeconds,
    targetKey: '',
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
  const spriteTexture = useMemo(
    () => createUnitSpriteTexture(unit.team, unit.role.id),
    [unit.role.id, unit.team]
  );

  useEffect(() => () => {
    spriteTexture.dispose();
  }, [spriteTexture]);

  const wx = (map.width - 1 - unit.position.x) * ts + ts / 2;
  const wz = unit.position.y * ts + ts / 2;
  const angle = Math.atan2(-unit.facing.x, unit.facing.y);
  const targetPosition = useMemo(() => new THREE.Vector3(wx, 0, wz), [wx, wz]);
  const targetKey = `${unit.position.x}:${unit.position.y}`;

  useLayoutEffect(() => {
    if (groupRef.current && !hasInitialPosition.current) {
      groupRef.current.position.copy(targetPosition);
      groupRef.current.rotation.y = angle;
      movementRef.current.from.copy(targetPosition);
      movementRef.current.to.copy(targetPosition);
      movementRef.current.targetKey = targetKey;
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

      if (movement.targetKey !== targetKey) {
        const tileDistance = groupRef.current.position.distanceTo(targetPosition) / ts;
        movement.targetKey = targetKey;
        movement.startedAt = state.clock.elapsedTime;

        if (tileDistance > TELEPORT_TILE_DISTANCE) {
          groupRef.current.position.copy(targetPosition);
          movement.from.copy(targetPosition);
          movement.to.copy(targetPosition);
          movement.duration = 0;
        } else {
          movement.from.copy(groupRef.current.position);
          movement.to.copy(targetPosition);
          movement.duration = getMovementSegmentDurationSeconds(tileDistance);
        }
      }

      if (movement.duration > 0) {
        const elapsedMovement = state.clock.elapsedTime - movement.startedAt;
        const progress = THREE.MathUtils.clamp(
          elapsedMovement / movement.duration,
          0,
          1
        );
        const easedProgress = getSegmentProgress(
          elapsedMovement,
          movement.duration
        );
        groupRef.current.position.lerpVectors(movement.from, movement.to, easedProgress);
        movementIntensity = progress < 1
          ? 1
          : elapsedMovement < movement.duration + DEFAULT_MOVEMENT_TIMING.settleSeconds
            ? 0.35
            : 0;
      } else {
        groupRef.current.position.copy(targetPosition);
      }

      groupRef.current.rotation.y = dampAngle(
        groupRef.current.rotation.y,
        angle,
        movementIntensity > 0 ? 15 : 10,
        delta
      );
    }

    const walkPhase = state.clock.elapsedTime * 13;
    if (bodyRef.current) {
      bodyRef.current.position.y = THREE.MathUtils.damp(
        bodyRef.current.position.y,
        movementIntensity * Math.abs(Math.sin(walkPhase)) * 0.07,
        16,
        delta
      );
      bodyRef.current.rotation.x = THREE.MathUtils.damp(
        bodyRef.current.rotation.x,
        movementIntensity * Math.sin(walkPhase) * 0.045,
        14,
        delta
      );
    }
    if (leftLegRef.current) {
      leftLegRef.current.rotation.x = THREE.MathUtils.damp(
        leftLegRef.current.rotation.x,
        movementIntensity * Math.sin(walkPhase) * 0.42,
        18,
        delta
      );
    }
    if (rightLegRef.current) {
      rightLegRef.current.rotation.x = THREE.MathUtils.damp(
        rightLegRef.current.rotation.x,
        movementIntensity * -Math.sin(walkPhase) * 0.42,
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
        0.22 - shotPulse * 0.14 * shotPresentation.recoilScale,
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
      {/* Dim overlay for inactive team */}
      <group scale={[1.22, 1.22, 1.22]}>

        {/* === BASE DISC === */}
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[0.62, 32]} />
          <meshStandardMaterial
            color={p.base}
            roughness={0.8}
            emissive={baseEmissive}
            emissiveIntensity={baseEmissiveIntensity}
          />
        </mesh>

        <TeamIdentityBase team={unit.team} palette={p} roleAccent={rc.accent} />
        <RoleSilhouette roleId={unit.role.id} accent={rc.accent} opacity={stateVisual.roleOpacity} />

        <sprite
          position={[0, 1.32 * s, 0.04]}
          scale={[1.48 * s, 1.96 * s, 1]}
          raycast={() => null}
        >
          <spriteMaterial
            map={spriteTexture}
            transparent
            opacity={stateVisual.spriteOpacity}
            depthTest={false}
            depthWrite={false}
          />
        </sprite>

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
        {/* === BOOTS === */}
        <mesh position={[-0.1 * s, 0.06, 0.02]} castShadow material={mats.boot}>
          <boxGeometry args={[0.14 * s, 0.1, 0.2]} />
        </mesh>
        <mesh position={[0.1 * s, 0.06, 0.02]} castShadow material={mats.boot}>
          <boxGeometry args={[0.14 * s, 0.1, 0.2]} />
        </mesh>

        {/* === LEGS === */}
        <mesh ref={leftLegRef} position={[-0.1 * s, 0.32, 0]} castShadow material={mats.pants}>
          <cylinderGeometry args={[0.07 * s, 0.08 * s, 0.48, 6]} />
        </mesh>
        <mesh ref={rightLegRef} position={[0.1 * s, 0.32, 0]} castShadow material={mats.pants}>
          <cylinderGeometry args={[0.07 * s, 0.08 * s, 0.48, 6]} />
        </mesh>

        {/* === TORSO (vest) === */}
        <mesh position={[0, 0.82 * s, 0]} castShadow material={mats.vest}>
          <boxGeometry args={[0.5 * s, 0.54 * s, 0.3 * s]} />
        </mesh>

        {/* === VEST PLATE (front) === */}
        <mesh position={[0, 0.85 * s, 0.15 * s]} castShadow material={mats.roleAccent}>
          <boxGeometry args={[0.32 * s, 0.08 * s, 0.075]} />
        </mesh>
        <RoleVestGlyph roleId={unit.role.id} accent={rc.accent} scale={s} />

        <RoleGear roleId={unit.role.id} accent={rc.accent} scale={s} />

        {/* === TEAM MARKING === */}
        {unit.team === 'CT' ? (
          <mesh position={[0, 0.93 * s, -0.18]} castShadow>
            <boxGeometry args={[0.36 * s, 0.16 * s, 0.05]} />
            <meshStandardMaterial color="#e9eef7" roughness={0.48} emissive="#224c84" emissiveIntensity={0.08} />
          </mesh>
        ) : (
          <mesh position={[0, 0.96 * s, 0.205]} castShadow>
            <boxGeometry args={[0.38 * s, 0.07 * s, 0.05]} />
            <meshStandardMaterial color="#c43a32" roughness={0.72} emissive="#4b0907" emissiveIntensity={0.1} />
          </mesh>
        )}
        <TeamChestBadge team={unit.team} scale={s} roleAccent={rc.accent} />

        {/* === TEAM ARMBAND (left upper arm) === */}
        <mesh position={[-0.28 * s, 0.95 * s, 0]} material={mats.armband}>
          <cylinderGeometry args={[0.075 * s, 0.075 * s, 0.06, 8]} />
        </mesh>

        {/* === SHOULDERS + ARMS === */}
        <mesh position={[-0.25 * s, 1.02 * s, 0]} castShadow material={mats.vest}>
          <sphereGeometry args={[0.08 * s, 6, 4]} />
        </mesh>
        <mesh position={[0.25 * s, 1.02 * s, 0]} castShadow material={mats.vest}>
          <sphereGeometry args={[0.08 * s, 6, 4]} />
        </mesh>

        {/* Left arm (weapon hand) */}
        <mesh position={[-0.26 * s, 0.78 * s, 0.08]} castShadow material={mats.vestDark}>
          <cylinderGeometry args={[0.05 * s, 0.05 * s, 0.35, 5]} />
        </mesh>
        {/* Right arm */}
        <mesh position={[0.26 * s, 0.78 * s, 0.06]} castShadow material={mats.vestDark}>
          <cylinderGeometry args={[0.05 * s, 0.05 * s, 0.35, 5]} />
        </mesh>

        {/* === WEAPON === */}
        <group ref={weaponRef} position={[-0.12, 0.72 * s, 0.22]}>
          <mesh rotation={[Math.PI * 0.03, 0, 0]} castShadow material={mats.weapon}>
            <boxGeometry args={[weaponProfile.bodyWidth, weaponProfile.bodyHeight, weaponProfile.bodyLength]} />
          </mesh>
          {/* Stock */}
          {weaponProfile.stockScale > 0 && (
            <mesh position={[0, 0, -weaponProfile.bodyLength * 0.45]} castShadow material={mats.weapon}>
              <boxGeometry args={[0.04 * weaponProfile.stockScale, 0.09, 0.12 * weaponProfile.stockScale]} />
            </mesh>
          )}
          {/* Magazine */}
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
          {/* Scope */}
          {weaponProfile.scopeVisible && (
            <>
              <mesh position={[0, 0.06, 0.15]} castShadow>
                <cylinderGeometry args={[0.025, 0.03, 0.32, 8]} />
                <meshStandardMaterial color={rc.accent} roughness={0.2} metalness={0.9} emissive={rc.accent} emissiveIntensity={0.2} />
              </mesh>
              <mesh position={[0, 0.03, weaponProfile.bodyLength * 0.3]} castShadow>
                <boxGeometry args={[0.09, 0.035, 0.18]} />
                <meshStandardMaterial color="#15191f" roughness={0.22} metalness={0.65} />
              </mesh>
            </>
          )}
          {/* Suppressor */}
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

        {/* === IGL ANTENNA === */}
        {rc.hasAntenna && (
          <group position={[0.15 * s, 1.25 * s, -0.1]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.01, 0.01, 0.35, 4]} />
              <meshStandardMaterial color="#333333" roughness={0.5} metalness={0.5} />
            </mesh>
            <mesh position={[0, 0.18, 0]}>
              <sphereGeometry args={[0.02, 4, 4]} />
              <meshBasicMaterial color="#44ff44" />
            </mesh>
          </group>
        )}

        {/* === NECK === */}
        <mesh position={[0, 1.12 * s, 0]} castShadow material={mats.skin}>
          <cylinderGeometry args={[0.05, 0.07, 0.06, 6]} />
        </mesh>

        {/* === HEAD === */}
        <mesh position={[0, 1.24 * s, 0]} castShadow material={mats.skin}>
          <sphereGeometry args={[0.12, 8, 6]} />
        </mesh>

        {/* === HELMET / HEADGEAR === */}
        <TeamHeadgear team={unit.team} scale={s} mats={mats} palette={p} />

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

        {/* === NAME === */}
        <SafeText
          position={[0, 0.115, -0.95]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.18}
          color={stateVisual.nameColor}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.015}
          outlineColor="#000000"
          font={undefined}
        >
          {unit.name}
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

      <mesh position={[0, 0.025, 0]} rotation={[Math.PI / 2, 0, 0.18]} castShadow>
        <capsuleGeometry args={[0.12, 0.55, 4, 8]} />
        <meshStandardMaterial
          color={palette.vestDark}
          roughness={0.78}
          metalness={0.02}
          transparent
          opacity={0.86}
        />
      </mesh>
      <mesh position={[0.2, 0.03, -0.08]} rotation={[Math.PI / 2, 0, -0.35]} castShadow>
        <capsuleGeometry args={[0.045, 0.34, 3, 6]} />
        <meshStandardMaterial color={palette.pants} roughness={0.8} transparent opacity={0.78} />
      </mesh>
      <mesh position={[-0.2, 0.03, 0.07]} rotation={[Math.PI / 2, 0, 0.35]} castShadow>
        <capsuleGeometry args={[0.045, 0.34, 3, 6]} />
        <meshStandardMaterial color={palette.pants} roughness={0.8} transparent opacity={0.78} />
      </mesh>

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
  return (
    <group>
      {units.filter((u) => !u.alive).map((unit) => (
        <CasualtyMarker key={`dead-${unit.id}`} unit={unit} />
      ))}
      {units.filter((u) => u.alive).map((unit) => (
        <SoldierFigure key={unit.id} unit={unit} />
      ))}
    </group>
  );
}
