// ============================================================
// UnitRenderer: Professional tactical soldier figures.
//
// Each role has a distinct silhouette:
//   AWPer — tallest, long rifle barrel, scope glint
//   Entry — bulky vest, short rifle, aggressive stance
//   IGL — radio antenna on back, tablet/map indicator
//   Support — utility belt visible, thicker torso
//   Lurker — slimmer build, suppressed weapon
//
// Teams distinguished by:
//   CT — Navy blue vest + white arm band + POLICE text
//   T  — Olive drab vest + red bandana/headwrap
//
// Selected = pulsing ring + HP bar
// Active team units glow subtly, inactive team dimmed
// ============================================================
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../game/store';
import type { Unit } from '../game/types';

const CT_PALETTE = {
  vest: '#1e3f7a',
  vestDark: '#0f2040',
  pants: '#1a2535',
  helmet: '#2a4e8a',
  helmetRim: '#1a3060',
  skin: '#d4a574',
  armband: '#ffffff',
  accent: '#5599ee',
  weapon: '#2a2a2a',
  base: '#0e1e3a',
  dimFactor: 0.4,
};

const T_PALETTE = {
  vest: '#5c5030',
  vestDark: '#3a3420',
  pants: '#3a3528',
  helmet: '#8a7050',    // bandana/balaclava
  helmetRim: '#5c4a30',
  skin: '#c8a882',
  armband: '#cc3333',   // red arm band
  accent: '#e8b630',
  weapon: '#333333',
  base: '#3a2a10',
  dimFactor: 0.4,
};

const ROLE_TAGS: Record<string, string> = {
  awper: 'AWP',
  entry: 'ENTRY',
  igl: 'IGL',
  support: 'SUP',
  lurker: 'LURK',
};

// Role-specific weapon lengths and body modifications
const ROLE_CONFIG: Record<string, { weaponLen: number; bodyScale: number; hasScope: boolean; hasAntenna: boolean }> = {
  awper:   { weaponLen: 1.2,  bodyScale: 1.0, hasScope: true,  hasAntenna: false },
  entry:   { weaponLen: 0.85, bodyScale: 1.1, hasScope: false, hasAntenna: false },
  igl:     { weaponLen: 0.75, bodyScale: 1.0, hasScope: false, hasAntenna: true  },
  support: { weaponLen: 0.75, bodyScale: 1.05, hasScope: false, hasAntenna: false },
  lurker:  { weaponLen: 0.8,  bodyScale: 0.95, hasScope: false, hasAntenna: false },
};

function SoldierFigure({ unit }: { unit: Unit }) {
  const selectedUnitId = useGameStore((s) => s.selectedUnitId);
  const selectUnit = useGameStore((s) => s.selectUnit);
  const activeTeam = useGameStore((s) => s.round.activeTeam);
  const map = useGameStore((s) => s.map);
  const ts = map.tileSize;
  const glowRef = useRef<THREE.Mesh>(null);

  const isSelected = selectedUnitId === unit.id;
  const isActiveTeam = unit.team === activeTeam;
  const p = unit.team === 'CT' ? CT_PALETTE : T_PALETTE;
  const rc = ROLE_CONFIG[unit.role.id] || ROLE_CONFIG.entry;

  const wx = unit.position.x * ts + ts / 2;
  const wz = unit.position.y * ts + ts / 2;
  const angle = Math.atan2(unit.facing.x, unit.facing.y);

  // Dim factor for inactive team
  const dim = isActiveTeam ? 1.0 : p.dimFactor;

  useFrame((state) => {
    if (glowRef.current && isSelected) {
      const pulse = 0.3 + Math.sin(state.clock.elapsedTime * 3.5) * 0.15;
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = pulse;
    }
  });

  const mats = useMemo(() => ({
    vest: new THREE.MeshStandardMaterial({
      color: p.vest, roughness: 0.7, metalness: 0.05,
      emissive: isSelected ? p.accent : '#000000',
      emissiveIntensity: isSelected ? 0.3 : 0,
    }),
    vestDark: new THREE.MeshStandardMaterial({ color: p.vestDark, roughness: 0.8 }),
    pants: new THREE.MeshStandardMaterial({ color: p.pants, roughness: 0.85 }),
    helmet: new THREE.MeshStandardMaterial({ color: p.helmet, roughness: 0.5, metalness: 0.15 }),
    skin: new THREE.MeshStandardMaterial({ color: p.skin, roughness: 0.9 }),
    weapon: new THREE.MeshStandardMaterial({ color: p.weapon, roughness: 0.3, metalness: 0.7 }),
    armband: new THREE.MeshStandardMaterial({ color: p.armband, roughness: 0.6 }),
    boot: new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.9 }),
  }), [p, isSelected]);

  const s = rc.bodyScale;

  return (
    <group
      position={[wx, 0, wz]}
      rotation={[0, angle, 0]}
      onClick={(e) => { e.stopPropagation(); selectUnit(unit.id); }}
      onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { document.body.style.cursor = 'default'; }}
    >
      {/* Dim overlay for inactive team */}
      <group scale={[1, 1, 1]}>

        {/* === BASE DISC === */}
        <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[0.5, 24]} />
          <meshStandardMaterial
            color={p.base}
            roughness={0.8}
            emissive={isSelected ? p.accent : (isActiveTeam ? p.accent : '#000000')}
            emissiveIntensity={isSelected ? 0.6 : (isActiveTeam ? 0.15 : 0)}
          />
        </mesh>

        {/* === SELECTION RING === */}
        {isSelected && (
          <mesh ref={glowRef} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.45, 0.7, 32]} />
            <meshBasicMaterial color={p.accent} transparent opacity={0.3} side={THREE.DoubleSide} />
          </mesh>
        )}

        {/* === AP INDICATOR (small dots around base) === */}
        {isActiveTeam && Array.from({ length: unit.maxAp }, (_, i) => (
          <mesh
            key={`ap-${i}`}
            position={[
              Math.cos((i / unit.maxAp) * Math.PI * 2 - Math.PI / 2) * 0.55,
              0.06,
              Math.sin((i / unit.maxAp) * Math.PI * 2 - Math.PI / 2) * 0.55,
            ]}
          >
            <sphereGeometry args={[0.04, 6, 4]} />
            <meshBasicMaterial color={i < unit.ap ? '#44ee66' : '#333333'} />
          </mesh>
        ))}

        {/* === BOOTS === */}
        <mesh position={[-0.1 * s, 0.06, 0.02]} castShadow material={mats.boot}>
          <boxGeometry args={[0.14 * s, 0.1, 0.2]} />
        </mesh>
        <mesh position={[0.1 * s, 0.06, 0.02]} castShadow material={mats.boot}>
          <boxGeometry args={[0.14 * s, 0.1, 0.2]} />
        </mesh>

        {/* === LEGS === */}
        <mesh position={[-0.1 * s, 0.32, 0]} castShadow material={mats.pants}>
          <cylinderGeometry args={[0.07 * s, 0.08 * s, 0.48, 6]} />
        </mesh>
        <mesh position={[0.1 * s, 0.32, 0]} castShadow material={mats.pants}>
          <cylinderGeometry args={[0.07 * s, 0.08 * s, 0.48, 6]} />
        </mesh>

        {/* === TORSO (vest) === */}
        <mesh position={[0, 0.82 * s, 0]} castShadow material={mats.vest}>
          <boxGeometry args={[0.44 * s, 0.50 * s, 0.26 * s]} />
        </mesh>

        {/* === VEST PLATE (front) === */}
        <mesh position={[0, 0.85 * s, 0.12 * s]} castShadow material={mats.vestDark}>
          <boxGeometry args={[0.30 * s, 0.25 * s, 0.06]} />
        </mesh>

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
        <group position={[-0.12, 0.72 * s, 0.22]}>
          <mesh rotation={[Math.PI * 0.03, 0, 0]} castShadow material={mats.weapon}>
            <boxGeometry args={[0.05, 0.07, rc.weaponLen]} />
          </mesh>
          {/* Stock */}
          <mesh position={[0, 0, -rc.weaponLen * 0.45]} castShadow material={mats.weapon}>
            <boxGeometry args={[0.04, 0.09, 0.12]} />
          </mesh>
          {/* Magazine */}
          {rc.weaponLen > 0.5 && (
            <mesh position={[0, -0.07, 0]} castShadow material={mats.weapon}>
              <boxGeometry args={[0.03, 0.10, 0.04]} />
            </mesh>
          )}
          {/* Scope (AWPer only) */}
          {rc.hasScope && (
            <mesh position={[0, 0.06, 0.15]} castShadow>
              <cylinderGeometry args={[0.015, 0.02, 0.25, 6]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.2} metalness={0.9} />
            </mesh>
          )}
          {/* Suppressor (Lurker) */}
          {unit.role.id === 'lurker' && (
            <mesh position={[0, 0, rc.weaponLen * 0.55]} castShadow>
              <cylinderGeometry args={[0.025, 0.02, 0.15, 6]} />
              <meshStandardMaterial color="#1a1a1a" roughness={0.3} metalness={0.6} />
            </mesh>
          )}
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
        <mesh position={[0, 1.32 * s, 0]} castShadow material={mats.helmet}>
          <sphereGeometry args={[0.14, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        </mesh>
        {/* Helmet rim */}
        <mesh position={[0, 1.26 * s, 0.02]} castShadow>
          <boxGeometry args={[0.26, 0.03, 0.16]} />
          <meshStandardMaterial color={p.helmetRim} roughness={0.6} />
        </mesh>

        {/* === ROLE TAG === */}
        <Text
          position={[0, 1.65 * s, 0]}
          fontSize={0.22}
          color={p.accent}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.025}
          outlineColor="#000000"
          font={undefined}
          rotation={[0, -angle, 0]}
        >
          {ROLE_TAGS[unit.role.id] || '???'}
        </Text>

        {/* === NAME === */}
        <Text
          position={[0, 1.48 * s, 0]}
          fontSize={0.15}
          color={isActiveTeam ? '#cccccc' : '#666666'}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.015}
          outlineColor="#000000"
          font={undefined}
          rotation={[0, -angle, 0]}
        >
          {unit.name}
        </Text>

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

export function UnitRenderer() {
  const units = useGameStore((s) => s.units);
  return (
    <group>
      {units.filter((u) => u.alive).map((unit) => (
        <SoldierFigure key={unit.id} unit={unit} />
      ))}
    </group>
  );
}
