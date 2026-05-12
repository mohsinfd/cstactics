// ============================================================
// MapRenderer: prototype Inferno renderer.
//
// Current scope:
// - Floor tiles with subtle grid edges
// - Building mass (walls) with slight color variation
// - Cover objects with distinct materials
// - Bombsite plant zone indicators
// - Callout name labels floating above map areas
// - Walkable range highlight with AP bands and tactical boundary outlines
// - Hovered destination tile feedback with threat/cover information
// - Path preview line
// - Planned move previews
// - LOS shot previews and watched-lane overlays
// - Interactive invisible plane for click/hover
//
// Missing: flash/molly utility volumes, richer animation, and final art assets.
// ============================================================
import { Suspense, useMemo, useCallback, useRef, type ComponentProps } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Line, Text } from '@react-three/drei';
import { useGameStore } from '../game/store';
import { getCalloutLabels } from '../game/maps/inferno';
import type { CoverObject, MapData, TileCoord } from '../game/types';
import { getCrossingHeldAngles } from '../game/threats';
import { getShotPreview } from '../game/combat';
import { getWatchedLane } from '../game/los';

const CLICK_DRAG_THRESHOLD_PX = 4;

function SafeText(props: ComponentProps<typeof Text>) {
  return (
    <Suspense fallback={null}>
      <Text {...props} />
    </Suspense>
  );
}

// --- Color palette: muted tactical tones ---
const TILE_COLORS: Record<string, string> = {
  floor:       '#6f7b8e',
  bombsite_a:  '#963d3d',
  bombsite_b:  '#963d3d',
  spawn_t:     '#c59b2f',
  spawn_ct:    '#2d80bd',
  wall:        '#171b24',
  cover_half:  '#c0a661',
  cover_full:  '#8d7650',
  out_of_bounds: '#11151d',
};

const WALL_HEIGHT = 0.95;
const COVER_HALF_H = 0.9;
const COVER_FULL_H = 1.8;
const FLOOR_H = 0.1;
const GRID_GAP = 0.003; // nearly seamless so the silhouette reads before the grid
const MOVE_ONE_AP_COLOR = '#5df2ff';
const MOVE_TWO_AP_COLOR = '#f7cf5f';
const MOVE_BOUNDARY_COLOR = '#9dfcff';
const THREAT_COLOR = '#ff8a3d';
const SMOKE_PREVIEW_COLOR = '#c5d1df';
const SMOKE_THROW_RANGE = 12;
const SMOKE_RADIUS_TILES = 2;
const KEY_CALLOUTS = new Set([
  'T Spawn',
  'Upper Banana',
  'B Site',
  'Mid',
  'Second Mid',
  'Apartments',
  'A Site',
  'Arch',
  'CT Spawn',
]);

function displayCalloutName(name: string): string {
  if (name.includes('Banana')) return 'Banana';
  if (name === 'Second Mid') return '2nd Mid';
  if (name === 'Apartments') return 'Apps';
  return name;
}

function tileWorld(x: number, y: number, ts: number): [number, number, number] {
  return [(90 - 1 - x) * ts + ts / 2, 0, y * ts + ts / 2];
}

function gridDistance(a: TileCoord, b: TileCoord): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

type LinePoint = [number, number, number];
type BoundarySegment = [LinePoint, LinePoint];

function areaCenterWorldX(mapWidth: number, x: number, width: number, ts: number): number {
  return (mapWidth - x - width / 2) * ts;
}

// ---- Floor tiles (instanced per type) ----
function FloorLayer() {
  const map = useGameStore((s) => s.map);
  const ts = map.tileSize;

  const groups = useMemo(() => {
    const g: Record<string, { pos: [number, number, number][]; elev: number[] }> = {};
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const t = map.grid[y]?.[x];
        if (!t || !t.walkable) continue;
        const key = t.type;
        if (!g[key]) g[key] = { pos: [], elev: [] };
        g[key].pos.push(tileWorld(x, y, ts));
        g[key].elev.push(t.elevation);
      }
    }
    return g;
  }, [map, ts]);

  return (
    <>
      {Object.entries(groups).map(([type, data]) => (
        <InstancedFloor key={type} positions={data.pos} elevations={data.elev}
          color={TILE_COLORS[type] || TILE_COLORS.floor} tileSize={ts} />
      ))}
    </>
  );
}

function InstancedFloor({ positions, elevations, color, tileSize }: {
  positions: [number, number, number][]; elevations: number[];
  color: string; tileSize: number;
}) {
  const mesh = useMemo(() => {
    const size = tileSize - GRID_GAP;
    const geo = new THREE.BoxGeometry(size, FLOOR_H, size);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0.02 });
    const inst = new THREE.InstancedMesh(geo, mat, positions.length);
    const d = new THREE.Object3D();
    positions.forEach(([x, , z], i) => {
      d.position.set(x, elevations[i] * tileSize * 0.4, z);
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.receiveShadow = true;
    return inst;
  }, [positions, elevations, color, tileSize]);
  return <primitive object={mesh} />;
}

// ---- Walls (readable perimeter mass, not full black building slabs) ----
function WallLayer() {
  const map = useGameStore((s) => s.map);
  const ts = map.tileSize;

  const wallPositions = useMemo(() => {
    const p: [number, number, number][] = [];
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.grid[y]?.[x]?.type !== 'wall') continue;
        const touchesFloor = dirs.some(([dx, dy]) => map.grid[y + dy]?.[x + dx]?.walkable);
        if (touchesFloor) p.push(tileWorld(x, y, ts));
      }
    }
    return p;
  }, [map, ts]);

  const mesh = useMemo(() => {
    if (wallPositions.length === 0) return null;
    const geo = new THREE.BoxGeometry(ts - GRID_GAP, WALL_HEIGHT, ts - GRID_GAP);
    const mat = new THREE.MeshStandardMaterial({
      color: TILE_COLORS.wall,
      roughness: 0.86,
      metalness: 0.02,
      emissive: '#05070b',
      emissiveIntensity: 0.08,
    });
    const inst = new THREE.InstancedMesh(geo, mat, wallPositions.length);
    const d = new THREE.Object3D();

    // Add slight random color variation per instance
    const colorAttr = new Float32Array(wallPositions.length * 3);
    const baseColor = new THREE.Color(TILE_COLORS.wall);
    wallPositions.forEach(([x, , z], i) => {
      d.position.set(x, WALL_HEIGHT / 2, z);
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);

      // Subtle variation keeps the boundary from looking tiled-flat.
      const hash = ((x * 73 + z * 137) % 100) / 100;
      const variation = 0.82 + hash * 0.14;
      colorAttr[i * 3] = baseColor.r * variation;
      colorAttr[i * 3 + 1] = baseColor.g * variation;
      colorAttr[i * 3 + 2] = baseColor.b * variation;
    });

    inst.instanceMatrix.needsUpdate = true;
    inst.instanceColor = new THREE.InstancedBufferAttribute(colorAttr, 3);
    inst.castShadow = true;
    inst.receiveShadow = true;
    return inst;
  }, [wallPositions, ts]);

  if (!mesh) return null;
  return <primitive object={mesh} />;
}

// ---- Cover objects ----
function CoverLayer() {
  const map = useGameStore((s) => s.map);
  const ts = map.tileSize;

  return (
    <>
      {map.coverObjects.map((c, i) => {
        const cx = areaCenterWorldX(map.width, c.x, c.width, ts);
        const cz = (c.y + c.height / 2) * ts;
        const h = c.coverType === 'half' ? COVER_HALF_H : COVER_FULL_H;

        return (
          <group key={i}>
            <CoverProp cover={c} x={cx} z={cz} h={h} tileSize={ts} />
            {/* Cover label */}
            <SafeText
              position={[cx, h + 0.08, cz]}
              rotation={[-Math.PI / 2, 0, Math.PI]}
              fontSize={0.18}
              color="#dcc77e"
              fillOpacity={0.45}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.015}
              outlineColor="#000000"
              font={undefined}
            >
              {c.label}
            </SafeText>
          </group>
        );
      })}
    </>
  );
}

// ---- Bombsite plant zone indicators ----
function BombsiteMarkers() {
  const map = useGameStore((s) => s.map);
  const ts = map.tileSize;

  const sites = useMemo(() => {
    return (['A', 'B'] as const).map((site) => {
      const zone = map.plantZones[site];
      const w = (zone.max.x - zone.min.x) * ts;
      const h = (zone.max.y - zone.min.y) * ts;
      const width = zone.max.x - zone.min.x;
      const cx = areaCenterWorldX(map.width, zone.min.x, width, ts);
      const cz = (zone.min.y + (zone.max.y - zone.min.y) / 2) * ts;
      return { site, cx, cz, w, h };
    });
  }, [map, ts]);

  return (
    <>
      {sites.map(({ site, cx, cz, w, h }) => (
        <group key={site}>
          {/* Glowing plant zone */}
          <mesh position={[cx, FLOOR_H + 0.03, cz]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[w, h]} />
            <meshBasicMaterial color="#e44740" transparent opacity={0.32} side={THREE.DoubleSide} />
          </mesh>
          {/* Site letter */}
          <SafeText
            position={[cx, FLOOR_H + 0.08, cz]}
            rotation={[-Math.PI / 2, 0, Math.PI]}
            fontSize={2.65}
            color="#ffdad5"
            fillOpacity={0.94}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.06}
            outlineColor="#3f0f0d"
            font={undefined}
          >
            {site}
          </SafeText>
        </group>
      ))}
    </>
  );
}

// ---- Callout labels floating above map ----
function CalloutLabels() {
  const map = useGameStore((s) => s.map);
  const ts = map.tileSize;

  const labels = useMemo(() => {
    const all = getCalloutLabels();
    // Deduplicate: only show unique names (first occurrence)
    const seen = new Set<string>();
    return all.filter((l) => {
      const displayName = displayCalloutName(l.name);
      if (!KEY_CALLOUTS.has(l.name) || seen.has(displayName)) return false;
      seen.add(displayName);
      return true;
    });
  }, []);

  return (
    <>
      {labels.map((l) => {
        const wx = (map.width - 1 - l.x) * ts + ts / 2;
        const wz = l.y * ts + ts / 2;
        return (
          <SafeText
            key={l.name}
            position={[wx, FLOOR_H + 0.09, wz]}
            rotation={[-Math.PI / 2, 0, Math.PI]}
            fontSize={1.55}
            color="#f4f7fb"
            fillOpacity={0.82}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.12}
            outlineColor="#0b0d12"
            outlineOpacity={0.85}
            font={undefined}
          >
            {displayCalloutName(l.name).toUpperCase()}
          </SafeText>
        );
      })}
    </>
  );
}

function SmokeLayer() {
  const smokes = useGameStore((s) => s.smokes);
  const map = useGameStore((s) => s.map);
  const ts = map.tileSize;

  if (smokes.length === 0) return null;

  return (
    <>
      {smokes.map((smoke) => {
        const [wx, , wz] = tileWorld(smoke.position.x, smoke.position.y, ts);
        const radius = smoke.radius * ts;
        const color = smoke.team === 'CT' ? '#a9c7e8' : '#d9c89a';
        return (
          <group key={smoke.id} position={[wx, 0, wz]} raycast={() => null}>
            <mesh position={[0, FLOOR_H + 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[radius, 40]} />
              <meshBasicMaterial color={color} transparent opacity={0.2} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <mesh position={[0, FLOOR_H + 0.48, 0]}>
              <cylinderGeometry args={[radius * 0.94, radius * 0.72, 0.78, 36, 1, true]} />
              <meshStandardMaterial
                color="#b8c0ca"
                transparent
                opacity={0.26}
                roughness={1}
                metalness={0}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>
            <mesh position={[0, FLOOR_H + 0.91, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[radius * 0.48, radius * 0.92, 40]} />
              <meshBasicMaterial color="#eef4fb" transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <SafeText
              position={[0, FLOOR_H + 0.98, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.2}
              color="#eef4fb"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.025}
              outlineColor="#313943"
              font={undefined}
            >
              SMOKE
            </SafeText>
          </group>
        );
      })}
    </>
  );
}

// ---- Walkable range highlight ----
function WalkableHighlight() {
  const movementTiles = useGameStore((s) => s.movementTiles);
  const map = useGameStore((s) => s.map);
  const ts = map.tileSize;

  const groups = useMemo(() => {
    const oneAp = movementTiles.filter((tile) => tile.apCost <= 1);
    const twoAp = movementTiles.filter((tile) => tile.apCost >= 2);
    return { oneAp, twoAp };
  }, [movementTiles]);

  return (
    <>
      <MovementBand tiles={groups.twoAp} color={MOVE_TWO_AP_COLOR} opacity={0.15} tileSize={ts} />
      <MovementBand tiles={groups.oneAp} color={MOVE_ONE_AP_COLOR} opacity={0.18} tileSize={ts} />
      <MovementBoundary
        tiles={movementTiles}
        color={MOVE_BOUNDARY_COLOR}
        tileSize={ts}
        y={FLOOR_H + 0.125}
        lineWidth={2.4}
      />
      <MovementBoundary
        tiles={groups.oneAp}
        color={MOVE_ONE_AP_COLOR}
        tileSize={ts}
        y={FLOOR_H + 0.135}
        lineWidth={1.35}
        opacity={0.72}
      />
    </>
  );
}

function CoverProp({
  cover,
  x,
  z,
  h,
  tileSize,
}: {
  cover: CoverObject;
  x: number;
  z: number;
  h: number;
  tileSize: number;
}) {
  const width = cover.width * tileSize * 0.88;
  const depth = cover.height * tileSize * 0.88;
  const label = cover.label.toLowerCase();

  if (label.includes('fountain')) {
    return <FountainProp x={x} z={z} width={width} depth={depth} />;
  }
  if (label.includes('banana car') || label === 'truck') {
    return <VehicleProp x={x} z={z} width={width} depth={depth} isTruck={label === 'truck'} />;
  }
  if (label.includes('coffin')) {
    return <CoffinsProp x={x} z={z} width={width} depth={depth} height={h} />;
  }
  if (label.includes('orange')) {
    return <OrangesProp x={x} z={z} width={width} depth={depth} height={h} />;
  }
  if (label.includes('logs')) {
    return <LogsProp x={x} z={z} width={width} depth={depth} />;
  }
  if (label.includes('sandbags')) {
    return <SandbagsProp x={x} z={z} width={width} depth={depth} />;
  }
  if (label.includes('library shelf')) {
    return <LibraryShelfProp x={x} z={z} width={width} depth={depth} height={h} />;
  }
  if (label.includes('pillar')) {
    return <PillarProp x={x} z={z} height={h} />;
  }
  if (label.includes('rail') || label.includes('wall')) {
    return <WallStripProp x={x} z={z} width={width} depth={depth} height={h} />;
  }

  const color = cover.coverType === 'half' ? '#8a7d5a' : '#6a6050';
  return (
    <mesh position={[x, h / 2, z]} castShadow receiveShadow>
      <boxGeometry args={[width, h, depth]} />
      <meshStandardMaterial color={color} roughness={0.82} metalness={0.03} />
    </mesh>
  );
}

function VehicleProp({
  x,
  z,
  width,
  depth,
  isTruck,
}: {
  x: number;
  z: number;
  width: number;
  depth: number;
  isTruck: boolean;
}) {
  const bodyColor = isTruck ? '#6f776f' : '#56473b';
  const trimColor = isTruck ? '#b9c2b5' : '#2d2b28';
  const bodyH = isTruck ? 0.68 : 0.46;
  const cabinH = isTruck ? 0.55 : 0.34;

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, bodyH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, bodyH, depth * 0.8]} />
        <meshStandardMaterial color={bodyColor} roughness={0.58} metalness={0.22} />
      </mesh>
      <mesh position={[width * 0.18, bodyH + cabinH / 2 - 0.04, -depth * 0.02]} castShadow>
        <boxGeometry args={[width * 0.42, cabinH, depth * 0.62]} />
        <meshStandardMaterial color={trimColor} roughness={0.5} metalness={0.25} />
      </mesh>
      {[-0.34, 0.34].map((sx) => [-0.35, 0.35].map((sz) => (
        <mesh key={`${sx}-${sz}`} position={[sx * width, 0.14, sz * depth]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.14, 0.14, 0.12, 12]} />
          <meshStandardMaterial color="#111216" roughness={0.72} metalness={0.08} />
        </mesh>
      )))}
      <mesh position={[-width * 0.46, bodyH * 0.58, 0]} castShadow>
        <boxGeometry args={[0.08, 0.18, depth * 0.5]} />
        <meshStandardMaterial color="#f6d76a" roughness={0.35} emissive="#9b6b18" emissiveIntensity={0.12} />
      </mesh>
    </group>
  );
}

function FountainProp({
  x,
  z,
  width,
  depth,
}: {
  x: number;
  z: number;
  width: number;
  depth: number;
}) {
  const radius = Math.min(width, depth) * 0.38;

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius * 1.12, 0.34, 36]} />
        <meshStandardMaterial color="#8f8775" roughness={0.78} metalness={0.02} />
      </mesh>
      <mesh position={[0, 0.37, 0]} castShadow>
        <cylinderGeometry args={[radius * 0.58, radius * 0.66, 0.12, 32]} />
        <meshStandardMaterial color="#2f6e82" roughness={0.36} metalness={0.05} emissive="#1d5060" emissiveIntensity={0.18} />
      </mesh>
      <mesh position={[0, 0.56, 0]} castShadow>
        <cylinderGeometry args={[radius * 0.12, radius * 0.18, 0.36, 18]} />
        <meshStandardMaterial color="#b4a27d" roughness={0.6} />
      </mesh>
    </group>
  );
}

function CoffinsProp({
  x,
  z,
  width,
  depth,
  height,
}: {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
}) {
  return (
    <group position={[x, 0, z]}>
      {[-0.22, 0.22].map((offset) => (
        <mesh key={offset} position={[offset * width, height / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[width * 0.36, height, depth * 0.9]} />
          <meshStandardMaterial color="#403b37" roughness={0.7} metalness={0.04} />
        </mesh>
      ))}
      <mesh position={[0, height + 0.04, 0]} castShadow>
        <boxGeometry args={[width * 0.86, 0.08, depth * 0.78]} />
        <meshStandardMaterial color="#1c1a18" roughness={0.82} />
      </mesh>
    </group>
  );
}

function OrangesProp({
  x,
  z,
  width,
  depth,
  height,
}: {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
}) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color="#8c6540" roughness={0.76} metalness={0.02} />
      </mesh>
      {[-0.25, 0.05, 0.35].map((sx, index) => (
        <mesh key={sx} position={[sx * width, height + 0.13, (index - 1) * depth * 0.2]} castShadow>
          <sphereGeometry args={[0.13, 12, 8]} />
          <meshStandardMaterial color="#d9822b" roughness={0.7} emissive="#6d2e0d" emissiveIntensity={0.07} />
        </mesh>
      ))}
    </group>
  );
}

function LogsProp({
  x,
  z,
  width,
  depth,
}: {
  x: number;
  z: number;
  width: number;
  depth: number;
}) {
  return (
    <group position={[x, 0, z]}>
      {[-0.22, 0, 0.22].map((offset, index) => (
        <mesh key={offset} position={[0, 0.2 + index * 0.06, offset * depth]} rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
          <cylinderGeometry args={[0.16, 0.16, width * 0.92, 14]} />
          <meshStandardMaterial color={index % 2 === 0 ? '#6f4a2d' : '#7a5636'} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function SandbagsProp({
  x,
  z,
  width,
  depth,
}: {
  x: number;
  z: number;
  width: number;
  depth: number;
}) {
  const bags = [
    [-0.28, -0.18, 0],
    [0.05, -0.18, 0.03],
    [0.34, -0.14, -0.02],
    [-0.12, 0.18, 0.08],
    [0.22, 0.18, 0.04],
  ];

  return (
    <group position={[x, 0, z]}>
      {bags.map(([sx, sz, lift], index) => (
        <mesh key={index} position={[sx * width, 0.18 + lift, sz * depth]} scale={[0.38, 0.12, 0.22]} castShadow receiveShadow>
          <sphereGeometry args={[1, 16, 8]} />
          <meshStandardMaterial color={index % 2 ? '#9b8a63' : '#ab9a70'} roughness={0.92} />
        </mesh>
      ))}
    </group>
  );
}

function LibraryShelfProp({
  x,
  z,
  width,
  depth,
  height,
}: {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
}) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color="#4d3929" roughness={0.66} />
      </mesh>
      {[-0.25, 0, 0.25].map((sx, index) => (
        <mesh key={sx} position={[sx * width, height * 0.65, depth * 0.51]} castShadow>
          <boxGeometry args={[width * 0.12, height * 0.42, 0.04]} />
          <meshStandardMaterial color={['#9a3430', '#d0ac56', '#2f6f82'][index]} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

function PillarProp({
  x,
  z,
  height,
}: {
  x: number;
  z: number;
  height: number;
}) {
  return (
    <mesh position={[x, height / 2, z]} castShadow receiveShadow>
      <cylinderGeometry args={[0.38, 0.44, height, 12]} />
      <meshStandardMaterial color="#73695b" roughness={0.78} />
    </mesh>
  );
}

function WallStripProp({
  x,
  z,
  width,
  depth,
  height,
}: {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
}) {
  return (
    <mesh position={[x, Math.min(height, 1.05) / 2, z]} castShadow receiveShadow>
      <boxGeometry args={[width, Math.min(height, 1.05), depth]} />
      <meshStandardMaterial color="#8d7f68" roughness={0.84} metalness={0.02} />
    </mesh>
  );
}

function ThreatenedMovementOverlay() {
  const movementTiles = useGameStore((s) => s.movementTiles);
  const selectedUnitId = useGameStore((s) => s.selectedUnitId);
  const units = useGameStore((s) => s.units);
  const phase = useGameStore((s) => s.round.phase);
  const smokes = useGameStore((s) => s.smokes);
  const map = useGameStore((s) => s.map);
  const ts = map.tileSize;

  const threatenedTiles = useMemo(() => {
    const groups = {
      exposed: [] as TileCoord[],
      flanked: [] as TileCoord[],
      protected: [] as TileCoord[],
    };
    if (selectedUnitId === null || phase === 'setup' || movementTiles.length === 0) return groups;
    const selectedUnit = units.find((unit) => unit.id === selectedUnitId);
    if (!selectedUnit) return groups;
    const enemies = units.filter((unit) => unit.alive && unit.team !== selectedUnit.team);

    for (const tile of movementTiles) {
      const strongestThreat = enemies
        .map((enemy) => getShotPreview(map, enemy, selectedUnit, 0, tile, smokes))
        .filter((preview) => preview.hasLineOfSight && preview.inRange)
        .sort((a, b) => b.hitChance - a.hitChance)[0];

      if (strongestThreat) {
        groups[strongestThreat.coverState].push(tile);
      }
    }

    return groups;
  }, [map, movementTiles, phase, selectedUnitId, smokes, units]);

  if (
    threatenedTiles.exposed.length === 0 &&
    threatenedTiles.flanked.length === 0 &&
    threatenedTiles.protected.length === 0
  ) return null;

  return (
    <>
      <MovementBand tiles={threatenedTiles.protected} color="#d8c170" opacity={0.13} tileSize={ts} />
      <MovementBand tiles={threatenedTiles.flanked} color={THREAT_COLOR} opacity={0.2} tileSize={ts} />
      <MovementBand tiles={threatenedTiles.exposed} color="#ff4e6a" opacity={0.24} tileSize={ts} />
      <MovementBoundary
        tiles={[...threatenedTiles.exposed, ...threatenedTiles.flanked]}
        color={THREAT_COLOR}
        tileSize={ts}
        y={FLOOR_H + 0.155}
        lineWidth={1.6}
        opacity={0.78}
      />
    </>
  );
}

function HoveredTileHighlight() {
  const hoveredTile = useGameStore((s) => s.hoveredTile);
  const selectedUnitId = useGameStore((s) => s.selectedUnitId);
  const movementTiles = useGameStore((s) => s.movementTiles);
  const pathPreview = useGameStore((s) => s.pathPreview);
  const units = useGameStore((s) => s.units);
  const heldAngles = useGameStore((s) => s.heldAngles);
  const inputMode = useGameStore((s) => s.inputMode);
  const phase = useGameStore((s) => s.round.phase);
  const smokes = useGameStore((s) => s.smokes);
  const map = useGameStore((s) => s.map);
  const ts = map.tileSize;

  const hoveredMovementTile = useMemo(() => {
    if (!hoveredTile || selectedUnitId === null) return null;
    return movementTiles.find((tile) => tile.x === hoveredTile.x && tile.y === hoveredTile.y) ?? null;
  }, [hoveredTile, movementTiles, selectedUnitId]);

  if (!hoveredTile || !hoveredMovementTile) return null;

  const [wx, , wz] = tileWorld(hoveredTile.x, hoveredTile.y, ts);
  const isOneAp = hoveredMovementTile.apCost <= 1;
  const selectedUnit = units.find((unit) => unit.id === selectedUnitId);
  const crossedHeldAngles = selectedUnit
    && phase !== 'setup'
    ? getCrossingHeldAngles(heldAngles, pathPreview, selectedUnit.team)
    : [];
  const knownThreats = selectedUnit
    && phase !== 'setup'
    ? units
      .filter((unit) => unit.alive && unit.team !== selectedUnit.team)
      .map((unit) => getShotPreview(map, unit, selectedUnit, 0, hoveredTile, smokes))
      .filter((preview) => preview.hasLineOfSight && preview.inRange)
      .sort((a, b) => b.hitChance - a.hitChance)
    : [];
  const topKnownThreat = knownThreats[0] ?? null;
  const isWatched = crossedHeldAngles.length > 0;
  const isThreatened = knownThreats.length > 0;
  const color = isWatched ? '#ff4e6a' : (isThreatened ? THREAT_COLOR : (isOneAp ? MOVE_ONE_AP_COLOR : MOVE_TWO_AP_COLOR));
  const isSmokeMode = inputMode === 'smoke';
  const threatLabel = topKnownThreat?.coverState === 'protected'
    ? 'COVER'
    : topKnownThreat?.coverState === 'flanked'
      ? 'FLANK'
      : 'OPEN';
  const label = isSmokeMode ? 'SMOKE' : (isWatched ? 'WATCH' : (isThreatened ? threatLabel : (isOneAp ? '1 AP' : '2 AP')));
  const smokeColor = '#b9c6d8';
  const displayColor = isSmokeMode ? smokeColor : color;
  const coverEdges = getCoverEdges(map, hoveredTile);

  return (
    <group position={[wx, FLOOR_H + 0.16, wz]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh raycast={() => null}>
        <planeGeometry args={[ts - GRID_GAP, ts - GRID_GAP]} />
        <meshBasicMaterial
          color={displayColor}
          transparent
          opacity={0.46}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 0, 0.01]} raycast={() => null}>
        <ringGeometry args={[ts * 0.38, ts * 0.5, 4]} />
        <meshBasicMaterial color={displayColor} transparent opacity={0.85} side={THREE.DoubleSide} />
      </mesh>
      <SafeText
        position={[0, 0, 0.035]}
        fontSize={0.28}
        color="#101318"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.035}
        outlineColor={isSmokeMode ? '#3f4a58' : '#f8f3dc'}
        font={undefined}
      >
        {label}
      </SafeText>
      {coverEdges.map((edge) => (
        <mesh
          key={edge.key}
          position={[edge.x, edge.y, 0.055]}
          raycast={() => null}
        >
          <planeGeometry args={edge.orientation === 'horizontal' ? [ts * 0.62, 0.11] : [0.11, ts * 0.62]} />
          <meshBasicMaterial
            color={edge.cover === 'full' ? MOVE_ONE_AP_COLOR : MOVE_TWO_AP_COLOR}
            transparent
            opacity={edge.cover === 'full' ? 0.95 : 0.78}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function SmokeTargetPreview() {
  const hoveredTile = useGameStore((s) => s.hoveredTile);
  const selectedUnitId = useGameStore((s) => s.selectedUnitId);
  const inputMode = useGameStore((s) => s.inputMode);
  const units = useGameStore((s) => s.units);
  const map = useGameStore((s) => s.map);
  const ts = map.tileSize;

  if (!hoveredTile || selectedUnitId === null || inputMode !== 'smoke') return null;
  const unit = units.find((candidate) => candidate.id === selectedUnitId);
  if (!unit) return null;

  const tile = map.grid[hoveredTile.y]?.[hoveredTile.x];
  const inRange = gridDistance(unit.position, hoveredTile) <= SMOKE_THROW_RANGE;
  const valid = Boolean(tile?.walkable && inRange && unit.smokeGrenades > 0 && unit.ap > 0);
  const [wx, , wz] = tileWorld(hoveredTile.x, hoveredTile.y, ts);
  const radius = SMOKE_RADIUS_TILES * ts;
  const color = valid ? SMOKE_PREVIEW_COLOR : '#ff6b6b';

  return (
    <group position={[wx, FLOOR_H + 0.24, wz]} raycast={() => null}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius, 40]} />
        <meshBasicMaterial color={color} transparent opacity={valid ? 0.18 : 0.1} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 0.88, radius, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.78} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <SafeText
        position={[0, 0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.26}
        color={valid ? '#eef4fb' : '#ffd1d1'}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.035}
        outlineColor="#18202a"
        font={undefined}
      >
        {valid ? 'SMOKE' : 'NO THROW'}
      </SafeText>
    </group>
  );
}

function getCoverEdges(map: MapData, tile: TileCoord): Array<{
  key: string;
  cover: 'half' | 'full';
  orientation: 'horizontal' | 'vertical';
  x: number;
  y: number;
}> {
  const edge = map.tileSize * 0.48;
  const edges: Array<{
    key: string;
    cover: 'half' | 'full';
    orientation: 'horizontal' | 'vertical';
    x: number;
    y: number;
  }> = [];
  const directions = [
    { key: 'north', dx: 0, dy: -1, x: 0, y: -edge, orientation: 'horizontal' as const },
    { key: 'east', dx: 1, dy: 0, x: -edge, y: 0, orientation: 'vertical' as const },
    { key: 'south', dx: 0, dy: 1, x: 0, y: edge, orientation: 'horizontal' as const },
    { key: 'west', dx: -1, dy: 0, x: edge, y: 0, orientation: 'vertical' as const },
  ];

  for (const dir of directions) {
    const adjacent = map.grid[tile.y + dir.dy]?.[tile.x + dir.dx];
    if (!adjacent) continue;
    if (adjacent.type === 'cover_half') {
      edges.push({ key: dir.key, cover: 'half', orientation: dir.orientation, x: dir.x, y: dir.y });
    }
    if (adjacent.type === 'cover_full' || adjacent.type === 'wall') {
      edges.push({ key: dir.key, cover: 'full', orientation: dir.orientation, x: dir.x, y: dir.y });
    }
  }

  return edges;
}

function getBoundarySegments(
  tiles: Array<{ x: number; y: number }>,
  tileSize: number,
  y: number,
): BoundarySegment[] {
  if (tiles.length === 0) return [];

  const keys = new Set(tiles.map((tile) => `${tile.x},${tile.y}`));
  const half = tileSize / 2 - GRID_GAP * 2;
  const segments: BoundarySegment[] = [];

  for (const tile of tiles) {
    const [wx, , wz] = tileWorld(tile.x, tile.y, tileSize);
    const northWest: LinePoint = [wx - half, y, wz - half];
    const northEast: LinePoint = [wx + half, y, wz - half];
    const southEast: LinePoint = [wx + half, y, wz + half];
    const southWest: LinePoint = [wx - half, y, wz + half];

    const edges = [
      { neighbor: `${tile.x},${tile.y - 1}`, a: northWest, b: northEast },
      { neighbor: `${tile.x + 1},${tile.y}`, a: northEast, b: southEast },
      { neighbor: `${tile.x},${tile.y + 1}`, a: southEast, b: southWest },
      { neighbor: `${tile.x - 1},${tile.y}`, a: southWest, b: northWest },
    ];

    for (const edge of edges) {
      if (!keys.has(edge.neighbor)) {
        segments.push([edge.a, edge.b]);
      }
    }
  }

  return segments;
}

function MovementBoundary({
  tiles,
  color,
  tileSize,
  y,
  lineWidth,
  opacity = 0.95,
}: {
  tiles: Array<{ x: number; y: number }>;
  color: string;
  tileSize: number;
  y: number;
  lineWidth: number;
  opacity?: number;
}) {
  const segments = useMemo(
    () => getBoundarySegments(tiles, tileSize, y),
    [tiles, tileSize, y],
  );

  if (segments.length === 0) return null;

  return (
    <group>
      {segments.map((segment, index) => (
        <Line
          key={`${color}-${index}`}
          points={segment}
          color={color}
          lineWidth={lineWidth}
          transparent
          opacity={opacity}
        />
      ))}
    </group>
  );
}

function MovementBand({
  tiles,
  color,
  opacity,
  tileSize,
}: {
  tiles: Array<{ x: number; y: number }>;
  color: string;
  opacity: number;
  tileSize: number;
}) {
  const mesh = useMemo(() => {
    if (tiles.length === 0) return null;
    const size = tileSize - GRID_GAP;
    const geo = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const inst = new THREE.InstancedMesh(geo, mat, tiles.length);
    const d = new THREE.Object3D();
    tiles.forEach((tile, i) => {
      const [wx, , wz] = tileWorld(tile.x, tile.y, tileSize);
      d.position.set(wx, FLOOR_H + 0.04, wz);
      d.rotation.set(-Math.PI / 2, 0, 0);
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    return inst;
  }, [tiles, color, opacity, tileSize]);

  if (!mesh) return null;
  return <primitive object={mesh} raycast={() => null} />;
}

// ---- Path preview line ----
function PathPreview() {
  const pathPreview = useGameStore((s) => s.pathPreview);
  const selectedUnitId = useGameStore((s) => s.selectedUnitId);
  const units = useGameStore((s) => s.units);
  const map = useGameStore((s) => s.map);
  const ts = map.tileSize;

  const points = useMemo(() => {
    if (pathPreview.length === 0 || selectedUnitId === null) return null;
    const unit = units.find((u) => u.id === selectedUnitId);
    if (!unit) return null;
    const allTiles = [unit.position, ...pathPreview];
    return allTiles.map((t): [number, number, number] => {
      const [wx, , wz] = tileWorld(t.x, t.y, ts);
      return [wx, FLOOR_H + 0.12, wz];
    });
  }, [pathPreview, selectedUnitId, units, ts]);

  if (!points || points.length < 2) return null;
  return <Line points={points} color="#44ff88" lineWidth={3} />;
}

function PlannedActionPreview() {
  const plannedActions = useGameStore((s) => s.plannedActions);
  const heldAngles = useGameStore((s) => s.heldAngles);
  const phase = useGameStore((s) => s.round.phase);
  const units = useGameStore((s) => s.units);
  const smokes = useGameStore((s) => s.smokes);
  const map = useGameStore((s) => s.map);
  const ts = map.tileSize;

  return (
    <>
      {plannedActions.map((action, index) => {
        const unit = units.find((u) => u.id === action.unitId);
        const isWatched = phase !== 'setup' && getCrossingHeldAngles(heldAngles, action.path, action.team).length > 0;
        const isDanger = Boolean(unit && phase !== 'setup' && units.some((enemy) => {
          if (!enemy.alive || enemy.team === action.team) return false;
          const preview = getShotPreview(map, enemy, unit, 0, action.target, smokes);
          return preview.hasLineOfSight && preview.inRange;
        }));
        const color = isWatched ? '#ff4e6a' : (isDanger ? '#ff9d3d' : (unit?.team === 'CT' ? '#65b7ff' : '#ffd166'));
        const label = isWatched ? 'WATCH' : (isDanger ? 'DANGER' : `${action.apCost}AP`);
        const points = [action.from, ...action.path].map((tile): [number, number, number] => {
          const [wx, , wz] = tileWorld(tile.x, tile.y, ts);
          return [wx, FLOOR_H + 0.24 + index * 0.012, wz];
        });
        const [wx, , wz] = tileWorld(action.target.x, action.target.y, ts);

        return (
          <group key={action.id}>
            {points.length >= 2 && <Line points={points} color={color} lineWidth={2} />}
            <group position={[wx, FLOOR_H + 0.21, wz]} rotation={[-Math.PI / 2, 0, 0]}>
              <mesh raycast={() => null}>
                <ringGeometry args={[ts * 0.24, ts * 0.42, 24]} />
                <meshBasicMaterial color={color} transparent opacity={0.9} side={THREE.DoubleSide} />
              </mesh>
              <SafeText
                position={[0, 0, 0.04]}
                fontSize={0.24}
                color="#101318"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.03}
                outlineColor={color}
                font={undefined}
              >
                {label}
              </SafeText>
            </group>
          </group>
        );
      })}
    </>
  );
}

function HeldAngleOverlay() {
  const heldAngles = useGameStore((s) => s.heldAngles);
  const units = useGameStore((s) => s.units);
  const map = useGameStore((s) => s.map);
  const ts = map.tileSize;

  return (
    <>
      {heldAngles.map((angle) => {
        const unit = units.find((u) => u.id === angle.unitId);
        const color = unit?.team === 'CT' ? '#ff4e6a' : '#ff9d3d';
        const points = [angle.origin, ...angle.laneTiles].map((tile): [number, number, number] => {
          const [wx, , wz] = tileWorld(tile.x, tile.y, ts);
          return [wx, FLOOR_H + 0.31, wz];
        });

        return (
          <group key={angle.id}>
            {points.length >= 2 && <Line points={points} color={color} lineWidth={3} />}
            <HeldLaneTiles tiles={angle.laneTiles} color={color} tileSize={ts} />
          </group>
        );
      })}
    </>
  );
}

function HoldAngleHoverPreview() {
  const hoveredTile = useGameStore((s) => s.hoveredTile);
  const selectedUnitId = useGameStore((s) => s.selectedUnitId);
  const inputMode = useGameStore((s) => s.inputMode);
  const units = useGameStore((s) => s.units);
  const map = useGameStore((s) => s.map);
  const ts = map.tileSize;

  const preview = useMemo(() => {
    if (!hoveredTile || selectedUnitId === null || inputMode !== 'hold_angle') return null;
    const unit = units.find((candidate) => candidate.id === selectedUnitId);
    if (!unit || !unit.alive || unit.ap <= 0) return null;
    if (unit.position.x === hoveredTile.x && unit.position.y === hoveredTile.y) return null;

    const maxTiles = Math.max(4, Math.min(unit.weapon.rangeMax, 24));
    const laneTiles = getWatchedLane(map, unit.position, hoveredTile, maxTiles);
    if (laneTiles.length === 0) return null;
    return { unit, laneTiles };
  }, [hoveredTile, inputMode, map, selectedUnitId, units]);

  if (!preview) return null;

  const color = preview.unit.team === 'CT' ? '#ff87a0' : '#ffb86b';
  const points = [preview.unit.position, ...preview.laneTiles].map((tile): [number, number, number] => {
    const [wx, , wz] = tileWorld(tile.x, tile.y, ts);
    return [wx, FLOOR_H + 0.39, wz];
  });
  const lastTile = preview.laneTiles[preview.laneTiles.length - 1];
  const [labelX, , labelZ] = tileWorld(lastTile.x, lastTile.y, ts);

  return (
    <group>
      {points.length >= 2 && <Line points={points} color={color} lineWidth={2} />}
      <HeldLaneTiles tiles={preview.laneTiles} color={color} tileSize={ts} opacity={0.18} />
      <SafeText
        position={[labelX, FLOOR_H + 0.42, labelZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.25}
        color="#ffd7dd"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.025}
        outlineColor="#14080d"
        font={undefined}
      >
        HOLD
      </SafeText>
    </group>
  );
}

function HeldLaneTiles({
  tiles,
  color,
  tileSize,
  opacity = 0.28,
}: {
  tiles: TileCoord[];
  color: string;
  tileSize: number;
  opacity?: number;
}) {
  const mesh = useMemo(() => {
    if (tiles.length === 0) return null;
    const size = tileSize - GRID_GAP;
    const geo = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const inst = new THREE.InstancedMesh(geo, mat, tiles.length);
    const d = new THREE.Object3D();
    tiles.forEach((tile, i) => {
      const [wx, , wz] = tileWorld(tile.x, tile.y, tileSize);
      d.position.set(wx, FLOOR_H + 0.18, wz);
      d.rotation.set(-Math.PI / 2, 0, 0);
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    return inst;
  }, [tiles, color, opacity, tileSize]);

  if (!mesh) return null;
  return <primitive object={mesh} raycast={() => null} />;
}

function CombatEventMarker() {
  const event = useGameStore((s) => s.combatLog[0]);
  const map = useGameStore((s) => s.map);
  const ts = map.tileSize;
  const groupRef = useRef<THREE.Group>(null);
  const ringMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const startedAtRef = useRef({ id: '', time: 0 });

  useFrame((state) => {
    if (!event || !groupRef.current) return;

    if (startedAtRef.current.id !== event.id) {
      startedAtRef.current = { id: event.id, time: state.clock.elapsedTime };
    }

    const elapsed = state.clock.elapsedTime - startedAtRef.current.time;
    const progress = THREE.MathUtils.clamp(elapsed / 1.6, 0, 1);
    const lift = event.hit ? progress * 0.62 : progress * 0.32;
    const pulse = 1 + Math.sin(progress * Math.PI) * (event.hit ? 0.34 : 0.18);
    const opacity = Math.max(0, 0.92 * (1 - progress));

    groupRef.current.position.y = FLOOR_H + 0.5 + lift;
    groupRef.current.scale.setScalar(pulse);
    if (ringMaterialRef.current) {
      ringMaterialRef.current.opacity = opacity;
    }
  });

  if (!event) return null;

  const [wx, , wz] = tileWorld(event.tile.x, event.tile.y, ts);
  const color = event.hit ? '#ff4e6a' : '#d8c170';
  const label = event.hit ? `-${event.damage}` : 'MISS';

  return (
    <group ref={groupRef} position={[wx, FLOOR_H + 0.5, wz]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[ts * 0.32, ts * 0.55, 36]} />
        <meshBasicMaterial ref={ringMaterialRef} color={color} transparent opacity={0.88} side={THREE.DoubleSide} />
      </mesh>
      <SafeText
        position={[0, 0.04, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.36}
        color={event.hit ? '#ffd7dd' : '#fff1b5'}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.04}
        outlineColor="#11080c"
        font={undefined}
      >
        {label}
      </SafeText>
    </group>
  );
}

function CombatTracerOverlay() {
  const event = useGameStore((s) => s.combatLog[0]);
  const units = useGameStore((s) => s.units);
  const map = useGameStore((s) => s.map);
  const ts = map.tileSize;

  if (!event) return null;

  const attacker = units.find((unit) => unit.id === event.attackerId);
  const target = units.find((unit) => unit.id === event.targetId);
  if (!attacker) return null;

  const [sx, , sz] = tileWorld(attacker.position.x, attacker.position.y, ts);
  const targetTile = target?.position ?? event.tile;
  const [tx, , tz] = tileWorld(targetTile.x, targetTile.y, ts);
  const color = event.hit ? '#ff4e6a' : '#fff1b5';
  const label = event.type === 'reaction_fire' ? 'REACTION' : 'SHOT';
  const start: LinePoint = [sx, FLOOR_H + 1.08, sz];
  const end: LinePoint = [tx, FLOOR_H + 0.68, tz];
  const midpoint: LinePoint = [(sx + tx) / 2, FLOOR_H + 0.96, (sz + tz) / 2];

  return (
    <group raycast={() => null}>
      <Line points={[start, end]} color={color} lineWidth={event.hit ? 4 : 2} />
      <Line
        points={[[sx, FLOOR_H + 1.12, sz], [tx, FLOOR_H + 0.72, tz]]}
        color={event.hit ? '#ffd7dd' : '#d8c170'}
        lineWidth={1}
      />
      <mesh position={start}>
        <sphereGeometry args={[0.1, 12, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.82} />
      </mesh>
      <mesh position={end} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.18, event.hit ? 0.42 : 0.3, 28]} />
        <meshBasicMaterial color={color} transparent opacity={0.72} side={THREE.DoubleSide} />
      </mesh>
      <SafeText
        position={midpoint}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.22}
        color={color}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.03}
        outlineColor="#09090f"
        font={undefined}
      >
        {label}
      </SafeText>
    </group>
  );
}

function ShotPreviewOverlay() {
  const selectedUnitId = useGameStore((s) => s.selectedUnitId);
  const inputMode = useGameStore((s) => s.inputMode);
  const units = useGameStore((s) => s.units);
  const smokes = useGameStore((s) => s.smokes);
  const map = useGameStore((s) => s.map);
  const ts = map.tileSize;

  const shots = useMemo(() => {
    if (selectedUnitId === null || inputMode !== 'shoot') return [];
    const shooter = units.find((unit) => unit.id === selectedUnitId);
    if (!shooter || !shooter.alive || shooter.ap <= 0) return [];

    return units
      .filter((unit) => unit.alive && unit.team !== shooter.team)
      .map((target) => ({
        target,
        preview: getShotPreview(map, shooter, target, 0, target.position, smokes),
      }))
      .filter(({ preview }) => preview.hasLineOfSight && preview.inRange);
  }, [inputMode, map, selectedUnitId, smokes, units]);

  if (selectedUnitId === null || shots.length === 0) return null;
  const shooter = units.find((unit) => unit.id === selectedUnitId);
  if (!shooter) return null;

  return (
    <>
      {shots.map(({ target, preview }) => {
        const [sx, , sz] = tileWorld(shooter.position.x, shooter.position.y, ts);
        const [tx, , tz] = tileWorld(target.position.x, target.position.y, ts);
        const midpoint: [number, number, number] = [
          (sx + tx) / 2,
          FLOOR_H + 0.62,
          (sz + tz) / 2,
        ];
        const color = preview.hitChance >= 65 ? '#58ff9a' : preview.hitChance >= 35 ? '#ffd166' : '#ff6b82';
        const coverLabel = preview.coverState === 'protected'
          ? preview.coverLabel.toUpperCase()
          : preview.coverState.toUpperCase();

        return (
          <group key={`shot-${target.id}`}>
            <Line
              points={[[sx, FLOOR_H + 0.58, sz], [tx, FLOOR_H + 0.58, tz]]}
              color={color}
              lineWidth={2}
            />
            <SafeText
              position={midpoint}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.26}
              color={color}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.03}
              outlineColor="#08090d"
              font={undefined}
            >
              {`${preview.hitChance}%\n${coverLabel}`}
            </SafeText>
          </group>
        );
      })}
    </>
  );
}

// ---- Interactive plane for click-to-move + unit selection ----
function InteractiveFloor() {
  const map = useGameStore((s) => s.map);
  const moveUnit = useGameStore((s) => s.moveUnit);
  const queueMove = useGameStore((s) => s.queueMove);
  const holdAngle = useGameStore((s) => s.holdAngle);
  const throwSmoke = useGameStore((s) => s.throwSmoke);
  const selectUnit = useGameStore((s) => s.selectUnit);
  const hoverTile = useGameStore((s) => s.hoverTile);
  const planningMode = useGameStore((s) => s.planningMode);
  const inputMode = useGameStore((s) => s.inputMode);
  const ts = map.tileSize;
  const lastHoverKey = useRef<string | null>(null);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (e.delta > CLICK_DRAG_THRESHOLD_PX) return;
      const tileX = map.width - 1 - Math.floor(e.point.x / ts);
      const tileY = Math.floor(e.point.z / ts);
      if (tileX >= 0 && tileX < map.width && tileY >= 0 && tileY < map.height) {
        // Check if a unit is on this tile — if so, select it
        const { units, round } = useGameStore.getState();
        const unitOnTile = units.find(
          (u) => u.alive && u.position.x === tileX && u.position.y === tileY
        );
        if (inputMode === 'hold_angle') {
          holdAngle({ x: tileX, y: tileY });
        } else if (inputMode === 'smoke') {
          throwSmoke({ x: tileX, y: tileY });
        } else if (unitOnTile && unitOnTile.team === round.activeTeam) {
          selectUnit(unitOnTile.id);
        } else {
          const target = { x: tileX, y: tileY };
          if (planningMode) {
            queueMove(target);
          } else {
            moveUnit(target);
          }
        }
      }
    },
    [ts, map.width, map.height, moveUnit, queueMove, holdAngle, throwSmoke, selectUnit, planningMode, inputMode]
  );

  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (e.nativeEvent.buttons !== 0) return;
      const tileX = map.width - 1 - Math.floor(e.point.x / ts);
      const tileY = Math.floor(e.point.z / ts);
      if (tileX >= 0 && tileX < map.width && tileY >= 0 && tileY < map.height) {
        const key = `${tileX},${tileY}`;
        if (lastHoverKey.current === key) return;
        lastHoverKey.current = key;
        hoverTile({ x: tileX, y: tileY });
      }
    },
    [ts, map.width, map.height, hoverTile]
  );

  const cx = (map.width * ts) / 2;
  const cz = (map.height * ts) / 2;

  return (
    <mesh position={[cx, FLOOR_H + 0.01, cz]} rotation={[-Math.PI / 2, 0, 0]}
      onClick={handleClick} onPointerMove={handlePointerMove}>
      <planeGeometry args={[map.width * ts, map.height * ts]} />
      <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ---- Ground plane (beneath everything, dark) ----
function GroundPlane() {
  const map = useGameStore((s) => s.map);
  const ts = map.tileSize;
  return (
    <mesh position={[(map.width * ts) / 2, -0.05, (map.height * ts) / 2]}
      rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[map.width * ts + 20, map.height * ts + 20]} />
      <meshStandardMaterial color="#121722" roughness={1} />
    </mesh>
  );
}

// ---- Compose ----
export function MapRenderer() {
  return (
    <group>
      <GroundPlane />
      <FloorLayer />
      <WallLayer />
      <CoverLayer />
      <BombsiteMarkers />
      <CalloutLabels />
      <SmokeLayer />
      <WalkableHighlight />
      <ThreatenedMovementOverlay />
      <HoveredTileHighlight />
      <SmokeTargetPreview />
      <PathPreview />
      <PlannedActionPreview />
      <HeldAngleOverlay />
      <HoldAngleHoverPreview />
      <CombatTracerOverlay />
      <CombatEventMarker />
      <ShotPreviewOverlay />
      <InteractiveFloor />
    </group>
  );
}
