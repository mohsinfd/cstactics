// ============================================================
// IsometricScene: Main Three.js canvas.
//
// - Orthographic camera for clean isometric view
// - Warm directional light (sunlight) + cool fill
// - Subtle hemisphere light for ambient color
// - Shadow mapping
// - Fog for depth
// ============================================================
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject, type WheelEvent } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrthographicCamera, MapControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrthographicCamera as ThreeOrthographicCamera } from 'three';
import { ART } from './artDirection';
import { MapRenderer } from './MapRenderer';
import { UnitRenderer } from './UnitRenderer';
import { useGameStore } from '../game/store';

type MapControlsHandle = {
  target: THREE.Vector3;
  update: () => void;
};

type CameraRigRefs = {
  cameraRef: RefObject<ThreeOrthographicCamera | null>;
  controlsRef: RefObject<MapControlsHandle | null>;
};

type PresentationBeatState = {
  id: string;
  startedAt: number;
  basePosition: THREE.Vector3;
  baseTarget: THREE.Vector3;
  baseZoom: number;
  target: THREE.Vector3;
  settled: boolean;
};

type CameraCommand =
  | 'zoom-in'
  | 'zoom-out'
  | 'reset'
  | 'pan-left'
  | 'pan-right'
  | 'pan-up'
  | 'pan-down';

const CAMERA_PRESET = ART.camera.defaultPreset;

const WHEEL_INPUT = {
  mouseStepThresholdPx: 80,
  trackpadPanZoomFactor: 0.9,
  minTrackpadPanScale: 0.075,
  maxTrackpadPanScale: 0.22,
  mouseWheelZoomFactor: 1.12,
  pinchZoomFactor: 1.14,
} as const;

const CONTACT_CAMERA_BEAT = ART.camera.contactBeat;

const DUEL_LAB_CAMERA = ART.camera.duelLab;

function getCrispDevicePixelRatio(): number {
  if (typeof window === 'undefined') return ART.camera.dpr.fallback;
  return THREE.MathUtils.clamp(
    window.devicePixelRatio || ART.camera.dpr.fallback,
    ART.camera.dpr.min,
    ART.camera.dpr.max
  );
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

function tileToWorld(mapWidth: number, tileSize: number, x: number, y: number): THREE.Vector3 {
  return new THREE.Vector3(
    (mapWidth - 1 - x) * tileSize + tileSize / 2,
    0,
    y * tileSize + tileSize / 2
  );
}

function CameraBootstrap({
  cameraRef,
  controlsRef,
  cameraPosition,
  targetVector,
  zoom,
}: CameraRigRefs & {
  cameraPosition: [number, number, number];
  targetVector: THREE.Vector3;
  zoom: number;
}) {
  const appliedKeyRef = useRef('');

  useFrame(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const key = `${cameraPosition.join(',')}|${targetVector.x},${targetVector.y},${targetVector.z}|${zoom}`;
    if (appliedKeyRef.current === key) return;

    camera.position.set(...cameraPosition);
    camera.zoom = zoom;
    controls.target.copy(targetVector);
    camera.lookAt(targetVector);
    camera.updateProjectionMatrix();
    controls.update();
    appliedKeyRef.current = key;
  });

  return null;
}

function PresentationDirector({ cameraRef, controlsRef }: CameraRigRefs) {
  const map = useGameStore((s) => s.map);
  const interrupt = useGameStore((s) => s.executeInterrupt);
  const beatRef = useRef<PresentationBeatState>({
    id: '',
    startedAt: 0,
    basePosition: new THREE.Vector3(),
    baseTarget: new THREE.Vector3(),
    baseZoom: CAMERA_PRESET.zoom,
    target: new THREE.Vector3(),
    settled: true,
  });

  useFrame((state) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    if (interrupt && beatRef.current.id !== interrupt.id) {
      beatRef.current = {
        id: interrupt.id,
        startedAt: state.clock.elapsedTime,
        basePosition: camera.position.clone(),
        baseTarget: controls.target.clone(),
        baseZoom: camera.zoom,
        target: tileToWorld(map.width, map.tileSize, interrupt.contactTile.x, interrupt.contactTile.y),
        settled: false,
      };
    }

    if (!beatRef.current.id) return;

    const elapsed = state.clock.elapsedTime - beatRef.current.startedAt;
    const progress = THREE.MathUtils.clamp(elapsed / CONTACT_CAMERA_BEAT.durationSeconds, 0, 1);
    if (progress >= 1) {
      if (!beatRef.current.settled) {
        controls.target.copy(beatRef.current.baseTarget);
        camera.position.copy(beatRef.current.basePosition);
        camera.zoom = beatRef.current.baseZoom;
        camera.lookAt(controls.target);
        camera.updateProjectionMatrix();
        controls.update();
        beatRef.current.settled = true;
      }
      return;
    }

    const easeIn = THREE.MathUtils.smootherstep(progress, 0, 0.45);
    const easeOut = 1 - THREE.MathUtils.smoothstep(progress, 0.56, 1);
    const contactWeight = easeIn * easeOut;
    const shake = Math.sin(elapsed * 52) * CONTACT_CAMERA_BEAT.shakeWorld * contactWeight;
    const lift = Math.cos(elapsed * 39) * CONTACT_CAMERA_BEAT.shakeWorld * 0.45 * contactWeight;
    const stagedTarget = beatRef.current.baseTarget.clone().lerp(
      beatRef.current.target,
      CONTACT_CAMERA_BEAT.targetBlend * contactWeight
    );
    const stagedPosition = beatRef.current.basePosition.clone().lerp(
      beatRef.current.basePosition.clone().add(
        beatRef.current.target.clone().sub(beatRef.current.baseTarget).multiplyScalar(CONTACT_CAMERA_BEAT.targetBlend)
      ),
      contactWeight
    );

    stagedPosition.x += shake;
    stagedPosition.z += lift;
    controls.target.copy(stagedTarget);
    camera.position.copy(stagedPosition);
    camera.zoom = beatRef.current.baseZoom * (1 + (CONTACT_CAMERA_BEAT.pushInZoom - 1) * contactWeight + CONTACT_CAMERA_BEAT.shakeZoom * contactWeight);
    camera.lookAt(controls.target);
    camera.updateProjectionMatrix();
    controls.update();
  });

  return null;
}

export function IsometricScene() {
  const map = useGameStore((s) => s.map);
  const units = useGameStore((s) => s.units);
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
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const isDuelLab = units.length === 2 &&
      units.some((unit) => unit.id === 0 && unit.position.x === 43 && unit.position.y === 61) &&
      units.some((unit) => unit.id === 6 && unit.position.x === 43 && unit.position.y === 69);
    if (!isDuelLab) {
      return;
    }

    const livingUnits = units.filter((unit) => unit.alive);
    const center = livingUnits
      .map((unit) => tileToWorld(map.width, map.tileSize, unit.position.x, unit.position.y))
      .reduce((sum, point) => sum.add(point), new THREE.Vector3())
      .divideScalar(Math.max(1, livingUnits.length));
    center.z += map.tileSize * 0.8;
    const useCompactFrame = typeof window !== 'undefined' && window.innerWidth < 760;
    const offsetX = useCompactFrame ? DUEL_LAB_CAMERA.compactOffsetX : DUEL_LAB_CAMERA.offsetX;
    const height = useCompactFrame ? DUEL_LAB_CAMERA.compactHeight : DUEL_LAB_CAMERA.height;
    const offsetZ = useCompactFrame ? DUEL_LAB_CAMERA.compactOffsetZ : DUEL_LAB_CAMERA.offsetZ;
    const zoom = useCompactFrame ? DUEL_LAB_CAMERA.compactZoom : DUEL_LAB_CAMERA.zoom;

    controls.target.copy(center);
    camera.position.set(
      center.x + offsetX,
      height,
      center.z + offsetZ
    );
    camera.zoom = zoom;
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    controls.update();
  }, [map.tileSize, map.width, units]);

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
        background: ART.palette.void,
        touchAction: 'none',
        transform: 'translateZ(0)',
      }}
      onContextMenu={(event) => event.preventDefault()}
      onWheel={handleWheel}
    >
      <color attach="background" args={[ART.palette.void]} />

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

      {/* Neutral studio hemisphere for clay whitebox readability */}
      <hemisphereLight
        args={[
          ART.scene.lights.hemisphere.sky,
          ART.scene.lights.hemisphere.ground,
          ART.scene.lights.hemisphere.intensity,
        ]}
      />

      {/* Ambient fill */}
      <ambientLight intensity={ART.scene.lights.ambient.intensity} color={ART.scene.lights.ambient.color} />

      {/* Main sun (warm, casts shadows) */}
      <directionalLight
        position={[cx + 52, 96, cz - 64]}
        intensity={ART.scene.lights.sun.intensity}
        color={ART.scene.lights.sun.color}
        castShadow
        shadow-mapSize-width={ART.shadows.mapSize}
        shadow-mapSize-height={ART.shadows.mapSize}
        shadow-camera-left={-ART.shadows.cameraExtent}
        shadow-camera-right={ART.shadows.cameraExtent}
        shadow-camera-top={ART.shadows.cameraExtent}
        shadow-camera-bottom={-ART.shadows.cameraExtent}
        shadow-camera-near={ART.shadows.cameraNear}
        shadow-camera-far={ART.shadows.cameraFar}
        shadow-bias={ART.shadows.bias}
      />

      {/* Cool fill from opposite side */}
      <directionalLight
        position={[cx - 72, 62, cz + 72]}
        intensity={ART.scene.lights.fill.intensity}
        color={ART.scene.lights.fill.color}
      />

      {/* Soft neutral rim to separate white walls from the void */}
      <directionalLight
        position={[cx - 12, 38, cz - 82]}
        intensity={ART.scene.lights.rim.intensity}
        color={ART.scene.lights.rim.color}
      />

      {/* === Scene content === */}
      <CameraBootstrap
        cameraRef={cameraRef}
        controlsRef={controlsRef}
        cameraPosition={cameraPosition}
        targetVector={targetVector}
        zoom={CAMERA_PRESET.zoom}
      />
      <PresentationDirector cameraRef={cameraRef} controlsRef={controlsRef} />
      <MapRenderer />
      <Suspense fallback={null}>
        <UnitRenderer />
      </Suspense>

      {/* Fog for depth */}
      <fog attach="fog" args={[ART.palette.void, ART.scene.fog.near, ART.scene.fog.far]} />
    </Canvas>
  );
}
