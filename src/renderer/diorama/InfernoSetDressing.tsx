import * as THREE from 'three';
import type { MapData } from '../../game/types';
import { ART, standardMaterialProps } from '../artDirection';

const NO_RAYCAST = () => null;

const MAT = {
  clayTop: '#f2efe7',
  claySide: '#d2d3cf',
  clayDark: '#aeb6b6',
  roof: '#c5c8c9',
  roofDark: '#9aa4a6',
  wood: '#b7a58d',
  metal: '#b7bdc0',
  accentGreen: '#9fc98a',
  accentBlue: '#87b6d7',
  accentYellow: '#d9c26a',
} as const;

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function rectCenter(mapWidth: number, tileSize: number, rect: Rect): [number, number] {
  return [
    (mapWidth - rect.x - rect.width / 2) * tileSize,
    (rect.y + rect.height / 2) * tileSize,
  ];
}

function tileCenter(mapWidth: number, tileSize: number, x: number, y: number): [number, number] {
  return [
    (mapWidth - 1 - x) * tileSize + tileSize / 2,
    y * tileSize + tileSize / 2,
  ];
}

function material(color: THREE.ColorRepresentation, emissiveIntensity = 0.02) {
  return standardMaterialProps(color, 'stone', {
    roughness: 0.95,
    metalness: 0,
    emissive: color,
    emissiveIntensity,
  });
}

function MapBlock({
  map,
  rect,
  height,
  color = MAT.claySide,
  capColor = MAT.clayTop,
  y = ART.heights.floor,
}: {
  map: MapData;
  rect: Rect;
  height: number;
  color?: THREE.ColorRepresentation;
  capColor?: THREE.ColorRepresentation;
  y?: number;
}) {
  const [cx, cz] = rectCenter(map.width, map.tileSize, rect);
  const width = rect.width * map.tileSize;
  const depth = rect.height * map.tileSize;

  return (
    <group position={[cx, y, cz]} raycast={NO_RAYCAST}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial {...material(color)} />
      </mesh>
      <mesh position={[0, height + 0.035, 0]} castShadow receiveShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[width * 0.94, 0.07, depth * 0.94]} />
        <meshStandardMaterial {...material(capColor, 0.012)} />
      </mesh>
    </group>
  );
}

function LowRim({ map, rect, color = MAT.clayDark }: { map: MapData; rect: Rect; color?: THREE.ColorRepresentation }) {
  const [cx, cz] = rectCenter(map.width, map.tileSize, rect);
  const width = rect.width * map.tileSize;
  const depth = rect.height * map.tileSize;
  const t = Math.max(0.18, map.tileSize * 0.16);
  const y = ART.heights.floor + 0.16;

  return (
    <group position={[cx, y, cz]} raycast={NO_RAYCAST}>
      <mesh position={[0, 0, -depth / 2]} castShadow receiveShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[width, 0.32, t]} />
        <meshStandardMaterial {...material(color)} />
      </mesh>
      <mesh position={[0, 0, depth / 2]} castShadow receiveShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[width, 0.32, t]} />
        <meshStandardMaterial {...material(color)} />
      </mesh>
      <mesh position={[-width / 2, 0, 0]} castShadow receiveShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[t, 0.32, depth]} />
        <meshStandardMaterial {...material(color)} />
      </mesh>
      <mesh position={[width / 2, 0, 0]} castShadow receiveShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[t, 0.32, depth]} />
        <meshStandardMaterial {...material(color)} />
      </mesh>
    </group>
  );
}

function ArchGate({
  map,
  x,
  y,
  rotation = 0,
  widthTiles = 2.3,
}: {
  map: MapData;
  x: number;
  y: number;
  rotation?: number;
  widthTiles?: number;
}) {
  const [cx, cz] = tileCenter(map.width, map.tileSize, x, y);
  const w = widthTiles * map.tileSize;
  const h = 1.65;
  const pillar = 0.28 * map.tileSize;

  return (
    <group position={[cx, ART.heights.floor + 0.12, cz]} rotation={[0, rotation, 0]} raycast={NO_RAYCAST}>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * w / 2, h / 2, 0]} castShadow receiveShadow raycast={NO_RAYCAST}>
          <boxGeometry args={[pillar, h, pillar * 0.88]} />
          <meshStandardMaterial {...material(MAT.claySide)} />
        </mesh>
      ))}
      <mesh position={[0, h + 0.1, 0]} castShadow receiveShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[w + pillar, 0.34, pillar]} />
        <meshStandardMaterial {...material(MAT.clayTop)} />
      </mesh>
      <mesh position={[0, h * 0.5, 0.02]} rotation={[Math.PI / 2, 0, 0]} raycast={NO_RAYCAST}>
        <torusGeometry args={[w * 0.31, 0.045, 8, 22, Math.PI]} />
        <meshStandardMaterial {...material(MAT.clayDark)} />
      </mesh>
    </group>
  );
}

function ColumnRow({
  map,
  startX,
  y,
  count,
  spacing = 1.5,
  rotation = 0,
}: {
  map: MapData;
  startX: number;
  y: number;
  count: number;
  spacing?: number;
  rotation?: number;
}) {
  return (
    <group rotation={[0, rotation, 0]} raycast={NO_RAYCAST}>
      {Array.from({ length: count }, (_, index) => {
        const [cx, cz] = tileCenter(map.width, map.tileSize, startX + index * spacing, y);
        return (
          <mesh key={index} position={[cx, ART.heights.floor + 0.88, cz]} castShadow receiveShadow raycast={NO_RAYCAST}>
            <cylinderGeometry args={[0.18, 0.2, 1.76, 8]} />
            <meshStandardMaterial {...material(MAT.clayTop)} />
          </mesh>
        );
      })}
    </group>
  );
}

function Stairs({
  map,
  rect,
  steps,
  direction = 'z',
}: {
  map: MapData;
  rect: Rect;
  steps: number;
  direction?: 'x' | 'z';
}) {
  const [cx, cz] = rectCenter(map.width, map.tileSize, rect);
  const width = rect.width * map.tileSize;
  const depth = rect.height * map.tileSize;
  const stepSize = (direction === 'z' ? depth : width) / steps;

  return (
    <group position={[cx, ART.heights.floor + 0.03, cz]} raycast={NO_RAYCAST}>
      {Array.from({ length: steps }, (_, index) => {
        const h = 0.08 + index * 0.055;
        const offset = -((steps - 1) * stepSize) / 2 + index * stepSize;
        return (
          <mesh
            key={index}
            position={direction === 'z' ? [0, h / 2, offset] : [offset, h / 2, 0]}
            castShadow
            receiveShadow
            raycast={NO_RAYCAST}
          >
            <boxGeometry args={direction === 'z' ? [width, h, stepSize * 0.9] : [stepSize * 0.9, h, depth]} />
            <meshStandardMaterial {...material(MAT.claySide)} />
          </mesh>
        );
      })}
    </group>
  );
}

function BarrelCluster({ map, x, y, count = 3 }: { map: MapData; x: number; y: number; count?: number }) {
  const [cx, cz] = tileCenter(map.width, map.tileSize, x, y);
  return (
    <group position={[cx, ART.heights.floor, cz]} raycast={NO_RAYCAST}>
      {Array.from({ length: count }, (_, index) => {
        const ox = (index % 2) * 0.48 - 0.24;
        const oz = Math.floor(index / 2) * 0.48 - 0.18;
        return (
          <mesh key={index} position={[ox, 0.32, oz]} castShadow receiveShadow raycast={NO_RAYCAST}>
            <cylinderGeometry args={[0.22, 0.22, 0.64, 10]} />
            <meshStandardMaterial {...material(MAT.wood)} />
          </mesh>
        );
      })}
    </group>
  );
}

function CrateCluster({ map, x, y, width = 1.2, depth = 1.1 }: { map: MapData; x: number; y: number; width?: number; depth?: number }) {
  const [cx, cz] = tileCenter(map.width, map.tileSize, x, y);
  return (
    <group position={[cx, ART.heights.floor, cz]} raycast={NO_RAYCAST}>
      <mesh position={[0, 0.34, 0]} castShadow receiveShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[width, 0.68, depth]} />
        <meshStandardMaterial {...material(MAT.wood)} />
      </mesh>
      <mesh position={[0, 0.72, 0.08]} castShadow receiveShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[width * 0.78, 0.18, depth * 0.72]} />
        <meshStandardMaterial {...material(MAT.claySide)} />
      </mesh>
    </group>
  );
}

function SpawnFountain({ map, x, y, team }: { map: MapData; x: number; y: number; team: 'T' | 'CT' }) {
  const [cx, cz] = tileCenter(map.width, map.tileSize, x, y);
  const accent = team === 'T' ? MAT.accentGreen : MAT.accentBlue;
  return (
    <group position={[cx, ART.heights.floor + 0.02, cz]} raycast={NO_RAYCAST}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow raycast={NO_RAYCAST}>
        <ringGeometry args={[0.72, 1.04, 8]} />
        <meshStandardMaterial {...material(MAT.clayTop)} />
      </mesh>
      <mesh position={[0, 0.18, 0]} castShadow receiveShadow raycast={NO_RAYCAST}>
        <cylinderGeometry args={[0.42, 0.48, 0.34, 12]} />
        <meshStandardMaterial {...material(MAT.claySide)} />
      </mesh>
      <mesh position={[0, 0.38, 0]} castShadow receiveShadow raycast={NO_RAYCAST}>
        <cylinderGeometry args={[0.26, 0.3, 0.18, 12]} />
        <meshStandardMaterial {...material(accent, 0.05)} />
      </mesh>
    </group>
  );
}

function BananaLandmarks({ map }: { map: MapData }) {
  return (
    <group raycast={NO_RAYCAST}>
      <MapBlock map={map} rect={{ x: 31, y: 47, width: 3, height: 8 }} height={0.54} color={MAT.roof} capColor={MAT.clayTop} />
      <MapBlock map={map} rect={{ x: 36, y: 58, width: 2, height: 7 }} height={0.48} color={MAT.roofDark} capColor={MAT.roof} />
      <ArchGate map={map} x={39.5} y={66} rotation={Math.PI / 2} widthTiles={2.1} />
      <BarrelCluster map={map} x={35} y={58} />
      <CrateCluster map={map} x={45} y={70} width={1.25} depth={0.9} />
    </group>
  );
}

function BSiteLandmarks({ map }: { map: MapData }) {
  return (
    <group raycast={NO_RAYCAST}>
      <LowRim map={map} rect={{ x: 38, y: 72, width: 12, height: 13 }} color={MAT.clayDark} />
      <MapBlock map={map} rect={{ x: 31, y: 78, width: 7, height: 7 }} height={0.7} color={MAT.roof} capColor={MAT.clayTop} />
      <ColumnRow map={map} startX={34} y={82} count={4} spacing={1.2} />
      <ArchGate map={map} x={38} y={75} rotation={0} widthTiles={2.4} />
      <Stairs map={map} rect={{ x: 48, y: 73, width: 4, height: 2 }} steps={4} direction="x" />
      <CrateCluster map={map} x={47} y={83} />
      <BarrelCluster map={map} x={42} y={75} count={2} />
    </group>
  );
}

function ASiteLandmarks({ map }: { map: MapData }) {
  return (
    <group raycast={NO_RAYCAST}>
      <LowRim map={map} rect={{ x: 68, y: 22, width: 11, height: 17 }} color={MAT.clayDark} />
      <Stairs map={map} rect={{ x: 74, y: 36, width: 4, height: 2 }} steps={5} direction="z" />
      <ArchGate map={map} x={76} y={40} rotation={Math.PI / 2} widthTiles={2.2} />
      <CrateCluster map={map} x={74} y={30} width={1.15} depth={1.15} />
      <BarrelCluster map={map} x={69} y={27} count={2} />
    </group>
  );
}

function MidAndAppsLandmarks({ map }: { map: MapData }) {
  return (
    <group raycast={NO_RAYCAST}>
      <ArchGate map={map} x={63} y={52} rotation={Math.PI / 2} widthTiles={2.5} />
      <Stairs map={map} rect={{ x: 54, y: 29, width: 4, height: 2 }} steps={4} direction="z" />
      <CrateCluster map={map} x={56} y={47} width={1.1} depth={0.9} />
      <BarrelCluster map={map} x={50} y={32} count={2} />
    </group>
  );
}

function SpawnLandmarks({ map }: { map: MapData }) {
  return (
    <group raycast={NO_RAYCAST}>
      <LowRim map={map} rect={{ x: 5, y: 27, width: 9, height: 12 }} color={MAT.accentYellow} />
      <SpawnFountain map={map} x={9} y={36} team="T" />
      <SpawnFountain map={map} x={81} y={65} team="CT" />
    </group>
  );
}

export function InfernoSetDressingLayer({ map }: { map: MapData }) {
  return (
    <group raycast={NO_RAYCAST}>
      <SpawnLandmarks map={map} />
      <BananaLandmarks map={map} />
      <BSiteLandmarks map={map} />
      <ASiteLandmarks map={map} />
      <MidAndAppsLandmarks map={map} />
    </group>
  );
}
