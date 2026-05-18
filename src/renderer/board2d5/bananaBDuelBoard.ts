import type { BoardPackage } from './types';
import { bananaBClayTiles } from './bananaBClayGeometry';

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
    { id: 'ct-start', label: 'CT start', ...bananaBClayTiles['ct-start'], cover: 'half' },
    { id: 'short-1', label: 'Short lane', ...bananaBClayTiles['short-1'] },
    { id: 'logs', label: 'Logs peek', ...bananaBClayTiles.logs, cover: 'full' },
    { id: 'center', label: 'Center site lane', ...bananaBClayTiles.center },
    { id: 'site-left', label: 'Left site', ...bananaBClayTiles['site-left'] },
    { id: 'site-mid', label: 'B mark', ...bananaBClayTiles['site-mid'] },
    { id: 'site-box', label: 'Site box', ...bananaBClayTiles['site-box'], cover: 'half' },
    { id: 'coffins', label: 'Coffins edge', ...bananaBClayTiles.coffins, cover: 'full' },
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
        anchor: bananaBClayTiles['ct-start'].anchor,
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
        anchor: bananaBClayTiles['short-1'].anchor,
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
