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

/**
 * A run of a tray's base outline between two of its walls (milestone 64; runs
 * of several arcs and closed runs, milestone 65): its arcs (fillets, those of
 * one circle merged) and its creases (a point the outline turns at without a
 * fillet: where a round base's seam flat meets its curve), in order.
 */
export type RunPart = { kind: 'arc'; c: P2; r: number; turn: number; t1: P2; t2: P2 } | { kind: 'crease'; at: P2; turn: number };

/** A rounded corner of a tray's base between two of its walls (`a` = `b`: a round base's one wall, round to itself); `i` the point of its first arc. */
export type TrayCorner = { tray: string; base: string; i: number; a: string; b: string; parts: RunPart[]; turn: number; c: P2; r: number };

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
const passBands = new WeakMap<object, Map<string, Band[]>>();

/** A tray's rounded convex corners with a wall on each side, in the base's point order. */
export function trayCorners(d: Design, t: Tray): TrayCorner[] {
  const store = Object.isFrozen(d) ? memo(d, 'corners', () => new Map<string, TrayCorner[]>()) : passCorners.get(d);
  const hit = store?.get(t.id);
  if (hit) return hit;
  const out = cornersOf(d, t);
  store?.set(t.id, out);
  return out;
}

/** The largest turn a crease in a run may make (a sharper one is a corner, joined as such). */
const CREASE_MAX = (35 * Math.PI) / 180;

function cornersOf(d: Design, t: Tray): TrayCorner[] {
  const base = d.panels[t.baseId];
  if (!base || base.sketch.kind !== 'poly') return [];
  const s = base.sketch, n = s.pts.length;
  const fs = sketchFillets(s);
  // each edge's straight part, after the fillets at its ends
  const from = (i: number) => fs[i]?.t2 ?? s.pts[i], to = (i: number) => fs[(i + 1) % n]?.t1 ?? s.pts[(i + 1) % n];
  const straight = (i: number) => Math.hypot(to(i).x - from(i).x, to(i).y - from(i).y);
  const dir = (i: number) => {
    const a = s.pts[i], b = s.pts[(i + 1) % n], L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
  };
  const walls = s.edgeIds.map((k, i) => (straight(i) > 1e-6 ? wallOnEdge(d, t, base, k) : undefined));
  const out: TrayCorner[] = [];
  for (let i = 0; i < n; i++) {
    const a = walls[i];
    if (!a) continue;
    const parts: RunPart[] = [];
    let b: string | undefined, ok = true, fi = -1;
    for (let step = 1; step <= n; step++) {
      const j = (i + step) % n;
      // the point the run passes: a fillet's arc, or a crease
      const f = fs[j];
      const d1 = dir((j + n - 1) % n), d2 = dir(j);
      const turn = Math.atan2(d1.x * d2.y - d1.y * d2.x, d1.x * d2.x + d1.y * d2.y);
      if (f) {
        if (turn <= 1e-6) {
          ok = false;
          break;
        }
        const last = parts[parts.length - 1];
        if (last?.kind === 'arc' && Math.hypot(last.c.x - f.c.x, last.c.y - f.c.y) < 1e-6 && Math.abs(last.r - f.r) < 1e-6) {
          last.turn += turn;
          last.t2 = f.t2;
        } else parts.push({ kind: 'arc', c: f.c, r: f.r, turn, t1: f.t1, t2: f.t2 });
        if (fi < 0) fi = j;
      } else if (Math.abs(turn) > 1e-6) {
        if (turn < 0 || turn > CREASE_MAX) {
          ok = false;
          break;
        }
        parts.push({ kind: 'crease', at: s.pts[j], turn });
      }
      // the edge after it: a wall ends the run; an open straight edge breaks it
      if (walls[j]) {
        b = walls[j];
        break;
      }
      if (straight(j) > 1e-6) {
        ok = false;
        break;
      }
    }
    if (!ok || !b || !parts.some((q) => q.kind === 'arc')) continue;
    const arcs = parts.filter((q): q is Extract<RunPart, { kind: 'arc' }> => q.kind === 'arc');
    out.push({ tray: t.id, base: base.id, i: fi, a, b, parts, turn: parts.reduce((x, q) => x + q.turn, 0), c: arcs[0].c, r: Math.min(...arcs.map((q) => q.r)) });
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
 * The bands round a corner, one per arc, from the end of the wall before it
 * (milestone 65: several, for a stadium's end, an oval's arcs, a round base's
 * rim). Each one's cross-section is horizontal, from where it starts back
 * along the outline (`dIn`) and towards the box's inside (`up`), its arc on
 * its fillet's centre, at the wall's offset in from the outline and its height.
 * `pos`: where it starts along the strip, from the wall's end.
 */
export function wingBands(d: Design, c: Connection): Band[] {
  if (!c.wing) return [];
  // once per pass (the walls' frames are set before the first ask), once per frozen design
  const store = Object.isFrozen(d) ? memo(d, 'wingBands', () => new Map<string, Band[]>()) : passBands.get(d);
  const key = `${c.id}|${c.bend?.pattern ?? ''}|${c.bend?.density ?? ''}`;
  const hit = store?.get(key);
  if (hit) return hit;
  const bs = wingBandsOf(d, c);
  store?.set(key, bs);
  return bs;
}

/** The first band round a corner (the one joint labels and old callers use). */
export const wingBand = (d: Design, c: Connection): Band | null => wingBands(d, c)[0] ?? null;

/** The developed length of all a corner's bands (mm). */
export const wingLength = (d: Design, c: Connection) => wingBands(d, c).reduce((x, b) => x + b.lb, 0);

function wingBandsOf(d: Design, c: Connection): Band[] {
  const k0 = cornerOf(d, c);
  const A = d.panels[c.a.panelId], B = d.panels[c.b.panelId], base = k0 ? d.panels[k0.base] : undefined;
  if (!k0 || !A || !B || !base) return [];
  const eA = wallEnd(A, 'e1'), eB = wallEnd(B, 'e3');
  if (!eA || !eB) return [];
  const m = matOf(d, A.id);
  const t = m.thickness, kk = bendOf(m).k;
  const H = Math.min(eA.h, eB.h);
  // where the wall stands: how far in from the outline its outer face is, and how high its bottom
  const O: V3 = toWorld(A.frame, eA.x, 0, 0);
  const q = toLocal(base.frame, O);
  const first = k0.parts[0];
  const start = first.kind === 'arc' ? first.t1 : first.at;
  const off = Math.hypot(q.x - start.x, q.y - start.y);
  const lift = v3dot(v3sub(O, base.frame.o), matDir(base.frame));
  const U = v3norm(A.frame.v);
  const W = (p: P2): V3 => toWorld(base.frame, p.x, p.y, lift);
  const out: Band[] = [];
  let pos = 0, idx = 0;
  for (const part of k0.parts) {
    if (part.kind !== 'arc') continue;
    const Ro = part.r - off, r = Ro - t;
    const phi = part.turn;
    const lb = phi * (Math.max(0, r) + kk * t);
    // its start: the fillet's first tangent point, in by the wall's offset
    const nrm = { x: (part.c.x - part.t1.x) / part.r, y: (part.c.y - part.t1.y) / part.r };
    const P = { x: part.t1.x + nrm.x * off, y: part.t1.y + nrm.y * off };
    const tangent = { x: -nrm.y, y: nrm.x };
    const Aw = W(P);
    // back along the outline, into the wall before it (`tangent` points that way: the outline runs CCW, the inside on its left)
    const dIn = v3norm(v3sub(W({ x: P.x + tangent.x, y: P.y + tangent.y }), Aw));
    const up = v3norm(v3sub(W({ x: P.x + nrm.x, y: P.y + nrm.y }), Aw));
    const T1 = { x: 0, y: 0 }, Cc = { x: 0, y: Ro };
    const T2 = { x: -Ro * Math.sin(phi), y: Ro * (1 - Math.cos(phi)) };
    const pattern = bandPattern({ m, r: Math.max(0, r), len: H, width: lb, turn: phi }, c.bend?.pattern, c.bend?.density);
    out.push({ id: `${c.id}#${idx++}`, parent: A.id, child: B.id, edge: 'e1', r: Math.max(0, r), t, k: kk, Ro, phi, lb, trimP: 0, trimC: 0, span: [0, H], A: Aw, U, dIn, up, T1, T2, C: Cc, pattern, fits: r > 1e-6 && H > 1, wing: true, pos });
    pos += lb;
  }
  return out;
}

/** Is this wing's next wall folded off the base (so it cannot also continue the band in the net)? */
const foldsFromBase = (d: Design, wallId: string) => Object.values(d.connections).some((x) => x.grown && x.b.panelId === wallId && x.kind === 'fold');

/** Kinds this corner may take: one piece only where the next wall is another wall not already folded off the base. */
export function wingKindsFor(d: Design, c: Connection): ConnectionKind[] {
  const ks = wingKinds(matOf(d, c.a.panelId));
  return c.a.panelId === c.b.panelId || foldsFromBase(d, c.b.panelId) ? ks.filter((k) => k !== 'fold') : ks;
}

/** Extra web outside slots that follow a curve (mm): the curve's chords lie up to its flattening tolerance inside it. */
const CURVE_WEB = 0.05;

/** What holds a tray's bands to its base: glue teeth, tabs in curved slots, or nothing; by default only on a round base (its walls are nearly all band). */
export function curveKindOf(d: Design, t: Tray): 'teeth' | 'tabslot' | 'none' {
  if (t.curveKind) return t.curveKind;
  const base = d.panels[t.baseId];
  if (base?.sketch.kind !== 'poly' || !base.sketch.round) return 'none';
  const m = matOf(d, t.baseId);
  return m.kind === 'card' ? 'teeth' : m.kind === 'corrugated' ? 'tabslot' : 'none';
}

/** What may hold a tray's bands to its base, by material (plywood: wrapped round the cut-back base). */
export function curveKinds(m: MaterialProfile): ('teeth' | 'tabslot' | 'none')[] {
  return m.kind === 'card' ? ['teeth', 'none'] : m.kind === 'corrugated' ? ['tabslot', 'teeth', 'none'] : ['none'];
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

/** Where along a corner's strip (from the wall's end) each crease is, and the strip's whole length. */
function stripLayout(d: Design, c: Connection, k0: TrayCorner): { creases: number[]; L: number } {
  const bs = wingBands(d, c);
  const creases: number[] = [];
  let pos = 0, i = 0;
  for (const part of k0.parts) {
    if (part.kind === 'crease') creases.push(pos);
    else pos += bs[i++]?.lb ?? 0;
  }
  return { creases, L: pos };
}

/**
 * A corner's band material in the wall's coordinates (from x0, the wall's
 * end): the strip, its patterns' scores and slits, and a score at each
 * crease (card and corrugated; plywood's hinge takes the turn).
 */
export function wingStrip(d: Design, c: Connection): { parent: string; child: string; strip: P2[]; scores: { a: P2; b: P2 }[]; cuts: { a: P2; b: P2 }[]; paths: { pts: P2[]; closed: boolean }[] } | null {
  const k0 = cornerOf(d, c), bs = wingBands(d, c);
  const A = d.panels[c.a.panelId];
  const eA = A && wallEnd(A, 'e1');
  if (!k0 || !bs.length || !eA) return null;
  const x0 = eA.x, H = bs[0].span[1];
  const { creases, L } = stripLayout(d, c, k0);
  const scores: { a: P2; b: P2 }[] = [], cuts: { a: P2; b: P2 }[] = [], paths: { pts: P2[]; closed: boolean }[] = [];
  for (const b of bs) {
    const at = (q: { x: number; y: number }) => ({ x: x0 + (b.pos ?? 0) + q.x, y: q.y });
    for (const l of b.pattern.lines.scores) scores.push({ a: at(l.a), b: at(l.b) });
    for (const l of b.pattern.lines.cuts) cuts.push({ a: at(l.a), b: at(l.b) });
    for (const q of b.pattern.lines.paths) paths.push({ pts: q.pts.map(at), closed: q.closed });
  }
  if (matOf(d, A.id).kind !== 'plywood') for (const x of creases) scores.push({ a: { x: x0 + x, y: 0 }, b: { x: x0 + x, y: H } });
  return { parent: A.id, child: c.b.panelId, strip: [{ x: x0 - 0.01, y: 0 }, { x: x0 + L, y: 0 }, { x: x0 + L, y: H }, { x: x0 - 0.01, y: H }], scores, cuts, paths };
}

/**
 * A wing's joint geometry. One piece (`fold`): nothing on the walls (the
 * strip is drawn with the net, `foldBand`). Otherwise the bands are material
 * added past the wall's end, with their patterns, and at the end a glue lip,
 * a key (its socket in the next wall) or nothing. Under them, what holds them
 * to the base (milestone 65): glue teeth folded onto it, or tabs through
 * curved slots. Under bands whose wall stands down beside the base (fingers)
 * the base is cut back so they wrap round it.
 */
export function wingGeom(d: Design, c: Connection): ConnGeom | null {
  const bs = wingBands(d, c);
  const k0 = cornerOf(d, c);
  const strip = wingStrip(d, c);
  if (!bs.length || !k0 || !strip) return null;
  const A = d.panels[c.a.panelId], B = d.panels[c.b.panelId];
  const base = d.panels[k0.base];
  const tray = d.trays[k0.tray];
  const g = emptyGeom();
  const mA = matOf(d, A.id);
  const x0 = wallEnd(A, 'e1')!.x, H = bs[0].span[1];
  const L = bs.reduce((x, b) => x + b.lb, 0);
  if (c.kind !== 'fold') {
    g.adds.push({ panelId: A.id, poly: strip.strip, band: true });
    for (const l of strip.scores) g.scores.push({ panelId: A.id, a: l.a, b: l.b });
    if (strip.cuts.length) g.lines = strip.cuts.map((l) => ({ panelId: A.id, a: l.a, b: l.b }));
    if (strip.paths.length) g.cutPaths = strip.paths.map((q) => ({ panelId: A.id, pts: q.pts, closed: q.closed }));
  }
  const end = x0 + L;
  if (c.kind === 'glue') {
    // the lip, as wide as fits between the two walls in the flat net (they open apart from the corner's centre)
    const last = bs[bs.length - 1];
    const room = k0.turn < Math.PI / 2 - 0.05 ? last.Ro * Math.tan(k0.turn - 0.05) - L : Infinity;
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
      const key = keyAdd(end, H / 2, k);
      g.adds.push({ panelId: A.id, poly: key });
      const xB = wallEnd(B, 'e3')!.x;
      // in 3D the key sits in its socket at the next wall's start, in that wall's slab
      g.flaps3d.push({ panelId: B.id, poly: key.map((q) => ({ x: xB + (q.x - end), y: q.y })), z0: 0, z1: tOf(d, B.id), owner: A.id });
      g.cuts = [...(g.cuts ?? []), { panelId: B.id, poly: keySocket(xB, H / 2, k, matOf(d, B.id).clearance) }];
    }
  }
  if (!base || !tray) return g;
  const tB = tOf(d, base.id), clB = matOf(d, base.id).clearance;
  const lift = v3dot(v3sub(A.frame.o, base.frame.o), matDir(base.frame));
  const arcs = k0.parts.filter((q): q is Extract<RunPart, { kind: 'arc' }> => q.kind === 'arc');
  // a point at `x` along band j's strip, `inward` mm in from the outline (base coordinates)
  const off = arcs[0].r - bs[0].Ro;
  const onArc = (j: number, x: number, inward: number): P2 => {
    const arc = arcs[j], b = bs[j];
    const a0 = Math.atan2(arc.t1.y - arc.c.y, arc.t1.x - arc.c.x);
    const th = a0 + (Math.max(0, Math.min(b.lb, x)) / Math.max(1e-9, b.lb)) * arc.turn;
    const rr = arc.r - inward;
    return { x: arc.c.x + rr * Math.cos(th), y: arc.c.y + rr * Math.sin(th) };
  };
  const sector = (j: number, x1: number, x2: number, in0: number, in1: number): P2[] => {
    const n = Math.max(3, Math.ceil(((x2 - x1) / Math.max(1e-9, bs[j].lb)) * arcs[j].turn / 0.05));
    const outer: P2[] = [], inner: P2[] = [];
    for (let q = 0; q <= n; q++) {
      const x = x1 + ((x2 - x1) * q) / n;
      outer.push(onArc(j, x, in0));
      inner.push(onArc(j, x, in1));
    }
    return [...outer, ...inner.reverse()];
  };
  // the base under bands whose wall stands down beside it is cut back to their inner face
  if (lift < tB - 1e-6)
    for (let j = 0; j < arcs.length; j++) {
      const b = bs[j], arc = arcs[j];
      const ext = 0.002 * b.lb;
      g.cuts = [...(g.cuts ?? []), { panelId: base.id, poly: sector(j, -ext, b.lb + ext, -0.5, arc.r - b.r + clB / 2) }];
    }
  // tabs need a web between their slots and the base's edge: under a wall standing at the edge (a fold) the bands are glued with teeth instead
  const want = curveKindOf(d, tray);
  const holds = want === 'tabslot' && off < minWeb(matOf(d, base.id)) - 1e-6 ? 'teeth' : want;
  if (holds === 'teeth' && lift >= tB - 1e-6) {
    const fh = Math.min(lipOf(d, c, mA), H / 2);
    // a wall folded off the base lies beside it in the net: teeth near its end would lie on the base
    const inNet = Object.values(d.connections).some((x) => x.grown && x.b.panelId === A.id && x.kind === 'fold');
    const R1 = arcs[0].r;
    const sMin = inNet ? (R1 > fh + 1 ? Math.sqrt(R1 * R1 - (R1 - fh - 1) ** 2) : R1) : 0;
    for (let j = 0; j < bs.length; j++) {
      const b = bs[j], pitch = Math.max(2 * fh, 8);
      const n = Math.max(1, Math.round(b.lb / pitch));
      const step = b.lb / n, gap = Math.min(step / 4, Math.max(1, 2 * mA.thickness));
      for (let q = 0; q < n; q++) {
        const s0 = q * step + gap / 2, s1 = (q + 1) * step - gap / 2, w = s1 - s0;
        if ((b.pos ?? 0) + s0 < sMin) continue;
        // tapered so neighbours do not overlap when folded in round the curve
        const inset = Math.min(w / 2 - 0.5, Math.max(fh * 0.25, (w * fh) / (2 * Math.max(1, b.r)) + 0.5));
        const X = x0 + (b.pos ?? 0);
        g.adds.push({ panelId: A.id, poly: [{ x: X + s0, y: 0.01 }, { x: X + s1, y: 0.01 }, { x: X + s1 - inset, y: -fh }, { x: X + s0 + inset, y: -fh }] });
        g.scores.push({ panelId: A.id, a: { x: X + s0, y: 0 }, b: { x: X + s1, y: 0 } });
        // folded in onto the base's top face, from the band's inner face
        const ri = off + mA.thickness;
        g.flaps3d.push({ panelId: base.id, poly: [onArc(j, s0, ri), onArc(j, s1, ri), onArc(j, s1 - inset, ri + fh), onArc(j, s0 + inset, ri + fh)], z0: tB, z1: tB + mA.thickness });
      }
    }
  } else if (holds === 'tabslot' && lift >= tB - 1e-6) {
    const tw = Math.max(8, 3 * mA.thickness);
    for (let j = 0; j < bs.length; j++) {
      const b = bs[j];
      const n = Math.max(1, Math.round(b.lb / (3 * tw)));
      const seg = b.lb / (2 * n + 1);
      const X = x0 + (b.pos ?? 0);
      for (let q = 1; q < 2 * n + 1; q += 2) {
        const s0 = q * seg, s1 = (q + 1) * seg;
        g.adds.push({ panelId: A.id, poly: [{ x: X + s0, y: 0.01 }, { x: X + s1, y: 0.01 }, { x: X + s1, y: -tB }, { x: X + s0, y: -tB }] });
        // in 3D the tab fills its curved slot, through the base's thickness
        g.flaps3d.push({ panelId: base.id, poly: sector(j, s0, s1, off, off + mA.thickness), z0: 0, z1: tB, owner: A.id });
        // the slot follows the curve: the tab's band through the base, grown by half the clearance
        // shifted in a hair: the base's flattened circle runs up to 0.02 mm inside the true one, and the web outside the slot must stay whole
        g.holes.push({ panelId: base.id, poly: sector(j, s0 - clB / 2, s1 + clB / 2, off - clB / 2 + CURVE_WEB, off + mA.thickness + clB / 2 + CURVE_WEB) });
      }
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
      const lb = wingLength(d, c);
      const add = lb + (d.panels[k.b]?.w ?? 0);
      if (acc + add > max + 1e-6) {
        c.kind = 'key';
        acc = 0;
      } else acc += lb;
    } else acc = 0;
    id = k.b;
  }
}
