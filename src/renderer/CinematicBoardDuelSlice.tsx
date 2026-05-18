import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { bananaBDuelBoardPackage } from './board2d5/bananaBDuelBoard';
import { BOARD_DUEL_TIMING, boardDuelPhaseCopy, createBoard2d5Event, type BoardDuelMode, type BoardDuelPhase } from './board2d5/duelScenario';
import { findBoardPath, getBoardNode, getReachableNodeIds } from './board2d5/graph';
import type {
  Board2d5Event,
  BoardActorSprite,
  BoardAuthoringBlock,
  BoardNode,
  BoardPackage,
  BoardPoint,
  BoardRectPlacement,
} from './board2d5/types';
import { assertValidBoardPackage } from './board2d5/validateBoardPackage';

assertValidBoardPackage(bananaBDuelBoardPackage);

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function getBoardPointFromPointer(frame: HTMLDivElement, clientX: number, clientY: number): BoardPoint {
  const rect = frame.getBoundingClientRect();
  return {
    x: clampPercent(((clientX - rect.left) / rect.width) * 100),
    y: clampPercent(((clientY - rect.top) / rect.height) * 100),
  };
}

function placementStyle(placement: BoardRectPlacement): CSSProperties {
  return {
    left: `${placement.anchor.x}%`,
    top: `${placement.anchor.y}%`,
    width: `${placement.size.width}%`,
    height: `${placement.size.height}%`,
    '--placement-rotate': `${placement.rotation ?? 0}deg`,
    '--placement-skew': `${placement.skewX ?? 0}deg`,
  } as CSSProperties;
}

function pointHandleStyle(anchor: BoardPoint): CSSProperties {
  return {
    left: `${anchor.x}%`,
    top: `${anchor.y}%`,
  };
}

function makeAuthoringBlock(anchor: BoardPoint, index: number): BoardAuthoringBlock {
  return {
    id: `author-cover-${index}`,
    label: `Placed cover ${index}`,
    kind: 'cover',
    anchor,
    size: { width: 7.8, height: 4.8 },
    rotation: -25,
    skewX: -7,
  };
}

function getSpriteImageUrl(sprite: BoardActorSprite, isDown: boolean): string {
  return isDown && sprite.downImageUrl ? sprite.downImageUrl : sprite.imageUrl;
}

type AuthorTool = 'inspect' | 'cover';
type AuthorDragKind = 'node' | 'target' | 'mask' | 'occluder' | 'block';

type AuthorDrag = {
  kind: AuthorDragKind;
  id: string;
};

export function CinematicBoardDuelSlice() {
  const board = bananaBDuelBoardPackage;
  const frameRef = useRef<HTMLDivElement | null>(null);
  const isAuthoring = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.has('debug') || params.has('author');
  }, []);
  const selectedActor = board.actors.find((actor) => actor.id === board.initial.selectedActorId) ?? board.actors[0];
  const baseTarget = board.targets.find((candidate) => candidate.id === board.initial.targetId) ?? board.targets[0];
  const initialNodeId = selectedActor.nodeId;
  const [phase, setPhase] = useState<BoardDuelPhase>('ready');
  const [mode, setMode] = useState<BoardDuelMode>('idle');
  const [ctNodeId, setCtNodeId] = useState(initialNodeId);
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const [pathNodeIds, setPathNodeIds] = useState<string[]>([initialNodeId]);
  const [authorTool, setAuthorTool] = useState<AuthorTool>('inspect');
  const [editedNodeAnchors, setEditedNodeAnchors] = useState<Record<string, BoardPoint>>({});
  const [editedTargetAnchors, setEditedTargetAnchors] = useState<Record<string, BoardPoint>>({});
  const [editedMaskAnchors, setEditedMaskAnchors] = useState<Record<string, BoardPoint>>({});
  const [editedOccluderAnchors, setEditedOccluderAnchors] = useState<Record<string, BoardPoint>>({});
  const [authoringBlocks, setAuthoringBlocks] = useState<BoardAuthoringBlock[]>(board.scene.authoringBlocks);
  const [authorDrag, setAuthorDrag] = useState<AuthorDrag | null>(null);
  const [selectedAuthorItem, setSelectedAuthorItem] = useState<string>('none');
  const [downIds, setDownIds] = useState<string[]>([]);
  const [events, setEvents] = useState<Board2d5Event[]>([
    createBoard2d5Event('select', 'CT entry selected.', {
      actorId: selectedActor.id,
      toNodeId: initialNodeId,
    }),
  ]);

  const runtimeBoard: BoardPackage = useMemo(() => ({
    ...board,
    nodes: board.nodes.map((node) => ({
      ...node,
      anchor: editedNodeAnchors[node.id] ?? node.anchor,
    })),
    targets: board.targets.map((candidate) => ({
      ...candidate,
      anchor: editedTargetAnchors[candidate.id] ?? candidate.anchor,
      hotspot: {
        ...candidate.hotspot,
        anchor: editedTargetAnchors[candidate.id] ?? candidate.hotspot.anchor,
      },
    })),
    scene: {
      ...board.scene,
      bakedUnitMasks: board.scene.bakedUnitMasks.map((mask) => ({
        ...mask,
        anchor: editedMaskAnchors[mask.id] ?? mask.anchor,
      })),
      foregroundOccluders: board.scene.foregroundOccluders.map((occluder) => ({
        ...occluder,
        anchor: editedOccluderAnchors[occluder.id] ?? occluder.anchor,
      })),
      authoringBlocks,
    },
  }), [authoringBlocks, board, editedMaskAnchors, editedNodeAnchors, editedOccluderAnchors, editedTargetAnchors]);
  const target = runtimeBoard.targets.find((candidate) => candidate.id === board.initial.targetId) ?? baseTarget;
  const isBusy = phase === 'moving' ||
    phase === 'firing' ||
    phase === 'impact' ||
    phase === 'trading' ||
    phase === 'trade-impact';
  const isRoundComplete = phase === 'down';
  const ctNode = getBoardNode(runtimeBoard, ctNodeId) ?? runtimeBoard.nodes[0];
  const traderActor = runtimeBoard.actors.find((actor) => actor.id === 'ct-trader') ?? runtimeBoard.actors[1];
  const traderNode = traderActor ? getBoardNode(runtimeBoard, traderActor.nodeId) : null;
  const reachableNodeIds = useMemo(
    () => getReachableNodeIds(runtimeBoard, ctNodeId, runtimeBoard.initial.moveRange),
    [ctNodeId, runtimeBoard]
  );

  const pushEvent = useCallback((event: Board2d5Event) => {
    setEvents((current) => [event, ...current].slice(0, 10));
  }, []);

  useEffect(() => {
    if (phase === 'moving') {
      const timer = window.setTimeout(() => {
        pushEvent(createBoard2d5Event('contact', 'T anchor fires first contact.', {
          actorId: selectedActor.id,
          targetId: target.id,
          fromNodeId: ctNodeId,
        }));
        setDownIds((current) => Array.from(new Set([...current, selectedActor.id])));
        setPhase('contact');
        setMode('idle');
      }, BOARD_DUEL_TIMING.moveMs);
      return () => window.clearTimeout(timer);
    }

    if (phase === 'firing') {
      const timer = window.setTimeout(() => {
        pushEvent(createBoard2d5Event('hit', 'Hit confirmed.', {
          actorId: selectedActor.id,
          targetId: target.id,
          toNodeId: ctNodeId,
        }));
        setPhase('impact');
      }, BOARD_DUEL_TIMING.shotToImpactMs);
      return () => window.clearTimeout(timer);
    }

    if (phase === 'impact') {
      const timer = window.setTimeout(() => {
        pushEvent(createBoard2d5Event('kill', 'Entry down.', {
          actorId: selectedActor.id,
          targetId: target.id,
          toNodeId: ctNodeId,
        }));
        setPhase('down');
        setMode('idle');
      }, BOARD_DUEL_TIMING.casualtySettleMs);
      return () => window.clearTimeout(timer);
    }

    if (phase === 'trading') {
      const timer = window.setTimeout(() => {
        pushEvent(createBoard2d5Event('hit', 'Trade hit confirmed.', {
          actorId: traderActor?.id,
          targetId: target.id,
          fromNodeId: traderActor?.nodeId,
        }));
        setPhase('trade-impact');
      }, BOARD_DUEL_TIMING.tradeImpactMs);
      return () => window.clearTimeout(timer);
    }

    if (phase === 'trade-impact') {
      const timer = window.setTimeout(() => {
        pushEvent(createBoard2d5Event('kill', 'CT anchor traded.', {
          actorId: traderActor?.id,
          targetId: target.id,
          fromNodeId: traderActor?.nodeId,
        }));
        setDownIds((current) => Array.from(new Set([...current, target.id])));
        setPhase('down');
        setMode('idle');
      }, BOARD_DUEL_TIMING.tradeSettleMs);
      return () => window.clearTimeout(timer);
    }

    if (phase === 'invalid') {
      const timer = window.setTimeout(
        () => setPhase(mode === 'shoot' ? 'aiming' : mode === 'move' ? 'move-select' : 'ready'),
        BOARD_DUEL_TIMING.invalidMs
      );
      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [ctNodeId, mode, phase, pushEvent, selectedActor.id, target.id, traderActor?.id, traderActor?.nodeId]);

  const className = useMemo(() => [
    'board-duel',
    `phase-${phase}`,
    `mode-${mode}`,
    ctNodeId !== initialNodeId ? 'ct-advanced' : '',
    isAuthoring ? 'authoring' : '',
  ].filter(Boolean).join(' '), [ctNodeId, initialNodeId, isAuthoring, mode, phase]);

  const beginMove = () => {
    if (phase !== 'ready' || isBusy) return;
    pushEvent(createBoard2d5Event('move_preview', 'Movement preview opened.', {
      actorId: selectedActor.id,
      fromNodeId: ctNodeId,
    }));
    setMode('move');
    setPhase('move-select');
  };

  const commitMove = (nodeId: string) => {
    if (isRoundComplete || isBusy || mode !== 'move' || !reachableNodeIds.includes(nodeId)) {
      pushEvent(createBoard2d5Event('invalid', 'Invalid move command.', {
        actorId: selectedActor.id,
        fromNodeId: ctNodeId,
        toNodeId: nodeId,
      }));
      setPhase('invalid');
      return;
    }

    const path = findBoardPath(runtimeBoard, ctNodeId, nodeId);
    if (path.length <= 1) {
      pushEvent(createBoard2d5Event('invalid', 'Invalid move command.', {
        actorId: selectedActor.id,
        fromNodeId: ctNodeId,
        toNodeId: nodeId,
      }));
      setPhase('invalid');
      return;
    }

    pushEvent(createBoard2d5Event('move_committed', 'Move committed.', {
      actorId: selectedActor.id,
      fromNodeId: ctNodeId,
      toNodeId: nodeId,
      pathNodeIds: path,
    }));
    setPathNodeIds(path);
    setHoverNodeId(null);
    setCtNodeId(nodeId);
    setPhase('moving');
  };

  const beginTrade = () => {
    if (phase !== 'contact' || isBusy || !traderActor) return;
    pushEvent(createBoard2d5Event('trade_started', 'Trade shot committed.', {
      actorId: traderActor.id,
      targetId: target.id,
      fromNodeId: traderActor.nodeId,
    }));
    setMode('shoot');
    setPhase('trading');
  };

  const fireShot = () => {
    if (isRoundComplete || isBusy) return;

    if (mode !== 'shoot') {
      pushEvent(createBoard2d5Event('invalid', 'Invalid shot command.', {
        actorId: selectedActor.id,
        targetId: target.id,
        fromNodeId: ctNodeId,
      }));
      setPhase('invalid');
      return;
    }

    pushEvent(createBoard2d5Event('shot_fired', 'Shot fired.', {
      actorId: selectedActor.id,
      targetId: target.id,
      fromNodeId: ctNodeId,
    }));
    setPhase('firing');
  };

  const rejectBoardClick = () => {
    if (isRoundComplete || isBusy || mode === 'idle') return;
    pushEvent(createBoard2d5Event('invalid', 'Invalid board command.', {
      actorId: selectedActor.id,
      targetId: mode === 'shoot' ? target.id : undefined,
      fromNodeId: ctNodeId,
    }));
    setPhase('invalid');
  };

  const reset = () => {
    pushEvent(createBoard2d5Event('reset', 'Board reset.', {
      actorId: selectedActor.id,
      targetId: target.id,
      toNodeId: initialNodeId,
    }));
    setPhase('ready');
    setMode('idle');
    setCtNodeId(initialNodeId);
    setHoverNodeId(null);
    setPathNodeIds([initialNodeId]);
    setDownIds([]);
  };

  const handleNodeClick = (nodeId: string) => {
    if (mode === 'move') {
      commitMove(nodeId);
      return;
    }

    if (mode === 'shoot') {
      pushEvent(createBoard2d5Event('invalid', 'Invalid shot target.', {
        actorId: selectedActor.id,
        targetId: target.id,
        fromNodeId: ctNodeId,
        toNodeId: nodeId,
      }));
      setPhase('invalid');
    }
  };

  const shotLine = phase === 'contact' || phase === 'firing' || phase === 'impact'
    ? { from: target.anchor, to: ctNode.anchor }
    : phase === 'trading' || phase === 'trade-impact' || phase === 'down'
      ? { from: traderNode?.anchor ?? ctNode.anchor, to: target.anchor }
      : { from: ctNode.anchor, to: target.anchor };
  const aimLineStyle = {
    '--aim-x1': `${shotLine.from.x}%`,
    '--aim-y1': `${shotLine.from.y}%`,
    '--aim-x2': `${shotLine.to.x}%`,
    '--aim-y2': `${shotLine.to.y}%`,
  } as CSSProperties;

  const previewPathNodeIds = mode === 'move' && hoverNodeId
    ? findBoardPath(runtimeBoard, ctNodeId, hoverNodeId)
    : pathNodeIds;
  const pathPoints = previewPathNodeIds
    .map((nodeId) => getBoardNode(runtimeBoard, nodeId))
    .filter((node): node is BoardNode => Boolean(node))
    .map((node) => `${node.anchor.x},${node.anchor.y}`)
    .join(' ');
  const boardLayer = runtimeBoard.scene.layers.find((layer) => layer.role === 'base') ?? runtimeBoard.scene.layers[0];
  const actorHotspot = selectedActor.hotspot
    ? { ...selectedActor.hotspot, anchor: ctNode.anchor }
    : { anchor: ctNode.anchor, size: { width: 12, height: 18 } };
  const authoringExport = useMemo(() => JSON.stringify({
    boardId: runtimeBoard.id,
    nodes: runtimeBoard.nodes.map((node) => ({ id: node.id, anchor: node.anchor })),
    actors: runtimeBoard.actors.map((actor) => {
      const actorNode = getBoardNode(runtimeBoard, actor.nodeId);
      return {
        id: actor.id,
        nodeId: actor.nodeId,
        hotspot: actor.hotspot && actorNode
          ? { ...actor.hotspot, anchor: actorNode.anchor }
          : actor.hotspot,
      };
    }),
    targets: runtimeBoard.targets.map((candidate) => ({
      id: candidate.id,
      anchor: candidate.anchor,
      hotspot: candidate.hotspot,
    })),
    scene: {
      bakedUnitMasks: runtimeBoard.scene.bakedUnitMasks.map((mask) => ({
        id: mask.id,
        anchor: mask.anchor,
        size: mask.size,
        rotation: mask.rotation,
        skewX: mask.skewX,
        tone: mask.tone,
      })),
      foregroundOccluders: runtimeBoard.scene.foregroundOccluders.map((occluder) => ({
        id: occluder.id,
        anchor: occluder.anchor,
        size: occluder.size,
        rotation: occluder.rotation,
        skewX: occluder.skewX,
        tone: occluder.tone,
        opacity: occluder.opacity,
      })),
      authoringBlocks,
    },
  }, null, 2), [authoringBlocks, runtimeBoard]);

  const handleFrameClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isAuthoring || authorTool !== 'cover' || !frameRef.current) return;
    if ((event.target as HTMLElement).closest('button')) return;
    event.stopPropagation();
    const anchor = getBoardPointFromPointer(frameRef.current, event.clientX, event.clientY);
    setAuthoringBlocks((current) => [...current, makeAuthoringBlock(anchor, current.length + 1)]);
  };

  const handleFramePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isAuthoring || !authorDrag || !frameRef.current) return;
    event.stopPropagation();
    const anchor = getBoardPointFromPointer(frameRef.current, event.clientX, event.clientY);
    if (authorDrag.kind === 'node') {
      setEditedNodeAnchors((current) => ({ ...current, [authorDrag.id]: anchor }));
    } else if (authorDrag.kind === 'target') {
      setEditedTargetAnchors((current) => ({ ...current, [authorDrag.id]: anchor }));
    } else if (authorDrag.kind === 'mask') {
      setEditedMaskAnchors((current) => ({ ...current, [authorDrag.id]: anchor }));
    } else if (authorDrag.kind === 'occluder') {
      setEditedOccluderAnchors((current) => ({ ...current, [authorDrag.id]: anchor }));
    } else {
      setAuthoringBlocks((current) => current.map((block) => (
        block.id === authorDrag.id ? { ...block, anchor } : block
      )));
    }
  };

  const stopDraggingBlock = () => {
    setAuthorDrag(null);
  };

  const beginAuthorDrag = (drag: AuthorDrag) => (event: ReactPointerEvent<HTMLElement>) => {
    if (!isAuthoring) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedAuthorItem(`${drag.kind}:${drag.id}`);
    setAuthorDrag(drag);
  };

  return (
    <main
      className={className}
      aria-label="Playable isometric one versus one board slice"
      data-testid="board-duel-package"
      data-board-id={board.id}
      onClick={rejectBoardClick}
    >
      <style>{`
        :root { color-scheme: dark; }
        * { box-sizing: border-box; }
        body { margin: 0; overflow: hidden; }

        .board-duel {
          position: fixed;
          inset: 0;
          overflow: hidden;
          color: #f5fbff;
          font-family: Inter, Segoe UI, system-ui, sans-serif;
          background:
            radial-gradient(circle at 54% 42%, rgba(54, 137, 196, 0.18), transparent 33%),
            linear-gradient(180deg, #07111b 0%, #02050a 100%);
        }

        .concept-frame {
          position: absolute;
          --frame-margin: 16px;
          --frame-gutter: 32px;
          --frame-width: min(calc(100vw - var(--frame-gutter)), calc((100vh - var(--frame-gutter)) * var(--board-aspect)));
          left: 50%;
          top: 50%;
          width: var(--frame-width);
          aspect-ratio: var(--board-aspect);
          transform: translate(-50%, -50%);
          background-image: var(--board-image);
          background-size: contain;
          background-position: center;
          background-repeat: no-repeat;
          filter: saturate(1.02) contrast(1.01);
        }

        @media (min-aspect-ratio: 2 / 1) {
          .concept-frame {
            left: var(--frame-margin);
            transform: translateY(-50%);
          }
        }

        .concept-frame::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(circle at 50% 48%, transparent 0 56%, rgba(0,0,0,0.18) 76%, rgba(0,0,0,0.34) 100%);
        }

        .phase-firing .concept-frame,
        .phase-impact .concept-frame {
          animation: camera-hit 720ms cubic-bezier(.2,.85,.2,1) both;
        }

        .phase-invalid .concept-frame {
          animation: invalid-shake 190ms ease 2;
        }

        .scene-image-layer {
          position: absolute;
          inset: 0;
          z-index: 2;
          background-size: contain;
          background-position: center;
          background-repeat: no-repeat;
          pointer-events: none;
        }

        .scene-image-layer.layer-shadow {
          z-index: 3;
          mix-blend-mode: multiply;
        }

        .scene-image-layer.layer-foreground {
          z-index: 14;
        }

        .scene-mask,
        .foreground-occluder,
        .authoring-block {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%) rotate(var(--placement-rotate)) skewX(var(--placement-skew));
          transform-origin: center;
          pointer-events: none;
        }

        .scene-mask {
          z-index: 5;
          border-radius: 18px;
          filter: blur(0.15px);
        }

        .board-duel:not(.authoring) .scene-mask {
          opacity: 0 !important;
        }

        .board-duel:not(.authoring) .foreground-occluder {
          opacity: 0 !important;
        }

        .scene-mask.tone-floor-clay {
          background:
            radial-gradient(circle at 40% 35%, rgba(185, 203, 211, 0.78), transparent 42%),
            linear-gradient(145deg, rgba(67, 93, 111, 0.8), rgba(27, 42, 56, 0.86));
          box-shadow: inset 0 0 18px rgba(208, 228, 236, 0.12), 0 10px 24px rgba(0,0,0,0.14);
        }

        .scene-mask.tone-wall-clay {
          background:
            linear-gradient(180deg, rgba(214, 196, 147, 0.72), rgba(98, 86, 66, 0.7)),
            radial-gradient(circle at 42% 32%, rgba(240, 223, 174, 0.35), transparent 50%);
          box-shadow: inset 0 0 18px rgba(255, 232, 174, 0.13), 0 10px 20px rgba(0,0,0,0.16);
        }

        .scene-mask.tone-shadow-clay {
          background: rgba(17, 25, 33, 0.54);
          box-shadow: 0 10px 20px rgba(0,0,0,0.18);
        }

        .foreground-occluder {
          z-index: 14;
          border-radius: 7px;
          box-shadow: 0 12px 24px rgba(0,0,0,0.16), inset 0 1px rgba(255,255,255,0.12);
        }

        .foreground-occluder.tone-cover-block {
          background: linear-gradient(180deg, rgba(196, 171, 105, 0.92), rgba(97, 78, 43, 0.86));
        }

        .foreground-occluder.tone-front-wall {
          background: linear-gradient(180deg, rgba(196, 208, 213, 0.9), rgba(80, 101, 113, 0.86));
        }

        .foreground-occluder.tone-shadow {
          background: rgba(18, 26, 34, 0.58);
        }

        .feedback {
          position: absolute;
          left: 50%;
          top: max(18px, 3.2vh);
          z-index: 20;
          min-height: 38px;
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 0 16px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.18);
          background: rgba(3, 8, 14, 0.68);
          box-shadow: 0 18px 44px rgba(0,0,0,0.38), inset 0 1px rgba(255,255,255,0.1);
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 1.4px;
          text-transform: uppercase;
          transform: translateX(-50%);
          pointer-events: none;
        }

        .feedback::before {
          content: "";
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: #68cfff;
          box-shadow: 0 0 16px rgba(104, 207, 255, 0.9);
        }

        .phase-invalid .feedback {
          color: #ffe4de;
          border-color: rgba(255, 94, 72, 0.62);
          animation: feedback-pop 180ms ease 2;
        }

        .phase-invalid .feedback::before {
          background: #ff604d;
          box-shadow: 0 0 16px rgba(255, 96, 77, 0.9);
        }

        .phase-down .feedback::before {
          background: #ffcf70;
          box-shadow: 0 0 16px rgba(255, 207, 112, 0.9);
        }

        .hotspot {
          position: absolute;
          z-index: 10;
          border: 0;
          padding: 0;
          background: transparent;
          cursor: default;
        }

        .tile-layer {
          position: absolute;
          inset: 0;
          z-index: 8;
          pointer-events: none;
        }

        .mode-move .tile-layer {
          pointer-events: auto;
        }

        .tile-path {
          position: absolute;
          inset: 0;
          z-index: 8;
          width: 100%;
          height: 100%;
          pointer-events: none;
          opacity: 0;
          transition: opacity 160ms ease;
        }

        .mode-move .tile-path,
        .phase-moving .tile-path {
          opacity: 1;
        }

        .tile-path polyline {
          fill: none;
          stroke: rgba(91, 213, 255, 0.58);
          stroke-width: 0.42;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .iso-tile {
          position: absolute;
          left: var(--tile-x);
          top: var(--tile-y);
          width: var(--tile-width);
          aspect-ratio: 1 / var(--tile-aspect);
          transform: translate(-50%, -50%) rotate(var(--tile-rotate)) skewX(var(--tile-skew));
          transform-origin: center;
          border: 1px solid rgba(105, 211, 255, 0);
          border-radius: 2px;
          background: rgba(69, 194, 255, 0);
          box-shadow: 0 0 0 rgba(89, 213, 255, 0);
          pointer-events: auto;
          transition: opacity 150ms ease, border-color 150ms ease, background 150ms ease, box-shadow 150ms ease;
          opacity: 0;
        }

        .mode-move .iso-tile {
          cursor: pointer;
          opacity: 1;
          border-color: rgba(89, 213, 255, 0.9);
          background: rgba(65, 195, 255, 0.14);
          box-shadow: inset 0 0 0 1px rgba(210, 247, 255, 0.16);
        }

        .mode-move .iso-tile.current {
          border-color: rgba(255, 255, 255, 0.64);
          background: rgba(255, 255, 255, 0.1);
        }

        .mode-move .iso-tile.unreachable {
          pointer-events: none;
          opacity: 0;
        }

        .mode-move .iso-tile.hovered {
          border-color: rgba(255, 235, 157, 0.92);
          background: rgba(255, 220, 120, 0.18);
          box-shadow: inset 0 0 0 1px rgba(255, 248, 206, 0.22);
        }

        .mode-move .iso-tile.cover-full::after,
        .mode-move .iso-tile.cover-half::after {
          content: "";
          position: absolute;
          right: 8%;
          top: 12%;
          width: 16%;
          height: 16%;
          border-radius: 2px;
          background: rgba(255, 211, 116, 0.82);
          box-shadow: 0 0 4px rgba(255, 211, 116, 0.42);
        }

        .ct-hotspot {
          border-radius: 24px;
          transform: translate(-50%, -50%);
        }

        .actor-token {
          position: absolute;
          left: var(--unit-x);
          top: var(--unit-y);
          z-index: 12;
          width: 11.2%;
          aspect-ratio: 1;
          transform: translate(-50%, -66%) scale(var(--unit-scale));
          transform-origin: 50% 76%;
          pointer-events: none;
          transition: left 520ms cubic-bezier(.2,.84,.2,1), top 520ms cubic-bezier(.2,.84,.2,1);
        }

        .actor-image {
          position: absolute;
          inset: 0;
          z-index: 2;
          width: 100%;
          height: 100%;
          object-fit: contain;
          filter: drop-shadow(0 9px 12px rgba(0,0,0,0.42));
          transform-origin: 50% 74%;
          user-select: none;
        }

        .actor-token.facing-left .actor-image {
          transform: scaleX(-1);
        }

        .actor-shadow {
          position: absolute;
          left: 50%;
          bottom: 1%;
          width: 76%;
          height: 35%;
          transform: translateX(-50%) rotate(-25deg) skewX(-7deg);
          border-radius: 12px;
          background: rgba(4, 8, 14, 0.44);
          filter: blur(0.6px);
        }

        .unit-token .actor-shadow {
          border: 2px solid rgba(90, 213, 255, 0.88);
          background: rgba(24, 165, 255, 0.16);
          box-shadow: 0 0 26px rgba(74, 203, 255, 0.54), inset 0 0 18px rgba(74, 203, 255, 0.16);
        }

        .unit-token.team-T .actor-shadow {
          border-color: rgba(255, 118, 84, 0.92);
          background: rgba(255, 83, 58, 0.14);
          box-shadow: 0 0 26px rgba(255, 91, 70, 0.48), inset 0 0 18px rgba(255, 91, 70, 0.14);
        }

        .unit-token .unit-chevron {
          position: absolute;
          left: 50%;
          top: 2%;
          width: 28%;
          height: 18%;
          transform: translateX(-50%);
          clip-path: polygon(50% 0, 100% 100%, 50% 72%, 0 100%);
          background: rgba(116, 221, 255, 0.9);
          filter: drop-shadow(0 0 10px rgba(94, 206, 255, 0.8));
          z-index: 3;
        }

        .actor-body {
          position: absolute;
          left: 50%;
          bottom: 27%;
          width: 31%;
          height: 46%;
          transform: translateX(-50%);
          border-radius: 999px;
          box-shadow: 0 10px 18px rgba(0,0,0,0.44), 0 0 20px rgba(94, 206, 255, 0.45);
          clip-path: polygon(50% 0, 78% 18%, 88% 58%, 70% 100%, 30% 100%, 12% 58%, 22% 18%);
        }

        .actor-head {
          position: absolute;
          left: 50%;
          bottom: 66%;
          width: 22%;
          height: 22%;
          transform: translateX(-50%);
          border-radius: 50%;
          box-shadow: 0 8px 12px rgba(0,0,0,0.32);
        }

        .actor-rifle {
          position: absolute;
          left: 54%;
          bottom: 53%;
          width: 54%;
          height: 6%;
          border-radius: 999px;
          transform-origin: 0 50%;
          transform: rotate(-8deg);
          box-shadow: 0 6px 8px rgba(0,0,0,0.4);
        }

        .team-CT .actor-body {
          background: linear-gradient(180deg, rgba(132, 225, 255, 0.96), rgba(12, 74, 132, 0.96));
        }

        .team-CT .actor-head {
          background: linear-gradient(180deg, #d5f2ff, #5e9cc2);
        }

        .team-CT .actor-rifle {
          background: linear-gradient(90deg, #06101b, #111c26 72%, #010306);
        }

        .team-T .actor-body {
          background: linear-gradient(180deg, #ffb05f, #9b3a24 55%, #3a0d0a);
          box-shadow: 0 10px 18px rgba(0,0,0,0.46), 0 0 20px rgba(255, 96, 72, 0.42);
        }

        .team-T .actor-head {
          background: linear-gradient(180deg, #ffd69a, #a56636);
        }

        .team-T .actor-rifle {
          left: auto;
          right: 52%;
          transform-origin: 100% 50%;
          transform: rotate(8deg);
          background: linear-gradient(90deg, #090302, #1f0b08 28%, #060101);
        }

        .target-token {
          z-index: 12;
        }

        .actor-token.down {
          transform: translate(-50%, -32%) rotate(-24deg) skewX(-6deg) scale(calc(var(--unit-scale) * 0.9));
          opacity: 0.72;
          transition: transform 360ms cubic-bezier(.2,.85,.2,1), opacity 240ms ease;
        }

        .actor-token.down .actor-image {
          filter: drop-shadow(0 4px 8px rgba(0,0,0,0.38)) saturate(0.88);
        }

        .target-hotspot {
          border-radius: 24px;
          transform: translate(-50%, -50%);
        }

        .mode-shoot .target-hotspot {
          cursor: crosshair;
          outline: 2px solid rgba(255, 101, 72, 0.88);
          box-shadow: 0 0 34px rgba(255, 91, 70, 0.36);
        }

        .phase-firing .shot-flash,
        .phase-impact .shot-flash {
          opacity: 1;
          animation: shot-flash 720ms ease both;
        }

        .aim-svg {
          position: absolute;
          inset: 0;
          z-index: 8;
          width: 100%;
          height: 100%;
          pointer-events: none;
          opacity: 0;
        }

        .phase-contact .aim-svg,
        .mode-shoot .aim-svg,
        .phase-firing .aim-svg,
        .phase-impact .aim-svg,
        .phase-trading .aim-svg,
        .phase-trade-impact .aim-svg,
        .phase-down .aim-svg {
          opacity: 1;
        }

        .aim-svg line {
          stroke: rgba(255, 222, 134, 0.86);
          stroke-width: 0.62;
          stroke-linecap: round;
          filter: drop-shadow(0 0 5px rgba(255, 196, 82, 0.9));
        }

        .shot-flash {
          position: absolute;
          left: 27.4%;
          top: 33.6%;
          width: 47.8%;
          height: 35.5%;
          z-index: 8;
          pointer-events: none;
          opacity: 0;
          background:
            linear-gradient(146deg, transparent 0 45%, rgba(255,255,255,0.84) 48%, rgba(255, 210, 92, 0.88) 50%, rgba(255, 114, 48, 0.16) 54%, transparent 58%),
            radial-gradient(circle at 98% 8%, rgba(255,80,60,0.72), transparent 12%),
            radial-gradient(circle at 2% 92%, rgba(255,228,130,0.62), transparent 10%);
          filter: blur(0.4px) drop-shadow(0 0 22px rgba(255, 198, 82, 0.82));
          mix-blend-mode: screen;
        }

        .phase-down .target-hotspot {
          pointer-events: none;
          outline: 2px solid rgba(255, 108, 82, 0.92);
          background: rgba(62, 7, 8, 0.28);
          box-shadow: 0 0 34px rgba(255, 91, 70, 0.42), inset 0 0 28px rgba(255, 91, 70, 0.18);
        }

        .phase-down .target-hotspot::before,
        .phase-down .target-hotspot::after {
          content: "";
          position: absolute;
          left: 12%;
          top: 48%;
          width: 76%;
          height: 4px;
          border-radius: 999px;
          background: rgba(255, 228, 196, 0.92);
          box-shadow: 0 0 16px rgba(255, 88, 58, 0.92);
        }

        .phase-down .target-hotspot::before {
          transform: rotate(34deg);
        }

        .phase-down .target-hotspot::after {
          transform: rotate(-34deg);
        }

        .phase-down .casualty-marker {
          opacity: 1;
          transform: translate(-50%, -50%) rotate(-25deg) skewX(-7deg) scale(1);
        }

        .casualty-marker {
          position: absolute;
          left: var(--target-x);
          top: var(--target-y);
          z-index: 11;
          width: 7.2%;
          aspect-ratio: 1 / 0.52;
          border-radius: 12px;
          border: 2px solid rgba(255, 120, 92, 0.7);
          background: rgba(124, 22, 20, 0.36);
          box-shadow: 0 0 24px rgba(255, 82, 64, 0.45), inset 0 0 18px rgba(255, 82, 64, 0.18);
          opacity: 0;
          transform: translate(-50%, -50%) rotate(-25deg) skewX(-7deg) scale(0.82);
          transition: opacity 220ms ease, transform 260ms ease;
          pointer-events: none;
        }

        .event-probe {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip: rect(0 0 0 0);
          white-space: nowrap;
        }

        .authoring .concept-frame {
          cursor: crosshair;
        }

        .authoring .hotspot,
        .authoring .tile-layer {
          pointer-events: none;
        }

        .authoring .concept-frame::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 30;
          pointer-events: none;
          background-image:
            linear-gradient(rgba(255,255,255,0.16) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.16) 1px, transparent 1px);
          background-size: 10% 10%;
          opacity: 0.22;
        }

        .authoring-block {
          z-index: 31;
          border: 1px solid rgba(255, 227, 139, 0.92);
          border-radius: 8px;
          background: rgba(255, 215, 118, 0.28);
          box-shadow: 0 0 24px rgba(255, 215, 118, 0.32), inset 0 0 12px rgba(255, 255, 255, 0.16);
          pointer-events: auto;
          cursor: grab;
        }

        .authoring-block:active {
          cursor: grabbing;
        }

        .authoring-handle-layer {
          position: absolute;
          inset: 0;
          z-index: 34;
          pointer-events: none;
        }

        .author-handle {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 18px;
          height: 18px;
          transform: translate(-50%, -50%);
          border: 2px solid rgba(255,255,255,0.92);
          border-radius: 50%;
          background: rgba(6, 13, 20, 0.72);
          color: #fff;
          font: 900 9px/1 Inter, Segoe UI, system-ui, sans-serif;
          box-shadow: 0 0 0 2px rgba(0,0,0,0.32), 0 0 16px rgba(255,255,255,0.24);
          pointer-events: auto;
          cursor: grab;
        }

        .author-handle:active {
          cursor: grabbing;
        }

        .handle-node {
          border-color: rgba(91, 213, 255, 0.96);
          z-index: 36;
        }

        .handle-actor {
          width: 24px;
          height: 24px;
          border-color: rgba(70, 193, 255, 0.98);
          background: rgba(18, 82, 128, 0.72);
          z-index: 38;
        }

        .handle-target {
          width: 24px;
          height: 24px;
          border-color: rgba(255, 92, 66, 0.98);
          background: rgba(114, 28, 18, 0.74);
          z-index: 38;
        }

        .handle-mask {
          border-color: rgba(255, 228, 142, 0.98);
          background: rgba(103, 74, 18, 0.72);
          z-index: 35;
        }

        .handle-occluder {
          border-color: rgba(171, 255, 194, 0.96);
          background: rgba(24, 91, 47, 0.74);
          z-index: 34;
        }

        .authoring-panel {
          position: absolute;
          right: 18px;
          top: 18px;
          z-index: 40;
          width: min(360px, calc(100vw - 36px));
          max-height: calc(100vh - 36px);
          overflow: auto;
          padding: 14px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(5, 12, 18, 0.84);
          box-shadow: 0 24px 60px rgba(0,0,0,0.42), inset 0 1px rgba(255,255,255,0.1);
          backdrop-filter: blur(12px);
        }

        .authoring-title {
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 1.2px;
          text-transform: uppercase;
          margin-bottom: 10px;
        }

        .authoring-buttons {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .authoring-buttons button {
          min-height: 32px;
          padding: 0 10px;
          border-radius: 999px;
          border: 1px solid rgba(184, 219, 255, 0.22);
          background: rgba(15, 28, 42, 0.88);
          color: #f5fbff;
          font: 850 11px/1 Inter, Segoe UI, system-ui, sans-serif;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          cursor: pointer;
        }

        .authoring-buttons button.active {
          border-color: rgba(255, 218, 132, 0.82);
          background: rgba(93, 58, 13, 0.88);
        }

        .authoring-panel p {
          margin: 10px 0;
          color: rgba(245,251,255,0.72);
          font-size: 12px;
          line-height: 1.35;
        }

        .authoring-selection {
          margin: 8px 0;
          padding: 7px 9px;
          border-radius: 8px;
          background: rgba(104, 207, 255, 0.09);
          color: #aeeeff;
          font: 850 11px/1 Consolas, "SFMono-Regular", monospace;
        }

        .authoring-panel output {
          display: block;
          white-space: pre-wrap;
          max-height: 220px;
          overflow: auto;
          padding: 10px;
          border-radius: 8px;
          background: rgba(0,0,0,0.32);
          color: #d6f6ff;
          font: 11px/1.35 Consolas, "SFMono-Regular", monospace;
        }

        .actions {
          position: absolute;
          left: max(18px, 3.4vw);
          bottom: max(18px, 3.1vh);
          z-index: 20;
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .chip {
          min-height: 42px;
          padding: 0 16px;
          border-radius: 999px;
          border: 1px solid rgba(184, 219, 255, 0.28);
          background: linear-gradient(180deg, rgba(11, 24, 38, 0.84), rgba(4, 9, 16, 0.94));
          color: #f5fbff;
          box-shadow: 0 16px 34px rgba(0,0,0,0.34), inset 0 1px rgba(255,255,255,0.12);
          font: 950 12px/1 Inter, Segoe UI, system-ui, sans-serif;
          letter-spacing: 1.4px;
          text-transform: uppercase;
          cursor: pointer;
        }

        .chip:hover {
          border-color: rgba(255, 218, 132, 0.72);
          transform: translateY(-1px);
        }

        .chip:disabled {
          color: rgba(245,251,255,0.36);
          border-color: rgba(184,219,255,0.1);
          cursor: default;
          transform: none;
        }

        .mode-move .move-chip,
        .mode-shoot .shoot-chip {
          border-color: rgba(255, 205, 111, 0.86);
          background: linear-gradient(180deg, rgba(77, 45, 13, 0.9), rgba(22, 12, 3, 0.95));
        }

        @keyframes camera-hit {
          0%, 100% { transform: translate(-50%, -50%) scale(1); filter: saturate(1.02) contrast(1.01); }
          36% { transform: translate(calc(-50% - 7px), calc(-50% + 4px)) scale(1.01); filter: saturate(1.24) contrast(1.06); }
          58% { transform: translate(calc(-50% + 6px), calc(-50% - 3px)) scale(1.012); }
        }

        @media (min-aspect-ratio: 2 / 1) {
          @keyframes camera-hit {
            0%, 100% { transform: translateY(-50%) scale(1); filter: saturate(1.02) contrast(1.01); }
            36% { transform: translate(-7px, calc(-50% + 4px)) scale(1.01); filter: saturate(1.24) contrast(1.06); }
            58% { transform: translate(6px, calc(-50% - 3px)) scale(1.012); }
          }
        }

        @keyframes invalid-shake {
          0%, 100% { transform: translate(-50%, -50%); }
          35% { transform: translate(calc(-50% - 7px), -50%); }
          70% { transform: translate(calc(-50% + 6px), -50%); }
        }

        @media (min-aspect-ratio: 2 / 1) {
          @keyframes invalid-shake {
            0%, 100% { transform: translateY(-50%); }
            35% { transform: translate(-7px, -50%); }
            70% { transform: translate(6px, -50%); }
          }
        }

        @keyframes feedback-pop {
          0%, 100% { transform: translateX(-50%) scale(1); }
          50% { transform: translateX(-50%) scale(1.04); }
        }

        @keyframes tile-pulse {
          0%, 100% { box-shadow: 0 0 24px rgba(89, 213, 255, 0.3); }
          50% { box-shadow: 0 0 44px rgba(89, 213, 255, 0.52); }
        }

        @keyframes shot-flash {
          0%, 14% { opacity: 0; transform: scaleX(0.18); }
          34% { opacity: 1; transform: scaleX(1); }
          100% { opacity: 0; transform: scaleX(1); }
        }
      `}</style>

      <div className="feedback" data-testid="board-duel-feedback">{boardDuelPhaseCopy[phase]}</div>
      <output className="event-probe" data-testid="board-duel-latest-event">{events[0]?.type ?? 'none'}</output>
      <div
        ref={frameRef}
        className="concept-frame"
        style={{
          '--board-image': `url(${boardLayer.imageUrl})`,
          '--board-aspect': `${runtimeBoard.aspectRatio}`,
          '--tile-width': `${runtimeBoard.scene.projection.tileWidth}%`,
          '--tile-aspect': `${runtimeBoard.scene.projection.tileAspect}`,
          '--tile-rotate': `${runtimeBoard.scene.projection.rotate}deg`,
          '--tile-skew': `${runtimeBoard.scene.projection.skewX}deg`,
        } as CSSProperties}
        onClick={handleFrameClick}
        onPointerMove={handleFramePointerMove}
        onPointerUp={stopDraggingBlock}
        onPointerCancel={stopDraggingBlock}
      >
        {runtimeBoard.scene.layers.filter((layer) => layer.role !== 'base').map((layer) => (
          <div
            key={layer.id}
            className={`scene-image-layer layer-${layer.role}`}
            data-layer-id={layer.id}
            style={{
              backgroundImage: `url(${layer.imageUrl})`,
              opacity: layer.opacity ?? 1,
            }}
            aria-hidden="true"
          />
        ))}
        {runtimeBoard.scene.bakedUnitMasks.map((mask) => (
          <div
            key={mask.id}
            className={`scene-mask tone-${mask.tone}`}
            data-testid="board-scene-mask"
            data-mask-id={mask.id}
            style={placementStyle(mask)}
            aria-hidden="true"
          />
        ))}
        <svg className="tile-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline points={pathPoints} />
        </svg>
        <svg className="aim-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" style={aimLineStyle}>
          <line x1={shotLine.from.x} y1={shotLine.from.y} x2={shotLine.to.x} y2={shotLine.to.y} />
        </svg>
        <div className="tile-layer" aria-hidden={mode !== 'move'}>
          {runtimeBoard.nodes.map((node) => {
            const reachable = reachableNodeIds.includes(node.id);
            return (
            <button
              key={node.id}
              type="button"
              className={[
                'hotspot',
                'iso-tile',
                node.id === ctNodeId ? 'current' : '',
                mode === 'move' && !reachable && node.id !== ctNodeId ? 'unreachable' : '',
                hoverNodeId === node.id ? 'hovered' : '',
                node.cover ? `cover-${node.cover}` : '',
              ].filter(Boolean).join(' ')}
              style={{ '--tile-x': `${node.anchor.x}%`, '--tile-y': `${node.anchor.y}%` } as CSSProperties}
              data-testid={node.id === 'logs' ? 'board-duel-peek-tile' : 'board-duel-node'}
              data-node-id={node.id}
              aria-label={node.label}
              onMouseEnter={() => {
                if (mode === 'move' && reachable) setHoverNodeId(node.id);
              }}
              onMouseLeave={() => {
                if (hoverNodeId === node.id) setHoverNodeId(null);
              }}
              onClick={(event) => {
                event.stopPropagation();
                handleNodeClick(node.id);
              }}
            />
            );
          })}
        </div>
        {runtimeBoard.actors.map((actor) => {
          const actorNode = actor.id === selectedActor.id
            ? ctNode
            : getBoardNode(runtimeBoard, actor.nodeId);
          if (!actorNode) return null;
          const isDown = downIds.includes(actor.id);
          return (
            <div
              key={actor.id}
              className={[
                'actor-token',
                actor.id === selectedActor.id ? 'unit-token' : 'support-token',
                `team-${actor.team}`,
                `sprite-${actor.sprite.kind}`,
                `facing-${actor.sprite.facing ?? 'right'}`,
                isDown ? 'down' : '',
              ].filter(Boolean).join(' ')}
              style={{
                '--unit-x': `${actorNode.anchor.x}%`,
                '--unit-y': `${actorNode.anchor.y}%`,
                '--unit-scale': `${actor.sprite.scale ?? 1}`,
              } as CSSProperties}
              data-testid="board-actor-token"
              data-actor-id={actor.id}
              aria-hidden="true"
            >
              <span className="actor-shadow" />
              {actor.id === selectedActor.id && <span className="unit-chevron" />}
              <img
                className="actor-image"
                src={getSpriteImageUrl(actor.sprite, isDown)}
                alt=""
                draggable={false}
              />
            </div>
          );
        })}
        {runtimeBoard.targets.map((candidate) => {
          const isDown = downIds.includes(candidate.id);
          return (
            <div
              key={candidate.id}
              className={[
                'actor-token',
                'target-token',
                `team-${candidate.team}`,
                `sprite-${candidate.sprite.kind}`,
                `facing-${candidate.sprite.facing ?? 'right'}`,
                isDown ? 'down' : '',
              ].filter(Boolean).join(' ')}
              style={{
                '--unit-x': `${candidate.anchor.x}%`,
                '--unit-y': `${candidate.anchor.y}%`,
                '--unit-scale': `${candidate.sprite.scale ?? 1}`,
              } as CSSProperties}
              data-testid="board-target-token"
              data-target-id={candidate.id}
              aria-hidden="true"
            >
              <span className="actor-shadow" />
              <img
                className="actor-image"
                src={getSpriteImageUrl(candidate.sprite, isDown)}
                alt=""
                draggable={false}
              />
            </div>
          );
        })}
        {runtimeBoard.scene.foregroundOccluders.map((occluder) => (
          <div
            key={occluder.id}
            className={`foreground-occluder tone-${occluder.tone}`}
            data-testid="board-foreground-occluder"
            data-occluder-id={occluder.id}
            style={{
              ...placementStyle(occluder),
              opacity: occluder.opacity ?? 1,
            }}
            aria-hidden="true"
          />
        ))}
        {authoringBlocks.map((block) => (
          <button
            key={block.id}
            type="button"
            className={`authoring-block block-${block.kind}`}
            data-testid="board-author-block"
            data-block-id={block.id}
            style={placementStyle(block)}
            aria-label={block.label}
            onPointerDown={(event) => {
              if (!isAuthoring) return;
              event.stopPropagation();
              event.currentTarget.setPointerCapture(event.pointerId);
              setSelectedAuthorItem(`block:${block.id}`);
              setAuthorDrag({ kind: 'block', id: block.id });
            }}
            onClick={(event) => event.stopPropagation()}
          />
        ))}
        {isAuthoring && (
          <div className="authoring-handle-layer" aria-label="Board package authoring handles">
            {runtimeBoard.nodes.map((node) => (
              <button
                key={node.id}
                type="button"
                className="author-handle handle-node"
                style={pointHandleStyle(node.anchor)}
                data-testid="board-author-node-handle"
                data-author-id={node.id}
                aria-label={`Move node ${node.label}`}
                onPointerDown={beginAuthorDrag({ kind: 'node', id: node.id })}
                onClick={(event) => event.stopPropagation()}
              >
                {node.id === ctNodeId ? 'A' : ''}
              </button>
            ))}
            {runtimeBoard.actors.map((actor) => {
              const actorNode = getBoardNode(runtimeBoard, actor.nodeId);
              if (!actorNode) return null;
              return (
                <button
                  key={actor.id}
                  type="button"
                  className="author-handle handle-actor"
                  style={pointHandleStyle(actorNode.anchor)}
                  data-testid="board-author-actor-handle"
                  data-author-id={actor.id}
                  aria-label={`Move actor anchor ${actor.label}`}
                  onPointerDown={beginAuthorDrag({ kind: 'node', id: actor.nodeId })}
                  onClick={(event) => event.stopPropagation()}
                />
              );
            })}
            {runtimeBoard.targets.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className="author-handle handle-target"
                style={pointHandleStyle(candidate.anchor)}
                data-testid="board-author-target-handle"
                data-author-id={candidate.id}
                aria-label={`Move target ${candidate.label}`}
                onPointerDown={beginAuthorDrag({ kind: 'target', id: candidate.id })}
                onClick={(event) => event.stopPropagation()}
              />
            ))}
            {runtimeBoard.scene.bakedUnitMasks.map((mask) => (
              <button
                key={mask.id}
                type="button"
                className="author-handle handle-mask"
                style={pointHandleStyle(mask.anchor)}
                data-testid="board-author-mask-handle"
                data-author-id={mask.id}
                aria-label={`Move mask ${mask.label}`}
                onPointerDown={beginAuthorDrag({ kind: 'mask', id: mask.id })}
                onClick={(event) => event.stopPropagation()}
              />
            ))}
            {runtimeBoard.scene.foregroundOccluders.map((occluder) => (
              <button
                key={occluder.id}
                type="button"
                className="author-handle handle-occluder"
                style={pointHandleStyle(occluder.anchor)}
                data-testid="board-author-occluder-handle"
                data-author-id={occluder.id}
                aria-label={`Move occluder ${occluder.label}`}
                onPointerDown={beginAuthorDrag({ kind: 'occluder', id: occluder.id })}
                onClick={(event) => event.stopPropagation()}
              />
            ))}
          </div>
        )}
        <button
          type="button"
          className="hotspot ct-hotspot"
          data-testid="board-duel-ct"
          aria-label="Counter-terrorist anchor"
          style={placementStyle(actorHotspot)}
          onClick={(event) => {
            event.stopPropagation();
            if (!isBusy && !isRoundComplete) {
              if (mode !== 'idle') {
                pushEvent(createBoard2d5Event('invalid', 'Invalid actor command.', {
                  actorId: selectedActor.id,
                  fromNodeId: ctNodeId,
                }));
                setPhase('invalid');
                return;
              }
              setMode('idle');
              setPhase('ready');
            }
          }}
        />
        <button
          type="button"
          className="hotspot target-hotspot"
          data-testid="board-duel-target"
          aria-label={phase === 'contact' ? `Trade ${target.label}, ${target.hitChance} percent` : target.label}
          disabled={isRoundComplete}
          style={placementStyle(target.hotspot)}
          onClick={(event) => {
            event.stopPropagation();
            if (phase === 'contact') {
              beginTrade();
            } else {
              fireShot();
            }
          }}
        />
        <div
          className="casualty-marker"
          style={{ '--target-x': `${target.anchor.x}%`, '--target-y': `${target.anchor.y}%` } as CSSProperties}
          aria-hidden="true"
        />
        <div className="shot-flash" />
      </div>

      {isAuthoring && (
        <aside className="authoring-panel" data-testid="board-author-panel" onClick={(event) => event.stopPropagation()}>
          <div className="authoring-title">Board authoring</div>
          <div className="authoring-buttons">
            <button
              type="button"
              className={authorTool === 'inspect' ? 'active' : ''}
              onClick={() => setAuthorTool('inspect')}
            >
              Inspect
            </button>
            <button
              type="button"
              className={authorTool === 'cover' ? 'active' : ''}
              data-testid="board-author-place-cover"
              onClick={() => setAuthorTool('cover')}
            >
              Place cover
            </button>
            <button
              type="button"
              data-testid="board-author-clear"
              onClick={() => setAuthoringBlocks([])}
            >
              Clear
            </button>
            <button
              type="button"
              data-testid="board-author-reset-edits"
              onClick={() => {
                setEditedNodeAnchors({});
                setEditedTargetAnchors({});
                setEditedMaskAnchors({});
                setEditedOccluderAnchors({});
                setAuthoringBlocks([]);
                setSelectedAuthorItem('none');
              }}
            >
              Reset edits
            </button>
          </div>
          <p>Drag node, actor, target, mask, and occluder handles. Use Place cover for temporary package blocks.</p>
          <div className="authoring-selection" data-testid="board-author-selected">{selectedAuthorItem}</div>
          <output data-testid="board-author-export">{authoringExport}</output>
        </aside>
      )}

      <div className="actions" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="chip move-chip" data-testid="board-duel-move" disabled={phase !== 'ready' || isBusy} onClick={beginMove}>
          Move contact
        </button>
        <button type="button" className="chip shoot-chip" data-testid="board-duel-shoot" disabled={phase !== 'contact' || isBusy} onClick={beginTrade}>
          Trade {target.hitChance}%
        </button>
        <button type="button" className="chip" data-testid="board-duel-reset" onClick={reset}>
          Reset
        </button>
      </div>
    </main>
  );
}
