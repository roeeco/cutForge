// The grow ghost as the grow card and the stage both see it: the joint, the
// part of the edge, and the outline (edited by hand on the ghost, or trimmed to
// what it would run into when adapting is on).
import type { Design, Panel, WallSketch } from '../model/types';
import { growKind, type GrowOptions } from '../store/store';
import { fromHinge } from '../model/hinge';
import { defaultOffset, seatingOf } from '../model/ops';
import { adaptiveSketch, edgeFreeSpans, ghostNeighbours, ghostPanel } from '../model/adapt';
import { edgeLength } from '../model/frame';
import { findEdge } from '../model/edges';

export type EffectiveGrow = {
  kind: ReturnType<typeof growKind>;
  angle: number;
  dir: 'up' | 'down';
  offset: number;
  span: [number, number] | null;
  /** The outline that will be committed (hand edits, else the adaptive trim when on), or null for a plain rectangle. */
  sketch: WallSketch | null;
  adaptive: WallSketch | null;
  ghost: Panel | null;
  /** The ghost before any outline change (for snapping). */
  plain: Panel | null;
};

export function effectiveGrow(d: Design, parentId: string, edge: string, grow: GrowOptions): EffectiveGrow {
  const kind = growKind(d, grow);
  const { angle, dir } = fromHinge(grow.angle);
  const parent = d.panels[parentId];
  const offset = defaultOffset(d, kind);
  let span: [number, number] | null = grow.span ?? null;
  if (!span && parent && findEdge(parent, edge) && offset === 0) {
    // the largest free stretch; the whole edge stays "no span"
    const L = edgeLength(parent, edge);
    const free = edgeFreeSpans(d, parentId, edge);
    const best = free.reduce<[number, number] | null>((b, x) => (!b || x[1] - x[0] > b[1] - b[0] ? x : b), null);
    if (best && !(best[0] < 1e-6 && best[1] > L - 1e-6)) span = best;
  }
  const spec = { height: grow.height, angle, dir, kind, offset, seating: seatingOf(kind), span };
  const plain = ghostPanel(d, parentId, edge, spec);
  const adaptive = grow.adapt !== false && plain ? adaptiveSketch(d, plain, ghostNeighbours(d, parentId)) : null;
  const sketch = grow.sketch ?? adaptive;
  const ghost = sketch ? ghostPanel(d, parentId, edge, { ...spec, sketch }) : plain;
  return { kind, angle, dir, offset, span, sketch, adaptive, ghost, plain };
}
