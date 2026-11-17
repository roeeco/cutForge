// Smart snapping in a panel's own coordinates. Targets: the panel's corners,
// edge midpoints and centre; other shapes' corners, edge midpoints, centres
// (array copies included); alignment with any of those; equal spacing between
// neighbouring shapes. The geometry being manipulated is excluded. The
// tolerance comes from the view (a fixed number of screen pixels).
// Snapping creates no relationship: it only adjusts the value being dragged.
import { facingTargets } from './match';
import type { Design, P2, V3 } from './types';
import { detailCorners, detailInstances } from './geometry';

export type Guide = { a: P2; b: P2; kind: 'align' | 'gap' };
export type SnapResult = { dx: number; dy: number; guides: Guide[]; targets: P2[] };
type Box = { minX: number; maxX: number; minY: number; maxY: number };

export type SnapContext = { points: P2[]; boxes: Box[]; panel: Box };

export function snapContext(d: Design, panelId: string, exclude: Set<string>): SnapContext | null {
  const p = d.panels[panelId];
  if (!p) return null;
  const points: P2[] = [];
  const boxPts = (b: Box) => {
    const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
    points.push(
      { x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY }, { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY },
      { x: cx, y: b.minY }, { x: b.maxX, y: cy }, { x: cx, y: b.maxY }, { x: b.minX, y: cy },
      { x: cx, y: cy },
    );
  };
  const panel = { minX: 0, minY: 0, maxX: p.w, maxY: p.h };
  // the panel's own outline: its vertices and edge midpoints (a gable's apex, a polygon's corners), and its centre;
  // on a rectangle these are the same nine points as its box
  const ring = panelEdges(p);
  // a curve gives its ends, not its flattened points
  for (const e of ring) {
    if (!isCurveKey(e.key)) points.push({ x: e.a.x, y: e.a.y }, { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 });
    else if (/~0(#|$)/.test(e.key)) points.push({ x: e.a.x, y: e.a.y });
  }
  points.push({ x: p.w / 2, y: p.h / 2 });
  const boxes: Box[] = [];
  for (const dt of p.details) {
    if (exclude.has(dt.id)) continue;
    for (const i of detailInstances(dt)) {
      if (i.rot && i.shape !== 'circle') {
        // a turned shape: its own corners, edge midpoints and centre; its box (rotated bounds) for spacing
        const cs = detailCorners(i);
        for (let k = 0; k < 4; k++) points.push(cs[k], { x: (cs[k].x + cs[(k + 1) % 4].x) / 2, y: (cs[k].y + cs[(k + 1) % 4].y) / 2 });
        points.push({ x: i.cx, y: i.cy });
        boxes.push({ minX: Math.min(...cs.map((q) => q.x)), maxX: Math.max(...cs.map((q) => q.x)), minY: Math.min(...cs.map((q) => q.y)), maxY: Math.max(...cs.map((q) => q.y)) });
        continue;
      }
      const b = { minX: i.cx - i.w / 2, maxX: i.cx + i.w / 2, minY: i.cy - i.h / 2, maxY: i.cy + i.h / 2 };
      boxes.push(b);
      boxPts(b);
    }
  }
  // a through-cut being moved or resized: the panels in its path, seen in its own plane
  const through = [...exclude].map((id) => p.details.find((dt) => dt.id === id)).find((dt) => dt?.op === 'cut' && dt.through);
  if (through) for (const q of throughTargets(d, panelId, through.id)) points.push(q);
  return { points, boxes, panel };
}

/**
 * Snap targets from the panels a through-cut passes through, projected along
 * the cut direction into the source panel's plane: their outline vertices and
 * edge midpoints, and their shapes' corners and centres. Edge-on panels (the
 * cut runs within their plane) give none.
 */
export function throughTargets(d: Design, panelId: string, detailId: string): P2[] {
  const S = d.panels[panelId];
  if (!S) return [];
  const n = frameNormal(S.frame);
  const out: P2[] = [];
  const back = (w: [number, number, number]) => {
    const lam = (w[0] - S.frame.o[0]) * n[0] + (w[1] - S.frame.o[1]) * n[1] + (w[2] - S.frame.o[2]) * n[2];
    return toLocal(S.frame, [w[0] - n[0] * lam, w[1] - n[1] * lam, w[2] - n[2] * lam]);
  };
  for (const id of panelsCutBy(d, detailId)) {
    const P = d.panels[id];
    if (!P || Math.abs(n[0] * frameNormal(P.frame)[0] + n[1] * frameNormal(P.frame)[1] + n[2] * frameNormal(P.frame)[2]) < 1e-6) continue;
    for (const e of panelEdges(P)) {
      out.push(back(toWorld(P.frame, e.a.x, e.a.y)), back(toWorld(P.frame, (e.a.x + e.b.x) / 2, (e.a.y + e.b.y) / 2)));
    }
    for (const dt of P.details)
      for (const i of detailInstances(dt)) {
        const cs = i.rot && i.shape !== 'circle' ? detailCorners(i) : [{ x: i.cx - i.w / 2, y: i.cy - i.h / 2 }, { x: i.cx + i.w / 2, y: i.cy - i.h / 2 }, { x: i.cx + i.w / 2, y: i.cy + i.h / 2 }, { x: i.cx - i.w / 2, y: i.cy + i.h / 2 }];
        for (const q of [...cs, { x: i.cx, y: i.cy }]) out.push(back(toWorld(P.frame, q.x, q.y)));
      }
  }
  return out;
}

type Cand = { delta: number; guides: Guide[]; target?: P2 };

function best(cands: Cand[], tol: number): Cand | null {
  let b: Cand | null = null;
  for (const c of cands) if (Math.abs(c.delta) <= tol && (!b || Math.abs(c.delta) < Math.abs(b.delta) - 1e-9)) b = c;
  if (!b) return null;
  // merge guides of other candidates giving the same delta (several alignments at once)
  const same = cands.filter((c) => c !== b && Math.abs(c.delta - b!.delta) < 1e-6);
  return { ...b, guides: [...b.guides, ...same.flatMap((c) => c.guides)] };
}

/** Candidates along one axis for anchors (values of the moving thing). */
function axisCands(ctx: SnapContext, anchors: { v: number; other: number }[], axis: 'x' | 'y'): Cand[] {
  const out: Cand[] = [];
  for (const a of anchors)
    for (const p of ctx.points) {
      const tv = axis === 'x' ? p.x : p.y, to = axis === 'x' ? p.y : p.x;
      const delta = tv - a.v;
      const g: Guide = axis === 'x' ? { a: { x: tv, y: to }, b: { x: tv, y: a.other }, kind: 'align' } : { a: { x: to, y: tv }, b: { x: a.other, y: tv }, kind: 'align' };
      out.push({ delta, guides: [g], target: p });
    }
  return out;
}

/** Equal-spacing candidates for a box moving along one axis among neighbours in its row/column. */
function gapCands(ctx: SnapContext, box: Box, axis: 'x' | 'y'): Cand[] {
  const lo = (b: Box) => (axis === 'x' ? b.minX : b.minY), hi = (b: Box) => (axis === 'x' ? b.maxX : b.maxY);
  const olo = (b: Box) => (axis === 'x' ? b.minY : b.minX), ohi = (b: Box) => (axis === 'x' ? b.maxY : b.maxX);
  const row = ctx.boxes.filter((b) => ohi(b) > olo(box) && olo(b) < ohi(box));
  const c = (lo(box) + hi(box)) / 2, size = hi(box) - lo(box);
  const left = row.filter((b) => hi(b) <= c).sort((a, b) => hi(b) - hi(a));
  const right = row.filter((b) => lo(b) >= c).sort((a, b) => lo(a) - lo(b));
  const mid = (olo(box) + ohi(box)) / 2;
  const seg = (a: number, b: number): Guide => (axis === 'x' ? { a: { x: a, y: mid }, b: { x: b, y: mid }, kind: 'gap' } : { a: { x: mid, y: a }, b: { x: mid, y: b }, kind: 'gap' });
  const out: Cand[] = [];
  const L = left[0], R = right[0];
  if (L && R) {
    const start = (hi(L) + lo(R) - size) / 2;
    if (start >= hi(L)) out.push({ delta: start - lo(box), guides: [seg(hi(L), start), seg(start + size, lo(R))] });
  }
  if (L && left[1]) {
    const g = lo(L) - hi(left[1]);
    if (g > 0) out.push({ delta: hi(L) + g - lo(box), guides: [seg(hi(left[1]), lo(L)), seg(hi(L), hi(L) + g)] });
  }
  if (R && right[1]) {
    const g = lo(right[1]) - hi(R);
    if (g > 0) out.push({ delta: lo(R) - g - size - lo(box), guides: [seg(hi(R), lo(right[1])), seg(lo(R) - g, lo(R))] });
  }
  return out;
}

/** Snap a moving box (shape being moved). */
export function snapBox(ctx: SnapContext, box: Box, tol: number): SnapResult {
  const cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2;
  const bx = best([...axisCands(ctx, [{ v: box.minX, other: cy }, { v: cx, other: cy }, { v: box.maxX, other: cy }], 'x'), ...gapCands(ctx, box, 'x')], tol);
  const by = best([...axisCands(ctx, [{ v: box.minY, other: cx }, { v: cy, other: cx }, { v: box.maxY, other: cx }], 'y'), ...gapCands(ctx, box, 'y')], tol);
  return finish(bx, by);
}

/** Snap a single point (drawing, resizing a corner). */
export function snapPoint(ctx: SnapContext, p: P2, tol: number): SnapResult {
  const bx = best(axisCands(ctx, [{ v: p.x, other: p.y }], 'x'), tol);
  const by = best(axisCands(ctx, [{ v: p.y, other: p.x }], 'y'), tol);
  return finish(bx, by);
}

function finish(bx: Cand | null, by: Cand | null): SnapResult {
  const dx = bx?.delta ?? 0, dy = by?.delta ?? 0;
  // guides are drawn after the move: shift the moving end of x-guides by dy and y-guides by dx
  const guides = [
    ...(bx?.guides ?? []).map((g) => (g.kind === 'align' ? { ...g, b: { x: g.b.x, y: g.b.y + dy } } : { a: { x: g.a.x, y: g.a.y + dy }, b: { x: g.b.x, y: g.b.y + dy }, kind: g.kind })),
    ...(by?.guides ?? []).map((g) => (g.kind === 'align' ? { ...g, b: { x: g.b.x + dx, y: g.b.y } } : { a: { x: g.a.x + dx, y: g.a.y }, b: { x: g.b.x + dx, y: g.b.y }, kind: g.kind })),
  ];
  const targets = [bx?.target, by?.target].filter((x): x is P2 => !!x);
  return { dx, dy, guides, targets };
}

// ---------------------------------------------------------------------------
// Floor panels (milestone 17): a floor panel being moved snaps its outline to
// other floor panels' corners and edges (on the floor, world x/z), not just to
// the grid. Like shape snapping, this only adjusts the move.

import { isCurveKey, panelEdges, sketchRing } from './edges';
import { frameNormal, matDir, toLocal, toWorld } from './frame';
import { panelsCutBy } from './through';
import { tOf } from './materials';
import { FLOOR_FRAME, faceOut } from './place';

type F2 = { x: number; z: number };
export type FloorSnap = { dx: number; dz: number; guides: [F2, F2][] };

const isRoot = (d: Design, id: string) => !Object.values(d.connections).some((c) => c.grown && c.b.panelId === id);
const floorRing = (d: Design, id: string): F2[] => {
  const p = d.panels[id];
  return panelEdges(p).map((e) => {
    const w = toWorld(p.frame, e.a.x, e.a.y);
    return { x: w[0], z: w[2] };
  });
};

/**
 * Snap the move (dx, dz) of floor panel `id` (measured from `base`, the design
 * at the start of the drag). Corners onto corners win; otherwise up to two
 * edge lines (a corner onto another panel's edge, or a corner of another
 * panel onto one of this panel's edges) are combined. Null: nothing near.
 */
export function snapFloor(base: Design, id: string, dx: number, dz: number, tol: number): FloorSnap | null {
  if (!base.panels[id]) return null;
  const mine = floorRing(base, id).map((q) => ({ x: q.x + dx, z: q.z + dz }));
  const others = base.order.filter((o) => o !== id && base.panels[o] && isRoot(base, o) && Math.abs(base.panels[o].frame.o[1] - base.panels[id].frame.o[1]) < 1e-6).map((o) => floorRing(base, o));
  if (!others.length) return null;
  // corner onto corner
  let bestV: { d: F2; dist: number; g: [F2, F2] } | null = null;
  for (const ring of others)
    for (const t of ring)
      for (const v of mine) {
        const dist = Math.hypot(t.x - v.x, t.z - v.z);
        if (dist <= tol && (!bestV || dist < bestV.dist)) bestV = { d: { x: t.x - v.x, z: t.z - v.z }, dist, g: [t, t] };
      }
  if (bestV) return { dx: dx + bestV.d.x, dz: dz + bestV.d.z, guides: [bestV.g] };
  // a point onto a line: the move along the line's normal
  type Line = { n: F2; off: number; g: [F2, F2] };
  const lines: Line[] = [];
  const onto = (pts: F2[], ring: F2[], sign: number) => {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      if (L < 1e-9) continue;
      const t = { x: (b.x - a.x) / L, z: (b.z - a.z) / L }, n = { x: -t.z, z: t.x };
      for (const v of pts) {
        const s = (v.x - a.x) * t.x + (v.z - a.z) * t.z;
        if (s < -tol || s > L + tol) continue;
        const off = (v.x - a.x) * n.x + (v.z - a.z) * n.z;
        if (Math.abs(off) <= tol) lines.push({ n, off: -sign * off, g: [a, b] });
      }
    }
  };
  for (const ring of others) {
    onto(mine, ring, 1);
    for (let i = 0; i < mine.length; i++) onto(ring, [mine[i], mine[(i + 1) % mine.length]], -1);
  }
  if (!lines.length) return null;
  lines.sort((p, q) => Math.abs(p.off) - Math.abs(q.off));
  const l1 = lines[0];
  const l2 = lines.find((l) => Math.abs(l.n.x * l1.n.z - l.n.z * l1.n.x) > 0.1);
  if (!l2) return { dx: dx + l1.n.x * l1.off, dz: dz + l1.n.z * l1.off, guides: [l1.g] };
  // both: n1·δ = off1, n2·δ = off2
  const det = l1.n.x * l2.n.z - l1.n.z * l2.n.x;
  const ddx = (l1.off * l2.n.z - l1.n.z * l2.off) / det, ddz = (l1.n.x * l2.off - l1.off * l2.n.x) / det;
  return { dx: dx + ddx, dz: dz + ddz, guides: [l1.g, l2.g] };
}

// ---------------------------------------------------------------------------
// Outline editing: a vertex being dragged snaps to corners (the outline's own
// other vertices, and corners of panels lying in or standing on this panel's
// plane), then onto edges (its own non-adjacent edges and those panels'
// edges), then into line (x or y) with its own other vertices. In the
// panel's local coordinates.

export type OutlineTargets = { corners: P2[]; edges: [P2, P2][]; align: P2[] };
/** `fixed`: the coordinates the snap set (the others are free for the grid). */
export type OutlineSnap = { p: P2; kind: 'corner' | 'edge' | 'align' | null; target: P2 | null; guides: Guide[]; fixed: { x: boolean; y: boolean } };


/** Targets for dragging the outline vertex now at `moving` (in the design at the start of the drag). */
export function outlineTargets(d: Design, panelId: string, moving: P2): OutlineTargets {
  const S = d.panels[panelId];
  const out: OutlineTargets = { corners: [], edges: [], align: [] };
  if (!S) return out;
  const t = tOf(d, panelId);
  const same = (q: P2) => Math.hypot(q.x - moving.x, q.y - moving.y) < 1e-6;
  // own outline: vertices (the start of a curve, not its flattened points), and edges not touching the moving point
  const own = sketchRing(S);
  for (const e of own) {
    const k = e.key.match(/~(\d+)/);
    if (!same(e.a) && (!k || k[1] === '0')) {
      out.corners.push(e.a);
      out.align.push(e.a);
    }
    if (!same(e.a) && !same(e.b) && !isCurveKey(e.key)) out.edges.push([e.a, e.b]);
  }
  // other panels in this plane or standing on it: within a thickness of the slab, seen from above
  const m = matDir(S.frame);
  const near = (w: V3) => {
    const s = (w[0] - S.frame.o[0]) * m[0] + (w[1] - S.frame.o[1]) * m[1] + (w[2] - S.frame.o[2]) * m[2];
    return s >= -t - 0.05 && s <= 2 * t + 0.05;
  };
  for (const id of d.order) {
    const P = d.panels[id];
    if (!P || id === panelId) continue;
    for (const e of panelEdges(P))
      for (const z of [0, tOf(d, id)]) {
        const wa = toWorld(P.frame, e.a.x, e.a.y, z), wb = toWorld(P.frame, e.b.x, e.b.y, z);
        const na = near(wa), nb = near(wb);
        const a = toLocal(S.frame, wa), b = toLocal(S.frame, wb);
        if (na) out.corners.push(a);
        if (na && nb && Math.hypot(b.x - a.x, b.y - a.y) > 0.5) out.edges.push([a, b]);
      }
  }
  // a parallel wall facing this one (milestone 46): its top outline's points, projected onto this wall
  for (const q of facingTargets(d, panelId)) if (!same(q)) out.corners.push(q);
  return out;
}

/** Snap a dragged outline vertex at `l` (local), within `tol` mm. */
export function snapOutlinePoint(tg: OutlineTargets, l: P2, tol: number): OutlineSnap {
  let bc: P2 | null = null, bd = tol;
  for (const q of tg.corners) {
    const dist = Math.hypot(q.x - l.x, q.y - l.y);
    if (dist <= bd) [bc, bd] = [q, dist];
  }
  if (bc) return { p: { x: bc.x, y: bc.y }, kind: 'corner', target: bc, guides: [], fixed: { x: true, y: true } };
  let be: { p: P2; e: [P2, P2] } | null = null;
  bd = tol;
  for (const e of tg.edges) {
    const [a, b] = e;
    const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    if (L2 < 1e-12) continue;
    const s = Math.max(0, Math.min(1, ((l.x - a.x) * (b.x - a.x) + (l.y - a.y) * (b.y - a.y)) / L2));
    const q = { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s };
    const dist = Math.hypot(q.x - l.x, q.y - l.y);
    if (dist <= bd) [be, bd] = [{ p: q, e }, dist];
  }
  if (be) return { p: be.p, kind: 'edge', target: null, guides: [{ a: be.e[0], b: be.e[1], kind: 'align' }], fixed: { x: true, y: true } };
  const ctx: SnapContext = { points: tg.align, boxes: [], panel: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
  const r = snapPoint(ctx, l, tol);
  const fx = r.guides.some((g) => g.a.x === g.b.x && Math.abs(g.a.x - (l.x + r.dx)) < 1e-9), fy = r.guides.some((g) => g.a.y === g.b.y && Math.abs(g.a.y - (l.y + r.dy)) < 1e-9);
  if (!fx && !fy) return { p: l, kind: null, target: null, guides: [], fixed: { x: false, y: false } };
  return { p: { x: l.x + r.dx, y: l.y + r.dy }, kind: 'align', target: null, guides: r.guides, fixed: { x: fx, y: fy } };
}

// ---------------------------------------------------------------------------
// Drawing on a face (milestone 29): the Panel tool's points snap to targets on
// the face (in the host's local coordinates; the floor's for `host` null):
// the host's outline (corners, edge midpoints, centre) and shapes, panels
// already placed flat on that face, and the lines where panels standing on
// the face meet it (both their faces), so a partition drawn wall to wall ends
// exactly on both walls.

export type FaceTargets = { points: P2[]; lines: [P2, P2][] };

export function faceTargets(d: Design, host: string | null, face: 1 | -1): FaceTargets {
  const out: FaceTargets = { points: [], lines: [] };
  const H = host === null ? FLOOR_FRAME : d.panels[host]?.frame;
  if (!H) return out;
  const tH = host === null ? 0 : tOf(d, host);
  const out3 = faceOut(H, host === null ? 1 : face);
  const at = toWorld(H, 0, 0, host === null || face === 1 ? tH : 0);
  const off = (w: V3) => (w[0] - at[0]) * out3[0] + (w[1] - at[1]) * out3[1] + (w[2] - at[2]) * out3[2];
  if (host !== null) {
    const ctx = snapContext(d, host, new Set());
    if (ctx) out.points.push(...ctx.points);
  }
  const nH = frameNormal(H);
  for (const id of d.order) {
    const P = d.panels[id];
    if (!P || id === host) continue;
    const tP = tOf(d, id);
    const ring = panelEdges(P);
    const nP = frameNormal(P.frame);
    const k = Math.abs(nP[0] * nH[0] + nP[1] * nH[1] + nP[2] * nH[2]);
    if (k > 0.999) {
      // lying on this face: its corners (the floor: every panel lying on the floor)
      for (const z of [0, tP]) {
        const pts = ring.map((e) => toWorld(P.frame, e.a.x, e.a.y, z)).filter((w) => Math.abs(off(w)) < 0.05);
        if (pts.length === ring.length) {
          out.points.push(...pts.map((w) => toLocal(H, w)));
          if (host === null) for (let i = 0; i < pts.length; i++) out.lines.push([toLocal(H, pts[i]), toLocal(H, pts[(i + 1) % pts.length])]);
        }
      }
    } else if (k < 0.02) {
      // standing on it (or through it): where each of its faces crosses this face, within its outline
      for (const z of [0, tP]) {
        const pts: P2[] = [];
        for (const e of ring) {
          const wa = toWorld(P.frame, e.a.x, e.a.y, z), wb = toWorld(P.frame, e.b.x, e.b.y, z);
          const fa = off(wa), fb = off(wb);
          if (Math.abs(fa) < 1e-6) pts.push(toLocal(H, wa));
          else if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) {
            const s2 = fa / (fa - fb);
            pts.push(toLocal(H, [wa[0] + (wb[0] - wa[0]) * s2, wa[1] + (wb[1] - wa[1]) * s2, wa[2] + (wb[2] - wa[2]) * s2]));
          }
        }
        if (pts.length < 2) continue;
        let best: [P2, P2] = [pts[0], pts[1]], len = -1;
        for (let i = 0; i < pts.length; i++)
          for (let j = i + 1; j < pts.length; j++) {
            const l = Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
            if (l > len) [best, len] = [[pts[i], pts[j]], l];
          }
        if (len > 1) out.lines.push(best);
      }
    }
  }
  return out;
}

/** Snap a point drawn on a face: onto a target point, else onto a line (a standing wall's face), else null (the grid is the caller's). */
export function snapOnFace(t: FaceTargets, p: P2, tol: number): { p: P2; target: P2 | null; line: [P2, P2] | null } | null {
  let bp: P2 | null = null, bd = tol;
  for (const q of t.points) {
    const dist = Math.hypot(q.x - p.x, q.y - p.y);
    if (dist <= bd) [bp, bd] = [q, dist];
  }
  if (bp) return { p: { x: bp.x, y: bp.y }, target: bp, line: null };
  let bl: { q: P2; l: [P2, P2]; d: number } | null = null;
  for (const l of t.lines) {
    const [a, b] = l;
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1e-9) continue;
    const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
    const s = (p.x - a.x) * ux + (p.y - a.y) * uy;
    if (s < -tol || s > L + tol) continue;
    const q = { x: a.x + ux * s, y: a.y + uy * s };
    const dist = Math.hypot(q.x - p.x, q.y - p.y);
    if (dist <= tol && (!bl || dist < bl.d)) bl = { q, l, d: dist };
  }
  return bl ? { p: bl.q, target: null, line: bl.l } : null;
}
