// ============================================================
// MapRenderer: Professional-grade Inferno map rendering.
//
// Features:
// - Floor tiles with subtle grid edges
// - Building mass (walls) with slight color variation
// - Cover objects with distinct materials
// - Bombsite plant zone indicators
// - Callout name labels floating above map areas
// - Walkable range highlight (green tint)
// - Path preview line (bright green)
// - Interactive invisible plane for click/hover
// ============================================================
import { useMemo, useCallback } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { Line, Text } from '@react-three/drei';
import { useGameStore } from '../game/store';
import { getCalloutLabels } from '../game/maps/inferno';

// --- Color palette: muted tactical tones ---
const TILE_COLORS: Record<string, string> = {
  floor:       '#3a3a52',
  bombsite_a:  '#4a2828',
  bombsite_b:  '#4a2828',
  spawn_t:     '#4a4020',
  spawn_ct:    '#203850',
  wall:        '#4a4a60',
  cover_half:  '#7a6d4a',
  cover_full:  '#5c5540',
  out_of_bounds: '#08080c',
};

const WALL_HEIGHT = 2.8;
const COVER_HALF_H = 0.9;
const COVER_FULL_H = 1.8;
const FLOOR_H = 0.12;
const GRID_GAP = 0.04; // gap between tiles for grid effect

function tileWorld(x: number, y: number, ts: number): [number, number, number] {
  return [x * ts + ts / 2, 0, y * ts + ts / 2];
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

// ---- Walls (building mass) ----
function WallLayer() {
  const map = useGameStore((s) => s.map);
  const ts = map.tileSize;

  const wallPositions = useMemo(() => {
    const p: [number, number, number][] = [];
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.grid[y]?.[x]?.type === 'wall') p.push(tileWorld(x, y, ts));
      }
    }
    return p;
  }, [map, ts]);

  const mesh = useMemo(() => {
    if (wallPositions.length === 0) return null;
    const geo = new THREE.BoxGeometry(ts, WALL_HEIGHT, ts);
    // Slightly varied wall color using vertex colors would be ideal,
    // but for now use a single darker material
    const mat = new THREE.MeshStandardMaterial({
      color: TILE_COLORS.wall, roughness: 0.92, metalness: 0.0,
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

      // Subtle variation: +/- 5% brightness based on position hash
      const hash = ((x * 73 + z * 137) % 100) / 100;
      const variation = 0.92 + hash * 0.16;
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
        const cx = (c.x + c.width / 2) * ts;
        const cz = (c.y + c.height / 2) * ts;
        const h = c.coverType === 'half' ? COVER_HALF_H : COVER_FULL_H;
        const color = c.coverType === 'half' ? '#8a7d5a' : '#6a6050';

        return (
          <group key={i}>
            <mesh position={[cx, h / 2, cz]} castShadow receiveShadow>
              <boxGeometry args={[c.width * ts * 0.88, h, c.height * ts * 0.88]} />
              <meshStandardMaterial color={color} roughness={0.82} metalness={0.03} />
            </mesh>
            {/* Cover label */}
            <Text
              position={[cx, h + 0.15, cz]}
              fontSize={0.18}
              color="#887755"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.015}
              outlineColor="#000000"
              font={undefined}
            >
              {c.label}
            </Text>
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
      const cx = (zone.min.x + (zone.max.x - zone.min.x) / 2) * ts;
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
            <meshBasicMaterial color="#cc2222" transparent opacity={0.12} side={THREE.DoubleSide} />
          </mesh>
          {/* Site letter */}
          <Text
            position={[cx, 0.5, cz]}
            fontSize={1.5}
            color="#cc3333"
            fillOpacity={0.33}
            anchorX="center"
            anchorY="middle"
            font={undefined}
          >
            {site}
          </Text>
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
      if (seen.has(l.name)) return false;
      seen.add(l.name);
      return true;
    });
  }, []);

  return (
    <>
      {labels.map((l) => {
        const wx = l.x * ts + ts / 2;
        const wz = l.y * ts + ts / 2;
        return (
          <Text
            key={l.name}
            position={[wx, WALL_HEIGHT + 0.8, wz]}
            fontSize={0.35}
            color="#aaaaaa"
            fillOpacity={0.33}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.02}
            outlineColor="#000000"
            outlineOpacity={0.27}
            font={undefined}
          >
            {l.name.toUpperCase()}
          </Text>
        );
      })}
    </>
  );
}

// ---- Walkable range highlight ----
function WalkableHighlight() {
  const walkableTiles = useGameStore((s) => s.walkableTiles);
  const map = useGameStore((s) => s.map);
  const ts = map.tileSize;

  const mesh = useMemo(() => {
    if (walkableTiles.length === 0) return null;
    const size = ts - GRID_GAP;
    const geo = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshBasicMaterial({
      color: '#22ee66', transparent: true, opacity: 0.1, side: THREE.DoubleSide,
    });
    const inst = new THREE.InstancedMesh(geo, mat, walkableTiles.length);
    const d = new THREE.Object3D();
    walkableTiles.forEach((tile, i) => {
      const [wx, , wz] = tileWorld(tile.x, tile.y, ts);
      d.position.set(wx, FLOOR_H + 0.04, wz);
      d.rotation.set(-Math.PI / 2, 0, 0);
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    return inst;
  }, [walkableTiles, ts]);

  if (!mesh) return null;
  return <primitive object={mesh} />;
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

// ---- Interactive plane for click-to-move + unit selection ----
function InteractiveFloor() {
  const map = useGameStore((s) => s.map);
  const moveUnit = useGameStore((s) => s.moveUnit);
  const selectUnit = useGameStore((s) => s.selectUnit);
  const hoverTile = useGameStore((s) => s.hoverTile);
  const ts = map.tileSize;

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      const tileX = Math.floor(e.point.x / ts);
      const tileY = Math.floor(e.point.z / ts);
      if (tileX >= 0 && tileX < map.width && tileY >= 0 && tileY < map.height) {
        // Check if a unit is on this tile — if so, select it
        const { units, round } = useGameStore.getState();
        const unitOnTile = units.find(
          (u) => u.alive && u.position.x === tileX && u.position.y === tileY
        );
        if (unitOnTile && unitOnTile.team === round.activeTeam) {
          selectUnit(unitOnTile.id);
        } else {
          moveUnit({ x: tileX, y: tileY });
        }
      }
    },
    [ts, map.width, map.height, moveUnit, selectUnit]
  );

  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const tileX = Math.floor(e.point.x / ts);
      const tileY = Math.floor(e.point.z / ts);
      if (tileX >= 0 && tileX < map.width && tileY >= 0 && tileY < map.height) {
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
      <meshStandardMaterial color="#08080c" roughness={1} />
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
      <WalkableHighlight />
      <PathPreview />
      <InteractiveFloor />
    </group>
  );
}
