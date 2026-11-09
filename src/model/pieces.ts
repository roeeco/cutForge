// Pieces: one connected flat outline to cut. Panels joined by folds form one
// flat net (unfolded about their fold lines); everything else is separate.
import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';
import { safeDifference, safeUnion } from '../geom/clip';
import type { Design, P2, Panel } from './types';
import type { EdgeArg } from './edges';
import type { TaggedContour, Xform2 } from '../geom/types';
import { applyX, composeX, flattenContour, IDENTITY, pointInPolygon, polygonArea, polygonContour, xformContour, L } from '../geom/vec';
import { holeCuts, ownOutline } from './outline';
import { throughRegions } from './through';
import { edgeInwardLocal, edgeLocal } from './frame';
import { cleanPolygon, detailContours, panelExtras, panelNotches, panelOutline } from './geometry';
import { matIdOf, matOf } from './materials';

export type NetPanel = { panelId: string; xf: Xform2 };
/**
 * One connected outline to cut. A panel (or folded net) that its cuts split
 * into several fragments gives one piece per fragment: the largest keeps the
 * net's key, the others are `<key>~2`, `<key>~3` …; `frag` numbers them.
 */
export type Piece = { key: string; panels: NetPanel[]; contours: TaggedContour[]; frag?: { i: number; n: number } };

/** The net (and quantity) a piece key belongs to: fragments share their net's. */
export const pieceRoot = (key: string) => key.split('~')[0];

/** Rigid unfolding of a folded child into its parent's coordinates. */
export function foldXform(parent: Pick<Panel, 'w' | 'h' | 'sketch'>, edge: EdgeArg, allowance: number, s0 = 0): Xform2 {
  const [A0, B] = edgeLocal(parent, edge);
  const l = Math.hypot(B.x - A0.x, B.y - A0.y);
  const U = { x: (B.x - A0.x) / l, y: (B.y - A0.y) / l };
  // a child on part of the edge starts s0 along it
  const A = s0 ? { x: A0.x + U.x * s0, y: A0.y + U.y * s0 } : A0;
  const i = edgeInwardLocal(parent, edge);
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
        group.push({ panelId: c.b.panelId, xf: composeX(xf, foldXform(d.panels[panelId], c.a.edge, matOf(d, panelId).foldAllowance, c.span && !c.trayId ? Math.min(...c.span) : 0)) });
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
  return netGroups(d).flatMap((g) => groupPieces(d, g));
}

/** One panel on its own (solo view): its outline, joints and details, no fold partners. */
export function panelPiece(d: Design, panelId: string): Piece {
  const ps = groupPieces(d, [{ panelId, xf: IDENTITY }]);
  return ps.length === 1 ? ps[0] : { ...ps[0], contours: ps.flatMap((p) => p.contours), frag: undefined };
}

function groupPieces(d: Design, group: NetPanel[]): Piece[] {
  const folds = Object.values(d.connections).filter((c) => c.grown && c.kind === 'fold');
  {
    const polys: Polygon[] = [];
    const contours: TaggedContour[] = [];
    const ids = new Set(group.map((g) => g.panelId));
    for (const { panelId, xf } of group) {
      const p = d.panels[panelId];
      const tf = (q: P2) => applyX(xf, q);
      const own = ownOutline(p);
      const notches = panelNotches(d, p);
      const ex = panelExtras(d, p);
      const square = Math.abs(Math.sin(2 * xf.rot)) < 1e-12;
      if (square || !ex.adds.length) {
        for (const ring of own.rings) polys.push([toRing(panelOutline(p, notches, ring).map(tf))]);
        for (const a of ex.adds) polys.push([toRing(a.map(tf))]);
      } else {
        // turned by an angle that is not square: join the panel and its own additions (flaps, fold-over rim and liner)
        // in its exact local coordinates first, so rounding after the turn cannot leave hairline gaps between them
        const local: Polygon[] = [...own.rings.map((ring) => [toRing(panelOutline(p, notches, ring))] as Polygon), ...ex.adds.map((a) => [toRing(a)] as Polygon)];
        for (const poly of safeUnion(local)) polys.push(poly.map((r) => toRing(r.slice(0, -1).map(([x, y]) => tf({ x, y })))) as Polygon);
      }
      for (const h of own.holes) contours.push({ op: 'cut', role: 'hole', contour: polygonContour(h.map(tf)), ref: { panelId } });
      for (const h of [...ex.holes, ...ex.linerHoles]) contours.push({ op: 'cut', role: 'hole', contour: polygonContour(h.map(tf)), ref: { panelId } });
      for (const s of ex.scores) contours.push({ op: 'score', role: 'line', contour: { closed: false, segs: [L(tf(s.a), tf(s.b))] }, ref: { panelId } });
      const holes = new Map(holeCuts(p).map((h) => [h.dt.id, h.contours]));
      for (const dt of p.details) {
        // Adds and Cuts across the edge are part of the outline already
        if (dt.op === 'add') continue;
        for (const dc of dt.op === 'cut' ? (holes.get(dt.id) ?? []) : detailContours(dt)) {
          const contour = xformContour(xf, dc);
          const ref = { panelId, detailId: dt.id };
          if (dt.op === 'cut') contours.push({ op: 'cut', role: 'hole', contour, ref });
          else if (dt.op === 'engrave') contours.push({ op: 'engrave', role: 'fill', contour, ref });
          else contours.push({ op: 'score', role: 'line', contour, ref });
        }
      }
    }
    // fold strips (fold allowance) and their score lines
    for (const c of folds) {
      if (!ids.has(c.a.panelId) || !ids.has(c.b.panelId)) continue;
      const parent = d.panels[c.a.panelId];
      const xf = group.find((g) => g.panelId === parent.id)!.xf;
      let [A, B] = edgeLocal(parent, c.a.edge);
      if (c.span && !c.trayId) {
        // the fold strip runs along the part of the edge the child stands on
        const l = Math.hypot(B.x - A.x, B.y - A.y), ux = (B.x - A.x) / l, uy = (B.y - A.y) / l;
        const [s0, s1] = [Math.min(...c.span), Math.max(...c.span)];
        [A, B] = [{ x: A.x + ux * s0, y: A.y + uy * s0 }, { x: A.x + ux * s1, y: A.y + uy * s1 }];
      }
      const i = edgeInwardLocal(parent, c.a.edge);
      const al = matOf(d, parent.id).foldAllowance;
      const off = (q: P2, k: number) => applyX(xf, { x: q.x - i.x * k, y: q.y - i.y * k });
      // on a sloped edge the strip overlaps both panels a hair, so the union joins them despite float noise
      const sloped = Math.abs(B.x - A.x) > 1e-9 && Math.abs(B.y - A.y) > 1e-9;
      const ov = sloped ? 1e-5 : 0;
      if (al > 1e-9) polys.push([toRing([off(A, -ov), off(B, -ov), off(B, al + ov), off(A, al + ov)])]);
      contours.push({ op: 'score', role: 'line', contour: { closed: false, segs: [L(off(A, al / 2), off(B, al / 2))] }, ref: { panelId: c.b.panelId, foldId: c.id } });
    }
    let merged: MultiPolygon = safeUnion(polys);
    // material joints remove past a corner (layer 7)
    const cutPolys: Polygon[] = [];
    for (const { panelId, xf } of group) {
      for (const k of panelExtras(d, d.panels[panelId]).cuts) cutPolys.push([toRing(k.map((q) => applyX(xf, q)))]);
      // through-cuts from other panels (layer 5)
      for (const k of throughRegions(d, panelId)) cutPolys.push([toRing(k.map((q) => applyX(xf, q)))]);
    }
    if (cutPolys.length) merged = safeDifference(merged, cutPolys);
    const ringContours = (poly: Polygon): TaggedContour[] => {
      const out: TaggedContour[] = [];
      poly.forEach((ring, ri) => {
        const pts = cleanPolygon(ring.slice(0, ring[ring.length - 1][0] === ring[0][0] && ring[ring.length - 1][1] === ring[0][1] ? -1 : undefined).map(([x, y]) => ({ x, y })));
        if (pts.length < 3) return;
        out.push({ op: 'cut', role: ri === 0 ? 'outer' : 'hole', contour: polygonContour(pts), ref: { panelId: group[0].panelId } });
      });
      return out;
    };
    const key = group[0].panelId;
    if (!merged.length) return []; // removed by a cut: flagged, not cut
    if (merged.length < 2) {
      const outer = merged.flatMap(ringContours);
      // the largest outer ring first (packing and selection use contours[0])
      outer.sort((a, b) => (b.role === 'outer' ? 1 : 0) - (a.role === 'outer' ? 1 : 0));
      return [{ key, panels: group, contours: [...outer, ...contours] }];
    }
    // the panel's cuts split it: one piece per fragment, largest first, each with the lines inside it
    const frags = merged
      .map((poly) => ({ poly, own: ringContours(poly), ring: poly[0].map(([x, y]) => ({ x, y })) }))
      .filter((f) => f.own.length)
      .sort((a, b) => Math.abs(polygonArea(b.ring)) - Math.abs(polygonArea(a.ring)));
    const parts: Piece[] = frags.map((f, i) => ({ key: i ? `${key}~${i + 1}` : key, panels: group, contours: [...f.own], frag: { i: i + 1, n: frags.length } }));
    for (const c of contours) {
      const pts = flattenContour(c.contour, 0.05);
      const q = c.contour.closed && pts.length > 2 ? { x: pts.reduce((s2, v) => s2 + v.x, 0) / pts.length, y: pts.reduce((s2, v) => s2 + v.y, 0) / pts.length } : pts[Math.floor(pts.length / 2)];
      let k = frags.findIndex((f) => pointInPolygon(q, f.ring));
      if (k < 0) k = frags.findIndex((f) => pts.some((v) => pointInPolygon(v, f.ring)));
      if (k >= 0) parts[k].contours.push(c);
    }
    return parts;
  }
}

/** The material id a piece is cut from (its root board's; a fold net is one material). */
export function pieceMat(d: Design, pieceKey: string): string {
  return matIdOf(d, pieceRoot(pieceKey));
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

/** Two panels of one fold net that overlap when the net lies flat (milestone 35). */
export type NetOverlap = { a: string; b: string; area: number; region: P2[][]; net: string };

/** A panel as it lies in its flat net: its outline (joints applied) and what it adds (flaps, fold-over rim and liner), in net coordinates. */
export function flatPanel(d: Design, panelId: string, xf: Xform2): MultiPolygon {
  const p = d.panels[panelId];
  if (!p) return [];
  const notches = panelNotches(d, p);
  const polys: Polygon[] = ownOutline(p).rings.map((ring) => [toRing(panelOutline(p, notches, ring))] as Polygon);
  for (const a of panelExtras(d, p).adds) polys.push([toRing(a)]);
  const local = safeUnion(polys);
  return local.map((poly) => poly.map((r) => r.map(([x, y]) => {
    const q = applyX(xf, { x, y });
    return [q.x, q.y] as [number, number];
  })));
}

const ringArea = (r: [number, number][]) => {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length];
    s += x0 * y1 - x1 * y0;
  }
  return Math.abs(s) / 2;
};
const multiArea = (m: MultiPolygon) => m.reduce((s, poly) => s + poly.reduce((t, r, i) => t + (i ? -1 : 1) * ringArea(r), 0), 0);
const mbox = (m: MultiPolygon) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of m) for (const [x, y] of poly[0] ?? []) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
  return { x0, y0, x1, y1 };
};

/**
 * Panels of a fold net that overlap when it lies flat (milestone 35): each
 * panel flattened with its additions, intersected pair by pair. Overlaps of
 * at least `min` mm² are returned with their area and region (net coordinates).
 */
export function netOverlaps(d: Design, min = 0.5, only?: (g: NetPanel[]) => boolean): NetOverlap[] {
  const out: NetOverlap[] = [];
  for (const g of netGroups(d)) {
    if (g.length < 2 || (only && !only(g))) continue;
    const flats = g.map((n) => ({ id: n.panelId, m: flatPanel(d, n.panelId, n.xf) })).filter((f) => f.m.length);
    const boxes = flats.map((f) => mbox(f.m));
    for (let i = 0; i < flats.length; i++)
      for (let j = i + 1; j < flats.length; j++) {
        const A = boxes[i], B = boxes[j];
        if (A.x0 > B.x1 || B.x0 > A.x1 || A.y0 > B.y1 || B.y0 > A.y1) continue;
        let r: MultiPolygon = [];
        try {
          r = polygonClipping.intersection(flats[i].m, flats[j].m);
        } catch {
          continue;
        }
        const area = multiArea(r);
        if (area >= min) out.push({ a: flats[i].id, b: flats[j].id, area, region: r.map((poly) => poly[0].slice(0, -1).map(([x, y]) => ({ x, y }))), net: g[0].panelId });
      }
  }
  return out;
}
