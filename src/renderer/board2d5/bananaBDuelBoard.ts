import type { BoardPackage } from './types';

const CT_RIFLE_SPRITE = {
  kind: 'ct-rifle',
  imageUrl: '/board2d5/units/ct-rifle.svg',
  downImageUrl: '/board2d5/units/ct-rifle-down.svg',
} as const;

const T_RIFLE_SPRITE = {
  kind: 't-rifle',
  imageUrl: '/board2d5/units/t-rifle.svg',
  downImageUrl: '/board2d5/units/t-rifle-down.svg',
} as const;

export const bananaBDuelBoardPackage: BoardPackage = {
  id: 'banana-b-duel-v0',
  name: 'Banana B Contact Board V0',
  imageUrl: '/board2d5/scenes/banana-b-clay-v1/base.png',
  aspectRatio: 998 / 768,
  nodes: [
    { id: 'ct-start', label: 'CT start', anchor: { x: 23.4, y: 73.0 }, cover: 'half' },
    { id: 'short-1', label: 'Short lane', anchor: { x: 31.0, y: 67.2 } },
    { id: 'logs', label: 'Logs peek', anchor: { x: 38.7, y: 62.0 }, cover: 'full' },
    { id: 'center', label: 'Center site lane', anchor: { x: 47.6, y: 56.1 } },
    { id: 'site-left', label: 'Left site', anchor: { x: 56.3, y: 51.4 } },
    { id: 'site-mid', label: 'B mark', anchor: { x: 64.2, y: 47.1 } },
    { id: 'site-box', label: 'Site box', anchor: { x: 70.7, y: 42.9 }, cover: 'half' },
    { id: 'coffins', label: 'Coffins edge', anchor: { x: 76.8, y: 39.2 }, cover: 'full' },
  ],
  edges: [
    { from: 'ct-start', to: 'short-1' },
    { from: 'short-1', to: 'logs' },
    { from: 'logs', to: 'center' },
    { from: 'center', to: 'site-left' },
    { from: 'site-left', to: 'site-mid' },
    { from: 'site-mid', to: 'site-box' },
    { from: 'site-box', to: 'coffins' },
  ],
  actors: [
    {
      id: 'ct-entry',
      label: 'CT entry',
      team: 'CT',
      nodeId: 'ct-start',
      sprite: { ...CT_RIFLE_SPRITE, scale: 1.08, facing: 'right' },
      hotspot: {
        anchor: { x: 23.4, y: 73.0 },
        size: { width: 14.5, height: 22.5 },
      },
    },
    {
      id: 'ct-trader',
      label: 'CT trade',
      team: 'CT',
      nodeId: 'short-1',
      sprite: { ...CT_RIFLE_SPRITE, scale: 0.96, facing: 'right' },
      hotspot: {
        anchor: { x: 31.0, y: 67.2 },
        size: { width: 12.5, height: 19.5 },
      },
    },
  ],
  targets: [
    {
      id: 't-anchor',
      label: 'T anchor',
      team: 'T',
      anchor: { x: 78.8, y: 31.5 },
      hitChance: 64,
      sprite: { ...T_RIFLE_SPRITE, scale: 1.06, facing: 'left' },
      hotspot: {
        anchor: { x: 78.8, y: 31.5 },
        size: { width: 9.4, height: 14.4 },
      },
    },
    {
      id: 't-site',
      label: 'T site support',
      team: 'T',
      anchor: { x: 69.8, y: 38.1 },
      hitChance: 42,
      sprite: { ...T_RIFLE_SPRITE, scale: 0.92, facing: 'left' },
      hotspot: {
        anchor: { x: 69.8, y: 38.1 },
        size: { width: 9.5, height: 14.5 },
      },
    },
  ],
  scene: {
    projection: {
      tileWidth: 5.2,
      tileAspect: 0.58,
      rotate: -25,
      skewX: 0,
    },
    layers: [
      {
        id: 'banana-b-clay-base',
        role: 'base',
        imageUrl: '/board2d5/scenes/banana-b-clay-v1/base.png',
      },
      {
        id: 'banana-b-clay-shadow',
        role: 'shadow',
        imageUrl: '/board2d5/scenes/banana-b-clay-v1/shadow.png',
        opacity: 0.42,
      },
      {
        id: 'banana-b-clay-foreground',
        role: 'foreground',
        imageUrl: '/board2d5/scenes/banana-b-clay-v1/foreground.png',
      },
    ],
    bakedUnitMasks: [],
    foregroundOccluders: [],
    authoringBlocks: [],
  },
  initial: {
    selectedActorId: 'ct-entry',
    targetId: 't-anchor',
    moveRange: 3,
  },
};
