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
// Missing: molly/HE utility volumes, richer animation, and final art assets.
// ============================================================
import { Suspense, useMemo, useCallback, useRef, type ComponentProps } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Line, Text } from '@react-three/drei';
import { useGameStore } from '../game/store';
import { getCalloutLabels } from '../game/maps/inferno';
import type { CombatEvent, CoverObject, FlashBurst, MapData, TileCoord } from '../game/types';
import { getCrossingHeldAngles } from '../game/threats';
import { getShotPreview } from '../game/combat';
import { getPlannedActionBeat, sortPlannedActionsByBeat } from '../game/executeTimeline';
import { getWatchedLane, hasLineOfSight } from '../game/los';
import { getShotPresentation } from '../game/shotPresentation';

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
  floor:       '#9aa8ba',
  bombsite_a:  '#c15d58',
  bombsite_b:  '#c15d58',
  spawn_t:     '#d2a83f',
  spawn_ct:    '#52a6df',
  wall:        '#435064',
  cover_half:  '#dcc676',
  cover_full:  '#ad966b',
  out_of_bounds: '#303c52',
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
const FLASH_PREVIEW_COLOR = '#fff1a8';
const SMOKE_THROW_RANGE = 12;
const SMOKE_RADIUS_TILES = 2;
const FLASH_THROW_RANGE = 12;
const FLASH_RADIUS_TILES = 5;
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

function getCombatEventColor(event: CombatEvent): string {
  const shot = getShotPresentation(event.weaponCategory);
  if (event.critical || event.killed) return shot.color;
  if (event.hit) return shot.secondaryColor;
  return shot.missColor;
}

function getCombatEventLabel(event: CombatEvent): string {
  if (!event.hit) return 'MISS';
  if (event.killed && event.critical) return `HS KILL\n-${event.damage}`;
  if (event.killed) return `KILL\n-${event.damage}`;
  if (event.critical) return `HEADSHOT\n-${event.damage}`;
  return `-${event.damage}`;
}

function setObjectOpacity(root: THREE.Object3D | null, opacity: number): void {
  if (!root) return;

  root.traverse((child) => {
    const material = (child as THREE.Object3D & { material?: THREE.Material | THREE.Material[] }).material;
    const materials = Array.isArray(material) ? material : material ? [material] : [];

    materials.forEach((mat) => {
      mat.transparent = true;
      mat.opacity = opacity;
      mat.depthWrite = false;
    });
  });
}

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
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.86,
      metalness: 0.015,
      vertexColors: true,
      emissive: '#172030',
      emissiveIntensity: 0.08,
    });
    const inst = new THREE.InstancedMesh(geo, mat, positions.length);
    const d = new THREE.Object3D();
    const colorAttr = new Float32Array(positions.length * 3);
    const baseColor = new THREE.Color(color);
    positions.forEach(([x, , z], i) => {
      d.position.set(x, elevations[i] * tileSize * 0.4, z);
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);

      const hash = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
      const laneWear = (Math.sin(x * 0.31) + Math.cos(z * 0.27)) * 0.018;
      const variation = THREE.MathUtils.clamp(0.94 + hash * 0.1 + laneWear, 0.9, 1.06);
      colorAttr[i * 3] = baseColor.r * variation;
      colorAttr[i * 3 + 1] = baseColor.g * variation;
      colorAttr[i * 3 + 2] = baseColor.b * variation;
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.instanceColor = new THREE.InstancedBufferAttribute(colorAttr, 3);
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
      emissive: '#26344a',
      emissiveIntensity: 0.22,
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
      const variation = 0.98 + hash * 0.16;
      colorAttr[i * 3] = baseColor.r * variation;
      colorAttr[i * 3 + 1] = baseColor.g * variation;
      colorAttr[i * 3 + 2] = baseColor.b * variation;
    });

    inst.instanceMatrix.needsUpdate = true;
    inst.instanceColor = new THREE.InstancedBufferAttribute(colorAttr, 3);
    inst.castShadow = false;
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
            <SafeText
              position={[cx, h + 0.08, cz]}
              rotation={[-Math.PI / 2, 0, Math.PI]}
              fontSize={0.12}
              color="#dcc77e"
              fillOpacity={0.16}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.01}
              outlineColor="#000000"
              outlineOpacity={0.28}
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

function FlashBurstMarker({ burst }: { burst: FlashBurst }) {
  const map = useGameStore((s) => s.map);
  const ts = map.tileSize;
  const groupRef = useRef<THREE.Group>(null);
  const discMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const ringMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const [wx, , wz] = tileWorld(burst.position.x, burst.position.y, ts);
  const radius = burst.radius * ts;

  useFrame(() => {
    const age = performance.now() - burst.createdAt;
    const progress = THREE.MathUtils.clamp(age / 1400, 0, 1);
    const opacity = Math.max(0, 0.42 * (1 - progress));
    const scale = 0.55 + progress * 0.65;
    if (groupRef.current) groupRef.current.scale.setScalar(scale);
    if (discMaterialRef.current) discMaterialRef.current.opacity = opacity;
    if (ringMaterialRef.current) ringMaterialRef.current.opacity = Math.max(0, 0.86 * (1 - progress));
  });

  return (
    <group ref={groupRef} position={[wx, FLOOR_H + 0.32, wz]} raycast={() => null}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius, 44]} />
        <meshBasicMaterial ref={discMaterialRef} color="#fff3b0" transparent opacity={0.42} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 0.16, radius, 48]} />
        <meshBasicMaterial ref={ringMaterialRef} color="#fff8df" transparent opacity={0.86} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <SafeText
        position={[0, 0.04, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.34}
        color="#2a2110"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.04}
        outlineColor="#fff4c2"
        font={undefined}
      >
        {burst.affectedUnitIds.length > 0 ? `FLASH ${burst.affectedUnitIds.length}` : 'FLASH'}
      </SafeText>
    </group>
  );
}

function FlashLayer() {
  const flashBursts = useGameStore((s) => s.flashBursts);
  if (flashBursts.length === 0) return null;

  return (
    <>
      {flashBursts.map((burst) => (
        <FlashBurstMarker key={burst.id} burst={burst} />
      ))}
    </>
  );
}

function PlantedBombMarker() {
  const round = useGameStore((s) => s.round);
  const map = useGameStore((s) => s.map);
  const ts = map.tileSize;

  const isDropped = !round.bombPlanted && round.bombCarrierId === null;
  if ((!round.bombPlanted && !isDropped) || !round.bombPosition) return null;

  const [wx, , wz] = tileWorld(round.bombPosition.x, round.bombPosition.y, ts);
  const isDefused = round.bombDefused;
  const color = isDefused ? '#65b7ff' : (isDropped ? '#ffd166' : '#ff4e6a');

  return (
    <group position={[wx, FLOOR_H + 0.18, wz]} raycast={() => null}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ts * 0.34, ts * 0.58, 34]} />
        <meshBasicMaterial color={color} transparent opacity={0.88} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.13, 0]} castShadow>
        <boxGeometry args={[0.42, 0.22, 0.28]} />
        <meshStandardMaterial color="#2b1714" roughness={0.58} emissive={isDefused ? '#123252' : (isDropped ? '#5a3d10' : '#6b120e')} emissiveIntensity={0.32} />
      </mesh>
      <mesh position={[0.13, 0.26, 0.02]}>
        <sphereGeometry args={[0.045, 8, 6]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Text
        position={[0, 0.08, ts * 0.64]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.22}
        color={isDefused ? '#d8ecff' : (isDropped ? '#fff1b5' : '#ffd7dd')}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.03}
        outlineColor="#100709"
        font={undefined}
      >
        {isDefused ? 'DEFUSED' : (isDropped ? 'DROPPED' : `${round.bombTimer}T`)}
      </Text>
    </group>
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
    return (
      <group>
        <ContactShadow x={x} z={z} width={width * 1.04} depth={depth * 1.04} opacity={0.16} />
        <FountainProp x={x} z={z} width={width} depth={depth} />
      </group>
    );
  }
  if (label.includes('banana car') || label === 'truck') {
    return (
      <group>
        <ContactShadow x={x} z={z} width={width * 1.1} depth={depth * 1.12} opacity={label.includes('banana car') ? 0.22 : 0.18} />
        <VehicleProp x={x} z={z} width={width} depth={depth} isTruck={label === 'truck'} isLandmarkCar={label.includes('banana car')} />
      </group>
    );
  }
  if (label.includes('coffin')) {
    return (
      <group>
        <ContactShadow x={x} z={z} width={width * 1.03} depth={depth * 0.98} opacity={0.2} />
        <CoffinsProp x={x} z={z} width={width} depth={depth} height={h} />
      </group>
    );
  }
  if (label.includes('orange')) {
    return (
      <group>
        <ContactShadow x={x} z={z} width={width * 1.05} depth={depth * 1.02} opacity={0.17} />
        <OrangesProp x={x} z={z} width={width} depth={depth} height={h} />
      </group>
    );
  }
  if (label.includes('logs')) {
    return (
      <group>
        <ContactShadow x={x} z={z} width={width * 1.02} depth={depth * 1.18} opacity={0.19} />
        <LogsProp x={x} z={z} width={width} depth={depth} />
      </group>
    );
  }
  if (label.includes('sandbags')) {
    return (
      <group>
        <ContactShadow x={x} z={z} width={width * 1.06} depth={depth * 1.08} opacity={0.18} />
        <SandbagsProp x={x} z={z} width={width} depth={depth} />
      </group>
    );
  }
  if (label.includes('library shelf')) {
    return (
      <group>
        <ContactShadow x={x} z={z} width={width * 1.02} depth={depth * 1.02} opacity={0.17} />
        <LibraryShelfProp x={x} z={z} width={width} depth={depth} height={h} />
      </group>
    );
  }
  if (label.includes('pillar')) {
    return (
      <group>
        <ContactShadow x={x} z={z} width={tileSize * 0.78} depth={tileSize * 0.78} opacity={0.18} />
        <PillarProp x={x} z={z} height={h} />
      </group>
    );
  }
  if (label.includes('rail') || label.includes('wall')) {
    return (
      <group>
        <ContactShadow x={x} z={z} width={width * 1.01} depth={depth * 1.02} opacity={0.14} shape="plane" />
        <WallStripProp x={x} z={z} width={width} depth={depth} height={h} />
      </group>
    );
  }
  if (label.includes('box')) {
    return (
      <group>
        <ContactShadow x={x} z={z} width={width * 1.04} depth={depth * 1.04} opacity={0.17} />
        <CrateStackProp x={x} z={z} width={width} depth={depth} height={h} label={label} />
      </group>
    );
  }

  const color = cover.coverType === 'half' ? '#8a7d5a' : '#6a6050';
  return (
    <group>
      <ContactShadow x={x} z={z} width={width * 1.02} depth={depth * 1.02} opacity={0.15} shape="plane" />
      <mesh position={[x, h / 2, z]} castShadow receiveShadow>
        <boxGeometry args={[width, h, depth]} />
        <meshStandardMaterial color={color} roughness={0.82} metalness={0.03} />
      </mesh>
    </group>
  );
}

function ContactShadow({
  x,
  z,
  width,
  depth,
  opacity,
  shape = 'circle',
}: {
  x: number;
  z: number;
  width: number;
  depth: number;
  opacity: number;
  shape?: 'circle' | 'plane';
}) {
  return (
    <mesh position={[x, FLOOR_H + 0.018, z]} rotation={[-Math.PI / 2, 0, 0]} scale={[width / 2, depth / 2, 1]} raycast={() => null}>
      {shape === 'plane' ? <planeGeometry args={[2, 2]} /> : <circleGeometry args={[1, 32]} />}
      <meshBasicMaterial color="#05070a" transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function VehicleProp({
  x,
  z,
  width,
  depth,
  isTruck,
  isLandmarkCar = false,
}: {
  x: number;
  z: number;
  width: number;
  depth: number;
  isTruck: boolean;
  isLandmarkCar?: boolean;
}) {
  const bodyColor = isTruck ? '#6f776f' : '#56473b';
  const trimColor = isTruck ? '#b9c2b5' : (isLandmarkCar ? '#292f33' : '#2d2b28');
  const glassColor = isTruck ? '#d8e6df' : '#9ab0b3';
  const bodyH = isTruck ? 0.68 : (isLandmarkCar ? 0.74 : 0.46);
  const cabinH = isTruck ? 0.55 : (isLandmarkCar ? 0.5 : 0.34);
  const bodyDepth = depth * (isLandmarkCar ? 0.92 : 0.8);
  const cabinDepth = depth * (isLandmarkCar ? 0.66 : 0.62);

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, bodyH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, bodyH, bodyDepth]} />
        <meshStandardMaterial color={bodyColor} roughness={0.58} metalness={0.22} />
      </mesh>
      <mesh position={[width * 0.18, bodyH + cabinH / 2 - 0.04, -depth * 0.02]} castShadow>
        <boxGeometry args={[width * (isLandmarkCar ? 0.48 : 0.42), cabinH, cabinDepth]} />
        <meshStandardMaterial color={trimColor} roughness={0.5} metalness={0.25} />
      </mesh>
      <mesh position={[width * 0.18, bodyH + cabinH * 0.58, -cabinDepth * 0.51]} castShadow>
        <boxGeometry args={[width * 0.3, cabinH * 0.32, 0.035]} />
        <meshStandardMaterial color={glassColor} roughness={0.24} metalness={0.08} transparent opacity={0.7} />
      </mesh>
      <mesh position={[width * 0.18, bodyH + cabinH * 0.58, cabinDepth * 0.51]} castShadow>
        <boxGeometry args={[width * 0.3, cabinH * 0.32, 0.035]} />
        <meshStandardMaterial color={glassColor} roughness={0.24} metalness={0.08} transparent opacity={0.58} />
      </mesh>
      <mesh position={[-width * 0.16, bodyH + 0.035, 0]} castShadow>
        <boxGeometry args={[width * 0.33, 0.05, bodyDepth * 0.82]} />
        <meshStandardMaterial color={isLandmarkCar ? '#6a4f3d' : bodyColor} roughness={0.7} metalness={0.12} />
      </mesh>
      {isLandmarkCar && [-0.28, 0.28].map((sz) => (
        <mesh key={`rust-${sz}`} position={[-width * 0.06, bodyH + 0.068, sz * depth]} castShadow>
          <boxGeometry args={[width * 0.16, 0.018, depth * 0.07]} />
          <meshStandardMaterial color="#8c4b24" roughness={0.94} metalness={0.02} />
        </mesh>
      ))}
      {[-0.34, 0.34].map((sx) => [-0.35, 0.35].map((sz) => (
        <mesh key={`${sx}-${sz}`} position={[sx * width, 0.14, sz * depth]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.14, 0.14, 0.12, 12]} />
          <meshStandardMaterial color="#111216" roughness={0.72} metalness={0.08} />
        </mesh>
      )))}
      {[-0.34, 0.34].map((sx) => [-0.35, 0.35].map((sz) => (
        <mesh key={`hub-${sx}-${sz}`} position={[sx * width, 0.14, sz * depth + Math.sign(sz) * 0.062]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 0.014, 10]} />
          <meshStandardMaterial color="#6f7479" roughness={0.48} metalness={0.28} />
        </mesh>
      )))}
      <mesh position={[-width * 0.46, bodyH * 0.58, 0]} castShadow>
        <boxGeometry args={[0.08, 0.18, depth * 0.5]} />
        <meshStandardMaterial color="#f6d76a" roughness={0.35} emissive="#9b6b18" emissiveIntensity={0.12} />
      </mesh>
      <mesh position={[width * 0.5, bodyH * 0.5, 0]} castShadow>
        <boxGeometry args={[0.06, 0.14, depth * 0.42]} />
        <meshStandardMaterial color="#9c211d" roughness={0.38} emissive="#5e100d" emissiveIntensity={0.08} />
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
      <mesh position={[0, 0.37, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 0.68, radius * 1.02, 36]} />
        <meshStandardMaterial color="#b7ad96" roughness={0.82} metalness={0.01} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.37, 0]} castShadow>
        <cylinderGeometry args={[radius * 0.58, radius * 0.66, 0.12, 32]} />
        <meshStandardMaterial color="#2f6e82" roughness={0.36} metalness={0.05} emissive="#1d5060" emissiveIntensity={0.18} />
      </mesh>
      <mesh position={[0, 0.445, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius * 0.5, 32]} />
        <meshBasicMaterial color="#75c2d6" transparent opacity={0.34} depthWrite={false} />
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
      {[-0.22, 0.22].map((offset) => (
        <mesh key={`face-${offset}`} position={[offset * width, height * 0.72, -depth * 0.46]} castShadow>
          <boxGeometry args={[width * 0.26, height * 0.08, 0.035]} />
          <meshStandardMaterial color="#6f6255" roughness={0.62} metalness={0.08} />
        </mesh>
      ))}
      <mesh position={[0, height + 0.04, 0]} castShadow>
        <boxGeometry args={[width * 0.86, 0.08, depth * 0.78]} />
        <meshStandardMaterial color="#1c1a18" roughness={0.82} />
      </mesh>
      <mesh position={[0, height + 0.09, 0]} castShadow>
        <boxGeometry args={[width * 0.72, 0.035, depth * 0.08]} />
        <meshStandardMaterial color="#897457" roughness={0.7} metalness={0.1} />
      </mesh>
      <mesh position={[0, height * 0.42, depth * 0.46]} castShadow>
        <boxGeometry args={[width * 0.62, height * 0.05, 0.035]} />
        <meshStandardMaterial color="#201c19" roughness={0.84} />
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
      {[-0.36, -0.12, 0.13, 0.36].map((sx) => (
        <mesh key={`slat-${sx}`} position={[sx * width, height * 0.56, -depth * 0.51]} castShadow>
          <boxGeometry args={[width * 0.045, height * 0.86, 0.04]} />
          <meshStandardMaterial color="#5b3b27" roughness={0.86} />
        </mesh>
      ))}
      {[-0.25, 0.05, 0.35, -0.02].map((sx, index) => (
        <mesh key={sx} position={[sx * width, height + 0.13, (index - 1) * depth * 0.2]} castShadow>
          <sphereGeometry args={[index === 3 ? 0.1 : 0.13, 12, 8]} />
          <meshStandardMaterial color={index % 2 ? '#e09236' : '#d9822b'} roughness={0.7} emissive="#6d2e0d" emissiveIntensity={0.07} />
        </mesh>
      ))}
      <mesh position={[0, height + 0.045, 0]} castShadow>
        <boxGeometry args={[width * 0.86, 0.05, depth * 0.08]} />
        <meshStandardMaterial color="#61412a" roughness={0.82} />
      </mesh>
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
        <group key={offset} position={[0, 0.2 + index * 0.06, offset * depth]} rotation={[0, 0, Math.PI / 2]}>
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[0.16, 0.16, width * 0.92, 14]} />
            <meshStandardMaterial color={index % 2 === 0 ? '#6f4a2d' : '#7a5636'} roughness={0.82} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[0, side * width * 0.46, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.158, 14]} />
              <meshStandardMaterial color="#9a7047" roughness={0.88} side={THREE.DoubleSide} />
            </mesh>
          ))}
          {[-0.21, 0.18].map((stripe) => (
            <mesh key={`stripe-${stripe}`} position={[0.01, stripe * width, 0.118]} rotation={[Math.PI / 2, 0, 0]}>
              <boxGeometry args={[0.035, 0.018, width * 0.17]} />
              <meshStandardMaterial color="#3b2418" roughness={0.9} />
            </mesh>
          ))}
          {[-0.3, 0.3].map((band) => (
            <mesh key={`band-${band}`} position={[0, band * width, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.163, 0.012, 6, 14]} />
              <meshStandardMaterial color="#2d2925" roughness={0.74} metalness={0.18} />
            </mesh>
          ))}
        </group>
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
    [-0.36, 0.02, 0.02],
    [0.42, 0.05, 0.03],
  ];

  return (
    <group position={[x, 0, z]}>
      {bags.map(([sx, sz, lift], index) => (
        <group key={index} position={[sx * width, 0.18 + lift, sz * depth]}>
          <mesh scale={[0.38, 0.12, 0.22]} castShadow receiveShadow>
            <sphereGeometry args={[1, 16, 8]} />
            <meshStandardMaterial color={index % 2 ? '#9b8a63' : '#ab9a70'} roughness={0.94} />
          </mesh>
          <mesh position={[0, 0.045, 0]} scale={[0.26, 0.025, 0.19]} castShadow>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#7c6e50" roughness={0.96} />
          </mesh>
          <mesh position={[0, 0.08, 0]} scale={[0.3, 0.012, 0.04]} castShadow>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#6b5f45" roughness={0.98} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function CrateStackProp({
  x,
  z,
  width,
  depth,
  height,
  label,
}: {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  label: string;
}) {
  const dark = label.includes('dark');
  const baseColor = dark ? '#4f463d' : '#7b6244';
  const slatColor = dark ? '#2f2a25' : '#4f3825';
  const stack = [
    [0, height * 0.26, 0, 0.94, 0.52, 0.9],
    [-0.16, height * 0.78, -0.05, 0.62, 0.45, 0.74],
  ];

  return (
    <group position={[x, 0, z]}>
      {stack.map(([sx, sy, sz, sw, sh, sd], index) => (
        <group key={index} position={[sx * width, sy, sz * depth]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[width * sw, height * sh, depth * sd]} />
            <meshStandardMaterial color={baseColor} roughness={0.84} metalness={0.02} />
          </mesh>
          {[-0.26, 0.26].map((slat) => (
            <mesh key={slat} position={[slat * width * sw, 0, -depth * sd * 0.51]} castShadow>
              <boxGeometry args={[width * 0.055, height * sh * 0.88, 0.035]} />
              <meshStandardMaterial color={slatColor} roughness={0.9} />
            </mesh>
          ))}
          <mesh position={[0, height * sh * 0.2, -depth * sd * 0.515]} castShadow>
            <boxGeometry args={[width * sw * 0.78, height * 0.055, 0.04]} />
            <meshStandardMaterial color={slatColor} roughness={0.9} />
          </mesh>
        </group>
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
  const stripHeight = Math.min(height, 1.05);

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, stripHeight / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, stripHeight, depth]} />
        <meshStandardMaterial color="#8d7f68" roughness={0.84} metalness={0.02} />
      </mesh>
      <mesh position={[0, stripHeight + 0.025, 0]} castShadow>
        <boxGeometry args={[width * 0.94, 0.05, depth * 0.9]} />
        <meshStandardMaterial color="#b0a287" roughness={0.86} metalness={0.01} />
      </mesh>
    </group>
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

  const isSmokeMode = inputMode === 'smoke';
  const isFlashMode = inputMode === 'flash';
  const isUtilityMode = isSmokeMode || isFlashMode;

  if (!hoveredTile || (!hoveredMovementTile && !isUtilityMode)) return null;

  const [wx, , wz] = tileWorld(hoveredTile.x, hoveredTile.y, ts);
  const isOneAp = (hoveredMovementTile?.apCost ?? 2) <= 1;
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
  const threatLabel = topKnownThreat?.coverState === 'protected'
    ? topKnownThreat.coverQuality === 'corner' ? 'CORNER' : 'COVER'
    : topKnownThreat?.coverState === 'flanked'
      ? 'FLANK'
      : 'OPEN';
  const label = isFlashMode ? 'FLASH' : (isSmokeMode ? 'SMOKE' : (isWatched ? 'WATCH' : (isThreatened ? threatLabel : (isOneAp ? '1 AP' : '2 AP'))));
  const smokeColor = '#b9c6d8';
  const flashColor = '#fff1a8';
  const displayColor = isFlashMode ? flashColor : (isSmokeMode ? smokeColor : color);
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
        outlineColor={isFlashMode ? '#6d5720' : (isSmokeMode ? '#3f4a58' : '#f8f3dc')}
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

function FlashTargetPreview() {
  const hoveredTile = useGameStore((s) => s.hoveredTile);
  const selectedUnitId = useGameStore((s) => s.selectedUnitId);
  const inputMode = useGameStore((s) => s.inputMode);
  const units = useGameStore((s) => s.units);
  const smokes = useGameStore((s) => s.smokes);
  const map = useGameStore((s) => s.map);
  const ts = map.tileSize;

  if (!hoveredTile || selectedUnitId === null || inputMode !== 'flash') return null;
  const unit = units.find((candidate) => candidate.id === selectedUnitId);
  if (!unit) return null;

  const tile = map.grid[hoveredTile.y]?.[hoveredTile.x];
  const inRange = gridDistance(unit.position, hoveredTile) <= FLASH_THROW_RANGE;
  const valid = Boolean(tile?.walkable && inRange && unit.flashbangs > 0 && unit.ap > 0);
  const affectedEnemies = valid
    ? units.filter((candidate) => (
      candidate.alive &&
      candidate.team !== unit.team &&
      gridDistance(candidate.position, hoveredTile) <= FLASH_RADIUS_TILES &&
      hasLineOfSight(map, hoveredTile, candidate.position, smokes)
    ))
    : [];
  const [wx, , wz] = tileWorld(hoveredTile.x, hoveredTile.y, ts);
  const radius = FLASH_RADIUS_TILES * ts;
  const color = valid ? FLASH_PREVIEW_COLOR : '#ff6b6b';

  return (
    <group position={[wx, FLOOR_H + 0.3, wz]} raycast={() => null}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius, 44]} />
        <meshBasicMaterial color={color} transparent opacity={valid ? 0.14 : 0.08} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 0.9, radius, 44]} />
        <meshBasicMaterial color={color} transparent opacity={0.84} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <SafeText
        position={[0, 0.03, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.28}
        color={valid ? '#fff8d8' : '#ffd1d1'}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.04}
        outlineColor="#201905"
        font={undefined}
      >
        {valid ? `FLASH ${affectedEnemies.length}` : 'NO THROW'}
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
  const timelineActions = sortPlannedActionsByBeat(plannedActions);

  return (
    <>
      {timelineActions.map((action, index) => {
        const unit = units.find((u) => u.id === action.unitId);
        const isMove = action.kind === 'move';
        const isWatched = isMove && phase !== 'setup' && getCrossingHeldAngles(heldAngles, action.path, action.team).length > 0;
        const isDanger = Boolean(isMove && unit && phase !== 'setup' && units.some((enemy) => {
          if (!enemy.alive || enemy.team === action.team) return false;
          const preview = getShotPreview(map, enemy, unit, 0, action.target, smokes);
          return preview.hasLineOfSight && preview.inRange;
        }));
        const utilityColor = action.kind === 'flash' ? '#fff1a8' : '#c5d1df';
        const color = !isMove ? utilityColor : (isWatched ? '#ff4e6a' : (isDanger ? '#ff9d3d' : (unit?.team === 'CT' ? '#65b7ff' : '#ffd166')));
        const label = !isMove ? action.kind.toUpperCase() : (isWatched ? 'WATCH' : (isDanger ? 'DANGER' : `${action.apCost}AP`));
        const beat = getPlannedActionBeat(action);
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
                fontSize={0.18}
                color="#101318"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.03}
                outlineColor={color}
                font={undefined}
              >
                {`${beat.timeLabel}\n${label}`}
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

    const shot = getShotPresentation(event.weaponCategory);
    const elapsed = state.clock.elapsedTime - startedAtRef.current.time;
    const progress = THREE.MathUtils.clamp(elapsed / shot.markerDurationSeconds, 0, 1);
    const lift = event.killed ? progress * 0.92 : event.hit ? progress * 0.68 : progress * 0.32;
    const pulse = 1 + Math.sin(progress * Math.PI) * shot.impactScale * (event.killed ? 0.46 : event.hit ? 0.32 : 0.15);
    const opacity = Math.max(0, 0.92 * (1 - progress));

    groupRef.current.position.y = FLOOR_H + 0.5 + lift;
    groupRef.current.scale.setScalar(pulse);
    if (ringMaterialRef.current) {
      ringMaterialRef.current.opacity = opacity;
    }
  });

  if (!event) return null;

  const [wx, , wz] = tileWorld(event.tile.x, event.tile.y, ts);
  const shot = getShotPresentation(event.weaponCategory);
  const color = getCombatEventColor(event);
  const label = getCombatEventLabel(event);
  const fontSize = event.killed ? 0.31 : event.critical ? 0.28 : event.hit ? 0.36 : 0.34;

  return (
    <group ref={groupRef} position={[wx, FLOOR_H + 0.5, wz]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[ts * 0.32, ts * (0.5 + shot.impactScale * 0.08), 36]} />
        <meshBasicMaterial ref={ringMaterialRef} color={color} transparent opacity={0.88} side={THREE.DoubleSide} />
      </mesh>
      <SafeText
        position={[0, 0.04, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={fontSize}
        color={event.critical || event.killed ? '#ffffff' : event.hit ? shot.secondaryColor : '#fff1b5'}
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
  const groupRef = useRef<THREE.Group>(null);
  const muzzleRef = useRef<THREE.Group>(null);
  const impactRef = useRef<THREE.Group>(null);
  const damageRef = useRef<THREE.Group>(null);
  const labelRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!event || !groupRef.current) return;

    const shot = getShotPresentation(event.weaponCategory);
    const durationMs = shot.markerDurationSeconds * 1000;
    const elapsedMs = Math.max(0, Date.now() - event.createdAt);
    const progress = THREE.MathUtils.clamp(elapsedMs / durationMs, 0, 1);
    const fade = 1 - THREE.MathUtils.smoothstep(progress, 0.16, 1);
    const pulse = 1 + Math.sin(progress * Math.PI) * shot.impactScale * (event.killed ? 0.22 : event.hit ? 0.15 : 0.09);

    groupRef.current.visible = progress < 1 && fade > 0.02;
    setObjectOpacity(groupRef.current, 0.92 * fade);

    if (muzzleRef.current) {
      const muzzlePunch = 1 + Math.max(0, 1 - progress * 2.4) * shot.muzzleScale * (event.type === 'reaction_fire' ? 0.58 : 0.42);
      muzzleRef.current.scale.setScalar(muzzlePunch);
    }
    if (impactRef.current) {
      impactRef.current.scale.setScalar(pulse);
    }
    if (damageRef.current) {
      damageRef.current.scale.setScalar(1 + Math.sin(progress * Math.PI) * (event.killed ? 0.28 : 0.18));
    }
    if (labelRef.current) {
      labelRef.current.scale.setScalar(1 + Math.sin(progress * Math.PI) * 0.12);
    }
  });

  if (!event) return null;

  const attacker = units.find((unit) => unit.id === event.attackerId);
  const target = units.find((unit) => unit.id === event.targetId);
  if (!attacker) return null;

  const [sx, , sz] = tileWorld(attacker.position.x, attacker.position.y, ts);
  const targetTile = target?.position ?? event.tile;
  const [tx, , tz] = tileWorld(targetTile.x, targetTile.y, ts);
  const shot = getShotPresentation(event.weaponCategory);
  const color = getCombatEventColor(event);
  const label = event.critical
    ? `${shot.label} HEADSHOT`
    : event.killed
      ? `${shot.label} ELIM`
      : event.type === 'reaction_fire'
        ? `${shot.label} REACTION`
        : shot.label;
  const start: LinePoint = [sx, FLOOR_H + 1.08, sz];
  const end: LinePoint = [tx, FLOOR_H + 0.68, tz];
  const midpoint: LinePoint = [(sx + tx) / 2, FLOOR_H + 0.96, (sz + tz) / 2];
  const dx = tx - sx;
  const dz = tz - sz;
  const length = Math.sqrt(dx * dx + dz * dz) || 1;
  const offsetX = -dz / length;
  const offsetZ = dx / length;
  const tracerCount = event.hit ? shot.tracerCount : 1;

  return (
    <group ref={groupRef} raycast={() => null}>
      {Array.from({ length: tracerCount }).map((_, index) => {
        const offset = (index - (tracerCount - 1) / 2) * shot.tracerSpread;
        const tracerStart: LinePoint = [
          start[0] + offsetX * offset,
          start[1] + index * 0.018,
          start[2] + offsetZ * offset,
        ];
        const tracerEnd: LinePoint = [
          end[0] + offsetX * offset * 0.55,
          end[1] + index * 0.012,
          end[2] + offsetZ * offset * 0.55,
        ];

        return (
          <Line
            key={`tracer-${event.id}-${index}`}
            points={[tracerStart, tracerEnd]}
            color={index === 0 ? color : shot.secondaryColor}
            lineWidth={event.hit ? Math.max(2, shot.tracerWidth - index * 0.6) : 2}
            transparent
            opacity={0.92}
          />
        );
      })}
      <group ref={muzzleRef} position={start}>
        <mesh>
          <sphereGeometry args={[0.07 + shot.muzzleScale * 0.06, 12, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0.82} depthWrite={false} />
        </mesh>
      </group>
      <group ref={impactRef} position={end} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh>
          <ringGeometry args={[0.18, event.hit ? 0.28 + shot.impactScale * 0.16 : 0.3, 28]} />
          <meshBasicMaterial color={color} transparent opacity={0.72} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      </group>
      {event.hit && (
        <group ref={damageRef} position={[end[0], FLOOR_H + 0.9, end[2]]}>
          <SafeText
            position={[0, 0, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.21}
            color={event.killed || event.critical ? '#ffffff' : shot.secondaryColor}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.025}
            outlineColor="#09090f"
            font={undefined}
          >
            {`-${event.damage} HP`}
          </SafeText>
        </group>
      )}
      <group ref={labelRef} position={midpoint}>
        <SafeText
          position={[0, 0, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.2}
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
    </group>
  );
}

function ContactBreakPulse() {
  const interrupt = useGameStore((s) => s.executeInterrupt);
  const units = useGameStore((s) => s.units);
  const map = useGameStore((s) => s.map);
  const ts = map.tileSize;
  const groupRef = useRef<THREE.Group>(null);
  const outerRef = useRef<THREE.MeshBasicMaterial>(null);
  const innerRef = useRef<THREE.MeshBasicMaterial>(null);
  const startedAtRef = useRef({ id: '', time: 0 });
  const sparkOffsets = useMemo(() => [
    { x: -0.28, z: -0.12, rotation: -0.7, length: 0.46 },
    { x: 0.24, z: -0.22, rotation: 0.5, length: 0.38 },
    { x: -0.1, z: 0.28, rotation: 1.15, length: 0.32 },
    { x: 0.34, z: 0.16, rotation: -1.1, length: 0.42 },
  ], []);

  useFrame((state) => {
    if (!interrupt || !groupRef.current) return;
    if (startedAtRef.current.id !== interrupt.id) {
      startedAtRef.current = { id: interrupt.id, time: state.clock.elapsedTime };
    }

    const elapsed = state.clock.elapsedTime - startedAtRef.current.time;
    const progress = THREE.MathUtils.clamp(elapsed / 2.2, 0, 1);
    const pulse = 1 + Math.sin(progress * Math.PI * 2.2) * 0.1;
    groupRef.current.scale.setScalar(pulse);

    if (outerRef.current) {
      outerRef.current.opacity = Math.max(0.08, 0.42 * (1 - progress * 0.55));
    }
    if (innerRef.current) {
      innerRef.current.opacity = Math.max(0.16, 0.58 * (1 - progress * 0.35));
    }
  });

  if (!interrupt) return null;

  const [wx, , wz] = tileWorld(interrupt.contactTile.x, interrupt.contactTile.y, ts);
  const attacker = units.find((unit) => unit.id === interrupt.event.attackerId);
  const target = units.find((unit) => unit.id === interrupt.event.targetId);
  const attackerPoint = attacker
    ? tileWorld(attacker.position.x, attacker.position.y, ts)
    : null;
  const targetPoint = target
    ? tileWorld(target.position.x, target.position.y, ts)
    : tileWorld(interrupt.contactTile.x, interrupt.contactTile.y, ts);
  const shot = getShotPresentation(interrupt.event.weaponCategory);
  const color = getCombatEventColor(interrupt.event);

  return (
    <group ref={groupRef} position={[wx, FLOOR_H + 0.34, wz]} raycast={() => null}>
      {attackerPoint && (
        <>
          <Line
            points={[
              [attackerPoint[0] - wx, FLOOR_H + 0.62, attackerPoint[2] - wz],
              [targetPoint[0] - wx, FLOOR_H + 0.62, targetPoint[2] - wz],
            ]}
            color={color}
            lineWidth={8}
            transparent
            opacity={0.34}
          />
          <Line
            points={[
              [attackerPoint[0] - wx, FLOOR_H + 0.68, attackerPoint[2] - wz],
              [targetPoint[0] - wx, FLOOR_H + 0.68, targetPoint[2] - wz],
            ]}
            color="#ffffff"
            lineWidth={3}
            transparent
            opacity={0.88}
          />
          <mesh position={[attackerPoint[0] - wx, FLOOR_H + 0.78, attackerPoint[2] - wz]}>
            <sphereGeometry args={[0.18, 12, 8]} />
            <meshBasicMaterial color="#fff4b8" transparent opacity={0.82} depthWrite={false} />
          </mesh>
        </>
      )}
      <mesh position={[targetPoint[0] - wx, FLOOR_H + 0.75, targetPoint[2] - wz]}>
        <sphereGeometry args={[0.22, 14, 10]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.88} depthWrite={false} />
      </mesh>
      {sparkOffsets.map((spark, index) => (
        <mesh
          key={index}
          position={[targetPoint[0] - wx + spark.x, FLOOR_H + 0.72, targetPoint[2] - wz + spark.z]}
          rotation={[0, spark.rotation, 0]}
        >
          <boxGeometry args={[0.06, 0.06, spark.length]} />
          <meshBasicMaterial color={index % 2 === 0 ? '#ffffff' : '#ffd166'} transparent opacity={0.78} depthWrite={false} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ts * 0.86, ts * 1.02, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ts * 1.12, ts * 1.22, 64]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <ringGeometry args={[ts * 0.55, ts * 0.72, 4]} />
        <meshBasicMaterial ref={outerRef} color={color} transparent opacity={0.42} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ts * 0.28, ts * 0.44, 36]} />
        <meshBasicMaterial ref={innerRef} color={shot.secondaryColor} transparent opacity={0.56} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <SafeText
        position={[0, 0.14, -0.78]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.28}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.045}
        outlineColor="#09090f"
        font={undefined}
      >
        {`CONTACT\n${interrupt.beatLabel}`}
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
    if (!shooter || !shooter.alive || shooter.ap <= 0 || shooter.ammoInClip <= 0) return [];

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
          ? preview.coverQuality === 'corner' ? 'CORNER' : preview.coverLabel.toUpperCase()
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
  const throwFlash = useGameStore((s) => s.throwFlash);
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
        } else if (inputMode === 'flash') {
          throwFlash({ x: tileX, y: tileY });
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
    [ts, map.width, map.height, moveUnit, queueMove, holdAngle, throwSmoke, throwFlash, selectUnit, planningMode, inputMode]
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
      <meshBasicMaterial color={TILE_COLORS.out_of_bounds} />
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
      <PlantedBombMarker />
      <SmokeLayer />
      <FlashLayer />
      <WalkableHighlight />
      <ThreatenedMovementOverlay />
      <HoveredTileHighlight />
      <SmokeTargetPreview />
      <FlashTargetPreview />
      <PathPreview />
      <PlannedActionPreview />
      <HeldAngleOverlay />
      <HoldAngleHoverPreview />
      <ContactBreakPulse />
      <CombatTracerOverlay />
      <CombatEventMarker />
      <ShotPreviewOverlay />
      <InteractiveFloor />
    </group>
  );
}
