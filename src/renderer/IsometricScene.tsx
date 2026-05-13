// ============================================================
// IsometricScene: Main Three.js canvas.
//
// - Orthographic camera for clean isometric view
// - Warm directional light (sunlight) + cool fill
// - Subtle hemisphere light for ambient color
// - Shadow mapping
// - Fog for depth
// ============================================================
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type WheelEvent } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrthographicCamera, MapControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrthographicCamera as ThreeOrthographicCamera } from 'three';
import { MapRenderer } from './MapRenderer';
import { UnitRenderer } from './UnitRenderer';
import { useGameStore } from '../game/store';

type MapControlsHandle = {
  target: THREE.Vector3;
  update: () => void;
};

type CameraCommand =
  | 'zoom-in'
  | 'zoom-out'
  | 'reset'
  | 'pan-left'
  | 'pan-right'
  | 'pan-up'
  | 'pan-down';

const CAMERA_PRESET = {
  offsetX: 78,
  height: 125,
  offsetZ: -98,
  targetOffsetZ: 8,
  zoom: 4.9,
  minZoom: 3.8,
  maxZoom: 26,
} as const;

const WHEEL_INPUT = {
  mouseStepThresholdPx: 80,
  trackpadPanZoomFactor: 0.9,
  minTrackpadPanScale: 0.075,
  maxTrackpadPanScale: 0.22,
  mouseWheelZoomFactor: 1.12,
  pinchZoomFactor: 1.14,
} as const;

function getCrispDevicePixelRatio(): number {
  if (typeof window === 'undefined') return 1.5;
  return THREE.MathUtils.clamp(window.devicePixelRatio || 1, 1.5, 2.5);
}

function isLikelyMouseWheel(deltaX: number, deltaY: number, deltaMode: number, shiftKey: boolean): boolean {
  if (shiftKey) return false;
  if (deltaMode !== 0) return true;

  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  if (absX > 0.5 || absY < WHEEL_INPUT.mouseStepThresholdPx) return false;

  const roundedY = Math.round(absY);
  const isCleanStep = Math.abs(absY - roundedY) < 0.01;
  return isCleanStep && (roundedY % 100 === 0 || roundedY % 120 === 0);
}

export function IsometricScene() {
  const map = useGameStore((s) => s.map);
  const [rendererDpr, setRendererDpr] = useState(getCrispDevicePixelRatio);
  const cameraRef = useRef<ThreeOrthographicCamera>(null);
  const controlsRef = useRef<MapControlsHandle | null>(null);

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
  const targetVector = useMemo(
    () => new THREE.Vector3(...cameraTarget),
    [cameraTarget]
  );

  const panCamera = useCallback((screenX: number, screenY: number, scale: number | null = null) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    right.y = 0;
    up.y = 0;
    right.normalize();
    up.normalize();

    const worldScale = scale ?? Math.max(1.2, 20 / camera.zoom);
    const delta = right.multiplyScalar(screenX * worldScale).add(up.multiplyScalar(screenY * worldScale));
    camera.position.add(delta);
    controls.target.add(delta);
    controls.update();
  }, []);

  const zoomCamera = useCallback((factor: number) => {
    const camera = cameraRef.current;
    if (!camera) return;

    camera.zoom = THREE.MathUtils.clamp(
      camera.zoom * factor,
      CAMERA_PRESET.minZoom,
      CAMERA_PRESET.maxZoom
    );
    camera.updateProjectionMatrix();
    controlsRef.current?.update();
  }, []);

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    event.stopPropagation();

    const unitScale = event.deltaMode === 1
      ? 16
      : event.deltaMode === 2
        ? window.innerHeight
        : 1;
    const deltaX = event.deltaX * unitScale;
    const deltaY = event.deltaY * unitScale;

    const isPinchZoom = event.ctrlKey || event.metaKey || event.altKey;
    const isMouseWheel = isLikelyMouseWheel(event.deltaX, event.deltaY, event.deltaMode, event.shiftKey);

    if (isPinchZoom || isMouseWheel) {
      const zoomFactor = isMouseWheel ? WHEEL_INPUT.mouseWheelZoomFactor : WHEEL_INPUT.pinchZoomFactor;
      zoomCamera(deltaY < 0 ? zoomFactor : 1 / zoomFactor);
      return;
    }

    const horizontal = event.shiftKey && Math.abs(deltaX) < 1 ? deltaY : deltaX;
    const vertical = event.shiftKey && Math.abs(deltaX) < 1 ? 0 : deltaY;
    const camera = cameraRef.current;
    const panScale = camera
      ? THREE.MathUtils.clamp(
        WHEEL_INPUT.trackpadPanZoomFactor / camera.zoom,
        WHEEL_INPUT.minTrackpadPanScale,
        WHEEL_INPUT.maxTrackpadPanScale
      )
      : 0.1;
    panCamera(-horizontal, vertical, panScale);
  }, [panCamera, zoomCamera]);

  useLayoutEffect(() => {
    if (cameraRef.current) {
      cameraRef.current.lookAt(targetVector);
      cameraRef.current.updateProjectionMatrix();
    }

    if (controlsRef.current) {
      controlsRef.current.target.copy(targetVector);
      controlsRef.current.update();
    }
  }, [targetVector]);

  useEffect(() => {
    const updateDpr = () => setRendererDpr(getCrispDevicePixelRatio());
    updateDpr();
    window.addEventListener('resize', updateDpr);
    return () => window.removeEventListener('resize', updateDpr);
  }, []);

  useEffect(() => {
    const applyCameraCommand = (command: CameraCommand) => {
      const camera = cameraRef.current;
      if (!camera) return;

      if (command === 'zoom-in') {
        zoomCamera(1.22);
      } else if (command === 'zoom-out') {
        zoomCamera(1 / 1.22);
      } else if (command === 'reset') {
        camera.position.set(...cameraPosition);
        camera.zoom = CAMERA_PRESET.zoom;
        controlsRef.current?.target.copy(targetVector);
        camera.lookAt(targetVector);
      } else if (command === 'pan-left') {
        panCamera(-1, 0);
      } else if (command === 'pan-right') {
        panCamera(1, 0);
      } else if (command === 'pan-up') {
        panCamera(0, 1);
      } else if (command === 'pan-down') {
        panCamera(0, -1);
      }

      camera.updateProjectionMatrix();
      controlsRef.current?.update();
    };

    const onCameraCommand = (event: Event) => {
      applyCameraCommand((event as CustomEvent<CameraCommand>).detail);
    };

    window.addEventListener('cs2-camera-command', onCameraCommand);
    return () => window.removeEventListener('cs2-camera-command', onCameraCommand);
  }, [cameraPosition, panCamera, targetVector, zoomCamera]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }

      const keyCommands: Record<string, CameraCommand> = {
        '=': 'zoom-in',
        '+': 'zoom-in',
        '-': 'zoom-out',
        '_': 'zoom-out',
        '0': 'reset',
        Home: 'reset',
        ArrowLeft: 'pan-left',
        a: 'pan-left',
        A: 'pan-left',
        ArrowRight: 'pan-right',
        d: 'pan-right',
        D: 'pan-right',
        ArrowUp: 'pan-up',
        w: 'pan-up',
        W: 'pan-up',
        ArrowDown: 'pan-down',
        s: 'pan-down',
        S: 'pan-down',
      };

      const command = keyCommands[event.key];
      if (!command) return;
      event.preventDefault();
      window.dispatchEvent(new CustomEvent('cs2-camera-command', { detail: command }));
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <Canvas
      shadows
      dpr={rendererDpr}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        precision: 'highp',
      }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.shadowMap.type = THREE.PCFSoftShadowMap;
      }}
      style={{
        width: '100vw',
        height: '100vh',
        background: '#10131a',
        touchAction: 'none',
        transform: 'translateZ(0)',
      }}
      onContextMenu={(event) => event.preventDefault()}
      onWheel={handleWheel}
    >
      <color attach="background" args={['#10131a']} />

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
        ref={(controls) => {
          controlsRef.current = controls;
        }}
        enableRotate={false}
        enablePan
        enableZoom={false}
        enableDamping
        dampingFactor={0.12}
        minZoom={CAMERA_PRESET.minZoom}
        maxZoom={CAMERA_PRESET.maxZoom}
        mouseButtons={{
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
        touches={{
          ONE: THREE.TOUCH.PAN,
          TWO: THREE.TOUCH.DOLLY_PAN,
        }}
        screenSpacePanning
        target={targetVector}
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
      <Suspense fallback={null}>
        <UnitRenderer />
      </Suspense>

      {/* Fog for depth */}
      <fog attach="fog" args={['#10131a', 360, 640]} />
    </Canvas>
  );
}
