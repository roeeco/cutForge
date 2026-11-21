// Cartons (milestone 68, PACKAGING_PLAN.md §8.2, §8.3). A tray can be a tube:
// its base only places the walls (`Tray.base 'open'`, never cut), and the
// walls fold off each other in one strip, glued at one corner, the back left
// (the manufacturer's joint). Its ends close with a tuck lid folded off the
// back wall (a real panel the tray keeps, closed by milestone 67's closure),
// four seal flaps, or a snap-lock (1-2-3) bottom; the flaps are derived from
// the tray's choice on every solve, like a closure, as joints of their own.
import type { ConnGeom, Connection, Design, EndFlap, EndSpec, Flap3d, P2, Panel, Tray, V3 } from './types';
import { findEdge, segLength } from './edges';
import { matDir, toLocal, toWorld } from './frame';
import { matOf, tOf } from './materials';
import { v3add, v3cross, v3dot, v3mul, v3norm, v3sub } from '../geom/v3';
import { reachFor } from './closures';

/** A tray's walls in its base's edge order, with the edge each stands on. */
export function trayRing(d: Design, t: Tray): { wall: string; edge: string }[] {
  const base = d.panels[t.baseId];
  if (!base) return [];
  const out: { wall: string; edge: string; at: number }[] = [];
  const keys = base.sketch.kind === 'poly' ? base.sketch.edgeIds : ['e0', 'e1', 'e2', 'e3'];
  for (const c of Object.values(d.connections)) {
    if (!c.grown || c.trayId !== t.id || c.a.panelId !== base.id || !d.panels[c.b.panelId]) continue;
    const k = findEdge(base, c.a.edge)?.key ?? c.a.edge;
    out.push({ wall: c.b.panelId, edge: k, at: keys.indexOf(k.replace(/#\d+$/, '')) });
  }
  return out.sort((a, b) => a.at - b.at).map(({ wall, edge }) => ({ wall, edge }));
}

/** Where a wall's edge is, in its base's coordinates: its middle. */
function edgeMid(base: Panel, key: string): P2 | null {
  const e = findEdge(base, key);
  return e ? { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 } : null;
}

/**
 * An open tray's strip (milestone 68): the walls fold off each other in the
 * base's order, from the wall after the glue seam; the seam is the corner
 * nearest the back left. Set as the tray's fold plan, so each wall's joint
 * with the next becomes a fold (`fixKind`) and the walls lie in one net.
 */
export function planOpenTrays(d: Design) {
  for (const t of Object.values(d.trays ?? {})) {
    if (t.base !== 'open') continue;
    // plywood does not fold (milestone 162): its open tray (a drawer's sleeve) is four boards of their own, fingered at the corners
    if (d.panels[t.baseId] && matOf(d, t.baseId).kind === 'plywood') {
      delete t.fixPlan;
      continue;
    }
    const base = d.panels[t.baseId];
    const ring = trayRing(d, t);
    if (!base || ring.length < 2) {
      delete t.fixPlan;
      continue;
    }
    // the glue seam: the corner (between wall i and wall i+1) nearest the back left
    let seam = 0, best = -Infinity;
    for (let i = 0; i < ring.length; i++) {
      const e = findEdge(base, ring[i].edge);
      if (!e) continue;
      const score = -e.b.x + e.b.y;
      if (score > best) (best = score), (seam = i);
    }
    const hinge: Record<string, string> = {};
    for (let k = 2; k <= ring.length; k++) {
      const cur = ring[(seam + k) % ring.length], prev = ring[(seam + k - 1) % ring.length];
      hinge[cur.edge] = prev.wall;
    }
    t.fixPlan = { hinge };
  }
}

/** The tray's back wall (its edge's middle furthest back) and front wall (furthest forward). */
export function backAndFront(d: Design, t: Tray): { back?: { wall: string; edge: string }; front?: { wall: string; edge: string } } {
  const base = d.panels[t.baseId];
  const ring = trayRing(d, t);
  if (!base || !ring.length) return {};
  const y = (r: { edge: string }) => edgeMid(base, r.edge)?.y ?? 0;
  return { back: ring.reduce((a, b) => (y(b) > y(a) ? b : a)), front: ring.reduce((a, b) => (y(b) < y(a) ? b : a)) };
}

/** The lid a tray's tuck top keeps: its id, grown off the back wall's top edge. */
export const topLidId = (t: Tray) => `${t.id}/top`;

/**
 * Keep the tuck lid of every tray whose top is `tuck` (a real panel folded off
 * the back wall's top edge, at 90°, over the box), and none otherwise. Called
 * by `solve` with the trays' walls; its depth is fitted once frames are
 * placed (`fitTopLids`).
 */
export function reconcileTopLids(d: Design) {
  for (const t of Object.values(d.trays ?? {})) {
    const id = topLidId(t), cid = `${id}/c`;
    const { back } = backAndFront(d, t);
    if (t.top !== 'tuck' || !back) {
      if (d.panels[id] && !d.panels[id].details.length) {
        delete d.panels[id];
        delete d.connections[cid];
        d.order = d.order.filter((x) => x !== id);
        delete d.pieces[id];
      }
      continue;
    }
    const W = d.panels[back.wall];
    if (!d.panels[id]) {
      d.panels[id] = { id, name: `${d.order.length + 1}`, w: W.w, h: 40, sketch: { kind: 'wall' }, frame: W.frame, details: [], ...(W.material ? { material: W.material } : {}) };
      d.order.push(id);
      d.pieces[id] = { quantity: 1 };
    }
    const cur = d.connections[cid];
    if (!cur || cur.a.panelId !== back.wall)
      d.connections[cid] = { id: cid, kind: 'fold', pref: 'fold', a: { panelId: back.wall, edge: 'e2' }, b: { panelId: id, edge: 'e0' }, grown: true, angle: 90, dir: 'up', offset: 0, fingers: null, tabs: null, flap: null, foldDir: 'valley' };
  }
}

/** A tray's tuck lid reaches the front wall's inside face (once frames are placed). */
export function fitTopLids(d: Design) {
  for (const t of Object.values(d.trays ?? {})) {
    if (t.top !== 'tuck') continue;
    const L = d.panels[topLidId(t)];
    const c = d.connections[`${topLidId(t)}/c`];
    if (!L || !c) continue;
    const r = reachFor(d, L, c.a.panelId, c.id);
    if (r) L.h = Math.max(5, r.yIn);
  }
}

// ---------------------------------------------------------------------------
// End flaps

/**
 * Whether the crash-lock (auto) bottom of milestone C3 is offered to students: held back until the owner has
 * confirmed the patent question (SENTENCE_STYLES_PLAN.md §0). The engine still builds it, so a design that has one
 * opens and cuts as before; only the sentence's word, its style and the tray card's option are hidden.
 */
export const CRASH_LOCK_OFFERED = false;

export const endId = (t: Tray, end: 'top' | 'bottom') => `end:${t.id}:${end}`;

const F = (kind: EndFlap['kind'], gap?: number): EndFlap => (gap === undefined ? { kind } : { kind, gap });
const all = (f: EndFlap): EndSpec => ({ front: f, back: f, left: f, right: f });

/**
 * The named end styles as lists of flaps by wall (milestone 149): each draws exactly what its style drew before.
 * `tuck` folds off the front (a reverse tuck), `tuckBack` off the back (a straight tuck). `full` (FEFCO 0203) is the
 * first style that is only a list.
 */
export const END_STYLES: Record<'seal' | 'rsc' | 'full' | 'snap' | 'crash' | 'tuck' | 'tuckBack', EndSpec> = {
  seal: all(F('half')),
  rsc: all(F('rsc')),
  full: all(F('full')),
  snap: { back: F('lock'), left: F('hook'), right: F('hook'), front: F('tongue') },
  crash: { back: F('crash'), front: F('crash'), left: F('half', 1), right: F('half', 1) },
  tuck: { front: F('tuck'), back: F('none'), left: F('dust'), right: F('dust') },
  tuckBack: { back: F('tuck'), front: F('none'), left: F('dust'), right: F('dust') },
};

/** An end's flaps: the tray's own list, else its named style's; null when the end is not closed by flaps. */
export function endSpec(t: Tray, end: 'top' | 'bottom'): EndSpec | null {
  const own = t.ends?.[end];
  if (own) return own;
  if (end === 'top') return t.top === 'seal' || t.top === 'rsc' || t.top === 'full' ? END_STYLES[t.top] : null;
  return t.base === 'open' && t.bottom ? END_STYLES[t.bottom] : null;
}

/** The named style an end's flaps are, when they are one. */
export function endStyleOf(spec: EndSpec): keyof typeof END_STYLES | null {
  const same = (a: EndFlap, b: EndFlap) => a.kind === b.kind && (a.gap ?? null) === (b.gap ?? null);
  for (const [k, v] of Object.entries(END_STYLES)) if ((['front', 'back', 'left', 'right'] as const).every((r) => same(v[r], spec[r]))) return k as keyof typeof END_STYLES;
  return null;
}

/** The ends of each tray that close with flaps (seal ends, snap-lock and reverse-tuck bottoms, and any end given flaps wall by wall). */
export function wantedEnds(d: Design): { id: string; tray: Tray; end: 'top' | 'bottom' }[] {
  const out: { id: string; tray: Tray; end: 'top' | 'bottom' }[] = [];
  for (const t of Object.values(d.trays ?? {})) {
    if (trayRing(d, t).length !== 4) continue;
    // a tuck top is a lid of its own (reconcileTopLids); its flaps are the closure's
    if (t.top !== 'tuck' && endSpec(t, 'top')) out.push({ id: endId(t, 'top'), tray: t, end: 'top' });
    if (t.base === 'open' && endSpec(t, 'bottom')) out.push({ id: endId(t, 'bottom'), tray: t, end: 'bottom' });
  }
  return out;
}

/** Keep a closure joint for every flapped end, and none elsewhere (with the lids' closures, `reconcileClosures`). */
export function reconcileEnds(d: Design) {
  const want = wantedEnds(d);
  const ids = new Set(want.map((w) => w.id));
  for (const c of Object.values(d.connections)) if (c.id.startsWith('end:') && !ids.has(c.id)) delete d.connections[c.id];
  for (const w of want) {
    const ring = trayRing(d, w.tray);
    const a = ring[0].wall, b = ring[2].wall;
    const ex = d.connections[w.id];
    if (ex && ex.a.panelId === a && ex.b.panelId === b) continue;
    d.connections[w.id] = { id: w.id, kind: 'closure', a: { panelId: a, edge: w.end === 'top' ? 'e2' : 'e0' }, b: { panelId: b, edge: 'face' }, grown: false, angle: 90, dir: 'up', offset: 0, fingers: null, tabs: null, flap: null, foldDir: 'valley', auto: true, covers: [] };
  }
}

const empty = (): ConnGeom => ({ edges: [], holes: [], adds: [], scores: [], flaps3d: [] });

/**
 * An end flap's hinge (milestone 148): its wall's end edge, in the wall's coordinates, ordered so that turning the
 * folded flap back by its 90° about it (as `flapMatrix` does with the fold slider, or a picture's pose) lays it in
 * line with its wall, past the edge (`out`: 1 past the top, -1 past the bottom).
 */
export function endHinge(P: Panel, e: { a: P2; b: P2 }, out: number, foldedWorld: V3[], t: number): Pick<Flap3d, 'owner' | 'hinge' | 'angle'> {
  const h0: V3 = [e.a.x, e.a.y, t / 2], h1: V3 = [e.b.x, e.b.y, t / 2];
  if (!foldedWorld.length) return {};
  const W0 = toWorld(P.frame, ...h0), W1 = toWorld(P.frame, ...h1);
  const k = v3norm(v3sub(W1, W0));
  const mid: V3 = [(W0[0] + W1[0]) / 2, (W0[1] + W1[1]) / 2, (W0[2] + W1[2]) / 2];
  const c: V3 = [0, 1, 2].map((i) => foldedWorld.reduce((s, q) => s + q[i], 0) / foldedWorld.length) as V3;
  const r = v3sub(c, mid);
  // turned by -90° about k: r' = -(k × r) + k (k · r)
  const kr = v3dot(k, r);
  const turned = v3add(v3mul(v3cross(k, r), -1), v3mul(k, kr));
  const outW = v3mul(P.frame.v, out);
  return { owner: P.id, angle: 90, hinge: v3dot(turned, outW) >= 0 ? [h0, h1] : [h1, h0] };
}

/**
 * The flaps of a tray's end, on its four walls' top (e2) or bottom (e0)
 * edges, in each wall's coordinates, folded in across the end in 3D (drawn on
 * the base's plane, or at the walls' tops, one layer above the other):
 *   seal   the front and back flaps meet in the middle; the side flaps reach
 *          a little under half the width (glue or tape);
 *   snap   a snap-lock (1-2-3) bottom: the back flap with a notch, the side
 *          flaps hooked at their front ends, the front flap with a tongue that
 *          locks under the back flap. Starting proportions: cut and try them
 *          on the material before a run;
 *   tuck   a reverse tuck bottom: the front wall's flap the whole depth with a
 *          lip, dust flaps on the sides.
 */
export function endGeom(d: Design, c: Connection): ConnGeom | null {
  const w = wantedEnds(d).find((x) => x.id === c.id);
  if (!w) return null;
  const t = w.tray, base = d.panels[t.baseId];
  const { back, front } = backAndFront(d, t);
  if (!base || !back || !front) return null;
  const ring = trayRing(d, t);
  const sides = ring.filter((r) => r.wall !== back.wall && r.wall !== front.wall);
  const B = d.panels[back.wall], F = d.panels[front.wall];
  if (!B || !F || sides.length !== 2) return null;
  const top = w.end === 'top';
  const spec = endSpec(t, w.end);
  if (!spec) return null;
  const g = empty();
  const m = matOf(d, B.id), tW = m.thickness;
  // the box's inside: width (along the front) and depth (front to back)
  const width = F.w, depth = Math.abs(v3dot(v3sub(B.frame.o, F.frame.o), matDir(F.frame))) - tW;
  const mb = matDir(base.frame);
  // how high the end is, along the base's normal (its plane, or the walls' tops)
  const endZ = top ? Math.max(...ring.map((r) => v3dot(v3sub(toWorld(d.panels[r.wall].frame, 0, d.panels[r.wall].h, 0), base.frame.o), mb))) : 0;
  let layer = 0;
  /**
   * A flap out from a wall's end edge: `shape` in (x along the edge, out from it) coordinates.
   * `fold3d`: the part of it folded flat across the end in 3D (default: all of it).
   */
  const flap = (P: Panel, shape: P2[], fold3d: P2[] = shape) => {
    const e = findEdge(P, top ? 'e2' : 'e0');
    if (!e) return;
    const L = segLength(e);
    const sx = (e.b.x - e.a.x) / L, sy = (e.b.y - e.a.y) / L;
    // outward from the wall: up past its top, down past its bottom
    const out = top ? 1 : -1;
    const at = (q: P2): P2 => ({ x: e.a.x + sx * q.x, y: e.a.y + sy * q.x + out * q.y });
    const poly = shape.map(at);
    g.adds.push({ panelId: P.id, poly });
    g.scores.push({ panelId: P.id, a: at({ x: 0, y: 0 }), b: at({ x: L, y: 0 }) });
    // folded in across the end: from the edge, along the wall's material direction (into the box)
    const mP = matDir(P.frame);
    const folded = fold3d.map((q) => {
      const p = at({ x: q.x, y: 0 });
      const wpt = toWorld(P.frame, p.x, p.y, tOf(d, P.id) / 2);
      return toLocal(base.frame, [wpt[0] + mP[0] * q.y, wpt[1] + mP[1] * q.y, wpt[2] + mP[2] * q.y]);
    });
    const z = endZ + (top ? -tW * (layer + 1) : tW * layer);
    g.flaps3d.push({ panelId: base.id, poly: folded, z0: z, z1: z + tW, ...endHinge(P, e, out, fold3d.length ? folded.map((q) => toWorld(base.frame, q.x, q.y, z)) : [], tOf(d, P.id)), endOf: top ? 'top' : 'bottom' });
    layer++;
  };
  const along = (P: Panel) => segLength(findEdge(P, top ? 'e2' : 'e0')!);
  const rect = (L: number, from: number, to: number, h: number, taper = 0): P2[] => [
    { x: from, y: -0.01 },
    { x: L - to, y: -0.01 },
    { x: L - to - taper, y: h },
    { x: from + taper, y: h },
  ];
  // the sides by where they are seen from the front (left: towards the front wall's start), in the ring's order
  const fMid = toWorld(F.frame, F.w / 2, 0, 0);
  const roleOf = (wall: string): 'left' | 'right' => (v3dot(v3sub(toWorld(d.panels[wall].frame, d.panels[wall].w / 2, 0, 0), fMid), F.frame.u) < 0 ? 'left' : 'right');
  const walls: Record<'front' | 'back' | 'left' | 'right', Panel> = { front: F, back: B, left: d.panels[sides[0].wall], right: d.panels[sides[1].wall] };
  const sideRoles = sides.map((r) => roleOf(r.wall));
  if (sideRoles[0] === sideRoles[1]) (sideRoles[0] = 'left'), (sideRoles[1] = 'right');
  sides.forEach((r, i) => (walls[sideRoles[i]] = d.panels[r.wall]));
  // the order they fold (and are cut): a snap-lock's back first, under its sides; otherwise the sides first, under the back and front
  const order: ('front' | 'back' | 'left' | 'right')[] = spec.back.kind === 'lock' ? ['back', ...sideRoles, 'front'] : [...sideRoles, 'back', 'front'];
  const isSide = (r: string) => r === 'left' || r === 'right';
  const notch = Math.min(0.3 * width, 30), nd = Math.min(8, depth / 6);
  for (const role of order) {
    const f = spec[role], P = walls[role];
    if (!P || f.kind === 'none') continue;
    const L = along(P), side = isSide(role);
    // how far across the end a flap from this wall can reach: the width for a side, the depth for the front or back
    const span = side ? width : depth;
    if (f.kind === 'half') flap(P, side ? rect(L, tW + 0.5, tW + 0.5, Math.max(8, width / 2 - tW - (f.gap ?? 2)), 3) : rect(L, 0.5, 0.5, Math.max(8, depth / 2 - 0.5)));
    else if (f.kind === 'rsc') {
      // a regular slotted container (FEFCO 0201, C2): every flap half the box's smaller side deep, straight slots between them;
      // the long sides' flaps meet in the middle, the short sides' leave a gap
      const h = Math.max(8, Math.min(width, depth) / 2 - 0.5);
      flap(P, side ? rect(L, tW + 0.5, tW + 0.5, h) : rect(L, 0.5, 0.5, h));
    } else if (f.kind === 'full') {
      // full overlap (FEFCO 0203, milestone 149): right across the end, the flaps lying one over another
      flap(P, side ? rect(L, tW + 0.5, tW + 0.5, Math.max(8, span - 2 * tW - 1), 3) : rect(L, 0.5, 0.5, Math.max(8, span - 0.5)));
    } else if (f.kind === 'dust') flap(P, side ? rect(L, tW + 1, tW + 1, Math.max(8, 0.45 * width), 4) : rect(L, 0.5, 0.5, Math.max(8, 0.45 * depth), 4));
    else if (f.kind === 'lock') {
      // 1: the back flap, more than half the depth, notched in its middle
      const hb = span * 0.55;
      flap(P, [{ x: tW, y: -0.01 }, { x: L - tW, y: -0.01 }, { x: L - tW, y: hb }, { x: L / 2 + notch / 2, y: hb }, { x: L / 2 + notch / 2, y: hb - nd }, { x: L / 2 - notch / 2, y: hb - nd }, { x: L / 2 - notch / 2, y: hb }, { x: tW, y: hb }]);
    } else if (f.kind === 'hook') {
      // 2 and 3: the side flaps, cut at 45° towards the front, hooked at their front end
      const frontAtEnd = Math.abs(v3dot(v3sub(toWorld(P.frame, L, 0, 0), F.frame.o), matDir(F.frame))) < Math.abs(v3dot(v3sub(toWorld(P.frame, 0, 0, 0), F.frame.o), matDir(F.frame)));
      const h = Math.min(width / 2 - 2, depth * 0.6), hook = Math.min(6, h / 3);
      const shape: P2[] = [{ x: tW, y: -0.01 }, { x: L - tW, y: -0.01 }, { x: L - tW - h * 0.6, y: h - hook }, { x: L - tW - h * 0.6 - hook, y: h - hook }, { x: L - tW - h * 0.6 - hook, y: h }, { x: tW + h * 0.25, y: h }];
      flap(P, frontAtEnd ? shape : shape.map((q) => ({ x: L - q.x, y: q.y })).reverse());
    } else if (f.kind === 'tongue') {
      // 4: the front flap, with a tongue that locks under the back flap's notch
      const hf = span * 0.5, tw = notch - 2;
      flap(P, [{ x: tW, y: -0.01 }, { x: L - tW, y: -0.01 }, { x: L - tW, y: hf }, { x: L / 2 + tw / 2, y: hf }, { x: L / 2 + tw / 2 - 2, y: hf + nd + 4 }, { x: L / 2 - tw / 2 + 2, y: hf + nd + 4 }, { x: L / 2 - tw / 2, y: hf }, { x: tW, y: hf }]);
    } else if (f.kind === 'crash') {
      // a crash-lock (auto) bottom (ECMA B40, milestone C3): half the depth deep, a 45° crease from its hinge corner to the
      // middle that cuts off a glue triangle (at diagonally opposite corners); glued in the flat at the triangles, it locks
      // itself when the carton is squared up
      const h = Math.max(8, depth / 2 - 0.5);
      g.glueAt ??= [];
      const corner = L - 0.5, leg = Math.min(h, corner - 0.5);
      flap(P, rect(L, 0.5, 0.5, h));
      const e = findEdge(P, 'e0');
      if (!e) continue;
      const sx = (e.b.x - e.a.x) / segLength(e), sy = (e.b.y - e.a.y) / segLength(e);
      const at = (q: P2): P2 => ({ x: e.a.x + sx * q.x, y: e.a.y + sy * q.x - q.y });
      g.scores.push({ panelId: P.id, a: at({ x: corner, y: 0 }), b: at({ x: corner - leg, y: leg }) });
      g.glueAt.push({ panelId: P.id, at: at({ x: corner - leg / 3, y: (2 * leg) / 3 }) });
    } else if (f.kind === 'tuck') {
      // a tuck reaches across the end with a lip that turns up inside the wall opposite: a reverse tuck off the front, a
      // straight tuck (C2) off the back
      const Q = role === 'front' ? B : role === 'back' ? F : walls[role === 'left' ? 'right' : 'left'];
      const reach = side ? width : depth;
      const lip = Math.min(22, Math.max(12, 0.3 * reach));
      const r = 4;
      const lipShape: P2[] = [{ x: L - tW - 0.5, y: reach }, { x: L - tW - 0.5, y: reach + lip - r }, { x: L - tW - 0.5 - r, y: reach + lip }, { x: tW + 0.5 + r, y: reach + lip }, { x: tW + 0.5, y: reach + lip - r }, { x: tW + 0.5, y: reach }];
      // in 3D the flap folds flat across the end and its lip turns up inside the opposite wall
      // (folded flat with the flap it ran on out past the opposite wall)
      flap(P, [{ x: 0.5, y: -0.01 }, { x: L - 0.5, y: -0.01 }, { x: L - 0.5, y: reach }, ...lipShape, { x: 0.5, y: reach }], [{ x: 0.5, y: -0.01 }, { x: L - 0.5, y: -0.01 }, { x: L - 0.5, y: reach }, { x: 0.5, y: reach }]);
      const eE = findEdge(P, top ? 'e2' : 'e0');
      if (eE && !top) {
        const LE = segLength(eE), sx = (eE.b.x - eE.a.x) / LE, sy = (eE.b.y - eE.a.y) / LE;
        const mE = matDir(P.frame), upQ = Q.frame.v;
        const lipOnQ = lipShape.map((q) => {
          // across the end to the opposite wall's inside, then up it
          const wv = toWorld(P.frame, eE.a.x + sx * q.x, eE.a.y + sy * q.x, 0);
          const up = q.y - reach;
          return toLocal(Q.frame, [wv[0] + mE[0] * reach + upQ[0] * up, wv[1] + mE[1] * reach + upQ[1] * up, wv[2] + mE[2] * reach + upQ[2] * up]);
        });
        g.flaps3d.push({ panelId: Q.id, poly: lipOnQ, z0: tW, z1: 2 * tW, owner: P.id });
      }
      if (eE) {
        const LE = segLength(eE), sx = (eE.b.x - eE.a.x) / LE, sy = (eE.b.y - eE.a.y) / LE;
        const out = top ? 1 : -1;
        const p2 = (x: number, y: number) => ({ x: eE.a.x + sx * x, y: eE.a.y + sy * x + out * y });
        g.scores.push({ panelId: P.id, a: p2(tW + 0.5, reach), b: p2(L - tW - 0.5, reach) });
      }
    }
  }
  return g;
}
