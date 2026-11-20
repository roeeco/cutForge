// The Net view's picking (milestone 113, DIELINE_DNA_PLAN.md D1): every
// straight edge of every board in a net, in the copy's own coordinates (its
// bounding box's corner at 0, 0), with what it is: free to grow from or flap,
// a fold (and which), or another joint. Pure, so it is tested without a browser.
import type { Design } from '../model/types';
import type { Vec2, Xform2 } from '../geom/types';
import type { PieceCopy } from '../model/pack';
import { applyX, composeX, invertX } from '../geom/vec';
import { pieceCopies } from '../model/pack';
import { growWith } from './ghost';
import type { GrowOptions } from '../store/store';
import { findEdge, isCurveKey, panelEdges } from '../model/edges';
import { edgeHasRoom } from '../model/adapt';
import { foldHolds } from '../model/pieces';
import { featuresOnEdge, type EdgeFeatureKindId } from '../model/edgeFeatures';

export type NetEdge = { panelId: string; key: string; a: Vec2; b: Vec2; free: boolean; foldId?: string; jointId?: string; features: EdgeFeatureKindId[] };
export type FoldChip = { foldId: string; at: Vec2; dirDeg: number; angle: number; valley: boolean };

/** The edges of a net's boards, in copy coordinates. */
export function netEdges(d: Design, copy: PieceCopy): NetEdge[] {
  const out: NetEdge[] = [];
  const conns = Object.values(d.connections);
  const o = copy.origin;
  for (const n of copy.panels) {
    const p = d.panels[n.panelId];
    if (!p) continue;
    for (const e of panelEdges(p)) {
      if (isCurveKey(e.key)) continue;
      const on = (pid: string, edge: string) => pid === p.id && edge !== 'face' && findEdge(p, edge)?.key === e.key;
      const fold = conns.find((c) => foldHolds(d, c) && (on(c.a.panelId, c.a.edge) || on(c.b.panelId, c.b.edge)));
      const joint = fold ? undefined : conns.find((c) => on(c.a.panelId, c.a.edge) || on(c.b.panelId, c.b.edge));
      const A = applyX(n.xf, e.a), B = applyX(n.xf, e.b);
      out.push({
        panelId: p.id,
        key: e.key,
        a: { x: A.x - o.x, y: A.y - o.y },
        b: { x: B.x - o.x, y: B.y - o.y },
        free: !fold && !joint && edgeHasRoom(d, p.id, e.key),
        ...(fold ? { foldId: fold.id } : {}),
        ...(joint ? { jointId: joint.id } : {}),
        features: featuresOnEdge(d, p.id, e.key).map((h) => h.kind),
      });
    }
  }
  return out;
}

/** One chip per fold in a net: at the middle of its crease, with its angle and whether it is a valley or a mountain fold. */
export function foldChips(d: Design, copy: PieceCopy): FoldChip[] {
  // every contour of a fold (a perforated fold is many dashes), gathered by its id
  const by = new Map<string, Vec2[]>();
  const dir = new Map<string, number>();
  for (const tc of copy.contours) {
    const id = tc.ref?.foldId;
    if (!id || tc.contour.closed || !tc.contour.segs.length || !d.connections[id]) continue;
    const pts = by.get(id) ?? [];
    for (const sg of tc.contour.segs) pts.push(sg.a, sg.b);
    by.set(id, pts);
    if (!dir.has(id)) {
      const sg = tc.contour.segs[0];
      dir.set(id, (Math.atan2(sg.b.y - sg.a.y, sg.b.x - sg.a.x) * 180) / Math.PI);
    }
  }
  const out: FoldChip[] = [];
  for (const [id, pts] of by) {
    const c = d.connections[id];
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    out.push({ foldId: id, at: { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }, dirDeg: dir.get(id) ?? 0, angle: c.angle, valley: (c.foldDir ?? 'valley') === 'valley' });
  }
  return out;
}

/**
 * Where a grow's new board lies in a net (milestone 114, D2): grown on a copy
 * of the design exactly as ✓ would grow it, then read from that copy's net
 * and brought into the shown net through the parent board (its place in the
 * net may move when the net gets a new board). Copy coordinates; null when the
 * grow makes nothing. `own`: the new board is cut as a piece of its own (not a
 * fold), so it is drawn beside its edge, outside the net.
 */
export type NetGhost = { pts: Vec2[]; own: boolean; xf: Xform2 };
const ghostCache = new Map<string, NetGhost | null>();
export function ghostInNet(d: Design, copy: PieceCopy, panelId: string, edge: string, grow: GrowOptions): NetGhost | null {
  const parentXf = copy.panels.find((n) => n.panelId === panelId)?.xf;
  if (!parentXf) return null;
  const key = JSON.stringify([panelId, edge, grow, copy.key]);
  const hit = ghostCache.get(key);
  // (the cache is per design object: cleared when the design changes)
  if (hit !== undefined && ghostCacheOf === d) return hit;
  if (ghostCacheOf !== d) {
    ghostCache.clear();
    ghostCacheOf = d;
  }
  const work = JSON.parse(JSON.stringify(d)) as Design;
  let r: ReturnType<typeof growWith> = null;
  try {
    r = growWith(work, panelId, edge, grow);
  } catch {
    r = null;
  }
  const P = r && work.panels[r.panelId];
  let out: NetGhost | null = null;
  if (r && P) {
    const net = pieceCopies(work).find((c) => c.copy === 0 && c.panels.some((n) => n.panelId === panelId));
    const pW = net?.panels.find((n) => n.panelId === panelId)?.xf;
    const nW = net?.panels.find((n) => n.panelId === r!.panelId)?.xf;
    const ring = panelEdges(P).map((e) => e.a);
    if (pW && nW) {
      // new board → its net → the parent's own frame → the shown net
      const xf = composeX(parentXf, composeX(invertX(pW), nW));
      out = { pts: ring.map((q) => applyX(xf, q)).map((q) => ({ x: q.x - copy.origin.x, y: q.y - copy.origin.y })), own: false, xf };
    } else {
      // a piece of its own: drawn flat beside the edge it grows from, as if folded out flat
      const e = findEdge(d.panels[panelId], edge);
      if (e) {
        const L = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) || 1;
        const ux = (e.b.x - e.a.x) / L, uy = (e.b.y - e.a.y) / L;
        // outward (away from the board): the right-hand normal of a counter-clockwise ring
        const nx = uy, ny = -ux;
        const gap = 6;
        const xfLocal: Xform2 = { tx: e.a.x + nx * gap, ty: e.a.y + ny * gap, rot: Math.atan2(uy, ux) };
        const xf = composeX(parentXf, xfLocal);
        out = { pts: ring.map((q) => applyX(xf, q)).map((q) => ({ x: q.x - copy.origin.x, y: q.y - copy.origin.y })), own: true, xf };
      }
    }
  }
  if (ghostCache.size > 50) ghostCache.clear();
  ghostCache.set(key, out);
  return out;
}
let ghostCacheOf: Design | null = null;
