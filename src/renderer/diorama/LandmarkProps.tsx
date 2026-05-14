import * as THREE from 'three';
import type { CoverObject } from '../../game/types';
import { ART, standardMaterialProps } from '../artDirection';

const NO_RAYCAST = () => null;

const CLAY = {
  light: '#ece7dc',
  cap: '#ddd8ce',
  base: '#ccc7bd',
  mid: '#b8b6ad',
  shadow: '#86908d',
  line: '#8f9792',
  darkLine: '#707b78',
  wheel: '#6f7774',
} as const;

type MaterialProfile = NonNullable<Parameters<typeof standardMaterialProps>[1]>;

function clayMaterial(
  color: THREE.ColorRepresentation = CLAY.base,
  profile: MaterialProfile = 'stone',
  overrides: THREE.MeshStandardMaterialParameters = {},
): THREE.MeshStandardMaterialParameters {
  return standardMaterialProps(color, profile, {
    roughness: 0.94,
    metalness: 0.01,
    ...overrides,
  });
}

type LandmarkCoverPropProps = {
  cover: CoverObject;
  x: number;
  z: number;
  h: number;
  tileSize: number;
};

export function LandmarkCoverProp({
  cover,
  x,
  z,
  h,
  tileSize,
}: LandmarkCoverPropProps) {
  const width = cover.width * tileSize * 0.9;
  const depth = cover.height * tileSize * 0.9;
  const label = cover.label.toLowerCase();

  if (label.includes('fountain')) {
    return (
      <group raycast={NO_RAYCAST}>
        <ContactShadow x={x} z={z} width={width * 1.04} depth={depth * 1.04} opacity={0.13} />
        <FountainProp x={x} z={z} width={width} depth={depth} />
      </group>
    );
  }

  if (label.includes('banana car') || label === 'truck' || label.includes('cart')) {
    return (
      <group raycast={NO_RAYCAST}>
        <ContactShadow
          x={x}
          z={z}
          width={width * 1.08}
          depth={depth * 1.1}
          opacity={label.includes('banana car') ? 0.18 : 0.14}
        />
        <VehicleProp
          x={x}
          z={z}
          width={width}
          depth={depth}
          isTruck={label === 'truck'}
          isCart={label.includes('cart')}
          isLandmarkCar={label.includes('banana car')}
        />
      </group>
    );
  }

  if (label.includes('coffin')) {
    return (
      <group raycast={NO_RAYCAST}>
        <ContactShadow x={x} z={z} width={width * 1.02} depth={depth} opacity={0.15} />
        <CoffinsProp x={x} z={z} width={width} depth={depth} height={h} />
      </group>
    );
  }

  if (label.includes('orange')) {
    return (
      <group raycast={NO_RAYCAST}>
        <ContactShadow x={x} z={z} width={width * 1.04} depth={depth * 1.02} opacity={0.13} />
        <BarrelStackProp x={x} z={z} width={width} depth={depth} height={h} />
      </group>
    );
  }

  if (label.includes('logs')) {
    return (
      <group raycast={NO_RAYCAST}>
        <ContactShadow x={x} z={z} width={width * 1.02} depth={depth * 1.16} opacity={0.14} />
        <LogsProp x={x} z={z} width={width} depth={depth} />
      </group>
    );
  }

  if (label.includes('sandbags')) {
    return (
      <group raycast={NO_RAYCAST}>
        <ContactShadow x={x} z={z} width={width * 1.06} depth={depth * 1.08} opacity={0.13} />
        <SandbagsProp x={x} z={z} width={width} depth={depth} />
      </group>
    );
  }

  if (label.includes('library shelf')) {
    return (
      <group raycast={NO_RAYCAST}>
        <ContactShadow x={x} z={z} width={width * 1.02} depth={depth * 1.02} opacity={0.13} />
        <LibraryShelfProp x={x} z={z} width={width} depth={depth} height={h} />
      </group>
    );
  }

  if (label.includes('pillar')) {
    return (
      <group raycast={NO_RAYCAST}>
        <ContactShadow x={x} z={z} width={tileSize * 0.78} depth={tileSize * 0.78} opacity={0.13} />
        <PillarProp x={x} z={z} height={h} />
      </group>
    );
  }

  if (label.includes('rail') || label.includes('wall')) {
    return (
      <group raycast={NO_RAYCAST}>
        <ContactShadow x={x} z={z} width={width * 1.01} depth={depth * 1.02} opacity={0.11} shape="plane" />
        <WallStripProp x={x} z={z} width={width} depth={depth} height={h} isRail={label.includes('rail')} />
      </group>
    );
  }

  if (
    label.includes('box') ||
    label.includes('ninja') ||
    label.includes('graveyard') ||
    label.includes('porch') ||
    label.includes('site')
  ) {
    return (
      <group raycast={NO_RAYCAST}>
        <ContactShadow x={x} z={z} width={width * 1.03} depth={depth * 1.03} opacity={0.12} />
        <CrateStackProp x={x} z={z} width={width} depth={depth} height={h} label={label} />
      </group>
    );
  }

  return (
    <group raycast={NO_RAYCAST}>
      <ContactShadow x={x} z={z} width={width * 1.02} depth={depth * 1.02} opacity={0.12} shape="plane" />
      <CleanCoverBlock x={x} z={z} width={width} depth={depth} height={h} />
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
    <mesh
      position={[x, ART.overlayY.contactShadow, z]}
      rotation={[-Math.PI / 2, 0, 0]}
      scale={[width / 2, depth / 2, 1]}
      raycast={NO_RAYCAST}
    >
      {shape === 'plane' ? <planeGeometry args={[2, 2]} /> : <circleGeometry args={[1, 24]} />}
      <meshBasicMaterial color={CLAY.shadow} transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function InsetPanelLines({
  width,
  height,
  depth,
  color = CLAY.line,
  face = -1,
}: {
  width: number;
  height: number;
  depth: number;
  color?: THREE.ColorRepresentation;
  face?: -1 | 1;
}) {
  const z = face * (depth / 2 + 0.012);
  const lineDepth = 0.026;
  const horizontalW = width * 0.66;
  const verticalH = height * 0.58;
  const insetY = height * 0.1;

  return (
    <group raycast={NO_RAYCAST}>
      <mesh position={[0, insetY + verticalH / 2, z]} raycast={NO_RAYCAST}>
        <boxGeometry args={[horizontalW, 0.032, lineDepth]} />
        <meshStandardMaterial {...clayMaterial(color)} />
      </mesh>
      <mesh position={[0, insetY - verticalH / 2, z]} raycast={NO_RAYCAST}>
        <boxGeometry args={[horizontalW, 0.032, lineDepth]} />
        <meshStandardMaterial {...clayMaterial(color)} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * horizontalW / 2, insetY, z]} raycast={NO_RAYCAST}>
          <boxGeometry args={[0.032, verticalH, lineDepth]} />
          <meshStandardMaterial {...clayMaterial(color)} />
        </mesh>
      ))}
    </group>
  );
}

function CleanCoverBlock({
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
    <group position={[x, 0, z]} raycast={NO_RAYCAST}>
      <group position={[0, height / 2, 0]} raycast={NO_RAYCAST}>
        <mesh castShadow receiveShadow raycast={NO_RAYCAST}>
          <boxGeometry args={[width, height, depth]} />
          <meshStandardMaterial {...clayMaterial(CLADING_COLOR(height), 'stone')} />
        </mesh>
        <InsetPanelLines width={width} height={height} depth={depth} color={CLAY.line} face={-1} />
        <InsetPanelLines width={width} height={height} depth={depth} color={CLAY.line} face={1} />
      </group>
      <mesh position={[0, height + 0.03, 0]} castShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[width * 0.93, 0.06, depth * 0.9]} />
        <meshStandardMaterial {...clayMaterial(CLAD_CAP_COLOR(height), 'stone')} />
      </mesh>
    </group>
  );
}

function CLADING_COLOR(height: number): THREE.ColorRepresentation {
  return height > 1.1 ? CLAY.mid : CLAY.base;
}

function CLAD_CAP_COLOR(height: number): THREE.ColorRepresentation {
  return height > 1.1 ? CLAY.cap : CLAY.light;
}

function VehicleProp({
  x,
  z,
  width,
  depth,
  isTruck,
  isCart,
  isLandmarkCar = false,
}: {
  x: number;
  z: number;
  width: number;
  depth: number;
  isTruck: boolean;
  isCart: boolean;
  isLandmarkCar?: boolean;
}) {
  if (isCart) {
    return <CartProp x={x} z={z} width={width} depth={depth} />;
  }

  const bodyH = isTruck ? 0.76 : isLandmarkCar ? 0.82 : 0.54;
  const cabinH = isTruck ? 0.58 : isLandmarkCar ? 0.5 : 0.34;
  const bodyDepth = depth * (isLandmarkCar ? 0.92 : 0.82);
  const cabinDepth = depth * (isLandmarkCar ? 0.66 : 0.62);

  return (
    <group position={[x, 0, z]} raycast={NO_RAYCAST}>
      <mesh position={[0, bodyH / 2, 0]} castShadow receiveShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[width, bodyH, bodyDepth]} />
        <meshStandardMaterial {...clayMaterial(CLAY.mid)} />
      </mesh>
      <mesh position={[width * 0.18, bodyH + cabinH / 2 - 0.04, -depth * 0.02]} castShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[width * (isLandmarkCar ? 0.48 : 0.42), cabinH, cabinDepth]} />
        <meshStandardMaterial {...clayMaterial(CLAY.cap)} />
      </mesh>
      <mesh position={[-width * 0.16, bodyH + 0.04, 0]} castShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[width * 0.34, 0.07, bodyDepth * 0.8]} />
        <meshStandardMaterial {...clayMaterial(CLAY.light)} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[width * 0.18, bodyH + cabinH * 0.58, side * cabinDepth * 0.51]} castShadow raycast={NO_RAYCAST}>
          <boxGeometry args={[width * 0.3, cabinH * 0.3, 0.03]} />
          <meshStandardMaterial {...clayMaterial(CLAY.shadow)} />
        </mesh>
      ))}
      {[-0.34, 0.34].map((sx) => [-0.35, 0.35].map((sz) => (
        <mesh
          key={`${sx}-${sz}`}
          position={[sx * width, 0.14, sz * depth]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
          raycast={NO_RAYCAST}
        >
          <cylinderGeometry args={[0.14, 0.14, 0.12, 12]} />
          <meshStandardMaterial {...clayMaterial(CLAY.wheel, 'rubber')} />
        </mesh>
      )))}
      {[-0.34, 0.34].map((sx) => [-0.35, 0.35].map((sz) => (
        <mesh
          key={`hub-${sx}-${sz}`}
          position={[sx * width, 0.14, sz * depth + Math.sign(sz) * 0.062]}
          rotation={[Math.PI / 2, 0, 0]}
          raycast={NO_RAYCAST}
        >
          <cylinderGeometry args={[0.07, 0.07, 0.014, 10]} />
          <meshStandardMaterial {...clayMaterial(CLAYER_LIGHT())} />
        </mesh>
      )))}
      <mesh position={[-width * 0.47, bodyH * 0.56, 0]} castShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[0.06, 0.14, depth * 0.46]} />
        <meshStandardMaterial {...clayMaterial(CLAY.line)} />
      </mesh>
      <mesh position={[width * 0.5, bodyH * 0.5, 0]} castShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[0.05, 0.12, depth * 0.4]} />
        <meshStandardMaterial {...clayMaterial(CLAY.light)} />
      </mesh>
    </group>
  );
}

function CLAYER_LIGHT(): THREE.ColorRepresentation {
  return CLAY.light;
}

function CartProp({
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
    <group position={[x, 0, z]} raycast={NO_RAYCAST}>
      <group position={[0, 0.29, 0]} raycast={NO_RAYCAST}>
        <mesh castShadow receiveShadow raycast={NO_RAYCAST}>
          <boxGeometry args={[width * 0.86, 0.38, depth * 0.78]} />
          <meshStandardMaterial {...clayMaterial(CLAY.base)} />
        </mesh>
        <InsetPanelLines width={width * 0.86} height={0.38} depth={depth * 0.78} color={CLAY.line} face={-1} />
      </group>
      <mesh position={[0, 0.55, 0]} castShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[width * 0.68, 0.12, depth * 0.58]} />
        <meshStandardMaterial {...clayMaterial(CLAY.light)} />
      </mesh>
      {[-0.38, 0.38].map((sx) => (
        <mesh key={sx} position={[sx * width, 0.16, -depth * 0.42]} rotation={[Math.PI / 2, 0, 0]} castShadow raycast={NO_RAYCAST}>
          <cylinderGeometry args={[0.13, 0.13, 0.08, 12]} />
          <meshStandardMaterial {...clayMaterial(CLAYER_LINE(), 'rubber')} />
        </mesh>
      ))}
      <mesh position={[0, 0.18, depth * 0.47]} castShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[width * 0.82, 0.08, 0.06]} />
        <meshStandardMaterial {...clayMaterial(CLAY.line)} />
      </mesh>
    </group>
  );
}

function CLAYER_LINE(): THREE.ColorRepresentation {
  return CLAY.darkLine;
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
    <group position={[x, 0, z]} raycast={NO_RAYCAST}>
      <mesh position={[0, 0.2, 0]} castShadow receiveShadow raycast={NO_RAYCAST}>
        <cylinderGeometry args={[radius, radius * 1.12, 0.38, 28]} />
        <meshStandardMaterial {...clayMaterial(CLAYER_LIGHT())} />
      </mesh>
      <mesh position={[0, 0.42, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={NO_RAYCAST}>
        <ringGeometry args={[radius * 0.64, radius * 1.02, 28]} />
        <meshStandardMaterial {...clayMaterial(CLAY.cap, 'stone', { side: THREE.DoubleSide })} />
      </mesh>
      <mesh position={[0, 0.43, 0]} castShadow raycast={NO_RAYCAST}>
        <cylinderGeometry args={[radius * 0.56, radius * 0.64, 0.08, 24]} />
        <meshStandardMaterial {...clayMaterial(CLAYER_MID())} />
      </mesh>
      <mesh position={[0, 0.6, 0]} castShadow raycast={NO_RAYCAST}>
        <cylinderGeometry args={[radius * 0.12, radius * 0.18, 0.34, 14]} />
        <meshStandardMaterial {...clayMaterial(CLAY.light)} />
      </mesh>
    </group>
  );
}

function CLAYER_MID(): THREE.ColorRepresentation {
  return CLAY.mid;
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
    <group position={[x, 0, z]} raycast={NO_RAYCAST}>
      {[-0.22, 0.22].map((offset) => (
        <group key={offset} position={[offset * width, height / 2, 0]} raycast={NO_RAYCAST}>
          <mesh castShadow receiveShadow raycast={NO_RAYCAST}>
            <boxGeometry args={[width * 0.36, height, depth * 0.9]} />
            <meshStandardMaterial {...clayMaterial(CLAYER_MID())} />
          </mesh>
          <InsetPanelLines width={width * 0.36} height={height} depth={depth * 0.9} color={CLAY.line} face={-1} />
        </group>
      ))}
      <mesh position={[0, height + 0.035, 0]} castShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[width * 0.86, 0.07, depth * 0.78]} />
        <meshStandardMaterial {...clayMaterial(CLAYER_LIGHT())} />
      </mesh>
      <mesh position={[0, height * 0.44, depth * 0.46]} castShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[width * 0.62, height * 0.05, 0.035]} />
        <meshStandardMaterial {...clayMaterial(CLAYER_LINE())} />
      </mesh>
    </group>
  );
}

function BarrelStackProp({
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
  const barrelHeight = Math.min(height * 0.86, 1.22);
  const radius = Math.min(width, depth) * 0.2;
  const barrels: Array<readonly [number, number, number]> = [
    [-0.18, -0.22, 0],
    [0.22, -0.1, 0],
    [0.02, 0.24, 0],
  ];

  return (
    <group position={[x, 0, z]} raycast={NO_RAYCAST}>
      {barrels.map(([sx, sz], index) => (
        <group key={index} position={[sx * width, 0, sz * depth]} raycast={NO_RAYCAST}>
          <mesh position={[0, barrelHeight / 2, 0]} castShadow receiveShadow raycast={NO_RAYCAST}>
            <cylinderGeometry args={[radius, radius, barrelHeight, 18]} />
            <meshStandardMaterial {...clayMaterial(index === 1 ? CLAY.cap : CLAY.base)} />
          </mesh>
          {[0.18, 0.5, 0.82].map((band) => (
            <mesh key={band} position={[0, barrelHeight * band, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={NO_RAYCAST}>
              <torusGeometry args={[radius * 1.02, 0.014, 6, 18]} />
              <meshStandardMaterial {...clayMaterial(CLAYER_LINE())} />
            </mesh>
          ))}
        </group>
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
    <group position={[x, 0, z]} raycast={NO_RAYCAST}>
      {[-0.23, 0, 0.23].map((offset, index) => (
        <group key={offset} position={[0, 0.21 + index * 0.06, offset * depth]} rotation={[0, 0, Math.PI / 2]} raycast={NO_RAYCAST}>
          <mesh castShadow receiveShadow raycast={NO_RAYCAST}>
            <cylinderGeometry args={[0.17, 0.17, width * 0.92, 14]} />
            <meshStandardMaterial {...clayMaterial(index % 2 === 0 ? CLAY.base : CLAY.cap)} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[0, side * width * 0.46, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={NO_RAYCAST}>
              <circleGeometry args={[0.166, 14]} />
              <meshStandardMaterial {...clayMaterial(CLAYER_LIGHT(), 'stone', { side: THREE.DoubleSide })} />
            </mesh>
          ))}
          {[-0.3, 0.3].map((band) => (
            <mesh key={`band-${band}`} position={[0, band * width, 0]} rotation={[Math.PI / 2, 0, 0]} raycast={NO_RAYCAST}>
              <torusGeometry args={[0.173, 0.012, 6, 14]} />
              <meshStandardMaterial {...clayMaterial(CLAYER_LINE())} />
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
  const bags: Array<readonly [number, number, number]> = [
    [-0.28, -0.18, 0],
    [0.05, -0.18, 0.03],
    [0.34, -0.14, -0.02],
    [-0.12, 0.18, 0.08],
    [0.22, 0.18, 0.04],
    [-0.36, 0.02, 0.02],
    [0.42, 0.05, 0.03],
  ];

  return (
    <group position={[x, 0, z]} raycast={NO_RAYCAST}>
      {bags.map(([sx, sz, lift], index) => (
        <group key={index} position={[sx * width, 0.18 + lift, sz * depth]} raycast={NO_RAYCAST}>
          <mesh scale={[0.38, 0.12, 0.22]} castShadow receiveShadow raycast={NO_RAYCAST}>
            <sphereGeometry args={[1, 12, 6]} />
            <meshStandardMaterial {...clayMaterial(index % 2 ? CLAY.mid : CLAY.base)} />
          </mesh>
          <mesh position={[0, 0.06, 0]} scale={[0.32, 0.012, 0.045]} castShadow raycast={NO_RAYCAST}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial {...clayMaterial(CLAYER_LINE())} />
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
  const compact = label.includes('ninja') || label.includes('graveyard') || label.includes('porch');
  const stack: Array<readonly [number, number, number, number, number, number]> = compact
    ? [
        [0, height * 0.26, 0, 0.86, 0.52, 0.82],
        [0.12, height * 0.78, -0.04, 0.58, 0.42, 0.64],
      ]
    : [
        [0, height * 0.27, 0, 0.96, 0.54, 0.9],
        [-0.16, height * 0.8, -0.05, 0.64, 0.46, 0.74],
      ];

  return (
    <group position={[x, 0, z]} raycast={NO_RAYCAST}>
      {stack.map(([sx, sy, sz, sw, sh, sd], index) => {
        const boxW = width * sw;
        const boxH = height * sh;
        const boxD = depth * sd;
        const color = index === 0 ? CLAY.base : CLAY.cap;

        return (
          <group key={index} position={[sx * width, sy, sz * depth]} raycast={NO_RAYCAST}>
            <mesh castShadow receiveShadow raycast={NO_RAYCAST}>
              <boxGeometry args={[boxW, boxH, boxD]} />
              <meshStandardMaterial {...clayMaterial(color)} />
            </mesh>
            <InsetPanelLines width={boxW} height={boxH} depth={boxD} color={CLAY.line} face={-1} />
            <InsetPanelLines width={boxW} height={boxH} depth={boxD} color={CLAY.line} face={1} />
          </group>
        );
      })}
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
    <group position={[x, 0, z]} raycast={NO_RAYCAST}>
      <group position={[0, height / 2, 0]} raycast={NO_RAYCAST}>
        <mesh castShadow receiveShadow raycast={NO_RAYCAST}>
          <boxGeometry args={[width, height, depth]} />
          <meshStandardMaterial {...clayMaterial(CLAYER_MID())} />
        </mesh>
        <InsetPanelLines width={width} height={height} depth={depth} color={CLAYER_LINE()} face={1} />
      </group>
      {[-0.22, 0.05, 0.32].map((sx) => (
        <mesh key={sx} position={[sx * width, height * 0.62, depth * 0.52]} castShadow raycast={NO_RAYCAST}>
          <boxGeometry args={[width * 0.08, height * 0.36, 0.035]} />
          <meshStandardMaterial {...clayMaterial(CLAYER_LIGHT())} />
        </mesh>
      ))}
      <mesh position={[0, height * 0.2, -depth * 0.52]} castShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[width * 0.86, height * 0.055, 0.045]} />
        <meshStandardMaterial {...clayMaterial(CLAYER_LINE())} />
      </mesh>
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
    <group raycast={NO_RAYCAST}>
      <mesh position={[x, height / 2, z]} castShadow receiveShadow raycast={NO_RAYCAST}>
        <cylinderGeometry args={[0.39, 0.45, height, 12]} />
        <meshStandardMaterial {...clayMaterial(CLAYER_MID())} />
      </mesh>
      <mesh position={[x, height + 0.035, z]} castShadow raycast={NO_RAYCAST}>
        <cylinderGeometry args={[0.46, 0.43, 0.07, 12]} />
        <meshStandardMaterial {...clayMaterial(CLAYER_LIGHT())} />
      </mesh>
      <mesh position={[x, 0.06, z]} castShadow raycast={NO_RAYCAST}>
        <cylinderGeometry args={[0.48, 0.5, 0.12, 12]} />
        <meshStandardMaterial {...clayMaterial(CLAYER_LINE())} />
      </mesh>
    </group>
  );
}

function WallStripProp({
  x,
  z,
  width,
  depth,
  height,
  isRail,
}: {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  isRail: boolean;
}) {
  const stripHeight = isRail ? Math.min(height, 0.58) : Math.min(height, height < 1 ? 0.82 : 1.14);

  return (
    <group position={[x, 0, z]} raycast={NO_RAYCAST}>
      <mesh position={[0, stripHeight / 2, 0]} castShadow receiveShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[width, stripHeight, depth]} />
        <meshStandardMaterial {...clayMaterial(isRail ? CLAY.base : CLAY.mid)} />
      </mesh>
      <mesh position={[0, stripHeight + 0.035, 0]} castShadow raycast={NO_RAYCAST}>
        <boxGeometry args={[width * 0.94, 0.07, depth * 0.9]} />
        <meshStandardMaterial {...clayMaterial(CLAYER_LIGHT())} />
      </mesh>
      {isRail && [-0.28, 0.28].map((sx) => (
        <mesh key={sx} position={[sx * width, stripHeight + 0.13, 0]} castShadow raycast={NO_RAYCAST}>
          <boxGeometry args={[width * 0.055, 0.22, depth * 0.62]} />
          <meshStandardMaterial {...clayMaterial(CLAYER_LINE())} />
        </mesh>
      ))}
    </group>
  );
}
