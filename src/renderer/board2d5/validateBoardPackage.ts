import type { BoardPackage, BoardPoint, BoardRectPlacement } from './types';

function isPercentPoint(point: BoardPoint): boolean {
  return Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= 0 &&
    point.x <= 100 &&
    point.y >= 0 &&
    point.y <= 100;
}

function isPercentSize(size: BoardRectPlacement['size']): boolean {
  return Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width > 0 &&
    size.height > 0 &&
    size.width <= 100 &&
    size.height <= 100;
}

function validatePlacement(errors: string[], label: string, placement: BoardRectPlacement): void {
  if (!isPercentPoint(placement.anchor)) errors.push(`${label} anchor must be within 0..100%`);
  if (!isPercentSize(placement.size)) errors.push(`${label} size must be within 0..100%`);
  if (placement.rotation !== undefined && !Number.isFinite(placement.rotation)) {
    errors.push(`${label} rotation must be finite`);
  }
  if (placement.skewX !== undefined && !Number.isFinite(placement.skewX)) {
    errors.push(`${label} skewX must be finite`);
  }
}

function validatePolygon(errors: string[], label: string, polygon: readonly BoardPoint[]): void {
  if (polygon.length < 3) {
    errors.push(`${label} footprint must have at least three points`);
  }
  for (const [index, point] of polygon.entries()) {
    if (!isPercentPoint(point)) errors.push(`${label} footprint point ${index} must be within 0..100%`);
  }
}

export function validateBoardPackage(board: BoardPackage): string[] {
  const errors: string[] = [];
  const nodeIds = new Set<string>();
  const actorIds = new Set<string>();
  const targetIds = new Set<string>();

  if (!board.id) errors.push('board.id is required');
  if (!board.imageUrl) errors.push('board.imageUrl is required');
  if (!Number.isFinite(board.aspectRatio) || board.aspectRatio <= 0) {
    errors.push('board.aspectRatio must be positive');
  }
  if (!board.scene) errors.push('board.scene is required');
  if (board.scene) {
    if (!Number.isFinite(board.scene.projection.tileWidth) || board.scene.projection.tileWidth <= 0) {
      errors.push('scene.projection.tileWidth must be positive');
    }
    if (!Number.isFinite(board.scene.projection.tileAspect) || board.scene.projection.tileAspect <= 0) {
      errors.push('scene.projection.tileAspect must be positive');
    }
    if (!Number.isFinite(board.scene.projection.rotate)) errors.push('scene.projection.rotate must be finite');
    if (!Number.isFinite(board.scene.projection.skewX)) errors.push('scene.projection.skewX must be finite');
    if (board.scene.layers.length === 0) errors.push('scene.layers must include at least one layer');
    for (const layer of board.scene.layers) {
      if (!layer.id) errors.push('scene layer id is required');
      if (!layer.imageUrl) errors.push(`scene layer ${layer.id} imageUrl is required`);
      if (layer.opacity !== undefined && (layer.opacity < 0 || layer.opacity > 1)) {
        errors.push(`scene layer ${layer.id} opacity must be within 0..1`);
      }
    }
    for (const mask of board.scene.bakedUnitMasks) {
      if (!mask.id) errors.push('baked unit mask id is required');
      validatePlacement(errors, `baked unit mask ${mask.id}`, mask);
    }
    for (const occluder of board.scene.foregroundOccluders) {
      if (!occluder.id) errors.push('foreground occluder id is required');
      validatePlacement(errors, `foreground occluder ${occluder.id}`, occluder);
      if (occluder.opacity !== undefined && (occluder.opacity < 0 || occluder.opacity > 1)) {
        errors.push(`foreground occluder ${occluder.id} opacity must be within 0..1`);
      }
    }
    for (const block of board.scene.authoringBlocks) {
      if (!block.id) errors.push('authoring block id is required');
      validatePlacement(errors, `authoring block ${block.id}`, block);
    }
  }

  for (const node of board.nodes) {
    if (nodeIds.has(node.id)) errors.push(`duplicate node id ${node.id}`);
    nodeIds.add(node.id);
    if (!isPercentPoint(node.anchor)) errors.push(`node ${node.id} anchor must be within 0..100%`);
    validatePolygon(errors, `node ${node.id}`, node.footprint);
  }

  for (const edge of board.edges) {
    if (!nodeIds.has(edge.from)) errors.push(`edge from ${edge.from} references missing node`);
    if (!nodeIds.has(edge.to)) errors.push(`edge to ${edge.to} references missing node`);
    if (edge.from === edge.to) errors.push(`edge ${edge.from}->${edge.to} cannot link a node to itself`);
  }

  for (const actor of board.actors) {
    if (actorIds.has(actor.id)) errors.push(`duplicate actor id ${actor.id}`);
    actorIds.add(actor.id);
    if (!nodeIds.has(actor.nodeId)) errors.push(`actor ${actor.id} references missing node ${actor.nodeId}`);
    if (!actor.sprite) errors.push(`actor ${actor.id} requires a sprite`);
    if (actor.sprite && !actor.sprite.imageUrl) errors.push(`actor ${actor.id} sprite imageUrl is required`);
    if (actor.hotspot) validatePlacement(errors, `actor ${actor.id} hotspot`, actor.hotspot);
  }

  for (const target of board.targets) {
    if (targetIds.has(target.id)) errors.push(`duplicate target id ${target.id}`);
    targetIds.add(target.id);
    if (!isPercentPoint(target.anchor)) errors.push(`target ${target.id} anchor must be within 0..100%`);
    if (target.hitChance < 0 || target.hitChance > 100) {
      errors.push(`target ${target.id} hitChance must be within 0..100`);
    }
    if (!target.sprite) errors.push(`target ${target.id} requires a sprite`);
    if (target.sprite && !target.sprite.imageUrl) errors.push(`target ${target.id} sprite imageUrl is required`);
    validatePlacement(errors, `target ${target.id} hotspot`, target.hotspot);
  }

  if (!actorIds.has(board.initial.selectedActorId)) {
    errors.push(`initial.selectedActorId ${board.initial.selectedActorId} does not exist`);
  }
  if (!targetIds.has(board.initial.targetId)) {
    errors.push(`initial.targetId ${board.initial.targetId} does not exist`);
  }
  if (!Number.isInteger(board.initial.moveRange) || board.initial.moveRange < 1) {
    errors.push('initial.moveRange must be a positive integer');
  }

  return errors;
}

export function assertValidBoardPackage(board: BoardPackage): void {
  const errors = validateBoardPackage(board);
  if (errors.length > 0) {
    throw new Error(`Invalid board package ${board.id}: ${errors.join('; ')}`);
  }
}
