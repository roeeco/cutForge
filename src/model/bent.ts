// Bent walls (milestone 46, CURVED_WALLS.md §3.2, §3.4, §4). A wall standing
// on a curve run of its base is an ordinary grown panel whose connection names
// the run (`e1^~`); its outline, shapes and joints stay in flat (s, y)
// coordinates, s the developed length along the material's neutral line. What
// is new is where it lies in 3D: a chain of planar facets along the run
// (`Panel.bent`, derived by `solve`). `panelToWorld` / `panelToLocal` map
// through them; planar panels have one facet, their frame.
//
// A curved crease cannot fold with one side flat (§2.1), so a bent wall is
// held to its base by glue teeth, tabs in slots that follow the curve, or by
// wrapping round the base (the base cut back by the wall's thickness under
// it). Where a bent wall meets a straight wall in line, the two are glued with
// an in-line flap; a closed strip (a circle) is closed the same way at the back.
import type { Bent, ConnGeom, Connection, ConnectionKind, Design, Facet, Frame, MaterialProfile, P2, Panel, V3 } from './types';
import { FACE, findEdge, findRun, isRunKey, segDir, segLength, type CurveRun, type EdgeSeg } from './edges';
import { matDir, toLocal, toWorld } from './frame';
import { bendOf, matOf, tOf } from './materials';
import { v3add, v3cross, v3dot, v3len, v3mul, v3norm, v3sub } from '../geom/v3';
import { autoFlap, tabCount } from './seams';

/** Largest turn within one facet (radians) and largest sagitta (mm). */
const FACET_TURN = (5 * Math.PI) / 180;
const FACET_SAG = 0.1;

const turnOf = (a: EdgeSeg, b: EdgeSeg) => {
  const da = segDir(a), db = segDir(b);
  return Math.atan2(da.x * db.y - da.y * db.x, da.x * db.x + da.y * db.y);
};
const left = (e: EdgeSeg): P2 => {
  const d = segDir(e);
  return { x: -d.y, y: d.x };
};

/** Extra web outside a bent wall's tab slots (mm): its run's chords lie up to the flattening tolerance inside the curve. */
export const BENT_WEB = 0.05;

/** Is this connection a wall bent along a curve run? */
export const onRun = (c: Pick<Connection, 'grown' | 'a'>) => c.grown && isRunKey(c.a.edge);

/** Where a bent wall's bottom stands: on the base's top face, or (wrapping round it) level with its bottom. */
export const bentLift = (kind: ConnectionKind, tBase: number) => (kind === 'wrap' ? 0 : tBase);

/**
 * Bend a wall along a run: `off` how far in from the base outline its outer
 * face stands, `t` its thickness, `k` its neutral-line factor, `lift` the
 * height of its bottom above the base's plane.
 */
export function bendAlong(base: Panel, run: CurveRun, off: number, t: number, k: number, lift: number): Bent {
  const segs = run.segs, m = segs.length;
  const closed = run.closed;
  // vertices: m + 1 (open), m (closed, the first repeated at the end below)
  const V: P2[] = closed ? segs.map((e) => e.a) : [...segs.map((e) => e.a), segs[m - 1].b];
  const nv = V.length;
  const turnAt = (i: number) => (closed ? turnOf(segs[(i + m - 1) % m], segs[i % m]) : i <= 0 || i >= m ? 0 : turnOf(segs[i - 1], segs[i]));
  const turns = Array.from({ length: nv }, (_, i) => turnAt(i));
  // inward normals at the vertices (the bisector of the two segments' normals)
  const nrm = V.map((_, i) => {
    const before = closed ? segs[(i + m - 1) % m] : segs[Math.max(0, i - 1)];
    const after = closed ? segs[i % m] : segs[Math.min(m - 1, i)];
    const a = left(before), b = left(after);
    const bx = a.x + b.x, by = a.y + b.y, L = Math.hypot(bx, by) || 1;
    // along the bisector, unscaled: a vertex on an arc stays on the arc's offset circle
    return { x: bx / L, y: by / L };
  });
  // developed length of each segment at the neutral line: the curve's length (from its chord and the turn it makes) less the offset's share
  const offN = off + (1 - k) * t;
  const sub = (i: number) => {
    if (closed) return (turns[i] + turns[(i + 1) % m]) / 2;
    if (m === 1) return 0;
    if (i === 0) return turns[1];
    if (i === m - 1) return turns[m - 1];
    return (turns[i] + turns[i + 1]) / 2;
  };
  const S = [0];
  for (let i = 0; i < m; i++) {
    const c = segLength(segs[i]), th = sub(i);
    const arc = Math.abs(th) < 1e-9 ? c : (c * (th / 2)) / Math.sin(th / 2);
    S.push(S[i] + Math.max(1e-6, arc - offN * th));
  }
  const pts = [...V, ...(closed ? [V[0]] : [])].map((p, i) => ({ s: S[i], p: { x: p.x, y: p.y }, n: nrm[i % nv] }));
  // facets: runs of vertices turning at most FACET_TURN and within FACET_SAG of their chord (at the outer face)
  const W = (q: P2, z: number): V3 => toWorld(base.frame, q.x, q.y, z);
  const outer = pts.map((q) => ({ x: q.p.x + q.n.x * off, y: q.p.y + q.n.y * off }));
  const up = matDir(base.frame);
  const facets: Facet[] = [];
  let i0 = 0;
  const last = pts.length - 1;
  while (i0 < last) {
    let j = i0 + 1;
    for (; j < last; j++) {
      let tsum = 0;
      for (let q = i0 + 1; q <= j; q++) tsum += Math.abs(turns[q % nv]);
      if (tsum > FACET_TURN) break;
      const A = outer[i0], B = outer[j + 1], dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1;
      let sag = 0;
      for (let q = i0 + 1; q <= j; q++) sag = Math.max(sag, Math.abs((outer[q].x - A.x) * dy - (outer[q].y - A.y) * dx) / L);
      if (sag > FACET_SAG) break;
    }
    const a = W(outer[i0], lift), b = W(outer[j], lift);
    const u = v3norm(v3sub(b, a));
    const nIn = (q: number): V3 => v3sub(W({ x: pts[q].p.x + pts[q].n.x, y: pts[q].p.y + pts[q].n.y }, 0), W(pts[q].p, 0));
    const inward = v3norm(v3add(nIn(i0), nIn(j)));
    const N = v3cross(u, up);
    const side: 1 | -1 = v3dot(N, inward) >= 0 ? 1 : -1;
    const frame: Frame = { o: v3sub(a, v3mul(u, pts[i0].s)), u, v: up, side };
    facets.push({ s0: pts[i0].s, s1: pts[j].s, frame, a, b, ma: nIn(i0), mb: nIn(j) });
    i0 = j;
  }
  return { run: run.key, base: base.id, closed, facets, pts, off, lift, minR: run.minR };
}

/** The facets of a panel: a bent panel's, else one facet (its frame) over its width. */
export function facetsOf(p: Pick<Panel, 'w' | 'frame' | 'bent'>): Facet[] {
  return p.bent?.facets.length ? p.bent.facets : [{ s0: 0, s1: p.w, frame: p.frame }];
}

function facetAt(fs: Facet[], x: number): Facet {
  if (x <= fs[0].s1) return fs[0];
  let lo = 0, hi = fs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (fs[mid].s1 < x) lo = mid + 1;
    else hi = mid;
  }
  return fs[lo];
}

/** A panel-local point (x, y on its flat outline, z into the material) in world coordinates, through its facets. */
export function panelToWorld(p: Pick<Panel, 'frame' | 'bent'>, x: number, y: number, z = 0): V3 {
  const b = p.bent;
  if (!b?.facets.length) return toWorld(p.frame, x, y, z);
  const f = facetAt(b.facets, x);
  if (!f.a || !f.b || !f.ma || !f.mb) return toWorld(f.frame, x, y, z);
  const al = f.s1 - f.s0 > 1e-12 ? (x - f.s0) / (f.s1 - f.s0) : 0;
  const P = v3add(f.a, v3mul(v3sub(f.b, f.a), al));
  const M = v3add(f.ma, v3mul(v3sub(f.mb, f.ma), al));
  return v3add(v3add(P, v3mul(f.frame.v, y)), v3mul(M, z));
}

/**
 * A world point in a panel's flat coordinates: through the facet it lies
 * against (the one whose slab middle, `t / 2` in, is nearest).
 */
export function panelToLocal(p: Pick<Panel, 'frame' | 'bent'>, w: V3, t = 0): P2 {
  const b = p.bent;
  if (!b?.facets.length) return toLocal(p.frame, w);
  let best: P2 | null = null, bd = Infinity;
  for (const f of b.facets) {
    let l = toLocal(f.frame, w);
    // along the facet as panelToWorld lays it (its chord from a to b spans s0 to s1)
    if (f.a && f.b) {
      const ab = v3sub(f.b, f.a), L2 = v3dot(ab, ab);
      if (L2 > 1e-12) l = { x: f.s0 + (v3dot(v3sub(w, f.a), ab) / L2) * (f.s1 - f.s0), y: l.y };
    }
    const out = Math.max(0, f.s0 - l.x, l.x - f.s1);
    const z = v3dot(v3sub(w, f.frame.o), matDir(f.frame));
    const dd = Math.abs(z - t / 2) + out * 10;
    if (dd < bd) {
      bd = dd;
      best = l;
    }
  }
  return best ?? toLocal(p.frame, w);
}

/** World direction into the material at a point of a panel (a bent panel's turns along it). */
export function panelMatDir(p: Pick<Panel, 'frame' | 'bent'>, x: number): V3 {
  if (!p.bent?.facets.length) return matDir(p.frame);
  return matDir(facetAt(p.bent.facets, x).frame);
}

/** A point on the base, in its local coordinates: at developed length `s` along a bent wall's run, about `inward` mm in from the base outline (exactly, at its vertices). */
export function runPoint(b: Bent, s: number, inward: number): P2 {
  const ps = b.pts;
  let i = 0;
  if (s >= ps[ps.length - 1].s) i = ps.length - 2;
  else while (i < ps.length - 2 && ps[i + 1].s < s) i++;
  const A = ps[i], B = ps[i + 1];
  const al = B.s - A.s > 1e-12 ? (s - A.s) / (B.s - A.s) : 0;
  const px = A.p.x + (B.p.x - A.p.x) * al, py = A.p.y + (B.p.y - A.p.y) * al;
  const nx = A.n.x + (B.n.x - A.n.x) * al, ny = A.n.y + (B.n.y - A.n.y) * al;
  return { x: px + nx * inward, y: py + ny * inward };
}

/** Radius of the run near developed length `s` (Infinity where straight), from its vertices' turns. */
export function radiusAt(b: Bent, s: number): number {
  const ps = b.pts;
  let best = Infinity;
  for (let i = 1; i + 1 < ps.length; i++) {
    if (Math.abs(ps[i].s - s) > Math.max(ps[i].s - ps[i - 1].s, ps[i + 1].s - ps[i].s) * 1.5) continue;
    const a = ps[i - 1].p, q = ps[i].p, c = ps[i + 1].p;
    const t = Math.abs(Math.atan2((q.x - a.x) * (c.y - q.y) - (q.y - a.y) * (c.x - q.x), (q.x - a.x) * (c.x - q.x) + (q.y - a.y) * (c.y - q.y)));
    if (t < 1e-9) continue;
    const ch = (Math.hypot(q.x - a.x, q.y - a.y) + Math.hypot(c.x - q.x, c.y - q.y)) / 2;
    best = Math.min(best, ch / (2 * Math.sin(t / 2)));
  }
  return best;
}

// ---------------------------------------------------------------------------
// Joints

const empty = (): ConnGeom => ({ edges: [], holes: [], adds: [], scores: [], flaps3d: [] });

/** Flap width for glue on a bent wall: the connection's, the design's, else the material's. */
const flapOf = (d: Design, c: Pick<Connection, 'flap'>, m: MaterialProfile) => c.flap ?? d.joints?.[m.kind]?.flap ?? autoFlap(m);

/** A strip closed on itself is closed with a glue flap (card, corrugated); plywood is glued edge to edge (a backing strip comes later). */
export const closingFlap = (m: MaterialProfile) => m.kind !== 'plywood';

/** Kinds a bent wall's in-line seam with a neighbour may take: a glue flap behind the neighbour, or edge to edge. */
export function inlineKinds(m: MaterialProfile): ConnectionKind[] {
  return m.kind === 'plywood' ? ['butt'] : ['glue', 'butt'];
}

/** A tapered in-line glue flap past the end of a wall (`end` 1: past x = w; 0: before x = 0), on its flat outline. */
function endFlap(W: Panel, end: 0 | 1, fh: number, y0: number, y1: number): { flat: P2[]; score: [P2, P2] } {
  const x0 = end ? W.w : 0, sg = end ? 1 : -1;
  const taper = Math.min(fh * 0.5, (y1 - y0) / 3);
  const flat = [
    { x: x0, y: y0 },
    { x: x0 + sg * fh, y: y0 + taper },
    { x: x0 + sg * fh, y: y1 - taper },
    { x: x0, y: y1 },
  ];
  return { flat: end ? flat : flat.reverse(), score: [{ x: x0, y: y0 }, { x: x0, y: y1 }] };
}

/** Geometry of a bent wall's joint with its base, with its closing seam when the strip is closed. Null when it no longer stands. */
export function bentGeom(d: Design, c: Connection): ConnGeom | null {
  const base = d.panels[c.a.panelId], W = d.panels[c.b.panelId];
  const b = W?.bent;
  if (!base || !W || !b || b.run !== c.a.edge || !findRun(base, c.a.edge)) return null;
  const g = empty();
  const mW = matOf(d, W.id), mB = matOf(d, base.id);
  const tW = mW.thickness, tB = mB.thickness, cl = mB.clearance;
  const L = W.w;
  if (c.kind === 'teeth') {
    const fh = flapOf(d, c, mW);
    const pitch = Math.max(2 * fh, 8);
    const n = Math.max(1, Math.round(L / pitch));
    const step = L / n, gap = Math.min(step / 4, Math.max(1, 2 * tW));
    for (let i = 0; i < n; i++) {
      const s0 = i * step + gap / 2, s1 = (i + 1) * step - gap / 2;
      const w = s1 - s0;
      // tapered so neighbours do not overlap when folded in round the curve
      const R = Math.max(1, radiusAt(b, (s0 + s1) / 2));
      const inset = Math.min(w / 2 - 0.5, Math.max(fh * 0.25, (w * fh) / (2 * R) + 0.5));
      const flat = [
        { x: s0, y: 0 },
        { x: s1, y: 0 },
        { x: s1 - inset, y: -fh },
        { x: s0 + inset, y: -fh },
      ];
      g.adds.push({ panelId: W.id, poly: flat });
      g.scores.push({ panelId: W.id, a: { x: s0, y: 0 }, b: { x: s1, y: 0 } });
      // folded in onto the base's top face, from the wall's inner face
      const q = (s: number, u: number) => runPoint(b, s, b.off + tW + u);
      g.flaps3d.push({ panelId: base.id, poly: [q(s0, 0), q(s1, 0), q(s1 - inset, fh), q(s0 + inset, fh)], z0: tB, z1: tB + tW });
    }
  } else if (c.kind === 'tabslot') {
    const n = tabCount(d, c, L, mW);
    const seg = L / (2 * n + 1);
    const notches = [];
    for (let k = 1; k < 2 * n + 1; k += 2) {
      const s0 = k * seg, s1 = (k + 1) * seg;
      notches.push({ s0, s1, depth: -tB });
      // the slot follows the curve: the tab's band through the base, grown by half the clearance
      const steps = Math.max(2, Math.ceil((s1 - s0) / 1));
      const outer: P2[] = [], inner: P2[] = [];
      for (let j = 0; j <= steps; j++) {
        const s = s0 - cl / 2 + ((s1 - s0 + cl) * j) / steps;
        outer.push(runPoint(b, s, b.off - cl / 2));
        inner.push(runPoint(b, s, b.off + tW + cl / 2));
      }
      g.holes.push({ panelId: base.id, poly: [...outer, ...inner.reverse()] });
    }
    g.edges.push({ panelId: W.id, edge: 'e0', notches });
  } else if (c.kind === 'wrap') {
    // the base sits inside the wall: cut back by the wall's thickness under it, in pieces of at most a quarter turn
    const ps = b.pts;
    let i0 = 0;
    while (i0 < ps.length - 1) {
      let j = i0 + 1, turn = 0;
      while (j < ps.length - 1) {
        const a = ps[j - 1].p, q = ps[j].p, r = ps[j + 1].p;
        turn += Math.abs(Math.atan2((q.x - a.x) * (r.y - q.y) - (q.y - a.y) * (r.x - q.x), (q.x - a.x) * (r.x - q.x) + (q.y - a.y) * (r.y - q.y)));
        if (turn > Math.PI / 2) break;
        j++;
      }
      const run = ps.slice(i0, j + 1);
      const out = run.map((q) => ({ x: q.p.x - q.n.x * 0.01, y: q.p.y - q.n.y * 0.01 }));
      const inn = run.map((q) => ({ x: q.p.x + q.n.x * tW, y: q.p.y + q.n.y * tW }));
      g.cuts = [...(g.cuts ?? []), { panelId: base.id, poly: [...out, ...inn.reverse()] }];
      i0 = j;
    }
  } else if (c.kind !== 'butt') return null;
  // a closed strip: a glue flap past its end, behind its start
  if (b.closed && closingFlap(mW)) {
    const fh = Math.min(flapOf(d, c, mW), L / 4);
    const y1 = W.h - 1;
    if (y1 > 2) {
      const { flat, score } = endFlap(W, 1, fh, 0.5, y1);
      g.adds.push({ panelId: W.id, poly: flat });
      g.scores.push({ panelId: W.id, a: score[0], b: score[1] });
      g.flaps3d.push({ panelId: W.id, poly: flat.map((q) => ({ x: q.x - L, y: q.y })), z0: tW, z1: 2 * tW });
    }
  }
  return g;
}

/** Is this a seam where a bent wall meets another wall end to end, in line? */
export function isInline(d: Design, c: Pick<Connection, 'grown' | 'a' | 'b'>): boolean {
  return !c.grown && c.b.edge !== FACE && c.a.edge !== FACE && (!!d.panels[c.a.panelId]?.bent || !!d.panels[c.b.panelId]?.bent);
}

/** In-line seam geometry: a glue flap past the bent wall's end, behind the other wall; or plain edges. */
export function inlineGeom(d: Design, c: Connection): ConnGeom | null {
  const A = d.panels[c.a.panelId], B = d.panels[c.b.panelId];
  if (!A || !B) return null;
  const g = empty();
  if (c.kind === 'butt') return g;
  if (c.kind !== 'glue') return null;
  const mA = matOf(d, A.id), tA = mA.thickness, tB = tOf(d, B.id);
  const end: 0 | 1 = c.a.edge === 'e1' ? 1 : 0;
  const fh = Math.min(flapOf(d, c, mA), A.w / 3, B.w / 3);
  const y1 = Math.min(A.h, B.h) - 1;
  if (y1 <= 2 || fh <= 1) return g;
  const { flat, score } = endFlap(A, end, fh, 0.5, y1);
  g.adds.push({ panelId: A.id, poly: flat });
  g.scores.push({ panelId: A.id, a: score[0], b: score[1] });
  // on the other wall's inner face, at its end
  const eB = findEdge(B, c.b.edge);
  if (eB) {
    const xB = eB.a.x, inward = c.b.edge === 'e3' ? 1 : -1;
    g.flaps3d.push({ panelId: B.id, poly: flat.map((q) => ({ x: xB + inward * Math.abs(q.x - (end ? A.w : 0)), y: q.y })), z0: tB, z1: tB + tA });
  }
  return g;
}

/** Id of the in-line seam at a bent wall's start (`s`) or end (`e`). */
export const inlineId = (wallId: string, at: 's' | 'e') => `${wallId}|${at}`;

/**
 * Keep the in-line seams of every bent tray wall: where its run leaves a
 * straight edge tangentially and a wall stands there in line (the same
 * offset), they are joined end to end. Seams whose walls no longer meet so
 * are removed; a pair the student unjoined is left alone.
 */
export function reconcileInline(d: Design) {
  const want = new Set<string>();
  const skip = new Set(d.noAutoSeams ?? []);
  const pk = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);
  for (const c of Object.values(d.connections)) {
    if (!onRun(c) || !c.trayId) continue;
    const base = d.panels[c.a.panelId], W = d.panels[c.b.panelId];
    if (!base || !W?.bent || W.bent.closed) continue;
    const run = findRun(base, c.a.edge);
    if (!run) continue;
    for (const at of ['s', 'e'] as const) {
      const key = at === 's' ? run.prev : run.next;
      if (!key || !(at === 's' ? run.tanStart : run.tanEnd)) continue;
      const sc = Object.values(d.connections).find((x) => x.grown && x.a.panelId === base.id && !onRun(x) && (x.a.edge === key || findEdge(base, x.a.edge)?.key === key) && Math.abs(x.offset - c.offset) < 0.1 && Math.abs(x.angle - 90) < 1e-6);
      const S = sc && d.panels[sc.b.panelId];
      if (!S || skip.has(pk(W.id, S.id))) continue;
      const id = inlineId(W.id, at);
      want.add(id);
      const a = { panelId: W.id, edge: at === 's' ? 'e3' : 'e1' }, bb = { panelId: S.id, edge: at === 's' ? 'e1' : 'e3' };
      const ex = d.connections[id];
      if (ex && ex.b.panelId === S.id) continue;
      const kind = inlineKinds(matOf(d, W.id))[0];
      d.connections[id] = { id, kind, pref: kind, a, b: bb, grown: false, angle: 180, dir: 'up', offset: 0, fingers: null, tabs: null, flap: null, foldDir: 'valley', auto: true };
    }
  }
  for (const c of Object.values(d.connections)) if (!c.grown && c.id === inlineId(c.a.panelId, c.id.slice(-1) as 's' | 'e') && !want.has(c.id)) delete d.connections[c.id];
}

/** A bent wall's tightest radius against its material: below what it bends to plainly, and below what it bends to at all with its pattern. */
export function bendCheck(d: Design, panelId: string): { minR: number; smoothR: number; patternR: number; tight: boolean; impossible: boolean } | null {
  const p = d.panels[panelId];
  if (!p?.bent) return null;
  const m = matOf(d, panelId), lim = bendOf(m);
  const r = p.bent.minR;
  return { minR: r, smoothR: lim.smoothR, patternR: lim.patternR, tight: r < lim.smoothR - 1e-6, impossible: r < lim.patternR - 1e-6 };
}

/** Length of a world vector: for tests and checks. */
export const worldLen = (a: V3, b: V3) => v3len(v3sub(a, b));
