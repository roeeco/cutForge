// The grow ghost as the grow card and the stage both see it: the joint, the
// part of the edge, and the outline (edited by hand on the ghost, or trimmed to
// what it would run into when adapting is on).
import type { Design, Panel, WallSketch } from '../model/types';
import { growKind, useStore, type GrowOptions } from '../store/store';
import { fromHinge } from '../model/hinge';
import { defaultOffset, growPanel, seatingOf } from '../model/ops';
import { connectionsFor, matOf } from '../model/materials';
import { designKind } from '../model/jointDefaults';
import { netOverlaps } from '../model/pieces';
import type { ConnectionKind } from '../model/types';
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
  const kind = growKind(d, grow, parentId);
  const { angle, dir } = fromHinge(grow.angle);
  const parent = d.panels[parentId];
  const offset = defaultOffset(d, kind, parentId);
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

/**
 * Grow the panel the grow ghost shows (its ✓): one undo step, then the new
 * panel is selected. `own` grows it as its own piece (a joint that is not a
 * fold), when a fold would make its net overlap when flat (milestone 35).
 */
export function doGrow(panelId: string, edge: string, own?: ConnectionKind): string | null {
  const st = useStore.getState();
  const grow = st.grow;
  const d0 = st.design;
  const effKind = own ?? growKind(d0, grow, panelId);
  const eg = effectiveGrow(d0, panelId, edge, grow);
  const { angle, dir } = fromHinge(grow.angle);
  let res: ReturnType<typeof growPanel> = null;
  st.apply((d) => {
    // a joint the student did not pick follows the design's (or the material's) default whenever the angle allows
    const m = matOf(d, panelId);
    const sq = connectionsFor(m, 90);
    const pref = own ?? (grow.kind && grow.kind === effKind ? effKind : (designKind(d, 'base', sq, m.kind) ?? sq[0]));
    res = growPanel(d, panelId, edge, { height: grow.height, angle, dir, kind: effKind, pref, span: eg.span, sketch: eg.sketch });
  });
  const r = res as ReturnType<typeof growPanel>;
  if (r) st.select({ kind: 'panel', id: r.panelId });
  return r?.panelId ?? null;
}

/**
 * Would growing this fold make its net overlap when it lies flat (milestone
 * 35)? The overlapping panels, from a copy of the design with the panel grown.
 */
export function growOverlap(d: Design, panelId: string, edge: string, grow: GrowOptions): string[] {
  const eg = effectiveGrow(d, panelId, edge, grow);
  if (eg.kind !== 'fold') return [];
  const copy: Design = JSON.parse(JSON.stringify(d));
  const { angle, dir } = fromHinge(grow.angle);
  const r = growPanel(copy, panelId, edge, { height: grow.height, angle, dir, kind: 'fold', span: eg.span, sketch: eg.sketch });
  if (!r) return [];
  return netOverlaps(copy)
    .filter((o) => o.a === r.panelId || o.b === r.panelId)
    .map((o) => (o.a === r.panelId ? o.b : o.a));
}

/** The joint a panel grown as its own piece uses: the design's wall-to-base kind if it is not a fold, else glue on card, tabs and slots on corrugated. */
export function ownGrowKind(d: Design, panelId: string): ConnectionKind {
  const m = matOf(d, panelId);
  const ok = connectionsFor(m, 90).filter((k) => k !== 'fold');
  return designKind(d, 'base', ok, m.kind) ?? (m.kind === 'card' ? 'glue' : 'tabslot');
}
