export type BoardPoint = {
  x: number;
  y: number;
};

export type BoardSize = {
  width: number;
  height: number;
};

export type BoardCover = 'half' | 'full';
export type BoardTeam = 'T' | 'CT';

export type BoardLayer = {
  id: string;
  role: 'base' | 'shadow' | 'foreground';
  imageUrl: string;
  opacity?: number;
};

export type BoardRectPlacement = {
  anchor: BoardPoint;
  size: BoardSize;
  rotation?: number;
  skewX?: number;
};

export type BoardSceneMask = BoardRectPlacement & {
  id: string;
  label: string;
  tone: 'floor-clay' | 'wall-clay' | 'shadow-clay';
};

export type BoardSceneOccluder = BoardRectPlacement & {
  id: string;
  label: string;
  tone: 'front-wall' | 'cover-block' | 'shadow';
  opacity?: number;
};

export type BoardAuthoringBlock = BoardRectPlacement & {
  id: string;
  label: string;
  kind: 'wall' | 'cover' | 'occluder';
};

export type BoardActorSprite = {
  kind: 'ct-rifle' | 't-rifle';
  imageUrl: string;
  downImageUrl?: string;
  scale?: number;
  facing?: 'left' | 'right';
};

export type BoardNode = {
  id: string;
  label: string;
  anchor: BoardPoint;
  cover?: BoardCover;
};

export type BoardEdge = {
  from: string;
  to: string;
};

export type BoardActor = {
  id: string;
  label: string;
  team: BoardTeam;
  nodeId: string;
  sprite: BoardActorSprite;
  hotspot?: BoardRectPlacement;
};

export type BoardTarget = {
  id: string;
  label: string;
  team: BoardTeam;
  anchor: BoardPoint;
  hitChance: number;
  sprite: BoardActorSprite;
  hotspot: BoardRectPlacement;
};

export type BoardPackage = {
  id: string;
  name: string;
  imageUrl: string;
  aspectRatio: number;
  nodes: BoardNode[];
  edges: BoardEdge[];
  actors: BoardActor[];
  targets: BoardTarget[];
  scene: {
    projection: {
      tileWidth: number;
      tileAspect: number;
      rotate: number;
      skewX: number;
    };
    layers: BoardLayer[];
    bakedUnitMasks: BoardSceneMask[];
    foregroundOccluders: BoardSceneOccluder[];
    authoringBlocks: BoardAuthoringBlock[];
  };
  initial: {
    selectedActorId: string;
    targetId: string;
    moveRange: number;
  };
};

export type Board2d5EventType =
  | 'select'
  | 'move_preview'
  | 'move_committed'
  | 'contact'
  | 'aim_started'
  | 'invalid'
  | 'shot_fired'
  | 'trade_started'
  | 'hit'
  | 'kill'
  | 'reset';

export type Board2d5Event = {
  id: string;
  type: Board2d5EventType;
  createdAt: number;
  actorId?: string;
  targetId?: string;
  fromNodeId?: string;
  toNodeId?: string;
  pathNodeIds?: string[];
  label: string;
};
