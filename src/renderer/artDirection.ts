import type { ColorRepresentation, MeshStandardMaterialParameters } from 'three';

export const palette = {
  void: '#d6dee3',
  groundPlane: '#e2e6e7',
  floorTop: '#eeede8',
  floorSide: '#d9d9d4',
  floorEdge: '#f8f7f2',
  slabSide: '#c5c9cd',
  slabSideDark: '#aeb5ba',
  wallTop: '#f8f6f0',
  wallSide: '#d8dade',
  wallDark: '#c1c6ca',
  coverStone: '#d1d3d4',
  coverWood: '#cbc7be',
  coverMetal: '#c7ccd0',
  ctAccent: '#2f7ec1',
  tAccent: '#cf5a52',
  bombAccent: '#c84f4f',
  utilityGreen: '#76ad7f',
  moveOneAP: '#259fbd',
  moveTwoAP: '#d0ad39',
  moveArrowBlue: '#1f71d5',
  moveArrowBlueSoft: '#76a9ef',
  fireLineRed: '#d73732',
  dangerZoneRed: '#d73732',
  controlZoneBlue: '#2a78d7',
  labelInk: '#5d6670',
  labelHalo: '#f9f7ef',
  danger: '#d65d51',
  selected: '#edc64c',
  floorSite: '#e8e5df',
  floorSpawnCT: '#dde8ee',
  floorSpawnT: '#eadbd7',
  smoke: '#dfe4e8',
  flash: '#fff3b7',
  textLight: '#fbfaf6',
  textDark: '#20272c',
} as const;

export type ArtPaletteToken = keyof typeof palette;

export const materialProfiles = {
  floor: {
    roughness: 0.96,
    metalness: 0,
  },
  wall: {
    roughness: 0.95,
    metalness: 0,
  },
  stone: {
    roughness: 0.94,
    metalness: 0,
  },
  wood: {
    roughness: 0.92,
    metalness: 0,
  },
  metal: {
    roughness: 0.88,
    metalness: 0.02,
  },
  glass: {
    roughness: 0.74,
    metalness: 0,
  },
  rubber: {
    roughness: 0.9,
    metalness: 0,
  },
} satisfies Record<string, Pick<MeshStandardMaterialParameters, 'roughness' | 'metalness'>>;

export type ArtMaterialProfile = keyof typeof materialProfiles;

export const heights = {
  floor: 0.12,
  slabDepth: 0.7,
  elevationStep: 0.4,
  wall: 1.12,
  wallCap: 0.14,
  coverHalf: 0.92,
  coverFull: 1.82,
  gridGap: 0.002,
} as const;

export const overlayY = {
  interactiveFloor: heights.floor + 0.01,
  contactShadow: heights.floor + 0.018,
  siteMarker: heights.floor + 0.026,
  siteText: heights.floor + 0.06,
  calloutText: heights.floor + 0.07,
  movementBand: heights.floor + 0.045,
  threatBand: heights.floor + 0.06,
  movementBoundary: heights.floor + 0.105,
  oneApBoundary: heights.floor + 0.118,
  threatBoundary: heights.floor + 0.14,
  pathPreview: heights.floor + 0.185,
  plannedPath: heights.floor + 0.205,
  hoveredTile: heights.floor + 0.23,
  plannedMarker: heights.floor + 0.25,
  heldLaneTile: heights.floor + 0.29,
  heldLaneLine: heights.floor + 0.33,
  utilityPreview: heights.floor + 0.34,
  flashPreview: heights.floor + 0.39,
  holdPreview: heights.floor + 0.37,
  holdLabel: heights.floor + 0.43,
  shotLine: heights.floor + 0.58,
  shotLabel: heights.floor + 0.62,
  contactPulse: heights.floor + 0.66,
  contactLane: heights.floor + 0.76,
  contactSpark: heights.floor + 0.82,
  contactLabel: heights.floor + 0.9,
  combatMarker: heights.floor + 0.72,
  tracerTarget: heights.floor + 0.84,
  impact: heights.floor + 0.9,
  damageText: heights.floor + 1.0,
  muzzle: heights.floor + 1.08,
} as const;

// Lower values render first. This mirrors overlayY so transparent tactical
// layers remain readable even when React render order changes.
export const overlayOrder = {
  siteLabel: 5,
  movementBand: 10,
  threatBand: 20,
  movementBoundary: 30,
  threatBoundary: 35,
  pathPreview: 40,
  plannedPath: 45,
  hoveredTile: 50,
  plannedMarker: 55,
  heldLaneTile: 60,
  heldLaneLine: 62,
  utilityPreview: 66,
  shotPreview: 80,
  contactPulse: 90,
  combat: 100,
} as const;

export const shadows = {
  contactColor: '#6c747a',
  contactOpacity: 0.14,
  mapSize: 2048,
  cameraExtent: 120,
  cameraNear: 1,
  cameraFar: 350,
  bias: -0.001,
} as const;

export const camera = {
  defaultPreset: {
    offsetX: 70,
    height: 112,
    offsetZ: -88,
    targetOffsetZ: 10,
    zoom: 6.1,
    minZoom: 4.4,
    maxZoom: 26,
  },
  duelLab: {
    offsetX: 34,
    height: 64,
    offsetZ: -44,
    zoom: 11.2,
    compactOffsetX: 42,
    compactHeight: 72,
    compactOffsetZ: -54,
    compactZoom: 9.2,
  },
  contactBeat: {
    durationSeconds: 3,
    pushInZoom: 1.42,
    targetBlend: 0.42,
    shakeWorld: 0.46,
    shakeZoom: 0.035,
  },
  dpr: {
    fallback: 1.5,
    min: 1.5,
    max: 2.5,
  },
} as const;

export const scene = {
  groundDrop: -0.74,
  voidPadding: 24,
  fog: {
    near: 520,
    far: 820,
  },
  lights: {
    hemisphere: {
      sky: '#f5f3ec',
      ground: '#d1d6da',
      intensity: 0.96,
    },
    ambient: {
      color: '#f1eee7',
      intensity: 0.84,
    },
    sun: {
      color: '#fff0d5',
      intensity: 1.18,
    },
    fill: {
      color: '#c5d9ec',
      intensity: 0.78,
    },
    rim: {
      color: '#eef0ed',
      intensity: 0.18,
    },
  },
} as const;

export const props = {
  coverLabel: '#8f8777',
  outline: '#4d5660',
  bombOutline: '#704141',
  vehicleBody: '#c7ccd0',
  vehicleCabin: '#b8bdc2',
  vehicleRust: '#beb9b2',
  glass: '#dce6eb',
  rubber: '#9aa2a8',
  metalLight: '#e2e3e4',
  metalDark: '#adb4b9',
  stoneLight: '#e6e4df',
  stoneDark: '#bec1c3',
  water: '#c8d5dc',
  waterLight: '#eef5f6',
  woodLight: '#d6d0c5',
  woodDark: '#b5afa5',
  orange: '#c98262',
  orangeDark: '#a26852',
  sandbag: '#cbc4b8',
  sandbagDark: '#b5aea2',
  bookRed: '#bf7d78',
  bookBlue: '#8aa4b4',
  invalid: '#df7068',
} as const;

export const ART = {
  palette,
  materials: materialProfiles,
  heights,
  overlayY,
  overlayOrder,
  shadows,
  camera,
  scene,
  props,
} as const;

export function standardMaterialProps(
  color: ArtPaletteToken | ColorRepresentation,
  profile: ArtMaterialProfile = 'stone',
  overrides: MeshStandardMaterialParameters = {},
): MeshStandardMaterialParameters {
  const resolvedColor = typeof color === 'string' && color in palette
    ? palette[color as ArtPaletteToken]
    : color;

  return {
    color: resolvedColor,
    ...materialProfiles[profile],
    ...overrides,
  };
}
