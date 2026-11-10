// Moving a panel sticks it to other panels' planes: in the plane it moves in
// (the floor, or the face it is placed on), every panel shows as lines (a
// panel standing across the plane: its two faces; a panel lying in it: its
// edges). A moving line that comes within reach of a parallel target line
// snaps onto it, so faces end up flush and edges in line; two such snaps in
// different directions hold the panel in both.
import type { Design, Frame, P2 } from './types';
import { frameNormal, toLocal, toWorld } from './frame';
import { panelEdges } from './edges';
import { tOf } from './materials';
import { netRoot } from './place';

export type Seg = [P2, P2];

/** The panels that move with `ids`: everything in their nets, and panels placed on any of them. */
export function moverSet(d: Design, ids: string[]): Set<string> {
  const roots = new Set(ids.map((id) => netRoot(d, id)));
  const out = new Set(d.order.filter((id) => roots.has(netRoot(d, id))));
  for (let grew = true; grew; ) {
    grew = false;
    for (const id of d.order) {
      const host = d.panels[id]?.place?.host;
      if (!out.has(id) && host && out.has(host)) {
        for (const x of d.order) if (netRoot(d, x) === netRoot(d, id) && !out.has(x)) out.add(x);
        out.add(id);
        grew = true;
      }
    }
  }
  return out;
}

/** The lines panels make in the plane of frame `F` (its local x, y). */
export function planeLines(d: Design, F: Frame, keep: (id: string) => boolean): Seg[] {
  const nF = frameNormal(F);
  const out: Seg[] = [];
  for (const id of d.order) {
    const P = d.panels[id];
    if (!P || !keep(id)) continue;
    const nP = frameNormal(P.frame);
    const k = Math.abs(nP[0] * nF[0] + nP[1] * nF[1] + nP[2] * nF[2]);
    const ring = panelEdges(P);
    if (k > 0.999) {
      // lying in the plane: its edges
      for (const e of ring) out.push([toLocal(F, toWorld(P.frame, e.a.x, e.a.y)), toLocal(F, toWorld(P.frame, e.b.x, e.b.y))]);
    } else if (k < 0.02) {
      // standing across it: each face is a line (the longest stretch of its outline seen from above)
      for (const z of [0, tOf(d, id)]) {
        const pts = ring.map((e) => toLocal(F, toWorld(P.frame, e.a.x, e.a.y, z)));
        let best: Seg | null = null, len = 0;
        for (let i = 0; i < pts.length; i++)
          for (let j = i + 1; j < pts.length; j++) {
            const l = Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
            if (l > len) [best, len] = [[pts[i], pts[j]], l];
          }
        if (best && len > 1) out.push(best);
      }
    }
  }
  return out;
}

export type FlushSnap = { dx: number; dy: number; lines: Seg[] };

/**
 * Snap a move (dx, dy in the plane) so that moving lines land on parallel
 * target lines within `tol`: the nearest such contact, then the nearest in
 * another direction. Null when nothing is within reach.
 */
export function snapFlush(moving: Seg[], targets: Seg[], dx: number, dy: number, tol: number): FlushSnap | null {
  type C = { n: P2; dist: number; line: Seg };
  const cands: C[] = [];
  for (const t of targets) {
    const tx = t[1].x - t[0].x, ty = t[1].y - t[0].y, L = Math.hypot(tx, ty);
    if (L < 1e-6) continue;
    const u = { x: tx / L, y: ty / L }, n = { x: -u.y, y: u.x };
    for (const m0 of moving) {
      const m: Seg = [{ x: m0[0].x + dx, y: m0[0].y + dy }, { x: m0[1].x + dx, y: m0[1].y + dy }];
      const mx = m[1].x - m[0].x, my = m[1].y - m[0].y, ml = Math.hypot(mx, my);
      if (ml < 1e-6 || Math.abs(mx * n.x + my * n.y) / ml > Math.sin(Math.PI / 180)) continue;
      const dist = (t[0].x - m[0].x) * n.x + (t[0].y - m[0].y) * n.y;
      if (Math.abs(dist) > tol) continue;
      // the two lines must overlap along their length (or nearly)
      const s0 = (m[0].x - t[0].x) * u.x + (m[0].y - t[0].y) * u.y, s1 = (m[1].x - t[0].x) * u.x + (m[1].y - t[0].y) * u.y;
      if (Math.max(s0, s1) < -tol || Math.min(s0, s1) > L + tol) continue;
      cands.push({ n, dist, line: t });
    }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => Math.abs(a.dist) - Math.abs(b.dist));
  const c1 = cands[0];
  const c2 = cands.find((c) => Math.abs(c.n.x * c1.n.x + c.n.y * c1.n.y) < 0.5);
  if (!c2) return { dx: dx + c1.n.x * c1.dist, dy: dy + c1.n.y * c1.dist, lines: [c1.line] };
  // both: the shift s with s·n1 = d1 and s·n2 = d2
  const det = c1.n.x * c2.n.y - c1.n.y * c2.n.x;
  const sx = (c1.dist * c2.n.y - c2.dist * c1.n.y) / det, sy = (c1.n.x * c2.dist - c2.n.x * c1.dist) / det;
  return { dx: dx + sx, dy: dy + sy, lines: [c1.line, c2.line] };
}
