import type { BoardPoint, BoardPolygon } from './types';

type BananaBClayTile = {
  anchor: BoardPoint;
  footprint: BoardPolygon;
};

export const bananaBClayTiles = {
  'ct-start': {
    anchor: { x: 23.4, y: 73.0 },
    footprint: [
      { x: 20.295, y: 72.02 },
      { x: 24.645, y: 69.992 },
      { x: 26.505, y: 73.98 },
      { x: 22.155, y: 76.008 },
    ],
  },
  'short-1': {
    anchor: { x: 31.0, y: 67.2 },
    footprint: [
      { x: 27.895, y: 66.22 },
      { x: 32.245, y: 64.192 },
      { x: 34.105, y: 68.18 },
      { x: 29.755, y: 70.208 },
    ],
  },
  'logs': {
    anchor: { x: 38.7, y: 62.0 },
    footprint: [
      { x: 35.595, y: 61.02 },
      { x: 39.945, y: 58.992 },
      { x: 41.805, y: 62.98 },
      { x: 37.455, y: 65.008 },
    ],
  },
  'center': {
    anchor: { x: 47.6, y: 56.1 },
    footprint: [
      { x: 44.495, y: 55.12 },
      { x: 48.845, y: 53.092 },
      { x: 50.705, y: 57.08 },
      { x: 46.355, y: 59.108 },
    ],
  },
  'site-left': {
    anchor: { x: 56.3, y: 51.4 },
    footprint: [
      { x: 53.286, y: 50.378 },
      { x: 57.455, y: 48.434 },
      { x: 59.314, y: 52.422 },
      { x: 55.145, y: 54.366 },
    ],
  },
  'site-mid': {
    anchor: { x: 64.2, y: 47.1 },
    footprint: [
      { x: 61.186, y: 46.078 },
      { x: 65.355, y: 44.134 },
      { x: 67.214, y: 48.122 },
      { x: 63.045, y: 50.066 },
    ],
  },
  'site-box': {
    anchor: { x: 70.7, y: 42.9 },
    footprint: [
      { x: 67.686, y: 41.878 },
      { x: 71.855, y: 39.934 },
      { x: 73.714, y: 43.922 },
      { x: 69.545, y: 45.866 },
    ],
  },
  'coffins': {
    anchor: { x: 76.8, y: 39.2 },
    footprint: [
      { x: 73.786, y: 38.178 },
      { x: 77.955, y: 36.234 },
      { x: 79.814, y: 40.222 },
      { x: 75.645, y: 42.166 },
    ],
  },
} as const satisfies Record<string, BananaBClayTile>;
