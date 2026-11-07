// Pieces: one connected flat outline to cut. Panels joined by folds form one
// flat net (unfolded about their fold lines); everything else is separate.
import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';
import type { Design, P2 } from './types';
import type { TaggedContour, Xform2 } from '../geom/types';
import { applyX, composeX, IDENTITY, polygonArea, polygonContour, xformContour, L } from '../geom/vec';
import { edgeInwardLocal, edgeLocal } from './frame';
import { cleanPolygon, detailContours, panelExtras, panelNotches, panelOutline } from './geometry';

export type NetPanel = { panelId: string; xf: Xform2 };
export type Piece = { key: string; panels: NetPanel[]; contours: TaggedContour[] };

/** Rigid unfolding of a folded child into its parent's coordinates. */
export function foldXform(parent: { w: number; h: number }, edge: number, allowance: number): Xform2 {
  const [A, B] = edgeLocal(parent, edge);
  const l = Math.hypot(B.x - A.x, B.y - A.y);
  const U = { x: (B.x - A.x) / l, y: (B.y - A.y) / l };
  const i = edgeInwardLocal(edge);
  const O = { x: -i.x, y: -i.y };
  const det = U.x * O.y - U.y * O.x;
  const tx = A.x + O.x * allowance, ty = A.y + O.y * allowance;
  // child x runs along U and child y along O (outward); mirror when that is a reflection
  return det > 0 ? { tx, ty, rot: Math.atan2(U.y, U.x) } : { tx, ty, rot: Math.atan2(-U.y, -U.x), mirror: true };
}

/** Panel groups joined by folds, each listed from its root (the earliest panel). */
export function netGroups(d: Design): NetPanel[][] {
  const folds = Object.values(d.connections).filter((c) => c.grown && c.kind === 'fold' && d.panels[c.a.panelId] && d.panels[c.b.panelId]);
  const inNet = new Set<string>();
  const groups: NetPanel[][] = [];
  for (const id of d.order) {
    if (!d.panels[id] || inNet.has(id)) continue;
    // a fold child is reached from its parent
    if (folds.some((c) => c.b.panelId === id)) continue;
    const group: NetPanel[] = [{ panelId: id, xf: IDENTITY }];
    inNet.add(id);
    for (let i = 0; i < group.length; i++) {
      const { panelId, xf } = group[i];
      for (const c of folds) {
        if (c.a.panelId !== panelId || inNet.has(c.b.panelId)) continue;
        group.push({ panelId: c.b.panelId, xf: composeX(xf, foldXform(d.panels[panelId], c.a.edge, d.material.foldAllowance)) });
        inNet.add(c.b.panelId);
      }
    }
    groups.push(group);
  }
  return groups;
}

const toRing = (pts: P2[]): [number, number][] => {
  const ccw = polygonArea(pts) >= 0 ? pts : [...pts].reverse();
  // snap to a 1e-7 mm grid so panels that touch exactly also touch after transforms
  const q = (x: number) => Math.round(x * 1e7) / 1e7;
  return ccw.map((p) => [q(p.x), q(p.y)]);
};

export function buildPieces(d: Design): Piece[] {
  return netGroups(d).map((g) => groupPiece(d, g));
}

/** One panel on its own (solo view): its outline, joints and details, no fold partners. */
export function panelPiece(d: Design, panelId: string): Piece {
  return groupPiece(d, [{ panelId, xf: IDENTITY }]);
}

function groupPiece(d: Design, group: NetPanel[]): Piece {
  const folds = Object.values(d.connections).filter((c) => c.grown && c.kind === 'fold');
  {
    const polys: Polygon[] = [];
    const contours: TaggedContour[] = [];
    const ids = new Set(group.map((g) => g.panelId));
    for (const { panelId, xf } of group) {
      const p = d.panels[panelId];
      const tf = (q: P2) => applyX(xf, q);
      polys.push([toRing(panelOutline(p, panelNotches(d, p)).map(tf))]);
      const ex = panelExtras(d, p);
      for (const a of ex.adds) polys.push([toRing(a.map(tf))]);
      for (const h of ex.holes) contours.push({ op: 'cut', role: 'hole', contour: polygonContour(h.map(tf)), ref: { panelId } });
      for (const s of ex.scores) contours.push({ op: 'score', role: 'line', contour: { closed: false, segs: [L(tf(s.a), tf(s.b))] }, ref: { panelId } });
      for (const dt of p.details)
        for (const dc of detailContours(dt)) {
          const contour = xformContour(xf, dc);
          const ref = { panelId, detailId: dt.id };
          if (dt.op === 'cut') contours.push({ op: 'cut', role: 'hole', contour, ref });
          else if (dt.op === 'engrave') contours.push({ op: 'engrave', role: 'fill', contour, ref });
          else contours.push({ op: 'score', role: 'line', contour, ref });
        }
    }
    // fold strips (fold allowance) and their score lines
    for (const c of folds) {
      if (!ids.has(c.a.panelId) || !ids.has(c.b.panelId)) continue;
      const parent = d.panels[c.a.panelId];
      const xf = group.find((g) => g.panelId === parent.id)!.xf;
      const [A, B] = edgeLocal(parent, c.a.edge);
      const i = edgeInwardLocal(c.a.edge);
      const al = d.material.foldAllowance;
      const off = (q: P2, k: number) => applyX(xf, { x: q.x - i.x * k, y: q.y - i.y * k });
      if (al > 1e-9) polys.push([toRing([off(A, 0), off(B, 0), off(B, al), off(A, al)])]);
      contours.push({ op: 'score', role: 'line', contour: { closed: false, segs: [L(off(A, al / 2), off(B, al / 2))] }, ref: { panelId: c.b.panelId, foldId: c.id } });
    }
    const merged: MultiPolygon = polys.length === 1 ? [polys[0]] : polygonClipping.union(polys[0], ...polys.slice(1));
    const outer: TaggedContour[] = [];
    for (const poly of merged) {
      poly.forEach((ring, ri) => {
        const pts = cleanPolygon(ring.slice(0, ring[ring.length - 1][0] === ring[0][0] && ring[ring.length - 1][1] === ring[0][1] ? -1 : undefined).map(([x, y]) => ({ x, y })));
        if (pts.length < 3) return;
        outer.push({ op: 'cut', role: ri === 0 ? 'outer' : 'hole', contour: polygonContour(pts), ref: { panelId: group[0].panelId } });
      });
    }
    // the largest outer ring first (packing and selection use contours[0])
    outer.sort((a, b) => (b.role === 'outer' ? 1 : 0) - (a.role === 'outer' ? 1 : 0));
    return { key: group[0].panelId, panels: group, contours: [...outer, ...contours] };
  }
}

/** The piece a panel is cut as part of (the root of its folded net). */
export function pieceKeyOf(d: Design, panelId: string): string {
  let id = panelId;
  for (let i = 0; i < 1000; i++) {
    const c = Object.values(d.connections).find((x) => x.grown && x.kind === 'fold' && x.b.panelId === id);
    if (!c) return id;
    id = c.a.panelId;
  }
  return id;
}
