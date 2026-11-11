// Bend patterns (milestone 47, CURVED_WALLS.md §2.2, §4.1). A bent wall
// that bends tighter than its material does on its own gets lines across it,
// parallel to the bend axis: score lines (card), kiss scores in the inner
// liner (corrugated, on one face only), perforations (short cut dashes) or a
// living hinge (plywood: staggered cut lines). The pattern is derived on every
// solve from the wall's run, its material and the student's choice
// (`Panel.bend`), and lands in the wall's joint geometry: scores on the SCORE
// layer, cut lines as open CUT lines.
//
// Each line lets the wall turn by at most φ = pitch / patternR (the material's
// pattern pitch at its tightest calibrated radius), so the line spacing
// follows the curve: R(s)·φ, tighter where it is tighter, held between half
// and twice the material's pitch (or at most the student's spacing).
// Holes, slots, tabs, tooth roots and the wall's ends are kept clear by a
// bridge (plywood) or the material's smallest web; a zone whose lines they cut
// short can no longer turn enough and is named by the export check.
import type { Bent, BendInfo, BendStyle, BendZone, Design, MaterialKind, MaterialProfile, P2, Panel } from './types';
import { bendOf, matOf, minWeb } from './materials';
import { holeCuts, ownOutline } from './outline';
import { panelExtras, panelNotches, panelOutlines } from './geometry';
import { flattenContour } from '../geom/vec';
import { segDir, segLength } from './edges';

type Style = Exclude<BendStyle, 'auto'>;

/** The bend styles a kind of material offers, in the order Auto tries them. */
export function stylesFor(kind: MaterialKind): Style[] {
  if (kind === 'card') return ['smooth', 'score', 'perf'];
  if (kind === 'corrugated') return ['smooth', 'kiss', 'perf'];
  return ['smooth', 'lattice'];
}

/** The tightest radius a style bends a material to (mm): on its own, or with its pattern (card perforations a little tighter than scores). */
export function styleReach(m: MaterialProfile, style: Style): number {
  const lim = bendOf(m);
  if (style === 'smooth') return lim.smoothR;
  if (style === 'perf' && m.kind === 'card') return lim.patternR * 0.75;
  return lim.patternR;
}

/** The tightest radius any of a material's styles bends to. */
export const bestReach = (m: MaterialProfile) => Math.min(...stylesFor(m.kind).map((s) => styleReach(m, s)));

/** The style a wall bends with: its choice when its material offers it, else the first that reaches its tightest curve (else the tightest). */
export function resolveStyle(m: MaterialProfile, choice: BendStyle | undefined, minR: number): { style: Style; auto: boolean } {
  const ok = stylesFor(m.kind);
  if (choice && choice !== 'auto' && ok.includes(choice)) return { style: choice, auto: false };
  const fit = ok.find((s) => styleReach(m, s) <= minR + 1e-6);
  if (fit) return { style: fit, auto: true };
  return { style: ok.reduce((a, b) => (styleReach(m, b) < styleReach(m, a) ? b : a)), auto: true };
}

/** A bridge of solid material kept round every hole and joint and from the edges for cut patterns (mm). */
export const bridgeOf = (m: MaterialProfile) => (m.kind === 'plywood' ? Math.max(3, m.thickness) : minWeb(m));

/** Turn each line of a style may take (radians). */
const phiOf = (m: MaterialProfile, style: Style) => bendOf(m).pitch / styleReach(m, style);

/** Headroom on a line's turn before a zone with lines cut short is flagged (the limits are starting points). */
const SLACK = 1.15;

/** One segment of the run, flat: its developed-length range, the turn it makes and its radius. */
type RunSeg = { s0: number; s1: number; turn: number; R: number };

/** The run's segments with their turns (a segment takes half the turn at each of its ends, all of it at an open run's end). */
function runSegs(b: Bent): RunSeg[] {
  const ps = b.pts, n = ps.length - 1;
  if (n < 1) return [];
  const ang = (i: number) => {
    // the segment i direction on the base outline
    const a = ps[i].p, c = ps[i + 1].p;
    return Math.atan2(c.y - a.y, c.x - a.x);
  };
  const wrap = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));
  // turn at vertex i (between segments i − 1 and i)
  const turnAt = (i: number) => {
    if (b.closed) return wrap(ang(i % n) - ang((i + n - 1) % n));
    if (i <= 0 || i >= n) return 0;
    return wrap(ang(i) - ang(i - 1));
  };
  const out: RunSeg[] = [];
  for (let i = 0; i < n; i++) {
    let th: number;
    if (b.closed) th = (turnAt(i) + turnAt(i + 1)) / 2;
    else if (n === 1) th = 0;
    else if (i === 0) th = turnAt(1);
    else if (i === n - 1) th = turnAt(n - 1);
    else th = (turnAt(i) + turnAt(i + 1)) / 2;
    const c = Math.hypot(ps[i + 1].p.x - ps[i].p.x, ps[i + 1].p.y - ps[i].p.y);
    const R = Math.abs(th) < 1e-9 ? Infinity : c / (2 * Math.sin(Math.abs(th) / 2));
    out.push({ s0: ps[i].s, s1: ps[i + 1].s, turn: th, R });
  }
  return out;
}

type Iv = [number, number];
/** Subtract intervals from intervals. */
function subtract(a: Iv[], cut: Iv[]): Iv[] {
  let out = a;
  for (const [c0, c1] of cut) {
    const next: Iv[] = [];
    for (const [x0, x1] of out) {
      if (c1 <= x0 || c0 >= x1) next.push([x0, x1]);
      else {
        if (c0 > x0) next.push([x0, c0]);
        if (c1 < x1) next.push([c1, x1]);
      }
    }
    out = next;
  }
  return out;
}
const lenOf = (a: Iv[]) => a.reduce((s, [x0, x1]) => s + Math.max(0, x1 - x0), 0);

/** Where a vertical line x crosses inside these polygons (even-odd per polygon, merged). */
function insideAt(polys: P2[][], x: number): Iv[] {
  const all: Iv[] = [];
  for (const poly of polys) {
    const ys: number[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if ((a.x <= x) === (b.x <= x)) continue;
      ys.push(a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y));
    }
    ys.sort((p, q) => p - q);
    for (let i = 0; i + 1 < ys.length; i += 2) all.push([ys[i], ys[i + 1]]);
  }
  all.sort((p, q) => p[0] - q[0]);
  const out: Iv[] = [];
  for (const iv of all) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1] + 1e-9) last[1] = Math.max(last[1], iv[1]);
    else out.push([iv[0], iv[1]]);
  }
  return out;
}

/** A keep-out: a polygon on the wall, grown by a margin, and what it is. */
type KeepOut = { poly: P2[]; by: 'shape' | 'joint'; id?: string; x0: number; x1: number };

const box = (poly: P2[]) => {
  let x0 = Infinity, x1 = -Infinity;
  for (const q of poly) (x0 = Math.min(x0, q.x)), (x1 = Math.max(x1, q.x));
  return { x0, x1 };
};

/** The y range a keep-out grown by `m` covers on the line x (null where it does not reach it): the polygon's slice of the band x ± m, grown by m. */
function keepAt(k: KeepOut, x: number, m: number): Iv | null {
  if (x < k.x0 - m || x > k.x1 + m) return null;
  const lo = x - m, hi = x + m;
  let y0 = Infinity, y1 = -Infinity;
  const P = k.poly;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    const ax = Math.min(a.x, b.x), bx = Math.max(a.x, b.x);
    if (bx < lo || ax > hi) continue;
    const at = (xx: number) => (Math.abs(b.x - a.x) < 1e-12 ? [a.y, b.y] : [a.y + ((xx - a.x) / (b.x - a.x)) * (b.y - a.y)]);
    const ys = [...(a.x >= lo && a.x <= hi ? [a.y] : []), ...(b.x >= lo && b.x <= hi ? [b.y] : [])];
    if (ax < lo) ys.push(...at(lo));
    if (bx > hi) ys.push(...at(hi));
    for (const y of ys) (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y));
  }
  return y0 <= y1 ? [y0 - m, y1 + m] : null;
}

/** Everything on the wall a pattern keeps clear of: its own cut shapes, holes and slots, joint notches and tabs, flaps and teeth. */
function keepOuts(d: Design, W: Panel): KeepOut[] {
  const out: KeepOut[] = [];
  const add = (poly: P2[], by: KeepOut['by'], id?: string) => poly.length > 1 && out.push({ poly, by, id, ...box(poly) });
  const own = ownOutline(W);
  for (const h of own.holes) add(h, 'shape');
  for (const { dt, contours } of holeCuts(W)) for (const c of contours) add(flattenContour(c, 0.1), 'shape', dt.id);
  const ex = panelExtras(d, W);
  for (const h of [...ex.holes, ...ex.linerHoles]) add(h, 'joint');
  for (const a of ex.adds) add(a, 'joint');
  for (const k of ex.cuts) add(k, 'joint');
  // joint notches along the outline's edges (tabs on its bottom, fingers on its ends)
  const notches = panelNotches(d, W);
  for (const ring of own.rings)
    for (const e of ring) {
      const ns = notches[e.key];
      if (!ns?.length) continue;
      const dir = segDir(e), L = segLength(e), inw = { x: -dir.y, y: dir.x };
      for (const n of ns) {
        if (n.s1 <= 0 || n.s0 >= L || Math.abs(n.depth) < 1e-9) continue;
        const A = { x: e.a.x + dir.x * n.s0, y: e.a.y + dir.y * n.s0 }, B = { x: e.a.x + dir.x * n.s1, y: e.a.y + dir.y * n.s1 };
        add([A, B, { x: B.x + inw.x * n.depth, y: B.y + inw.y * n.depth }, { x: A.x + inw.x * n.depth, y: A.y + inw.y * n.depth }], 'joint');
      }
    }
  return out;
}

/** Line spacing at radius R: R·φ held between half and twice the material's pitch, or at most the student's spacing. */
function spacingAt(m: MaterialProfile, style: Style, R: number, pitch: number | null | undefined): number {
  const P0 = bendOf(m).pitch, want = R * phiOf(m, style);
  if (pitch) return Math.max(Math.min(pitch, want), Math.min(pitch, 0.5 * P0));
  return Math.min(2 * P0, Math.max(0.5 * P0, want));
}

/** Line positions along a zone: as many as its turn needs at the local spacing, evenly by that measure (half a spacing in from its ends). */
function linePositions(segs: RunSeg[], sp: (R: number) => number): number[] {
  const cum: number[] = [0];
  for (const g of segs) cum.push(cum[cum.length - 1] + (g.s1 - g.s0) / sp(g.R));
  const total = cum[cum.length - 1];
  if (total <= 1e-9) return [];
  const n = Math.max(1, Math.ceil(total - 1e-6));
  const out: number[] = [];
  let i = 0;
  for (let k = 0; k < n; k++) {
    const q = ((k + 0.5) / n) * total;
    while (i < segs.length - 1 && cum[i + 1] < q) i++;
    const g = segs[i], f = (q - cum[i]) / Math.max(1e-12, cum[i + 1] - cum[i]);
    out.push(g.s0 + (g.s1 - g.s0) * f);
  }
  return out;
}

export type PatternLines = { scores: { a: P2; b: P2 }[]; cuts: { a: P2; b: P2 }[] };

/** Short cut dashes along [y0, y1], bridges between them and at both ends. */
function dashes(y0: number, y1: number, dash: number, gap: number, offset: boolean): Iv[] {
  const L = y1 - y0;
  if (L < dash * 0.5) return [];
  const n = Math.max(1, Math.round((L + gap) / (dash + gap)));
  const dl = (L - (n - 1) * gap) / n;
  if (dl <= 0.3) return [];
  const out: Iv[] = [];
  for (let k = 0; k < n; k++) out.push([y0 + k * (dl + gap), y0 + k * (dl + gap) + dl]);
  if (!offset || n < 2) return out;
  // every other line staggered by half a dash, kept inside [y0, y1]
  const sh = (dl + gap) / 2;
  return out
    .map(([a, b]): Iv => [Math.max(y0, a - sh), Math.max(y0, b - sh)])
    .concat([[Math.min(y1, y1 - sh + gap / 2), y1]])
    .filter(([a, b]) => b - a >= Math.min(dl / 2, gap));
}

/** A living hinge's cuts along [y0, y1]: long cuts with bridges at both ends and between them; every other column staggered by half a cut. */
function lattice(y0: number, y1: number, cut: number, bridge: number, odd: boolean): Iv[] {
  const L = y1 - y0;
  if (L < bridge) return [];
  const n = Math.max(1, Math.round((L + bridge) / (cut + bridge)));
  const cl = (L - (n - 1) * bridge) / n;
  const step = cl + bridge;
  const out: Iv[] = [];
  if (!odd) {
    for (let k = 0; k < n; k++) out.push([y0 + k * step, y0 + k * step + cl]);
    return out;
  }
  // shifted half a step: its cuts end on the even column's bridges, clipped to the band
  for (let k = -1; k <= n; k++) {
    const a = Math.max(y0, y0 + k * step + step / 2), b = Math.min(y1, y0 + k * step + step / 2 + cl);
    if (b - a >= bridge) out.push([a, b]);
  }
  return out;
}

/**
 * A bent wall's bend pattern: its zones, the style each got, and the lines cut
 * or scored into it (in its flat coordinates). Null for a wall that is not
 * bent. Reads the wall's joints (its keep-outs), so it runs once they are made.
 */
export function bendPattern(d: Design, W: Panel): { info: BendInfo; lines: PatternLines } | null {
  const b = W.bent;
  if (!b) return null;
  const m = matOf(d, W.id), lim = bendOf(m);
  const choice = W.bend;
  const segs = runSegs(b);
  const { style, auto } = resolveStyle(m, choice?.style, b.minR);
  // which face is up when cut: the student's, else the inside of most of its turn
  let pos = 0, neg = 0;
  for (const g of segs) if (g.R < (auto ? lim.smoothR : Infinity)) (g.turn > 0 ? (pos += g.turn) : (neg -= g.turn));
  const face: 1 | -1 = choice?.face ?? (neg > pos ? -1 : 1);
  const lines: PatternLines = { scores: [], cuts: [] };
  const zones: BendZone[] = [];
  // the zones: runs of segments turning one way that need a pattern (all curved ones for a style the student chose)
  const needs = (g: RunSeg) => Math.abs(g.turn) > 1e-9 && (!auto || g.R < lim.smoothR - 1e-6);
  const groups: RunSeg[][] = [];
  for (const g of segs) {
    const last = groups[groups.length - 1];
    if (!needs(g)) {
      if (last?.length) groups.push([]);
      continue;
    }
    if (last?.length && Math.sign(last[last.length - 1].turn) === Math.sign(g.turn) && Math.abs(last[last.length - 1].s1 - g.s0) < 1e-6) last.push(g);
    else groups.push([g]);
  }
  const keeps = style === 'smooth' ? [] : keepOuts(d, W);
  const notches = panelNotches(d, W);
  const outline = ownOutline(W).rings.flatMap((r) => panelOutlines(W, notches, r));
  const br = bridgeOf(m);
  for (const zs of groups) {
    if (!zs.length) continue;
    const sign: 1 | -1 = zs[0].turn > 0 ? 1 : -1;
    const turn = zs.reduce((s, g) => s + Math.abs(g.turn), 0);
    const zone: BendZone = { s0: zs[0].s0, s1: zs[zs.length - 1].s1, sign, turn, minR: Math.min(...zs.map((g) => g.R)), style, lines: 0, broken: 0 };
    zones.push(zone);
    // a kiss score bends one way only: zones turning the other way are perforated (Auto) or left smooth
    if (style === 'kiss' && sign !== face) zone.style = auto ? 'perf' : 'smooth';
    const zst = zone.style;
    if (zst === 'smooth') continue;
    const cut = zst === 'perf' || zst === 'lattice';
    const xs = linePositions(zs, (R) => spacingAt(m, zst, R, choice?.pitch));
    let effective = 0;
    const byKinds = new Set<'shape' | 'joint'>();
    xs.forEach((x, k) => {
      // the line's run across the wall, less what it keeps clear of (cut lines also a bridge from the wall's ends and edges)
      if (cut && (x < br - 1e-9 || x > W.w - br + 1e-9)) return;
      const full = insideAt(outline, x);
      const blocks: { iv: Iv; k: KeepOut }[] = [];
      for (const ko of keeps) {
        const iv = keepAt(ko, x, cut ? br : minWeb(m) / 2);
        if (iv) blocks.push({ iv, k: ko });
      }
      let kept = subtract(full, blocks.map((q) => q.iv));
      const fullLen = lenOf(full);
      if (fullLen <= 1e-6) return;
      zone.lines++;
      if (lenOf(kept) >= 0.6 * fullLen) effective++;
      else {
        zone.broken++;
        for (const q of blocks) byKinds.add(q.k.by);
        zone.by = byKinds.has('shape') ? 'shape' : 'joint';
        zone.byId ??= blocks.find((q) => q.k.by === 'shape' && q.k.id)?.k.id;
      }
      if (cut) kept = kept.map(([a, c]): Iv => [a + br, c - br]).filter(([a, c]) => c - a > 0.3);
      for (const [y0, y1] of kept) {
        if (!cut) {
          lines.scores.push({ a: { x, y: y0 }, b: { x, y: y1 } });
          continue;
        }
        const parts = zst === 'perf' ? dashes(y0, y1, m.kind === 'card' ? 3 : 5, m.kind === 'card' ? 1 : 1.5, k % 2 === 1) : lattice(y0, y1, 20, br, k % 2 === 1);
        for (const [a, c] of parts) lines.cuts.push({ a: { x, y: a }, b: { x, y: c } });
      }
    });
    // too few lines left to turn the zone: a shape or joint is in the way
    if (zone.broken && effective * phiOf(m, zst) * SLACK < turn) zone.by ??= 'joint';
    else {
      delete zone.by;
      delete zone.byId;
    }
  }
  const used = new Set(zones.map((z) => z.style));
  const reach = Math.min(styleReach(m, style), ...[...used].map((s) => styleReach(m, s)));
  const mirror = used.has('kiss') && face !== W.frame.side;
  return { info: { style, auto, face, mirror, zones, reach, pitch: choice?.pitch ?? lim.pitch }, lines };
}

/**
 * Make every bent wall's pattern and put its lines in the geometry of the
 * wall's joint with its base (scores on the score layer, open cut lines).
 * Runs in `solve` once every joint is made, so the keep-outs are known.
 */
export function applyBendPatterns(d: Design) {
  for (const c of Object.values(d.connections)) {
    if (!c.grown || !c.geom || c.broken) continue;
    const W = d.panels[c.b.panelId];
    if (!W?.bent || W.bent.run !== c.a.edge) continue;
    const r = bendPattern(d, W);
    if (!r) continue;
    W.bent.pattern = r.info;
    for (const s of r.lines.scores) c.geom.scores.push({ panelId: W.id, a: s.a, b: s.b });
    if (r.lines.cuts.length) c.geom.lines = [...(c.geom.lines ?? []), ...r.lines.cuts.map((s) => ({ panelId: W.id, a: s.a, b: s.b }))];
  }
}

/** The style a material's bend test is patterned with: its kind's pattern. */
export const testStyle = (m: MaterialProfile): Style => (m.kind === 'card' ? 'score' : m.kind === 'corrugated' ? 'kiss' : 'lattice');

/**
 * The lines of a plain patterned zone (the bend test, milestone 47): `len` mm
 * long from x0, `h` mm high, bending to radius R with the style's pattern at
 * its automatic spacing; cut patterns keep a bridge from the edges.
 */
export function zoneLines(m: MaterialProfile, style: Style, R: number, x0: number, len: number, h: number): PatternLines {
  const out: PatternLines = { scores: [], cuts: [] };
  if (style === 'smooth') return out;
  const xs = linePositions([{ s0: x0, s1: x0 + len, turn: len / R, R }], (r) => spacingAt(m, style, r, null));
  const br = bridgeOf(m);
  xs.forEach((x, k) => {
    if (style === 'score' || style === 'kiss') return void out.scores.push({ a: { x, y: 0 }, b: { x, y: h } });
    const parts = style === 'perf' ? dashes(br, h - br, m.kind === 'card' ? 3 : 5, m.kind === 'card' ? 1 : 1.5, k % 2 === 1) : lattice(br, h - br, 20, br, k % 2 === 1);
    for (const [a, c] of parts) out.cuts.push({ a: { x, y: a }, b: { x, y: c } });
  });
  return out;
}
