// Strips (milestone 48, CURVED_WALLS.md §4.3). A curved wall meeting a
// straight wall at a tangent point continues it without a fold, so the two can
// be cut as one strip:
// - card and corrugated: each curved corner rides on one straight neighbour in
//   the tray's flat net (the strip continues that wall), glued to the other
//   with its in-line flap. The neighbour is chosen so the net still lies flat
//   (glue teeth that would lie on the base flat are left off); on corrugated
//   the one that keeps the flutes up the wall first. When neither works the
//   corner stays a piece of its own, as before.
// - plywood: a tray's walls form one strip all round, broken once at the
//   closing seam (a puzzle key, no glue) at the back left; a strip longer than
//   the sheet is broken at more seams.
// A strip is never folded at these seams: the net simply continues (`'inline'`
// joins in `netFolds`). A single wall longer than the sheet (a big circle) is
// split inside by puzzle-key cuts.
import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';
import type { ConnGeom, Connection, Design, MaterialProfile, P2, Panel } from './types';
import type { Xform2 } from '../geom/types';
import { applyX, composeX, invertPoint } from '../geom/vec';
import { findEdge } from './edges';
import { toWorld } from './frame';
import { matOf, minWeb } from './materials';
import { panelToWorld, isInline, onRun } from './bent';
import { flatPanel, netGroups, type NetPanel } from './pieces';
import { ownOutline } from './outline';
import { panelExtras, panelNotches, panelOutlines } from './geometry';
import { resolveStyle } from './bendPattern';
import { v3dot, v3sub } from '../geom/v3';
import { connectionGeom } from './seams';

/** The longest strip a material's sheet takes (mm): along the sheet, or either way when pieces may turn. */
export function stripMax(d: Pick<Design, 'allowRotate' | 'sheetMargin'>, m: MaterialProfile): number {
  return (d.allowRotate ? Math.max(m.sheetW, m.sheetH) : m.sheetW) - 2 * (d.sheetMargin ?? 0);
}

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

/** A cut across a panel at x = s with a puzzle key at height ym: a band as wide as the clearance along the line y0 → y1, round the key. */
export function splitCut(s: number, ym: number, y0: number, y1: number, k: { neck: number; head: number; depth: number }, cl: number): P2[] {
  const path: P2[] = [
    { x: s, y: y0 },
    { x: s, y: ym - k.neck / 2 },
    { x: s + k.depth, y: ym - k.head / 2 },
    { x: s + k.depth, y: ym + k.head / 2 },
    { x: s, y: ym + k.neck / 2 },
    { x: s, y: y1 },
  ];
  const w = Math.max(0.02, cl) / 2;
  const left: P2[] = [], right: P2[] = [];
  for (let i = 0; i < path.length; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    const nrm = (p: P2, q: P2) => {
      const L = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      return { x: -(q.y - p.y) / L, y: (q.x - p.x) / L };
    };
    const n1 = nrm(i ? a : path[i], i ? path[i] : b), n2 = nrm(path[i], i < path.length - 1 ? b : path[i]);
    const n = i === 0 ? nrm(path[0], path[1]) : i === path.length - 1 ? nrm(path[i - 1], path[i]) : { x: n1.x + n2.x, y: n1.y + n2.y };
    const L = Math.hypot(n.x, n.y) || 1;
    // a mitre: as far out as keeps the band its width along both segments
    const cos = i === 0 || i === path.length - 1 ? 1 : Math.max(0.3, (n.x * n1.x + n.y * n1.y) / L);
    const m = w / cos;
    left.push({ x: path[i].x + (n.x / L) * m, y: path[i].y + (n.y / L) * m });
    right.push({ x: path[i].x - (n.x / L) * m, y: path[i].y - (n.y / L) * m });
  }
  return [...left, ...right.reverse()];
}

/** Where a bent wall's run starts or ends on its base (base-local), for picking the back-left seam. */
const seamPoint = (W: Panel, at: 's' | 'e'): P2 | null => {
  const ps = W.bent?.pts;
  return ps?.length ? (at === 's' ? ps[0].p : ps[ps.length - 1].p) : null;
};

/** Is this one of a bent wall's in-line seams (made by `reconcileInline`)? */
export const isInlineSeam = (d: Design, c: Connection) => !c.grown && isInline(d, c) && /\|[se]$/.test(c.id) && !!d.panels[c.a.panelId]?.bent;

/**
 * How a strip continues across an in-line seam: the transform from the
 * `child` panel's flat coordinates into the other one's (a shift along the
 * strip, and up or down by how far apart their bottoms stand). Null when the
 * edges are gone.
 */
export function inlineXf(d: Design, c: Connection, child: string): Xform2 | null {
  const W = d.panels[c.a.panelId], S = d.panels[c.b.panelId];
  if (!W?.bent || !S) return null;
  const start = c.a.edge === 'e3';
  const eS = findEdge(S, start ? 'e1' : 'e3');
  if (!eS) return null;
  const xS = start ? eS.a.x : eS.b.x;
  const PW = panelToWorld(W, start ? 0 : W.w, 0), PS = toWorld(S.frame, xS, 0);
  const ty = v3dot(S.frame.v, v3sub(PW, PS));
  const tx = start ? xS : xS - W.w;
  return child === W.id ? { tx, ty, rot: 0 } : child === S.id ? { tx: -tx, ty: -ty, rot: 0 } : null;
}

const empty = (): ConnGeom => ({ edges: [], holes: [], adds: [], scores: [], flaps3d: [] });

const toRing = (pts: P2[]): [number, number][] => pts.map((q) => [q.x, q.y]);
function area(m: MultiPolygon): number {
  let s = 0;
  for (const poly of m)
    poly.forEach((r, i) => {
      let a = 0;
      for (let j = 0; j < r.length; j++) a += r[j][0] * r[(j + 1) % r.length][1] - r[(j + 1) % r.length][0] * r[j][1];
      s += (i ? -1 : 1) * Math.abs(a / 2);
    });
  return s;
}
const overlaps = (a: MultiPolygon, b: MultiPolygon, min: number) => {
  try {
    return area(polygonClipping.intersection(a, b)) >= min;
  } catch {
    return true;
  }
};

/** A polygon grown about its centroid so each point moves out by about `g`. */
function grow(poly: P2[], g: number): P2[] {
  const cx = poly.reduce((s, q) => s + q.x, 0) / poly.length, cy = poly.reduce((s, q) => s + q.y, 0) / poly.length;
  return poly.map((q) => {
    const dx = q.x - cx, dy = q.y - cy, L = Math.hypot(dx, dy) || 1;
    return { x: q.x + (dx / L) * g, y: q.y + (dy / L) * g };
  });
}

/** A wall flat in its net: its outline and its additions less those left off, mapped by `xf`. */
function wallFlat(d: Design, W: Panel, xf: Xform2, drop: Set<P2[]>, extra: P2[][] = []): MultiPolygon {
  const notches = panelNotches(d, W);
  const polys: Polygon[] = ownOutline(W).rings.flatMap((ring) => panelOutlines(W, notches, ring).map((o) => [toRing(o)] as Polygon));
  for (const a of panelExtras(d, W).adds) if (!drop.has(a)) polys.push([toRing(a)]);
  for (const a of extra) polys.push([toRing(a)]);
  let u: MultiPolygon;
  try {
    u = polygonClipping.union(...(polys as [Polygon, ...Polygon[]]));
  } catch {
    u = polys.map((p) => p);
  }
  return u.map((poly) => poly.map((r) => r.map(([x, y]) => {
    const q = applyX(xf, { x, y });
    return [q.x, q.y] as [number, number];
  })));
}

/** The joint of a bent wall with its base. */
const baseJoint = (d: Design, W: Panel) => Object.values(d.connections).find((c) => onRun(c) && c.b.panelId === W.id && !c.broken && c.geom);

/** The glue teeth on a bent wall's bottom (its base joint's additions below it), by index. */
function teethOf(d: Design, W: Panel): { add: { panelId: string; poly: P2[] }; i: number }[] {
  const c = baseJoint(d, W);
  if (!c?.geom || c.kind !== 'teeth') return [];
  return c.geom.adds.filter((a) => a.panelId === W.id && a.poly.every((q) => q.y <= 1e-9)).map((add, i) => ({ add, i }));
}

/** Gap kept between a trimmed tooth and the base in the flat net (mm). */
const TEETH_GAP = 0.5;

/** Trim a bent wall's teeth (by index among its teeth: the new outline, or null to leave it off with its score and folded 3D flap). */
function trimTeeth(d: Design, W: Panel, cut: Map<number, P2[] | null>) {
  const c = baseJoint(d, W);
  const g = c?.geom;
  if (!g || !cut.size) return;
  const isTooth = (a: { panelId: string; poly: P2[] }) => a.panelId === W.id && a.poly.every((q) => q.y <= 1e-9);
  let k = 0;
  const off = new Set<number>([...cut].filter(([, v]) => !v).map(([i]) => i));
  g.adds = g.adds.flatMap((a) => {
    if (!isTooth(a)) return [a];
    const i = k++;
    if (!cut.has(i)) return [a];
    const p = cut.get(i);
    return p ? [{ ...a, poly: p }] : [];
  });
  k = 0;
  g.scores = g.scores.filter((s) => !(s.panelId === W.id && Math.abs(s.a.y) < 1e-9 && Math.abs(s.b.y) < 1e-9 && off.has(k++)));
  k = 0;
  g.flaps3d = g.flaps3d.filter((f) => !(f.panelId === c!.a.panelId && off.has(k++)));
}

/** Card and corrugated: let a curved corner ride on a straight neighbour in the tray's net, where the net still lies flat. */
function planRide(d: Design, W: Panel, cands: Connection[]): boolean {
  const m = matOf(d, W.id);
  const where = new Map<string, NetPanel & { group: NetPanel[] }>();
  for (const g of netGroups(d)) for (const n of g) where.set(n.panelId, { ...n, group: g });
  // flutes up the wall: the neighbour whose height runs along the flutes on the sheet first
  const along = (c: Connection) => {
    const w = where.get(c.b.panelId);
    if (!w || m.kind !== 'corrugated' || m.grain === 'none') return 0;
    const cy = Math.abs(Math.cos(w.xf.rot));
    return (m.grain === 'y' ? cy : 1 - cy) > 0.7 ? 0 : 1;
  };
  const order = [...cands].sort((a, b) => along(a) - along(b) || (a.id.endsWith('|s') ? 0 : 1) - (b.id.endsWith('|s') ? 0 : 1));
  const style = resolveStyle(m, W.bend?.style, W.bent?.minR ?? Infinity);
  for (const c of order) {
    const S = d.panels[c.b.panelId], ws = where.get(c.b.panelId);
    if (!S || !ws || ws.group.some((n) => n.panelId === W.id)) continue;
    const xi = inlineXf(d, c, W.id);
    if (!xi) continue;
    const xf = composeX(ws.xf, xi);
    // kiss scores go on the face the net shows: only where that is the face they need
    if (style.style === 'kiss') {
      const up = (W.frame.side === 1) !== !!xf.mirror ? 1 : -1;
      if ((W.bend?.face ?? 1) !== up) continue;
    }
    // teeth that would lie on the base, flat, are trimmed to the space beside it (or left off when little is left)
    const trimmed = new Map<number, P2[] | null>();
    const base = W.bent?.base, wb = base ? where.get(base) : undefined;
    if (base && wb && wb.group === ws.group) {
      const B = flatPanel(d, base, wb.xf);
      const Bg: MultiPolygon = B.map((poly) => [toRing(grow(poly[0].map(([x, y]) => ({ x, y })), TEETH_GAP))]);
      for (const { add, i } of teethOf(d, W)) {
        const net = add.poly.map((q) => applyX(xf, q));
        if (!overlaps([[toRing(net)]], Bg, 1e-6)) continue;
        let left: MultiPolygon = [];
        try {
          left = polygonClipping.difference([[toRing(net)]], Bg);
        } catch {
          left = [];
        }
        const big = left.map((p) => p[0]).sort((a, b) => area([[b]]) - area([[a]]))[0];
        const whole = area([[toRing(net)]]);
        trimmed.set(i, big && area([[big]]) >= 0.25 * whole ? big.slice(0, big.length - 1).map(([x, y]) => invertPoint(xf, { x, y })) : null);
      }
    }
    // left off: the glue flap this seam had (riding replaces it), and the teeth as they were
    const teeth = teethOf(d, W);
    const gone = new Set([...teeth.filter((x) => trimmed.has(x.i)).map((x) => x.add.poly), ...(c.geom?.adds ?? []).map((a) => a.poly)]);
    const extra = [...trimmed.values()].filter((p): p is P2[] => !!p);
    const flat = wallFlat(d, W, xf, gone, extra);
    if (ws.group.some((n) => n.panelId !== W.id && overlaps(flat, flatPanel(d, n.panelId, n.xf), 0.5))) continue;
    c.kind = 'inline';
    c.rides = W.id;
    c.geom = empty();
    trimTeeth(d, W, trimmed);
    return true;
  }
  return false;
}

/** Plywood: a tray's walls as one strip, broken at the back-left seam (a key) when they go all round, and wherever the sheet is too short. */
function planChain(d: Design, seams: Connection[]) {
  const adj = new Map<string, Connection[]>();
  for (const c of seams) for (const id of [c.a.panelId, c.b.panelId]) adj.set(id, [...(adj.get(id) ?? []), c]);
  const seen = new Set<string>();
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    // the component
    const nodes: string[] = [], edges = new Set<Connection>();
    const stack = [start];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      nodes.push(id);
      for (const c of adj.get(id) ?? []) {
        edges.add(c);
        stack.push(c.a.panelId === id ? c.b.panelId : c.a.panelId);
      }
    }
    const list = [...edges];
    const cycle = list.length === nodes.length && nodes.every((id) => adj.get(id)!.length === 2);
    let closing: Connection | undefined;
    let first: string;
    if (cycle) {
      // the closing seam: the one furthest towards the back left of the base
      const score = (c: Connection) => {
        const q = seamPoint(d.panels[c.a.panelId], c.id.endsWith('|s') ? 's' : 'e');
        return q ? -q.x + q.y : -Infinity;
      };
      closing = list.reduce((a, b) => (score(b) > score(a) ? b : a));
      // the strip starts after it (its end at the closing seam's straight-wall side runs into it)
      first = closing.a.edge === 'e1' ? closing.b.panelId : closing.a.panelId;
    } else first = nodes.find((id) => adj.get(id)!.length === 1) ?? nodes[0];
    const m = matOf(d, first);
    const max = stripMax(d, m);
    const width = (id: string) => d.panels[id]?.w ?? 0;
    let acc = width(first), prev = first;
    const used = new Set<Connection>(closing ? [closing] : []);
    for (;;) {
      const c = (adj.get(prev) ?? []).find((x) => !used.has(x));
      if (!c) break;
      used.add(c);
      const next = c.a.panelId === prev ? c.b.panelId : c.a.panelId;
      if (acc + width(next) > max + 1e-6) {
        c.kind = 'key';
        acc = width(next);
      } else {
        c.kind = 'inline';
        c.rides = next;
        acc += width(next);
      }
      prev = next;
    }
    if (closing) closing.kind = 'key';
    for (const c of list) c.geom = connectionGeom(d, c) ?? empty();
  }
}

/**
 * Plan every tray's strips (`solve`, once every joint is made): which curved
 * walls ride on a neighbour in its net, and, on plywood, where a strip all
 * round is keyed shut. Only seams the editor made (not ones the student set);
 * their stored choice stays and is applied again on the next solve.
 */
export function planStrips(d: Design) {
  for (const c of Object.values(d.connections)) delete c.rides;
  const seams = Object.values(d.connections).filter((c) => isInlineSeam(d, c) && c.auto !== false && !c.broken && c.geom);
  if (!seams.length) return;
  const ply = seams.filter((c) => matOf(d, c.a.panelId).kind === 'plywood' && matOf(d, c.b.panelId).kind === 'plywood');
  if (ply.length) planChain(d, ply);
  const byWall = new Map<string, Connection[]>();
  for (const c of seams) if (!ply.includes(c)) byWall.set(c.a.panelId, [...(byWall.get(c.a.panelId) ?? []), c]);
  for (const id of d.order) {
    const cs = byWall.get(id);
    if (cs) planRide(d, d.panels[id], cs);
  }
}
