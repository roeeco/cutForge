// Curved tray walls (milestone 64, PACKAGING_PLAN.md §4.2, §4.4, §4.5). On a
// base with rounded corners, a tray stands its walls on the straight edges
// only (rounding keeps every one, milestone 62). Each rounded corner between
// two walls is a band: the material curving round the corner from the end of
// the wall before it (A) to the start of the wall after it (B). The band is
// carried by A, and a corner connection (`Connection.wing`) says how its far
// end joins B:
//   fold  one piece: B continues A in the flat net (plywood strips)
//   glue  a glue lip past the band's end, on B's inner face (card, corrugated)
//   key   a puzzle key on the band's end, its socket in B's start (plywood)
//   butt  plain edges
// No wall is cut back: both already end where the fillet's straight edges end,
// so the band's tangent points are the walls' ends. Rounding the corners never
// makes or removes a wall (§4.6), and these connections are keyed by their two
// walls, so a radius swept up and down leaves the design as it was.
import type { ConnGeom, Connection, ConnectionKind, Design, MaterialProfile, P2, Panel, Tray, V3 } from './types';
import { findEdge, segLength, sketchFillets } from './edges';
import { matDir, toLocal, toWorld } from './frame';
import { bendOf, matOf, minWeb, tOf } from './materials';
import { v3dot, v3mul, v3norm, v3sub } from '../geom/v3';
import { bandPattern } from './bendPatterns';
import type { Band } from './bands';
import { autoFlap } from './seams';
import { memo } from './derived';

export const wingId = (a: string, b: string) => `wing:${a}|${b}`;

/** Kinds a corner's band may join the next wall with, the material's default first. */
export function wingKinds(m: MaterialProfile): ConnectionKind[] {
  return m.kind === 'plywood' ? ['fold', 'key', 'butt'] : ['glue', 'fold', 'butt'];
}

/** A rounded corner of a tray's base between two of its walls. */
export type TrayCorner = { tray: string; base: string; i: number; a: string; b: string; c: P2; r: number; turn: number };

/** The tray wall standing on a base edge (by key): by the joint's own edge key, else (an edge a cut split) by looking the edge up. */
function wallOnEdge(d: Design, t: Tray, base: Panel, key: string): string | undefined {
  // a wall whose joint with the base is broken (a 5 mm wall too short for fingers) is still a wall: what is broken is read from the last solve
  const mine = Object.values(d.connections).filter((c) => c.grown && c.trayId === t.id && c.a.panelId === base.id);
  return (mine.find((c) => c.a.edge === key) ?? mine.find((c) => findEdge(base, c.a.edge)?.key === key))?.b.panelId;
}

/**
 * Corners worked out during one solve pass (milestone 64): `reconcileWings`
 * starts a pass, once the tray walls stand; nothing changes a base's outline
 * or its walls until the next. A frozen design's are kept with it.
 */
const passCorners = new WeakMap<object, Map<string, TrayCorner[]>>();
const passBands = new WeakMap<object, Map<string, Band | null>>();

/** A tray's rounded convex corners with a wall on each side, in the base's point order. */
export function trayCorners(d: Design, t: Tray): TrayCorner[] {
  const store = Object.isFrozen(d) ? memo(d, 'corners', () => new Map<string, TrayCorner[]>()) : passCorners.get(d);
  const hit = store?.get(t.id);
  if (hit) return hit;
  const out = cornersOf(d, t);
  store?.set(t.id, out);
  return out;
}

function cornersOf(d: Design, t: Tray): TrayCorner[] {
  const base = d.panels[t.baseId];
  if (!base || base.sketch.kind !== 'poly') return [];
  const s = base.sketch, n = s.pts.length;
  const fs = sketchFillets(s);
  const out: TrayCorner[] = [];
  for (let i = 0; i < n; i++) {
    const f = fs[i];
    if (!f) continue;
    const prev = s.edgeIds[(i + n - 1) % n], next = s.edgeIds[i];
    const a = wallOnEdge(d, t, base, prev), b = wallOnEdge(d, t, base, next);
    if (!a || !b || a === b) continue;
    // the turn the outline makes there (CCW outlines turn left at a convex corner)
    const P = s.pts[(i + n - 1) % n], V = s.pts[i], N = s.pts[(i + 1) % n];
    const d1 = { x: V.x - P.x, y: V.y - P.y }, d2 = { x: N.x - V.x, y: N.y - V.y };
    const turn = Math.atan2(d1.x * d2.y - d1.y * d2.x, d1.x * d2.x + d1.y * d2.y);
    if (turn <= 1e-6) continue;
    out.push({ tray: t.id, base: base.id, i, a, b, c: f.c, r: f.r, turn });
  }
  return out;
}

/** The corner a wing connection goes round (null when it is gone). */
export function cornerOf(d: Design, c: Connection): TrayCorner | null {
  const t = c.trayId ? d.trays[c.trayId] : undefined;
  return t ? (trayCorners(d, t).find((k) => k.a === c.a.panelId && k.b === c.b.panelId) ?? null) : null;
}

/** The x where a wall's end edge (e1) stands, and its height there. */
function wallEnd(p: Panel, edge: 'e1' | 'e3'): { x: number; h: number } | null {
  const e = findEdge(p, edge);
  return e ? { x: edge === 'e1' ? e.a.x : e.b.x, h: segLength(e) } : null;
}

/**
 * The band round a corner, from the end of the wall before it: its
 * cross-section is horizontal, from that wall's end into it (`dIn`) and
 * towards the box's inside (`up`, the wall's material side), with the arc
 * centred on the base's fillet centre.
 */
export function wingBand(d: Design, c: Connection): Band | null {
  if (!c.wing) return null;
  // once per pass (the walls' frames are set before the first ask), once per frozen design
  const store = Object.isFrozen(d) ? memo(d, 'wingBands', () => new Map<string, Band | null>()) : passBands.get(d);
  const key = `${c.id}|${c.bend?.pattern ?? ''}|${c.bend?.density ?? ''}`;
  if (store?.has(key)) return store.get(key)!;
  const b = wingBandOf(d, c);
  store?.set(key, b);
  return b;
}

function wingBandOf(d: Design, c: Connection): Band | null {
  const k0 = cornerOf(d, c);
  const A = d.panels[c.a.panelId], B = d.panels[c.b.panelId], base = k0 ? d.panels[k0.base] : undefined;
  if (!k0 || !A || !B || !base) return null;
  const eA = wallEnd(A, 'e1'), eB = wallEnd(B, 'e3');
  if (!eA || !eB) return null;
  const m = matOf(d, A.id);
  const t = m.thickness, kk = bendOf(m).k;
  const O: V3 = toWorld(A.frame, eA.x, 0, 0);
  const U = v3norm(A.frame.v);
  const dIn = v3mul(v3norm(A.frame.u), -1);
  const up = matDir(A.frame);
  // the fillet's centre, at the wall's bottom: in the cross-section it lies Ro from the wall's outer face, over its end
  const Cw = toWorld(base.frame, k0.c.x, k0.c.y, 0);
  const rel = v3sub(Cw, O);
  const Ro = v3dot(rel, up);
  const r = Ro - t;
  const phi = k0.turn;
  const lb = phi * (Math.max(0, r) + kk * t);
  const T1 = { x: 0, y: 0 }, Cc = { x: 0, y: Ro };
  const T2 = { x: -Ro * Math.sin(phi), y: Ro * (1 - Math.cos(phi)) };
  const H = Math.min(eA.h, eB.h);
  const pattern = bandPattern({ m, r: Math.max(0, r), len: H, width: lb, turn: phi }, c.bend?.pattern, c.bend?.density);
  return { id: c.id, parent: A.id, child: B.id, edge: 'e1', r: Math.max(0, r), t, k: kk, Ro, phi, lb, trimP: 0, trimC: 0, span: [0, H], A: O, U, dIn, up, T1, T2, C: Cc, pattern, fits: r > 1e-6 && H > 1, wing: true };
}

/** Is this wing's next wall folded off the base (so it cannot also continue the band in the net)? */
const foldsFromBase = (d: Design, wallId: string) => Object.values(d.connections).some((x) => x.grown && x.b.panelId === wallId && x.kind === 'fold');

/** Kinds this corner may take: one piece only where the next wall is not already folded off the base. */
export function wingKindsFor(d: Design, c: Connection): ConnectionKind[] {
  const ks = wingKinds(matOf(d, c.a.panelId));
  return foldsFromBase(d, c.b.panelId) ? ks.filter((k) => k !== 'fold') : ks;
}

// ---------------------------------------------------------------------------
// Puzzle keys (a closed plywood strip's closing seam, a strip too long for the sheet)

/** A puzzle key's sizes for a material on a strip of height h: neck, head and depth (mm); null when the strip is too low for one. */
export function keyDims(m: MaterialProfile, h: number): { neck: number; head: number; depth: number } | null {
  const neck = Math.max(4, 2 * m.thickness), head = neck * 1.6, depth = Math.max(4, 2 * m.thickness);
  return head + 2 * minWeb(m) <= h ? { neck, head, depth } : null;
}

/** A dovetail key standing out from the line x = x0 towards +x, centred at height ym. */
export function keyAdd(x0: number, ym: number, k: { neck: number; head: number; depth: number }): P2[] {
  return [
    { x: x0 - 0.01, y: ym - k.neck / 2 },
    { x: x0 + k.depth, y: ym - k.head / 2 },
    { x: x0 + k.depth, y: ym + k.head / 2 },
    { x: x0 - 0.01, y: ym + k.neck / 2 },
  ];
}

/** The socket a key fits into: cut into a panel from its edge at x = x0 towards +x, the clearance all round. */
export function keySocket(x0: number, ym: number, k: { neck: number; head: number; depth: number }, cl: number): P2[] {
  const c = Math.max(0.02, cl) / 2;
  return [
    { x: x0 - 1, y: ym - k.neck / 2 - c },
    { x: x0 + k.depth + c, y: ym - k.head / 2 - c },
    { x: x0 + k.depth + c, y: ym + k.head / 2 + c },
    { x: x0 - 1, y: ym + k.neck / 2 + c },
  ];
}

// ---------------------------------------------------------------------------
// Geometry

const emptyGeom = (): ConnGeom => ({ edges: [], holes: [], adds: [], scores: [], flaps3d: [] });

/** The flap width a wing's lip gets: the joint's, the design's, else the material's. */
const lipOf = (d: Design, c: Connection, m: MaterialProfile) => c.flap ?? d.joints?.[m.kind]?.flap ?? autoFlap(m);

/**
 * A wing's joint geometry. One piece (`fold`): nothing on the walls (the
 * strip is drawn with the net, `foldBand`). Otherwise the band is material
 * added past the wall's end, with its pattern, and at its end a glue lip, a
 * key (its socket in the next wall) or nothing. Under a band whose wall
 * stands down beside the base (fingers), the base is cut back so the band
 * wraps round it.
 */
export function wingGeom(d: Design, c: Connection): ConnGeom | null {
  const b = wingBand(d, c);
  if (!b) return null;
  const A = d.panels[b.parent], B = d.panels[b.child];
  const k0 = cornerOf(d, c)!;
  const base = d.panels[k0.base];
  const g = emptyGeom();
  const mA = matOf(d, A.id);
  const x0 = wallEnd(A, 'e1')!.x, H = b.span[1];
  const at = (q: { x: number; y: number }) => ({ x: x0 + q.x, y: q.y });
  if (c.kind !== 'fold') {
    g.adds.push({ panelId: A.id, poly: [at({ x: -0.01, y: 0 }), at({ x: b.lb, y: 0 }), at({ x: b.lb, y: H }), at({ x: -0.01, y: H })] });
    for (const s of b.pattern.lines.scores) g.scores.push({ panelId: A.id, a: at(s.a), b: at(s.b) });
    const cuts = b.pattern.lines.cuts.map((s) => ({ panelId: A.id, a: at(s.a), b: at(s.b) }));
    if (cuts.length) g.lines = cuts;
  }
  const end = x0 + b.lb;
  if (c.kind === 'glue') {
    // the lip, as wide as fits between the two walls in the flat net (they open apart from the corner's centre)
    const room = b.phi < Math.PI / 2 - 0.05 ? b.Ro * Math.tan(b.phi - 0.05) - b.lb : Infinity;
    const fh = Math.min(lipOf(d, c, mA), room, B.w / 3);
    const y0 = 0.5, y1 = H - 0.5;
    if (fh > 1 && y1 - y0 > 2) {
      const taper = Math.min(fh * 0.5, (y1 - y0) / 3);
      const flat = [
        { x: end - 0.01, y: y0 },
        { x: end + fh, y: y0 + taper },
        { x: end + fh, y: y1 - taper },
        { x: end - 0.01, y: y1 },
      ];
      g.adds.push({ panelId: A.id, poly: flat });
      g.scores.push({ panelId: A.id, a: { x: end, y: y0 }, b: { x: end, y: y1 } });
      // on B's inner face at its start
      const tB = tOf(d, B.id), xB = wallEnd(B, 'e3')!.x;
      g.flaps3d.push({ panelId: B.id, poly: flat.map((q) => ({ x: xB + (q.x - end), y: q.y })), z0: tB, z1: tB + mA.thickness });
    }
  } else if (c.kind === 'key') {
    const k = keyDims(mA, H);
    if (k) {
      g.adds.push({ panelId: A.id, poly: keyAdd(end, H / 2, k) });
      const xB = wallEnd(B, 'e3')!.x;
      g.cuts = [...(g.cuts ?? []), { panelId: B.id, poly: keySocket(xB, H / 2, k, matOf(d, B.id).clearance) }];
    }
  }
  // the base under a band whose wall stands down beside it is cut back to the band's inner face
  if (base) {
    const tB = tOf(d, base.id);
    const lift = v3dot(v3sub(A.frame.o, base.frame.o), matDir(base.frame));
    if (lift < tB - 1e-6) {
      const cl = matOf(d, base.id).clearance;
      const ro = k0.r + 0.5, ri = Math.max(0.1, b.r - cl / 2);
      const centre = k0.c;
      // the corner's angles: from the band's start to its end, as seen from the fillet's centre, in the base's coordinates
      const pBase = (w: V3) => toLocal(base.frame, w);
      const s = pBase(b.A), e = pBase(toWorld(B.frame, wallEnd(B, 'e3')!.x, 0, 0));
      const a0 = Math.atan2(s.y - centre.y, s.x - centre.x);
      let a1 = Math.atan2(e.y - centre.y, e.x - centre.x);
      while (a1 < a0) a1 += 2 * Math.PI;
      const n = Math.max(4, Math.ceil((a1 - a0) / 0.05));
      const outer: P2[] = [], inner: P2[] = [];
      for (let j = 0; j <= n; j++) {
        const a = a0 - 0.002 + ((a1 - a0 + 0.004) * j) / n;
        outer.push({ x: centre.x + ro * Math.cos(a), y: centre.y + ro * Math.sin(a) });
        inner.push({ x: centre.x + ri * Math.cos(a), y: centre.y + ri * Math.sin(a) });
      }
      g.cuts = [...(g.cuts ?? []), { panelId: base.id, poly: [...outer, ...inner.reverse()] }];
    }
  }
  return g;
}

// ---------------------------------------------------------------------------
// Keeping them (in `solve`, once the tray walls exist)

/**
 * Keep a wing connection at every rounded corner of every tray between two of
 * its walls, and none elsewhere. A new one takes the material's default; a
 * corner the student set keeps its kind while allowed. On plywood the walls
 * form one strip: closed with a key at the tray's closing corner (the one
 * nearest the back left unless chosen), and keyed again wherever the strip
 * grows longer than the sheet.
 */
export function reconcileWings(d: Design) {
  passCorners.set(d, new Map());
  passBands.set(d, new Map());
  const want = new Map<string, TrayCorner>();
  for (const t of Object.values(d.trays ?? {})) for (const k of trayCorners(d, t)) want.set(wingId(k.a, k.b), k);
  for (const c of Object.values(d.connections)) if (c.wing && !want.has(c.id)) delete d.connections[c.id];
  for (const [id, k] of want) {
    if (d.connections[id]) continue;
    const kind = wingKinds(matOf(d, k.a))[0];
    d.connections[id] = { id, kind, pref: kind, a: { panelId: k.a, edge: 'e1' }, b: { panelId: k.b, edge: 'e3' }, grown: false, angle: 180, dir: 'up', offset: 0, fingers: null, tabs: null, flap: null, foldDir: 'valley', auto: true, trayId: k.tray, wing: true };
  }
}

/** Fit each wing's kind: the student's while it is allowed, else the plan's (plywood strips keyed shut and for the sheet). */
export function planWings(d: Design) {
  for (const c of Object.values(d.connections)) {
    if (!c.wing) continue;
    const ok = wingKindsFor(d, c);
    c.pref ??= c.kind;
    c.kind = ok.includes(c.pref) ? c.pref : ok[0];
  }
  for (const t of Object.values(d.trays ?? {})) planStrip(d, t);
}

/** The longest strip a material's sheet takes (mm): along the sheet, or either way when pieces may turn. */
export function stripMax(d: Pick<Design, 'allowRotate' | 'sheetMargin'>, m: MaterialProfile): number {
  return (d.allowRotate ? Math.max(m.sheetW, m.sheetH) : m.sheetW) - 2 * (d.sheetMargin ?? 0);
}

/** The corner a closed strip is closed at: the tray's choice, else the one nearest the back left. */
export function closingCorner(d: Design, t: Tray, corners = trayCorners(d, t)): TrayCorner | undefined {
  return corners.find((k) => k.a === t.closeAt) ?? corners.reduce<TrayCorner | undefined>((x, y) => (!x || -y.c.x + y.c.y > -x.c.x + x.c.y ? y : x), undefined);
}

/** Plywood: a tray's walls joined round its corners in one piece are one strip; it is keyed shut once when it closes, and wherever it outgrows the sheet. */
function planStrip(d: Design, t: Tray) {
  const corners = trayCorners(d, t);
  const wing = (k: TrayCorner) => d.connections[wingId(k.a, k.b)];
  const strip = corners.filter((k) => wing(k)?.kind === 'fold' && wing(k)?.auto !== false);
  if (!strip.length) return;
  const m = matOf(d, t.baseId);
  // a closed strip: every corner is a one-piece wing and the walls go all round
  const walls = new Set(corners.flatMap((k) => [k.a, k.b]));
  const closed = corners.length === walls.size && corners.every((k) => wing(k)?.kind === 'fold');
  const close = closed ? closingCorner(d, t, corners) : undefined;
  if (close) wing(close).kind = 'key';
  // the walls in strip order, from just after the closing corner (or a wall nothing joins before)
  const next = new Map(corners.map((k) => [k.a, k]));
  const before = new Set(corners.filter((k) => wing(k)?.kind === 'fold').map((k) => k.b));
  let id = close ? close.b : [...walls].find((w) => !before.has(w));
  const seen = new Set<string>();
  const max = stripMax(d, m);
  let acc = 0;
  while (id && !seen.has(id)) {
    seen.add(id);
    acc += d.panels[id]?.w ?? 0;
    const k = next.get(id);
    if (!k) break;
    const c = wing(k);
    if (c.kind === 'fold') {
      const b = wingBand(d, c);
      const add = (b?.lb ?? 0) + (d.panels[k.b]?.w ?? 0);
      if (acc + add > max + 1e-6) {
        c.kind = 'key';
        acc = 0;
      } else acc += b?.lb ?? 0;
    } else acc = 0;
    id = k.b;
  }
}
