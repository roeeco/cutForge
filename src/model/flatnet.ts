// Nets that lie flat (milestone 35, PANELS_AND_DIVIDERS.md §3). A tray's
// walls fold up from its base in one net (card and corrugated). Flat, walls
// at an inside corner fold over each other (and the closing wall runs into the
// base), and on short walls of a many-sided base a corner glue flap reaches
// into the next wall. `fixFlatNets` finds every overlap in a tray's flat net
// and changes the net so it lies flat, trying in this order:
//   1. trim the flap: a corner glue flap is clipped to the free space between
//      the two walls; when what is left is narrower than the material's
//      minimum flap, the flap moves to the corner's other wall;
//   2. hinge the wall off its neighbour: it folds off the side edge of its
//      other neighbour (across that convex corner) instead of off the base,
//      lying flat in line with it, and is glued to the base along its bottom;
//      used only when it then overlaps nothing;
//   3. cut the wall as its own piece: it leaves the net and joins the base with
//      the design's wall-to-base joint (glue on card, tabs on corrugated when
//      that is a fold).
// Fixes are re-made on every solve (stable ids: shapes stay on their wall);
// `Tray.pin` lets the student choose for a wall, `Tray.flat: 'off'` keeps the
// net whole (the export check then reports the overlap).
import polygonClipping, { type MultiPolygon } from 'polygon-clipping';
import type { Connection, ConnectionKind, Design, P2, Tray, TrayFix, V3 } from './types';
import { flatPanel, netGroups, netOverlaps, type NetOverlap, type NetPanel } from './pieces';
import { connectionGeom, autoFlap, cornerFit, seamKinds } from './seams';
import { edgeLocal, edgeInwardLocal } from './frame';
import { findEdge, panelEdges, segDir } from './edges';
import { matOf } from './materials';
import { designKind } from './jointDefaults';
import { applyX, invertPoint } from '../geom/vec';
import type { Xform2 } from '../geom/types';

/** Smallest glue flap worth keeping (mm). */
export function minFlap(d: Design, panelId: string): number {
  return autoFlap(matOf(d, panelId)) / 2;
}

/** The base edge key a tray wall stands on. */
export function wallEdge(d: Design, wallId: string): string | null {
  const c = Object.values(d.connections).find((x) => x.grown && x.trayId && x.b.panelId === wallId);
  const base = c && d.panels[c.a.panelId];
  return c && base ? (findEdge(base, c.a.edge)?.key ?? c.a.edge) : null;
}

/** The tray a wall belongs to (as one of its walls). */
function trayOfWall(d: Design, wallId: string): Tray | undefined {
  const c = Object.values(d.connections).find((x) => x.grown && x.trayId && x.b.panelId === wallId);
  return c ? d.trays[c.trayId!] : undefined;
}

/** A tray whose net may be changed: walls fold from the base, card or corrugated, not kept whole. */
function fixable(d: Design, t: Tray): boolean {
  return !!d.panels[t.baseId] && t.flat !== 'off' && matOf(d, t.baseId).kind !== 'plywood';
}

/** The kind a wall cut as its own piece joins its base with. */
export function ownKind(d: Design, baseId: string, wallId: string): ConnectionKind {
  const m = matOf(d, wallId);
  const k = designKind(d, 'base', ['glue', 'tabslot', 'slide', 'butt'], m.kind);
  if (k) return k;
  return m.kind === 'card' ? 'glue' : 'tabslot';
}

/**
 * During `solve`, after a joint's kind is fitted: the kind a tray's fixes
 * give it (a hinged wall glued to the base, its corner a fold; a wall cut as
 * its own piece joined by `ownKind`). Returns true when it changed the kind.
 */
export function fixKind(d: Design, c: Connection): boolean {
  if (!c.trayId) return false;
  const t = d.trays[c.trayId];
  if (!t) return false;
  if (c.grown) {
    const base = d.panels[c.a.panelId];
    const key = base ? (findEdge(base, c.a.edge)?.key ?? c.a.edge) : c.a.edge;
    if (t.fixPlan?.hinge?.[key]) return (c.kind = 'glue'), true;
    if (t.fixes?.[key] === 'own') return (c.kind = ownKind(d, t.baseId, c.b.panelId)), true;
    return false;
  }
  delete c.hingeOf;
  const hinge = t.fixPlan?.hinge;
  if (!hinge) return false;
  for (const [key, stay] of Object.entries(hinge)) {
    const w = wallOn(d, t, key);
    if (w && ((c.a.panelId === w && c.b.panelId === stay) || (c.b.panelId === w && c.a.panelId === stay)) && c.b.edge !== 'face') {
      c.kind = 'fold';
      c.hingeOf = w;
      return true;
    }
  }
  return false;
}

/** The tray wall standing on a base edge. */
function wallOn(d: Design, t: Tray, key: string): string | undefined {
  const base = d.panels[t.baseId];
  if (!base) return undefined;
  return Object.values(d.connections).find((c) => c.grown && c.trayId === t.id && c.a.panelId === base.id && (c.a.edge === key || findEdge(base, c.a.edge)?.key === key))?.b.panelId;
}

/** Each panel's place in its flat net. */
function netXfs(d: Design): Map<string, NetPanel & { root: string }> {
  const out = new Map<string, NetPanel & { root: string }>();
  for (const g of netGroups(d)) for (const n of g) out.set(n.panelId, { ...n, root: g[0].panelId });
  return out;
}

/** Clip a polygon to the half-plane dot(q − o, n) ≤ −gap (Sutherland–Hodgman). */
function clipHalf(poly: P2[], o: P2, n: P2, gap: number): P2[] {
  const f = (q: P2) => (q.x - o.x) * n.x + (q.y - o.y) * n.y + gap;
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const fa = f(a), fb = f(b);
    if (fa <= 0) out.push(a);
    if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) {
      const k = fa / (fa - fb);
      out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
    }
  }
  return out;
}

const area = (p: P2[]) => {
  let s = 0;
  for (let i = 0; i < p.length; i++) s += p[i].x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * p[i].y;
  return Math.abs(s) / 2;
};

/** The affine map taking a, b, c to a2, b2, c2 (2D). */
function affine(a: P2, b: P2, c: P2, a2: P2, b2: P2, c2: P2): ((q: P2) => P2) | null {
  const det = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
  if (Math.abs(det) < 1e-12) return null;
  return (q) => {
    const u = ((q.x - a.x) * (c.y - a.y) - (c.x - a.x) * (q.y - a.y)) / det;
    const v = ((b.x - a.x) * (q.y - a.y) - (q.x - a.x) * (b.y - a.y)) / det;
    return { x: a2.x + (b2.x - a2.x) * u + (c2.x - a2.x) * v, y: a2.y + (b2.y - a2.y) * u + (c2.y - a2.y) * v };
  };
}

/**
 * Trim a corner glue flap to the free space beside the other wall when flat:
 * clipped along that wall's side edge, a millimetre short of it. The flap as
 * folded (3D) is clipped the same way. Returns the flap's width left (its area
 * over its length), or null when there is nothing to trim.
 */
function trimFlap(d: Design, c: Connection, xfs: Map<string, NetPanel & { root: string }>): number | null {
  const g = c.geom;
  if (!g || !g.adds.length) return null;
  const O = d.panels[c.a.panelId], R = d.panels[c.b.panelId];
  const xo = xfs.get(O?.id ?? ''), xr = xfs.get(R?.id ?? '');
  if (!O || !R || !xo || !xr || xo.root !== xr.root || !findEdge(R, c.b.edge)) return null;
  const [ra, rb] = edgeLocal(R, c.b.edge);
  const ri = edgeInwardLocal(R, c.b.edge);
  const toO = (q: P2) => invertPoint(xo.xf, applyX(xr.xf, q));
  const o = toO(ra), o2 = toO(rb);
  const q = toO({ x: ra.x + ri.x, y: ra.y + ri.y });
  const n = { x: q.x - o.x, y: q.y - o.y };
  void o2;
  const [oa, ob] = edgeLocal(O, c.a.edge);
  const L = Math.hypot(ob.x - oa.x, ob.y - oa.y) || 1;
  let left = Infinity;
  for (const a of g.adds) {
    if (a.panelId !== O.id) continue;
    const flat = a.poly;
    const cut = clipHalf(flat, o, n, 1);
    left = Math.min(left, area(cut) / L);
    // the same flap folded on R: carried by the map from the flat flap to the folded one
    for (const f of g.flaps3d) {
      if (f.owner !== O.id || f.poly.length !== flat.length) continue;
      const m = affine(flat[0], flat[1], flat[flat.length - 1], f.poly[0], f.poly[1], f.poly[f.poly.length - 1]);
      if (m) f.poly = cut.length >= 3 ? cut.map(m) : [];
    }
    a.poly = cut;
  }
  g.adds = g.adds.filter((a) => a.poly.length >= 3);
  g.flaps3d = g.flaps3d.filter((f) => f.poly.length >= 3);
  return left === Infinity ? null : left;
}

/** The connection with its two ends swapped (the flap on the corner's other wall). */
const swapped = (c: Connection): Connection => ({ ...c, a: c.b, b: c.a });

/** After joint geometry is made (in `solve`): trim (and move) the corner flaps the tray fixes name. */
export function applyTrims(d: Design) {
  let xfs: Map<string, NetPanel & { root: string }> | null = null;
  for (const t of Object.values(d.trays ?? {})) {
    const plan = t.fixPlan;
    if (!plan?.trim?.length) continue;
    xfs ??= netXfs(d);
    for (const id of plan.trim) {
      const c = d.connections[id];
      if (!c?.geom) continue;
      if (plan.swap?.includes(id)) {
        const s = swapped(c);
        const g = connectionGeom(d, s);
        if (!g) continue;
        const cc = { ...s, geom: g };
        trimFlap(d, cc, xfs);
        c.geom = cc.geom;
      } else trimFlap(d, c, xfs);
    }
  }
}

/** Area two panels of a net overlap when flat. */
export function pairOverlap(d: Design, a: string, b: string): number {
  const xfs = netXfs(d);
  const xa = xfs.get(a), xb = xfs.get(b);
  if (!xa || !xb || xa.root !== xb.root) return 0;
  try {
    const r = polygonClipping.intersection(flatPanel(d, a, xa.xf), flatPanel(d, b, xb.xf));
    return multiArea(r);
  } catch {
    return 0;
  }
}
const multiArea = (m: MultiPolygon) => m.reduce((s, poly) => s + poly.reduce((t, r, i) => t + (i ? -1 : 1) * area(r.map(([x, y]) => ({ x, y }))), 0), 0);

const OVERLAP = 0.5;

/** Overlaps in the nets of trays whose nets may be changed. */
function trayOverlaps(d: Design): { o: NetOverlap; t: Tray }[] {
  const out: { o: NetOverlap; t: Tray }[] = [];
  for (const o of netOverlaps(d, OVERLAP)) {
    const t = trayOfWall(d, o.a) ?? trayOfWall(d, o.b) ?? Object.values(d.trays ?? {}).find((x) => x.baseId === o.a || x.baseId === o.b);
    if (t && fixable(d, t)) out.push({ o, t });
  }
  return out.sort((x, y) => y.o.area - x.o.area);
}

/** Base edges in order, and whether the corner after each is convex. */
function baseRing(d: Design, t: Tray): { key: string; wall?: string }[] {
  const base = d.panels[t.baseId];
  return base ? panelEdges(base).map((e) => ({ key: e.key, wall: wallOn(d, t, e.key) })) : [];
}

/** Is the base's corner between edges i and i+1 (in ring order) convex? */
function convexAfter(d: Design, t: Tray, i: number): boolean {
  const ring = panelEdges(d.panels[t.baseId]);
  const n = ring.length;
  const a = segDir(ring[i]), b = segDir(ring[(i + 1) % n]);
  return a.x * b.y - a.y * b.x > 1e-6;
}

/**
 * Make every auto tray's net lie flat (run at the end of `solve`, with
 * `again` re-solving the design once a fix is chosen).
 */
export function fixFlatNets(d: Design, again: (d: Design) => void) {
  const trays = Object.values(d.trays ?? {});
  if (!trays.length) return;
  let had = false;
  for (const t of trays) {
    if (t.fixes || t.fixPlan) had = true;
    delete t.fixes;
    delete t.fixPlan;
  }
  if (!trays.some((t) => fixable(d, t))) {
    if (had) again(d);
    return;
  }
  if (had) again(d);
  const tried = new Set<string>();
  for (let it = 0; it < 24; it++) {
    const list = trayOverlaps(d);
    let done = false;
    for (const { o, t } of list) {
      const k = [o.a, o.b].sort().join('|');
      if (tried.has(k)) continue;
      tried.add(k);
      if (fixPair(d, t, o, again)) {
        done = true;
        break;
      }
    }
    if (!done) break;
  }
  for (const t of trays) {
    if (t.fixes && !Object.keys(t.fixes).length) delete t.fixes;
    if (t.fixPlan && !Object.values(t.fixPlan).some((v) => v && Object.keys(v).length)) delete t.fixPlan;
  }
}

function setFix(t: Tray, key: string, f: TrayFix) {
  t.fixes = { ...(t.fixes ?? {}), [key]: f };
}

/** Choose and apply the fix for one overlapping pair; true when it was applied. */
function fixPair(d: Design, t: Tray, o: NetOverlap, again: (d: Design) => void): boolean {
  const clear = () => pairOverlap(d, o.a, o.b) < OVERLAP;
  // 1. a corner glue flap between the two: trim it (or move it to the other wall)
  const corner = Object.values(d.connections).find(
    (c) => !c.grown && c.trayId === t.id && c.kind === 'glue' && c.b.edge !== 'face' && ((c.a.panelId === o.a && c.b.panelId === o.b) || (c.a.panelId === o.b && c.b.panelId === o.a)),
  );
  if (corner && !t.fixPlan?.trim?.includes(corner.id)) {
    t.fixPlan = { ...(t.fixPlan ?? {}), trim: [...(t.fixPlan?.trim ?? []), corner.id] };
    again(d);
    const owner = () => (t.fixPlan?.swap?.includes(corner.id) ? corner.b.panelId : corner.a.panelId);
    if (flapLeft(d, corner) < minFlap(d, owner())) {
      t.fixPlan.swap = [...(t.fixPlan.swap ?? []), corner.id];
      again(d);
    }
    if (clear() && flapLeft(d, corner) >= minFlap(d, owner()) - 1e-9) {
      const key = wallEdge(d, owner());
      if (key) setFix(t, key, 'trim');
      return true;
    }
    // trimming does not clear it: undo, and let a wall give way
    t.fixPlan.trim = t.fixPlan.trim!.filter((x) => x !== corner.id);
    t.fixPlan.swap = (t.fixPlan.swap ?? []).filter((x) => x !== corner.id);
    again(d);
  }
  // 2. which wall gives way: the wall (against the base), else the shorter one, else the later on the base
  const ring = baseRing(d, t);
  const idx = (w: string) => ring.findIndex((r) => r.wall === w);
  const isWall = (id: string) => idx(id) >= 0;
  let gw: string, other: string | null;
  if (!isWall(o.a) && !isWall(o.b)) return false;
  if (!isWall(o.a) || !isWall(o.b)) [gw, other] = [isWall(o.a) ? o.a : o.b, null];
  else {
    const A = d.panels[o.a], B = d.panels[o.b];
    const later = idx(o.a) > idx(o.b) ? o.a : o.b;
    gw = Math.abs(A.w - B.w) > 1e-6 ? (A.w < B.w ? o.a : o.b) : later;
    other = gw === o.a ? o.b : o.a;
    if (t.pin?.[ring[idx(gw)].key] === 'other') [gw, other] = [other, gw];
  }
  const key = ring[idx(gw)].key;
  if (t.fixes?.[key] === 'own' || t.fixPlan?.hinge?.[key]) return false;
  // at an inside corner the giving-way wall closes the corner (reaches across to the other's face), so the other stays clear of the base
  if (other) {
    const n = ring.length, i = idx(gw), j = idx(other);
    if ((i + 1) % n === j && !convexAfter(d, t, i)) {
      t.fixPlan = { ...(t.fixPlan ?? {}), extOn: { ...(t.fixPlan?.extOn ?? {}), [ring[j].key]: 'prev' } };
      again(d);
    }
  }
  const pin = t.pin?.[key];
  // 3. hinge it off its other neighbour, across a convex corner
  if (pin !== 'own') {
    const i = idx(gw), n = ring.length;
    const cands: string[] = [];
    const next = ring[(i + 1) % n].wall, prev = ring[(i + n - 1) % n].wall;
    if (next && next !== other && convexAfter(d, t, i)) cands.push(next);
    if (prev && prev !== other && convexAfter(d, t, (i + n - 1) % n)) cands.push(prev);
    for (const stay of cands) {
      // the corner must be a joint between them (edges meeting): made here when they meet but are not joined that way yet
      const c = Object.values(d.connections).find((x) => !x.grown && x.b.edge !== 'face' && ((x.a.panelId === gw && x.b.panelId === stay) || (x.b.panelId === gw && x.a.panelId === stay))) ?? cornerSeam(d, t, gw, stay);
      if (!c) continue;
      t.fixPlan = { ...(t.fixPlan ?? {}), hinge: { ...(t.fixPlan?.hinge ?? {}), [key]: stay } };
      again(d);
      const alone = netOverlaps(d, OVERLAP).every((x) => x.a !== gw && x.b !== gw);
      const folded = d.connections[c.id]?.hingeOf === gw && !d.connections[c.id]?.broken;
      if (folded && (alone || pin === 'hinge')) {
        setFix(t, key, 'hinge');
        return true;
      }
      const h = { ...(t.fixPlan.hinge ?? {}) };
      delete h[key];
      t.fixPlan.hinge = h;
      again(d);
    }
    if (pin === 'hinge') return false;
  }
  // 4. cut it as its own piece
  setFix(t, key, 'own');
  again(d);
  return true;
}

/**
 * The corner joint two tray walls meet at (their side edges coinciding), made
 * as the editor would (an automatic seam with the tray's corner kind). Other
 * automatic joints between them (an edge on the other's face, left from an
 * earlier pose) give way to it.
 */
function cornerSeam(d: Design, t: Tray, a: string, b: string): Connection | null {
  const A = d.panels[a], B = d.panels[b];
  if (!A || !B) return null;
  for (const ea of panelEdges(A))
    for (const eb of panelEdges(B)) {
      if (!cornerFit(A, ea.key, B, eb.key)) continue;
      for (const x of Object.values(d.connections))
        if (!x.grown && x.auto !== false && ((x.a.panelId === a && x.b.panelId === b) || (x.a.panelId === b && x.b.panelId === a))) delete d.connections[x.id];
      const kinds = seamKinds(matOf(d, a), 'corner', matOf(d, b));
      const k = kinds.includes(t.cornerKind) ? t.cornerKind : kinds[0];
      // `a` must be the earlier panel (it owns finger corners)
      const [first, fe, second, se] = d.order.indexOf(a) <= d.order.indexOf(b) ? [a, ea.key, b, eb.key] : [b, eb.key, a, ea.key];
      const id = `${t.id}/k/${first}|${second}`;
      d.connections[id] = { id, kind: k, pref: k, a: { panelId: first, edge: fe }, b: { panelId: second, edge: se }, grown: false, angle: 90, dir: 'up', offset: 0, fingers: null, tabs: null, flap: null, foldDir: 'valley', auto: true, trayId: t.id, ...(t.tabLen === 'through' ? { tabLen: 'through' as const } : {}) };
      return d.connections[id];
    }
  return null;
}

/** A corner glue flap's width left after trimming (area over the joint's length). */
function flapLeft(d: Design, c: Connection): number {
  const cc = d.connections[c.id];
  const g = cc?.geom;
  if (!g) return Infinity;
  // its area over its score line's length: the flap's average width
  let a = 0, L = 0;
  for (const x of g.adds) a += area(x.poly);
  for (const sc of g.scores) L += Math.hypot(sc.b.x - sc.a.x, sc.b.y - sc.a.y);
  return L > 0 ? a / L : Infinity;
}

export type { Xform2, V3 };

/** What a tray on a base would need to lie flat: the tallest wall height at which its net stays one piece (no wall cut as its own piece), and how each wall is changed at `height`. */
export type FlatInfo = { flatHeight: number; fixes: Record<string, TrayFix>; height: number };

const probes = new Map<string, { probe: Design; tid: string; flatHeight: number }>();
const infoCache = new Map<string, FlatInfo>();

/**
 * The tray on `baseId` (or the one extruding it would make), on a copy of the
 * base alone: its flat height, the tallest at which the net lies flat in one
 * piece (binary search on the height, 0.5 mm steps; Infinity when walls of any
 * height do), and the walls changed at `height`. `make` builds a tray (the
 * editor's own `addTray`), passed in to keep this module free of the editor
 * operations. The copy is kept per base, so a height costs one solve.
 */
export function flatInfo(d: Design, baseId: string, height: number, make: (probe: Design, baseId: string, h: number, tray: Partial<Tray>) => string | null, resolve: (d: Design) => void): FlatInfo | null {
  const base = d.panels[baseId];
  if (!base || matOf(d, baseId).kind === 'plywood') return null;
  const tray = Object.values(d.trays ?? {}).find((t) => t.baseId === baseId);
  const spec: Partial<Tray> = tray ? { wallKind: tray.wallKind, cornerKind: tray.cornerKind, openEdges: [...tray.openEdges], pin: tray.pin, tabLen: tray.tabLen } : {};
  const sig = JSON.stringify([base.sketch, base.w, base.h, base.material ?? '', d.material, d.materials ?? null, d.joints ?? null, spec]);
  const h2 = Math.round(height * 2) / 2;
  const hit = infoCache.get(`${sig}@${h2}`);
  if (hit) return hit;
  const lo0 = 5 + matOf(d, baseId).thickness;
  let pr = probes.get(sig);
  if (!pr) {
    const probe: Design = JSON.parse(JSON.stringify({ ...d, panels: { [baseId]: { ...base, details: [] } }, order: [baseId], connections: {}, trays: {}, pieces: { [baseId]: { quantity: 1 } }, placements: {} }));
    const cap = Math.max(200, 4 * Math.max(base.w, base.h));
    const tid = make(probe, baseId, cap, { ...spec });
    if (!tid) return null;
    const t = probe.trays[tid];
    // too tall: a wall has to be cut as its own piece (trimmed flaps and hinged walls keep the net whole)
    const bad = (h: number) => {
      t.height = h;
      resolve(probe);
      return Object.values(t.fixes ?? {}).includes('own');
    };
    let flatHeight = Infinity;
    if (bad(cap)) {
      let lo = lo0, hi = cap;
      if (bad(lo)) flatHeight = lo;
      else {
        while (hi - lo > 0.5) {
          const mid = (lo + hi) / 2;
          if (bad(mid)) hi = mid;
          else lo = mid;
        }
        flatHeight = Math.floor(lo * 2) / 2;
      }
    }
    pr = { probe, tid, flatHeight };
    if (probes.size > 12) probes.clear();
    probes.set(sig, pr);
  }
  // the walls changed at this height
  const t = pr.probe.trays[pr.tid];
  t.height = Math.max(lo0, h2);
  resolve(pr.probe);
  const info: FlatInfo = { flatHeight: pr.flatHeight, fixes: { ...(t.fixes ?? {}) }, height: h2 };
  if (infoCache.size > 200) infoCache.clear();
  infoCache.set(`${sig}@${h2}`, info);
  return info;
}

/** The tray wall standing on a base edge (by key). */
export function trayWallOn(d: Design, t: Tray, key: string): string | undefined {
  return wallOn(d, t, key);
}
