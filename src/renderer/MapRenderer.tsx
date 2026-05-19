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
import type { CombatEvent, FlashBurst, MapData, Tile, TileCoord, Unit } from '../game/types';
import { getCrossingHeldAngles } from '../game/threats';
import { getShotPreview } from '../game/combat';
import { getPlannedActionBeat, sortPlannedActionsByBeat } from '../game/executeTimeline';
import { getWatchedLane, hasLineOfSight } from '../game/los';
import { getShotPresentation } from '../game/shotPresentation';
import { buildTeamVisibleTileKeys, isUnitVisibleToTeam, visibilityTileKey } from '../game/visibility';
import { ART, standardMaterialProps, type ArtMaterialProfile, type ArtPaletteToken } from './artDirection';
import { InfernoSetDressingLayer } from './diorama/InfernoSetDressing';
import { LandmarkCoverProp } from './diorama/LandmarkProps';

const CLICK_DRAG_THRESHOLD_PX = 4;

function SafeText(props: ComponentProps<typeof Text>) {
  return (
    <Suspense fallback={null}>
      <Text {...props} />
    </Suspense>
  );
}

type ArtColor = ArtPaletteToken | THREE.ColorRepresentation;

const WHITEBOX = {
  floor: ART.palette.floorTop,
  floorSite: ART.palette.floorSite,
  floorSpawnT: '#e7dfd9',
  floorSpawnCT: '#e0e9ee',
  slabSide: '#c3c7c4',
  slabSideDark: '#9fa8a9',
  wallTop: ART.palette.wallTop,
  wallCapSide: '#d5d4cc',
  wallSide: '#d7d7d1',
  wallPlinth: '#b8bebc',
  wallDark: '#9ea8a9',
  archLight: '#eee9df',
  archMid: '#d0d2cf',
  archDark: '#aab2b0',
  siteA: '#d26c65',
  siteB: '#dfc861',
} as const;

// --- Color palette: muted low-poly diorama tones ---
const TILE_COLORS: Record<string, string> = {
  floor: WHITEBOX.floor,
  bombsite_a: WHITEBOX.floorSite,
  bombsite_b: WHITEBOX.floorSite,
  spawn_t: WHITEBOX.floorSpawnT,
  spawn_ct: WHITEBOX.floorSpawnCT,
  wall: WHITEBOX.wallSide,
  cover_half: WHITEBOX.archMid,
  cover_full: WHITEBOX.archMid,
  out_of_bounds: ART.palette.void,
};

const WALL_HEIGHT = ART.heights.wall * 2.18;
const WALL_CAP_H = Math.max(0.22, ART.heights.wallCap * 1.65);
const WALL_PLINTH_H = 0.2;
const COVER_HALF_H = ART.heights.coverHalf;
const COVER_FULL_H = ART.heights.coverFull;
const FLOOR_H = ART.heights.floor;
const GRID_GAP = ART.heights.gridGap; // nearly seamless so the silhouette reads before the grid
const MOVE_ONE_AP_COLOR = ART.palette.moveOneAP;
const MOVE_TWO_AP_COLOR = ART.palette.moveTwoAP;
const MOVE_BOUNDARY_COLOR = ART.palette.selected;
const THREAT_COLOR = ART.palette.danger;
const SMOKE_PREVIEW_COLOR = ART.palette.smoke;
const FLASH_PREVIEW_COLOR = ART.palette.flash;
const FOG_COLOR = '#34414d';
const SMOKE_THROW_RANGE = 12;
const SMOKE_RADIUS_TILES = 2;
const FLASH_THROW_RANGE = 12;
const FLASH_RADIUS_TILES = 5;
const KEY_CALLOUTS = new Set([
  'T Spawn',
  'Upper Banana',
  'B Site',
  'Mid',
  'Top Mid',
  'Second Mid',
  'Boiler',
  'Apartments',
  'Pit',
  'A Site',
  'Arch',
  'Construction',
  'Moto',
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

function tileElevationY(elevation: number, ts: number): number {
  return elevation * ts * ART.heights.elevationStep;
}

function tileSurfaceY(elevation: number, ts: number): number {
  return tileElevationY(elevation, ts) + FLOOR_H / 2;
}

function tileSlabBottomY(elevation: number, ts: number): number {
  return tileSurfaceY(elevation, ts) - ART.heights.slabDepth;
}

function footprintKey(x: number, y: number): string {
  return `${x},${y}`;
}

const CARDINAL_DIRECTIONS = [
  { dx: 1, dy: 0, shade: 0.9 },
  { dx: -1, dy: 0, shade: 1 },
  { dx: 0, dy: 1, shade: 0.84 },
  { dx: 0, dy: -1, shade: 0.96 },
] as const;

type WallRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  elevation: number;
};

function buildCoverFootprintKeys(map: MapData): Set<string> {
  const keys = new Set<string>();

  for (const cover of map.coverObjects) {
    for (let y = cover.y; y < cover.y + cover.height; y++) {
      for (let x = cover.x; x < cover.x + cover.width; x++) {
        if (x >= 0 && x < map.width && y >= 0 && y < map.height) {
          keys.add(footprintKey(x, y));
        }
      }
    }
  }

  return keys;
}

function isCoverFootprintTile(
  tile: Tile | undefined,
  coverFootprint: ReadonlySet<string>,
  x: number,
  y: number,
): boolean {
  return tile?.type === 'cover_half' || tile?.type === 'cover_full' || coverFootprint.has(footprintKey(x, y));
}

function isRenderedFloorFootprintTile(
  map: MapData,
  coverFootprint: ReadonlySet<string>,
  x: number,
  y: number,
): boolean {
  const tile = map.grid[y]?.[x];
  return Boolean(tile && (tile.walkable || isCoverFootprintTile(tile, coverFootprint, x, y)));
}

function isRenderedWallFootprintTile(
  map: MapData,
  coverFootprint: ReadonlySet<string>,
  x: number,
  y: number,
): boolean {
  const tile = map.grid[y]?.[x];
  if (tile?.type !== 'wall') return false;
  return CARDINAL_DIRECTIONS.some(({ dx, dy }) => isRenderedFloorFootprintTile(map, coverFootprint, x + dx, y + dy));
}

function isBoardFootprintTile(
  map: MapData,
  coverFootprint: ReadonlySet<string>,
  x: number,
  y: number,
): boolean {
  return isRenderedFloorFootprintTile(map, coverFootprint, x, y) ||
    isRenderedWallFootprintTile(map, coverFootprint, x, y);
}

function isTrueVoidAt(
  map: MapData,
  coverFootprint: ReadonlySet<string>,
  x: number,
  y: number,
): boolean {
  return !isBoardFootprintTile(map, coverFootprint, x, y);
}

function buildWallRects(map: MapData, coverFootprint: ReadonlySet<string>): WallRect[] {
  const used = new Set<string>();
  const rects: WallRect[] = [];

  const isMergeableWall = (x: number, y: number, elevation: number): boolean => {
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
    if (used.has(footprintKey(x, y))) return false;
    const tile = map.grid[y]?.[x];
    return Boolean(
      tile &&
      tile.elevation === elevation &&
      isRenderedWallFootprintTile(map, coverFootprint, x, y)
    );
  };

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const key = footprintKey(x, y);
      if (used.has(key)) continue;
      const tile = map.grid[y]?.[x];
      if (!tile || !isRenderedWallFootprintTile(map, coverFootprint, x, y)) continue;

      const elevation = tile.elevation;
      let width = 1;
      while (isMergeableWall(x + width, y, elevation)) width += 1;

      let height = 1;
      let canGrow = true;
      while (canGrow && y + height < map.height) {
        for (let dx = 0; dx < width; dx++) {
          if (!isMergeableWall(x + dx, y + height, elevation)) {
            canGrow = false;
            break;
          }
        }
        if (canGrow) height += 1;
      }

      for (let yy = y; yy < y + height; yy++) {
        for (let xx = x; xx < x + width; xx++) {
          used.add(footprintKey(xx, yy));
        }
      }

      rects.push({ x, y, width, height, elevation });
    }
  }

  return rects;
}

function buildFloorSlabEdgeGeometry(map: MapData, ts: number): THREE.BufferGeometry | null {
  const vertices: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const coverFootprint = buildCoverFootprintKeys(map);
  const slabColor = new THREE.Color(WHITEBOX.slabSide);
  const half = ts / 2;

  const addFace = (corners: [number, number, number][], shade: number) => {
    const start = vertices.length / 3;
    const color = slabColor.clone().multiplyScalar(shade);

    corners.forEach(([x, y, z]) => {
      vertices.push(x, y, z);
      colors.push(color.r, color.g, color.b);
    });
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  };

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!isBoardFootprintTile(map, coverFootprint, x, y)) continue;
      const tile = map.grid[y]?.[x];
      if (!tile) continue;

      const [wx, , wz] = tileWorld(x, y, ts);
      const topY = tileSurfaceY(tile.elevation, ts);
      const bottomY = tileSlabBottomY(tile.elevation, ts);

      CARDINAL_DIRECTIONS.forEach(({ dx, dy, shade }) => {
        if (!isTrueVoidAt(map, coverFootprint, x + dx, y + dy)) return;

        if (dx === 1) {
          const edgeX = wx - half;
          addFace([
            [edgeX, bottomY, wz + half],
            [edgeX, bottomY, wz - half],
            [edgeX, topY, wz - half],
            [edgeX, topY, wz + half],
          ], shade);
        } else if (dx === -1) {
          const edgeX = wx + half;
          addFace([
            [edgeX, bottomY, wz - half],
            [edgeX, bottomY, wz + half],
            [edgeX, topY, wz + half],
            [edgeX, topY, wz - half],
          ], shade);
        } else if (dy === 1) {
          const edgeZ = wz + half;
          addFace([
            [wx - half, bottomY, edgeZ],
            [wx + half, bottomY, edgeZ],
            [wx + half, topY, edgeZ],
            [wx - half, topY, edgeZ],
          ], shade);
        } else {
          const edgeZ = wz - half;
          addFace([
            [wx + half, bottomY, edgeZ],
            [wx - half, bottomY, edgeZ],
            [wx - half, topY, edgeZ],
            [wx + half, topY, edgeZ],
          ], shade);
        }
      });
    }
  }

  if (vertices.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildFloorTopGeometry(map: MapData, ts: number): THREE.BufferGeometry | null {
  const vertices: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const half = ts / 2;

  const addTopFace = (x: number, y: number, tile: Tile) => {
    const [wx, , wz] = tileWorld(x, y, ts);
    const topY = tileSurfaceY(tile.elevation, ts) + 0.002;
    const start = vertices.length / 3;
    const color = new THREE.Color(TILE_COLORS[tile.type] || TILE_COLORS.floor);

    vertices.push(
      wx - half, topY, wz - half,
      wx - half, topY, wz + half,
      wx + half, topY, wz + half,
      wx + half, topY, wz - half,
    );

    for (let i = 0; i < 4; i++) {
      colors.push(color.r, color.g, color.b);
    }

    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  };

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.grid[y]?.[x];
      if (!tile || !tile.walkable) continue;
      addTopFace(x, y, tile);
    }
  }

  if (vertices.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeStandardMaterial(
  color: ArtColor,
  profile: ArtMaterialProfile,
  overrides: THREE.MeshStandardMaterialParameters = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial(standardMaterialProps(color, profile, overrides));
}

function makeBoxMaterials({
  top,
  side,
  bottom = side,
  profile,
  vertexColors = false,
  overrides = {},
}: {
  top: ArtColor;
  side: ArtColor;
  bottom?: ArtColor;
  profile: ArtMaterialProfile;
  vertexColors?: boolean;
  overrides?: THREE.MeshStandardMaterialParameters;
}): THREE.MeshStandardMaterial[] {
  const sideProps = { vertexColors, ...overrides };
  const topProps = { vertexColors, ...overrides };

  return [
    makeStandardMaterial(side, profile, sideProps),
    makeStandardMaterial(side, profile, sideProps),
    makeStandardMaterial(top, profile, topProps),
    makeStandardMaterial(bottom, profile, sideProps),
    makeStandardMaterial(side, profile, sideProps),
    makeStandardMaterial(side, profile, sideProps),
  ];
}

function gridDistance(a: TileCoord, b: TileCoord): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

type LinePoint = [number, number, number];
type BoundarySegment = [LinePoint, LinePoint];

function curvedLinePoints(points: LinePoint[], segmentsPerPoint = 8): LinePoint[] {
  if (points.length <= 2) return points;
  const curve = new THREE.CatmullRomCurve3(
    points.map((point) => new THREE.Vector3(...point)),
    false,
    'centripetal',
    0.32,
  );
  return curve.getPoints(Math.max(14, points.length * segmentsPerPoint)).map((point) => [point.x, point.y, point.z]);
}

function arrowHeadSegments(points: LinePoint[], size: number): BoundarySegment[] {
  if (points.length < 2) return [];
  const end = points[points.length - 1];
  const prev = points[points.length - 2];
  const dx = end[0] - prev[0];
  const dz = end[2] - prev[2];
  const len = Math.sqrt(dx * dx + dz * dz) || 1;
  const ux = dx / len;
  const uz = dz / len;
  const px = -uz;
  const pz = ux;
  const back: LinePoint = [end[0] - ux * size, end[1], end[2] - uz * size];
  const left: LinePoint = [back[0] + px * size * 0.44, end[1], back[2] + pz * size * 0.44];
  const right: LinePoint = [back[0] - px * size * 0.44, end[1], back[2] - pz * size * 0.44];
  return [[end, left], [end, right]];
}

function ArrowHeadLines({
  points,
  color,
  size,
  lineWidth,
  renderOrder,
}: {
  points: LinePoint[];
  color: string;
  size: number;
  lineWidth: number;
  renderOrder: number;
}) {
  return (
    <>
      {arrowHeadSegments(points, size).map((segment, index) => (
        <Line
          key={index}
          points={segment}
          color={color}
          lineWidth={lineWidth}
          transparent
          opacity={0.95}
          depthTest={false}
          renderOrder={renderOrder}
        />
      ))}
    </>
  );
}

function buildFacingConeGeometry(tileSize: number): THREE.BufferGeometry {
  const range = tileSize * 3.4;
  const halfAngle = Math.PI / 8;
  const segments = 12;
  const vertices: number[] = [0, 0, 0];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const angle = -halfAngle + halfAngle * 2 * t;
    vertices.push(
      Math.sin(angle) * range,
      0,
      Math.cos(angle) * range,
    );
  }

  for (let i = 1; i <= segments; i++) {
    indices.push(0, i, i + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function UnitFacingCone({ unit, tileSize, selected }: {
  unit: Unit;
  tileSize: number;
  selected: boolean;
}) {
  const geometry = useMemo(
    () => buildFacingConeGeometry(tileSize),
    [tileSize],
  );
  const [wx, , wz] = tileWorld(unit.position.x, unit.position.y, tileSize);
  const worldDx = -unit.facing.x;
  const worldDz = unit.facing.y;
  const yaw = Math.atan2(worldDx, worldDz);
  const color = unit.team === 'CT' ? ART.palette.controlZoneBlue : ART.palette.dangerZoneRed;

  return (
    <mesh
      geometry={geometry}
      position={[wx, ART.overlayY.threatBand + 0.012, wz]}
      rotation={[0, yaw, 0]}
      renderOrder={ART.overlayOrder.threatBand}
      raycast={() => null}
    >
      <meshBasicMaterial
        color={color}
        transparent
        opacity={selected ? 0.15 : 0.045}
        side={THREE.DoubleSide}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}

function UnitTacticalOverlayLayer() {
  const units = useGameStore((s) => s.units);
  const selectedUnitId = useGameStore((s) => s.selectedUnitId);
  const activeTeam = useGameStore((s) => s.round.activeTeam);
  const smokes = useGameStore((s) => s.smokes);
  const map = useGameStore((s) => s.map);
  const ts = map.tileSize;
  const visibleUnits = useMemo(
    () => units.filter((unit) => unit.alive && isUnitVisibleToTeam(map, units, activeTeam, unit, smokes)),
    [activeTeam, map, smokes, units],
  );

  return (
    <>
      {visibleUnits.map((unit) => {
        const [wx, , wz] = tileWorld(unit.position.x, unit.position.y, ts);
        const selected = unit.id === selectedUnitId;
        const color = unit.team === 'CT' ? ART.palette.controlZoneBlue : ART.palette.dangerZoneRed;

        return (
          <group key={`unit-tactical-${unit.id}`}>
            <mesh
              position={[wx, ART.overlayY.siteMarker + 0.012, wz]}
              rotation={[-Math.PI / 2, 0, 0]}
              renderOrder={ART.overlayOrder.movementBand}
              raycast={() => null}
            >
              <circleGeometry args={[ts * (selected ? 1.45 : 1.08), 32]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={selected ? 0.12 : 0.055}
                side={THREE.DoubleSide}
                depthWrite={false}
                depthTest={false}
              />
            </mesh>
            <UnitFacingCone unit={unit} tileSize={ts} selected={selected} />
          </group>
        );
      })}
    </>
  );
}

function FogOfWarLayer() {
  const map = useGameStore((s) => s.map);
  const units = useGameStore((s) => s.units);
  const activeTeam = useGameStore((s) => s.round.activeTeam);
  const smokes = useGameStore((s) => s.smokes);
  const ts = map.tileSize;

  const fog = useMemo(() => {
    const visible = buildTeamVisibleTileKeys(map, units, activeTeam, smokes);
    const shrouded: TileCoord[] = [];
    const frontier: TileCoord[] = [];

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tile = map.grid[y]?.[x];
        if (!tile?.walkable) continue;

        const key = visibilityTileKey(tile);
        if (!visible.has(key)) {
          shrouded.push({ x, y });
          continue;
        }

        const touchesUnknown = CARDINAL_DIRECTIONS.some(({ dx, dy }) => {
          const neighbor = map.grid[y + dy]?.[x + dx];
          return Boolean(neighbor?.walkable && !visible.has(visibilityTileKey(neighbor)));
        });
        if (touchesUnknown) frontier.push({ x, y });
      }
    }

    return { shrouded, frontier };
  }, [activeTeam, map, smokes, units]);

  if (fog.shrouded.length === 0) return null;

  const frontierColor = activeTeam === 'CT' ? ART.palette.controlZoneBlue : ART.palette.dangerZoneRed;

  return (
    <>
      <MovementBand
        tiles={fog.shrouded}
        color={FOG_COLOR}
        opacity={0.34}
        tileSize={ts}
        y={ART.overlayY.fog}
        renderOrder={ART.overlayOrder.fog}
      />
      <MovementBand
        tiles={fog.frontier}
        color={frontierColor}
        opacity={0.055}
        tileSize={ts}
        y={ART.overlayY.fogEdge}
        renderOrder={ART.overlayOrder.fogEdge}
      />
      <MovementBoundary
        tiles={fog.frontier}
        color={frontierColor}
        tileSize={ts}
        y={ART.overlayY.fogEdge + 0.01}
        lineWidth={0.9}
        opacity={0.3}
        renderOrder={ART.overlayOrder.fogEdge}
      />
    </>
  );
}

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

  const geometry = useMemo(
    () => buildFloorTopGeometry(map, ts),
    [map, ts],
  );
  const material = useMemo(
    () => new THREE.MeshStandardMaterial(standardMaterialProps(WHITEBOX.floor, 'floor', {
      vertexColors: true,
      emissive: WHITEBOX.floor,
      emissiveIntensity: 0.012,
    })),
    [],
  );

  if (!geometry) return null;
  return <mesh geometry={geometry} material={material} receiveShadow raycast={() => null} />;
}

function FloorSlabEdgeLayer() {
  const map = useGameStore((s) => s.map);
  const ts = map.tileSize;

  const geometry = useMemo(
    () => buildFloorSlabEdgeGeometry(map, ts),
    [map, ts],
  );
  const material = useMemo(
    () => new THREE.MeshStandardMaterial(standardMaterialProps(WHITEBOX.slabSide, 'stone', {
      vertexColors: true,
      side: THREE.DoubleSide,
      emissive: WHITEBOX.slabSideDark,
      emissiveIntensity: 0.04,
    })),
    [],
  );

  if (!geometry) return null;
  return <mesh geometry={geometry} material={material} receiveShadow raycast={() => null} />;
}

// ---- Walls (readable perimeter mass, not full black building slabs) ----
function WallLayer() {
  const map = useGameStore((s) => s.map);
  const ts = map.tileSize;

  const wallRects = useMemo(() => {
    const coverFootprint = buildCoverFootprintKeys(map);
    return buildWallRects(map, coverFootprint);
  }, [map]);

  const meshes = useMemo(() => {
    if (wallRects.length === 0) return null;
    const bodyHeight = Math.max(0.01, WALL_HEIGHT - WALL_CAP_H - WALL_PLINTH_H);
    const plinthGeo = new THREE.BoxGeometry(1, 1, 1);
    const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
    const capGeo = new THREE.BoxGeometry(1, 1, 1);
    const plinthMat = makeBoxMaterials({
      top: WHITEBOX.wallPlinth,
      side: WHITEBOX.wallDark,
      bottom: WHITEBOX.wallDark,
      profile: 'wall',
      overrides: {
        emissive: WHITEBOX.wallDark,
        emissiveIntensity: 0.025,
      },
    });
    const bodyMat = makeBoxMaterials({
      top: WHITEBOX.wallSide,
      side: WHITEBOX.wallSide,
      bottom: WHITEBOX.wallDark,
      profile: 'wall',
      overrides: {
        emissive: WHITEBOX.wallDark,
        emissiveIntensity: 0.03,
      },
    });
    const capMat = makeBoxMaterials({
      top: WHITEBOX.wallTop,
      side: WHITEBOX.wallCapSide,
      bottom: WHITEBOX.wallSide,
      profile: 'wall',
      overrides: {
        emissive: WHITEBOX.wallTop,
        emissiveIntensity: 0.018,
      },
    });
    const plinth = new THREE.InstancedMesh(plinthGeo, plinthMat, wallRects.length);
    const body = new THREE.InstancedMesh(bodyGeo, bodyMat, wallRects.length);
    const cap = new THREE.InstancedMesh(capGeo, capMat, wallRects.length);
    const d = new THREE.Object3D();

    wallRects.forEach((rect, i) => {
      const x = areaCenterWorldX(map.width, rect.x, rect.width, ts);
      const z = (rect.y + rect.height / 2) * ts;
      const baseY = tileSurfaceY(rect.elevation, ts);
      const width = rect.width * ts - GRID_GAP;
      const depth = rect.height * ts - GRID_GAP;

      d.position.set(x, baseY + WALL_PLINTH_H / 2, z);
      d.scale.set(width + ts * 0.16, WALL_PLINTH_H, depth + ts * 0.16);
      d.updateMatrix();
      plinth.setMatrixAt(i, d.matrix);

      d.position.set(x, baseY + WALL_PLINTH_H + bodyHeight / 2, z);
      d.scale.set(width, bodyHeight, depth);
      d.updateMatrix();
      body.setMatrixAt(i, d.matrix);

      d.position.set(x, baseY + WALL_PLINTH_H + bodyHeight + WALL_CAP_H / 2, z);
      d.scale.set(width + ts * 0.16, WALL_CAP_H, depth + ts * 0.16);
      d.updateMatrix();
      cap.setMatrixAt(i, d.matrix);
    });

    plinth.instanceMatrix.needsUpdate = true;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    body.instanceMatrix.needsUpdate = true;
    body.castShadow = true;
    body.receiveShadow = true;
    cap.instanceMatrix.needsUpdate = true;
    cap.castShadow = true;
    cap.receiveShadow = true;
    return { plinth, body, cap };
  }, [map.width, wallRects, ts]);

  if (!meshes) return null;
  return (
    <group>
      <primitive object={meshes.plinth} />
      <primitive object={meshes.body} />
      <primitive object={meshes.cap} />
    </group>
  );
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
            <LandmarkCoverProp cover={c} x={cx} z={cz} h={h} tileSize={ts} />
            <SafeText
              position={[cx, h + 0.08, cz]}
              rotation={[-Math.PI / 2, 0, Math.PI]}
              fontSize={0.12}
              color={ART.props.coverLabel}
              fillOpacity={0.16}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.01}
              outlineColor={ART.props.outline}
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
          <mesh
            position={[cx, ART.overlayY.siteMarker, cz]}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={ART.overlayOrder.siteLabel}
          >
            <planeGeometry args={[w, h]} />
            <meshBasicMaterial
              color={site === 'A' ? WHITEBOX.siteA : WHITEBOX.siteB}
              transparent
              opacity={0.2}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          {/* Site letter */}
          <SafeText
            position={[cx, ART.overlayY.siteText, cz]}
            rotation={[-Math.PI / 2, 0, Math.PI]}
            fontSize={2.25}
            color={ART.palette.labelInk}
            fillOpacity={0.72}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.08}
            outlineColor={ART.palette.labelHalo}
            outlineOpacity={0.82}
            renderOrder={ART.overlayOrder.siteLabel}
            font={undefined}
          >
            {`${site} SITE`}
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
            position={[wx, ART.overlayY.calloutText, wz]}
            rotation={[-Math.PI / 2, 0, Math.PI]}
            fontSize={1.55}
            color={ART.palette.labelInk}
            fillOpacity={0.58}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.14}
            outlineColor={ART.palette.labelHalo}
            outlineOpacity={0.72}
            renderOrder={ART.overlayOrder.siteLabel}
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
        const color = smoke.team === 'CT' ? ART.palette.ctAccent : ART.palette.tAccent;
        return (
          <group key={smoke.id} position={[wx, 0, wz]} raycast={() => null}>
            <mesh position={[0, FLOOR_H + 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[radius, 40]} />
              <meshBasicMaterial color={color} transparent opacity={0.2} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <mesh position={[0, FLOOR_H + 0.48, 0]}>
              <cylinderGeometry args={[radius * 0.94, radius * 0.72, 0.78, 36, 1, true]} />
              <meshStandardMaterial
                color={ART.palette.smoke}
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
              <meshBasicMaterial color={ART.palette.textLight} transparent opacity={0.18} side={THREE.DoubleSide} depthWrite={false} />
            </mesh>
            <SafeText
              position={[0, FLOOR_H + 0.98, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.2}
              color={ART.palette.textLight}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.025}
              outlineColor={ART.props.outline}
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
        <meshBasicMaterial ref={discMaterialRef} color={ART.palette.flash} transparent opacity={0.42} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 0.16, radius, 48]} />
        <meshBasicMaterial ref={ringMaterialRef} color={ART.palette.textLight} transparent opacity={0.86} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <SafeText
        position={[0, 0.04, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.34}
        color={ART.palette.textDark}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.04}
        outlineColor={ART.palette.flash}
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
  const color = isDefused ? ART.palette.ctAccent : (isDropped ? ART.palette.tAccent : ART.palette.bombAccent);

  return (
    <group position={[wx, FLOOR_H + 0.18, wz]} raycast={() => null}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ts * 0.34, ts * 0.58, 34]} />
        <meshBasicMaterial color={color} transparent opacity={0.88} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.13, 0]} castShadow>
        <boxGeometry args={[0.42, 0.22, 0.28]} />
        <meshStandardMaterial
          {...standardMaterialProps('wallDark', 'metal', {
            emissive: isDefused ? ART.palette.ctAccent : (isDropped ? ART.palette.tAccent : ART.palette.bombAccent),
            emissiveIntensity: 0.18,
          })}
        />
      </mesh>
      <mesh position={[0.13, 0.26, 0.02]}>
        <sphereGeometry args={[0.045, 8, 6]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <Text
        position={[0, 0.08, ts * 0.64]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.22}
        color={isDefused ? ART.palette.textLight : (isDropped ? ART.palette.flash : ART.palette.textLight)}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.03}
        outlineColor={ART.props.outline}
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
      <MovementBand
        tiles={groups.twoAp}
        color={MOVE_TWO_AP_COLOR}
        opacity={0.17}
        tileSize={ts}
        y={ART.overlayY.movementBand}
        renderOrder={ART.overlayOrder.movementBand}
      />
      <MovementBand
        tiles={groups.oneAp}
        color={MOVE_ONE_AP_COLOR}
        opacity={0.2}
        tileSize={ts}
        y={ART.overlayY.movementBand}
        renderOrder={ART.overlayOrder.movementBand}
      />
      <MovementBoundary
        tiles={movementTiles}
        color={MOVE_BOUNDARY_COLOR}
        tileSize={ts}
        y={ART.overlayY.movementBoundary}
        lineWidth={2.4}
        renderOrder={ART.overlayOrder.movementBoundary}
      />
      <MovementBoundary
        tiles={groups.oneAp}
        color={MOVE_ONE_AP_COLOR}
        tileSize={ts}
        y={ART.overlayY.oneApBoundary}
        lineWidth={1.35}
        opacity={0.72}
        renderOrder={ART.overlayOrder.movementBoundary}
      />
    </>
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
      <MovementBand
        tiles={threatenedTiles.protected}
        color={ART.palette.moveTwoAP}
        opacity={0.13}
        tileSize={ts}
        y={ART.overlayY.threatBand}
        renderOrder={ART.overlayOrder.threatBand}
      />
      <MovementBand
        tiles={threatenedTiles.flanked}
        color={ART.palette.dangerZoneRed}
        opacity={0.2}
        tileSize={ts}
        y={ART.overlayY.threatBand}
        renderOrder={ART.overlayOrder.threatBand}
      />
      <MovementBand
        tiles={threatenedTiles.exposed}
        color={ART.palette.dangerZoneRed}
        opacity={0.28}
        tileSize={ts}
        y={ART.overlayY.threatBand}
        renderOrder={ART.overlayOrder.threatBand}
      />
      <MovementBoundary
        tiles={[...threatenedTiles.exposed, ...threatenedTiles.flanked]}
        color={ART.palette.fireLineRed}
        tileSize={ts}
        y={ART.overlayY.threatBoundary}
        lineWidth={1.6}
        opacity={0.78}
        renderOrder={ART.overlayOrder.threatBoundary}
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
  const color = isWatched ? ART.palette.danger : (isThreatened ? THREAT_COLOR : (isOneAp ? MOVE_ONE_AP_COLOR : MOVE_TWO_AP_COLOR));
  const threatLabel = topKnownThreat?.coverState === 'protected'
    ? topKnownThreat.coverQuality === 'corner' ? 'CORNER' : 'COVER'
    : topKnownThreat?.coverState === 'flanked'
      ? 'FLANK'
      : 'OPEN';
  const label = isFlashMode ? 'FLASH' : (isSmokeMode ? 'SMOKE' : (isWatched ? 'WATCH' : (isThreatened ? threatLabel : (isOneAp ? '1 AP' : '2 AP'))));
  const smokeColor = ART.palette.smoke;
  const flashColor = ART.palette.flash;
  const displayColor = isFlashMode ? flashColor : (isSmokeMode ? smokeColor : color);
  const coverEdges = getCoverEdges(map, hoveredTile);

  return (
    <group
      position={[wx, ART.overlayY.hoveredTile, wz]}
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={ART.overlayOrder.hoveredTile}
    >
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
        <meshBasicMaterial color={displayColor} transparent opacity={0.85} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <SafeText
        position={[0, 0, 0.035]}
        fontSize={0.28}
        color={ART.palette.textDark}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.035}
        outlineColor={isFlashMode ? ART.palette.tAccent : (isSmokeMode ? ART.props.outline : ART.palette.textLight)}
        renderOrder={ART.overlayOrder.hoveredTile}
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
  const color = valid ? SMOKE_PREVIEW_COLOR : ART.props.invalid;

  return (
    <group position={[wx, ART.overlayY.utilityPreview, wz]} renderOrder={ART.overlayOrder.utilityPreview} raycast={() => null}>
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
        color={valid ? ART.palette.textLight : ART.props.invalid}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.035}
        outlineColor={ART.props.outline}
        renderOrder={ART.overlayOrder.utilityPreview}
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
  const color = valid ? FLASH_PREVIEW_COLOR : ART.props.invalid;

  return (
    <group position={[wx, ART.overlayY.flashPreview, wz]} renderOrder={ART.overlayOrder.utilityPreview} raycast={() => null}>
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
        color={valid ? ART.palette.textLight : ART.props.invalid}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.04}
        outlineColor={ART.props.outline}
        renderOrder={ART.overlayOrder.utilityPreview}
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
  renderOrder = ART.overlayOrder.movementBoundary,
}: {
  tiles: Array<{ x: number; y: number }>;
  color: string;
  tileSize: number;
  y: number;
  lineWidth: number;
  opacity?: number;
  renderOrder?: number;
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
          renderOrder={renderOrder}
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
  y = ART.overlayY.movementBand,
  renderOrder = ART.overlayOrder.movementBand,
}: {
  tiles: Array<{ x: number; y: number }>;
  color: string;
  opacity: number;
  tileSize: number;
  y?: number;
  renderOrder?: number;
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
    inst.renderOrder = renderOrder;
    const d = new THREE.Object3D();
    tiles.forEach((tile, i) => {
      const [wx, , wz] = tileWorld(tile.x, tile.y, tileSize);
      d.position.set(wx, y, wz);
      d.rotation.set(-Math.PI / 2, 0, 0);
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    return inst;
  }, [tiles, color, opacity, tileSize, y, renderOrder]);

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
    const rawPoints = allTiles.map((t): [number, number, number] => {
      const [wx, , wz] = tileWorld(t.x, t.y, ts);
      return [wx, ART.overlayY.pathPreview, wz];
    });
    return curvedLinePoints(rawPoints);
  }, [pathPreview, selectedUnitId, units, ts]);

  if (!points || points.length < 2) return null;
  return (
    <>
      <Line
        points={points}
        color={ART.palette.moveArrowBlue}
        lineWidth={4.2}
        transparent
        opacity={0.95}
        depthTest={false}
        renderOrder={ART.overlayOrder.pathPreview}
      />
      <ArrowHeadLines
        points={points}
        color={ART.palette.moveArrowBlue}
        size={ts * 0.42}
        lineWidth={4.2}
        renderOrder={ART.overlayOrder.pathPreview}
      />
    </>
  );
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
        const utilityColor = action.kind === 'flash' ? ART.palette.flash : ART.palette.smoke;
        const color = !isMove
          ? utilityColor
          : (isWatched || isDanger ? ART.palette.fireLineRed : ART.palette.moveArrowBlue);
        const label = !isMove ? action.kind.toUpperCase() : (isWatched ? 'WATCH' : (isDanger ? 'DANGER' : `${action.apCost}AP`));
        const beat = getPlannedActionBeat(action);
        const stackOffset = Math.min(index, 8);
        const plannedPathY = ART.overlayY.plannedPath + stackOffset * 0.006;
        const plannedMarkerY = ART.overlayY.plannedMarker + stackOffset * 0.004;
        const rawPoints = [action.from, ...action.path].map((tile): [number, number, number] => {
          const [wx, , wz] = tileWorld(tile.x, tile.y, ts);
          return [wx, plannedPathY, wz];
        });
        const points = isMove ? curvedLinePoints(rawPoints) : rawPoints;
        const [wx, , wz] = tileWorld(action.target.x, action.target.y, ts);

        return (
          <group key={action.id}>
            {points.length >= 2 && (
              <>
                <Line
                  points={points}
                  color={color}
                  lineWidth={isMove ? 3.8 : 2.4}
                  transparent
                  opacity={isMove ? 0.92 : 0.82}
                  depthTest={false}
                  dashed={isWatched || isDanger}
                  dashSize={0.32}
                  gapSize={0.18}
                  renderOrder={ART.overlayOrder.plannedPath}
                />
                {isMove && (
                  <ArrowHeadLines
                    points={points}
                    color={color}
                    size={ts * 0.38}
                    lineWidth={3.8}
                    renderOrder={ART.overlayOrder.plannedPath}
                  />
                )}
              </>
            )}
            <group
              position={[wx, plannedMarkerY, wz]}
              rotation={[-Math.PI / 2, 0, 0]}
              renderOrder={ART.overlayOrder.plannedMarker}
            >
              <mesh raycast={() => null}>
                <ringGeometry args={[ts * 0.24, ts * 0.42, 24]} />
                <meshBasicMaterial color={color} transparent opacity={0.9} side={THREE.DoubleSide} depthWrite={false} />
              </mesh>
              <SafeText
                position={[0, 0, 0.04]}
                fontSize={0.18}
                color={ART.palette.textDark}
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.03}
                outlineColor={color}
                renderOrder={ART.overlayOrder.plannedMarker}
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
        const color = unit?.team === 'CT' ? ART.palette.fireLineRed : ART.palette.moveArrowBlue;
        const points = [angle.origin, ...angle.laneTiles].map((tile): [number, number, number] => {
          const [wx, , wz] = tileWorld(tile.x, tile.y, ts);
          return [wx, ART.overlayY.heldLaneLine, wz];
        });

        return (
          <group key={angle.id}>
            {points.length >= 2 && (
              <Line
                points={points}
                color={color}
                lineWidth={3.2}
                transparent
                opacity={0.92}
                dashed={unit?.team === 'CT'}
                dashSize={0.34}
                gapSize={0.18}
                depthTest={false}
                renderOrder={ART.overlayOrder.heldLaneLine}
              />
            )}
            <HeldLaneTiles
              tiles={angle.laneTiles}
              color={color}
              tileSize={ts}
              y={ART.overlayY.heldLaneTile}
              renderOrder={ART.overlayOrder.heldLaneTile}
            />
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

  const color = preview.unit.team === 'CT' ? ART.palette.fireLineRed : ART.palette.moveArrowBlue;
  const points = [preview.unit.position, ...preview.laneTiles].map((tile): [number, number, number] => {
    const [wx, , wz] = tileWorld(tile.x, tile.y, ts);
    return [wx, ART.overlayY.holdPreview, wz];
  });
  const lastTile = preview.laneTiles[preview.laneTiles.length - 1];
  const [labelX, , labelZ] = tileWorld(lastTile.x, lastTile.y, ts);

  return (
    <group>
      {points.length >= 2 && (
        <Line
          points={points}
          color={color}
          lineWidth={2.8}
          transparent
          opacity={0.84}
          dashed={preview.unit.team === 'CT'}
          dashSize={0.3}
          gapSize={0.18}
          depthTest={false}
          renderOrder={ART.overlayOrder.utilityPreview}
        />
      )}
      <HeldLaneTiles
        tiles={preview.laneTiles}
        color={color}
        tileSize={ts}
        opacity={0.18}
        y={ART.overlayY.holdPreview}
        renderOrder={ART.overlayOrder.utilityPreview}
      />
      <SafeText
        position={[labelX, ART.overlayY.holdLabel, labelZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.25}
        color={ART.palette.textLight}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.025}
        outlineColor={ART.props.outline}
        renderOrder={ART.overlayOrder.utilityPreview}
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
  y = ART.overlayY.heldLaneTile,
  renderOrder = ART.overlayOrder.heldLaneTile,
}: {
  tiles: TileCoord[];
  color: string;
  tileSize: number;
  opacity?: number;
  y?: number;
  renderOrder?: number;
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
    inst.renderOrder = renderOrder;
    const d = new THREE.Object3D();
    tiles.forEach((tile, i) => {
      const [wx, , wz] = tileWorld(tile.x, tile.y, tileSize);
      d.position.set(wx, y, wz);
      d.rotation.set(-Math.PI / 2, 0, 0);
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    return inst;
  }, [tiles, color, opacity, tileSize, y, renderOrder]);

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

    groupRef.current.position.y = ART.overlayY.combatMarker + lift;
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
    <group ref={groupRef} position={[wx, ART.overlayY.combatMarker, wz]} renderOrder={ART.overlayOrder.combat}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[ts * 0.32, ts * (0.5 + shot.impactScale * 0.08), 36]} />
        <meshBasicMaterial ref={ringMaterialRef} color={color} transparent opacity={0.88} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <SafeText
        position={[0, 0.04, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={fontSize}
        color={event.critical || event.killed ? ART.palette.textLight : event.hit ? shot.secondaryColor : ART.palette.flash}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.04}
        outlineColor={ART.props.outline}
        renderOrder={ART.overlayOrder.combat}
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
  const start: LinePoint = [sx, ART.overlayY.muzzle, sz];
  const end: LinePoint = [tx, ART.overlayY.tracerTarget, tz];
  const midpoint: LinePoint = [(sx + tx) / 2, ART.overlayY.damageText, (sz + tz) / 2];
  const dx = tx - sx;
  const dz = tz - sz;
  const length = Math.sqrt(dx * dx + dz * dz) || 1;
  const offsetX = -dz / length;
  const offsetZ = dx / length;
  const tracerCount = event.hit ? shot.tracerCount : 1;

  return (
    <group ref={groupRef} renderOrder={ART.overlayOrder.combat} raycast={() => null}>
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
            renderOrder={ART.overlayOrder.combat}
          />
        );
      })}
      <group ref={muzzleRef} position={start} renderOrder={ART.overlayOrder.combat}>
        <mesh>
          <sphereGeometry args={[0.07 + shot.muzzleScale * 0.06, 12, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0.82} depthWrite={false} />
        </mesh>
      </group>
      <group ref={impactRef} position={end} rotation={[-Math.PI / 2, 0, 0]} renderOrder={ART.overlayOrder.combat}>
        <mesh>
          <ringGeometry args={[0.18, event.hit ? 0.28 + shot.impactScale * 0.16 : 0.3, 28]} />
          <meshBasicMaterial color={color} transparent opacity={0.72} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      </group>
      {event.hit && (
        <group ref={damageRef} position={[end[0], ART.overlayY.damageText, end[2]]} renderOrder={ART.overlayOrder.combat}>
          <SafeText
            position={[0, 0, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.21}
            color={event.killed || event.critical ? ART.palette.textLight : shot.secondaryColor}
            anchorX="center"
            anchorY="middle"
            outlineWidth={0.025}
            outlineColor={ART.props.outline}
            renderOrder={ART.overlayOrder.combat}
            font={undefined}
          >
            {`-${event.damage} HP`}
          </SafeText>
        </group>
      )}
      <group ref={labelRef} position={midpoint} renderOrder={ART.overlayOrder.combat}>
        <SafeText
          position={[0, 0, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.2}
          color={color}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.03}
          outlineColor={ART.props.outline}
          renderOrder={ART.overlayOrder.combat}
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
  const laneY = ART.overlayY.contactLane - ART.overlayY.contactPulse;
  const sparkY = ART.overlayY.contactSpark - ART.overlayY.contactPulse;
  const labelY = ART.overlayY.contactLabel - ART.overlayY.contactPulse;

  return (
    <group
      ref={groupRef}
      position={[wx, ART.overlayY.contactPulse, wz]}
      renderOrder={ART.overlayOrder.contactPulse}
      raycast={() => null}
    >
      {attackerPoint && (
        <>
          <Line
            points={[
              [attackerPoint[0] - wx, laneY, attackerPoint[2] - wz],
              [targetPoint[0] - wx, laneY, targetPoint[2] - wz],
            ]}
            color={color}
            lineWidth={8}
            transparent
            opacity={0.34}
            renderOrder={ART.overlayOrder.contactPulse}
          />
          <Line
            points={[
              [attackerPoint[0] - wx, laneY + 0.045, attackerPoint[2] - wz],
              [targetPoint[0] - wx, laneY + 0.045, targetPoint[2] - wz],
            ]}
            color={ART.palette.textLight}
            lineWidth={3}
            transparent
            opacity={0.88}
            renderOrder={ART.overlayOrder.contactPulse}
          />
          <mesh position={[attackerPoint[0] - wx, sparkY, attackerPoint[2] - wz]} renderOrder={ART.overlayOrder.contactPulse}>
            <sphereGeometry args={[0.18, 12, 8]} />
            <meshBasicMaterial color={ART.palette.flash} transparent opacity={0.82} depthWrite={false} />
          </mesh>
        </>
      )}
      <mesh position={[targetPoint[0] - wx, sparkY, targetPoint[2] - wz]} renderOrder={ART.overlayOrder.contactPulse}>
        <sphereGeometry args={[0.22, 14, 10]} />
        <meshBasicMaterial color={ART.palette.textLight} transparent opacity={0.88} depthWrite={false} />
      </mesh>
      {sparkOffsets.map((spark, index) => (
        <mesh
          key={index}
          position={[targetPoint[0] - wx + spark.x, sparkY - 0.03, targetPoint[2] - wz + spark.z]}
          rotation={[0, spark.rotation, 0]}
          renderOrder={ART.overlayOrder.contactPulse}
        >
          <boxGeometry args={[0.06, 0.06, spark.length]} />
          <meshBasicMaterial color={index % 2 === 0 ? ART.palette.textLight : ART.palette.tAccent} transparent opacity={0.78} depthWrite={false} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={ART.overlayOrder.contactPulse}>
        <ringGeometry args={[ts * 0.86, ts * 1.02, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={ART.overlayOrder.contactPulse}>
        <ringGeometry args={[ts * 1.12, ts * 1.22, 64]} />
        <meshBasicMaterial color={ART.palette.textLight} transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]} renderOrder={ART.overlayOrder.contactPulse}>
        <ringGeometry args={[ts * 0.55, ts * 0.72, 4]} />
        <meshBasicMaterial ref={outerRef} color={color} transparent opacity={0.42} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={ART.overlayOrder.contactPulse}>
        <ringGeometry args={[ts * 0.28, ts * 0.44, 36]} />
        <meshBasicMaterial ref={innerRef} color={shot.secondaryColor} transparent opacity={0.56} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <SafeText
        position={[0, labelY, -0.78]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.28}
        color={ART.palette.textLight}
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.045}
        outlineColor={ART.props.outline}
        renderOrder={ART.overlayOrder.contactPulse}
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
          ART.overlayY.shotLabel,
          (sz + tz) / 2,
        ];
        const color = ART.palette.fireLineRed;
        const coverLabel = preview.coverState === 'protected'
          ? preview.coverQuality === 'corner' ? 'CORNER' : preview.coverLabel.toUpperCase()
          : preview.coverState.toUpperCase();

        return (
          <group key={`shot-${target.id}`}>
            <Line
              points={[[sx, ART.overlayY.shotLine, sz], [tx, ART.overlayY.shotLine, tz]]}
              color={color}
              lineWidth={3.2}
              transparent
              opacity={0.94}
              dashed
              dashSize={0.36}
              gapSize={0.18}
              depthTest={false}
              renderOrder={ART.overlayOrder.shotPreview}
            />
            <SafeText
              position={midpoint}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.26}
              color={color}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.04}
              outlineColor={ART.palette.labelHalo}
              renderOrder={ART.overlayOrder.shotPreview}
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

// ---- Compose ----
export function MapRenderer() {
  const map = useGameStore((s) => s.map);

  return (
    <group>
      <FloorLayer />
      <FloorSlabEdgeLayer />
      <WallLayer />
      <InfernoSetDressingLayer map={map} />
      <CoverLayer />
      <BombsiteMarkers />
      <CalloutLabels />
      <PlantedBombMarker />
      <SmokeLayer />
      <FlashLayer />
      <FogOfWarLayer />
      <UnitTacticalOverlayLayer />
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
