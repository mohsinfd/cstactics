// ============================================================
// IsometricScene: Main Three.js canvas.
//
// - Orthographic camera for clean isometric view
// - Warm directional light (sunlight) + cool fill
// - Subtle hemisphere light for ambient color
// - Shadow mapping
// - Fog for depth
// ============================================================
import { useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrthographicCamera, MapControls } from '@react-three/drei';
import type { OrthographicCamera as ThreeOrthographicCamera } from 'three';
import { MapRenderer } from './MapRenderer';
import { UnitRenderer } from './UnitRenderer';
import { useGameStore } from '../game/store';

const CAMERA_PRESET = {
  offsetX: 78,
  height: 125,
  offsetZ: -98,
  targetOffsetZ: 8,
  zoom: 4.9,
  minZoom: 3.8,
  maxZoom: 26,
} as const;

export function IsometricScene() {
  const map = useGameStore((s) => s.map);
  const cameraRef = useRef<ThreeOrthographicCamera>(null);

  const cx = (map.width * map.tileSize) / 2;
  const cz = (map.height * map.tileSize) / 2;
  const cameraPosition = useMemo<[number, number, number]>(() => [
    cx + CAMERA_PRESET.offsetX,
    CAMERA_PRESET.height,
    cz + CAMERA_PRESET.offsetZ,
  ], [cx, cz]);
  const cameraTarget = useMemo<[number, number, number]>(() => [
    cx,
    0,
    cz + CAMERA_PRESET.targetOffsetZ,
  ], [cx, cz]);

  useLayoutEffect(() => {
    cameraRef.current?.lookAt(...cameraTarget);
    cameraRef.current?.updateProjectionMatrix();
  }, [cameraTarget]);

  return (
    <Canvas
      shadows
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      style={{ width: '100vw', height: '100vh', background: '#10131a' }}
    >
      {/* Camera */}
      <OrthographicCamera
        ref={cameraRef}
        makeDefault
        zoom={CAMERA_PRESET.zoom}
        position={cameraPosition}
        near={1}
        far={500}
      />

      {/* Pan + zoom, no rotation */}
      <MapControls
        enableRotate={false}
        enableDamping
        dampingFactor={0.12}
        minZoom={CAMERA_PRESET.minZoom}
        maxZoom={CAMERA_PRESET.maxZoom}
        screenSpacePanning
        target={cameraTarget}
      />

      {/* === Lighting === */}

      {/* Hemisphere: warm ground, cool sky */}
      <hemisphereLight
        args={['#d7deee', '#2a2630', 0.78]}
      />

      {/* Ambient fill */}
      <ambientLight intensity={0.76} color="#c9d2e2" />

      {/* Main sun (warm, casts shadows) */}
      <directionalLight
        position={[cx + 60, 100, cz - 40]}
        intensity={1.2}
        color="#ffe0b0"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-120}
        shadow-camera-right={120}
        shadow-camera-top={120}
        shadow-camera-bottom={-120}
        shadow-camera-near={1}
        shadow-camera-far={350}
        shadow-bias={-0.001}
      />

      {/* Cool fill from opposite side */}
      <directionalLight
        position={[cx - 50, 50, cz + 50]}
        intensity={0.42}
        color="#7788aa"
      />

      {/* Slight rim light from behind */}
      <directionalLight
        position={[cx, 30, cz - 80]}
        intensity={0.28}
        color="#aabbcc"
      />

      {/* === Scene content === */}
      <MapRenderer />
      <UnitRenderer />

      {/* Fog for depth */}
      <fog attach="fog" args={['#10131a', 360, 640]} />
    </Canvas>
  );
}
