// ============================================================
// IsometricScene: Main Three.js canvas.
//
// - Orthographic camera for clean isometric view
// - Warm directional light (sunlight) + cool fill
// - Subtle hemisphere light for ambient color
// - Shadow mapping
// - Fog for depth
// ============================================================
import { Canvas } from '@react-three/fiber';
import { OrthographicCamera, MapControls } from '@react-three/drei';
import { MapRenderer } from './MapRenderer';
import { UnitRenderer } from './UnitRenderer';
import { useGameStore } from '../game/store';

export function IsometricScene() {
  const map = useGameStore((s) => s.map);

  const cx = (map.width * map.tileSize) / 2;
  const cz = (map.height * map.tileSize) / 2;
  const camDist = 120;

  return (
    <Canvas
      shadows
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      style={{ width: '100vw', height: '100vh', background: '#06060a' }}
    >
      {/* Camera */}
      <OrthographicCamera
        makeDefault
        zoom={6}
        position={[cx - camDist, camDist, cz - camDist]}
        near={1}
        far={500}
      />

      {/* Pan + zoom, no rotation */}
      <MapControls
        enableRotate={false}
        enableDamping
        dampingFactor={0.12}
        minZoom={2}
        maxZoom={30}
        screenSpacePanning
        target={[cx, 0, cz]}
      />

      {/* === Lighting === */}

      {/* Hemisphere: warm ground, cool sky */}
      <hemisphereLight
        args={['#667799', '#332211', 0.35]}
      />

      {/* Ambient fill */}
      <ambientLight intensity={0.3} color="#9aa8c0" />

      {/* Main sun (warm, casts shadows) */}
      <directionalLight
        position={[cx + 60, 100, cz - 40]}
        intensity={1.6}
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
        intensity={0.3}
        color="#7788aa"
      />

      {/* Slight rim light from behind */}
      <directionalLight
        position={[cx, 30, cz - 80]}
        intensity={0.15}
        color="#aabbcc"
      />

      {/* === Scene content === */}
      <MapRenderer />
      <UnitRenderer />

      {/* Fog for depth */}
      <fog attach="fog" args={['#06060a', 180, 380]} />
    </Canvas>
  );
}
