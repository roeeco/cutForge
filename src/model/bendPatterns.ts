// Bend patterns (milestone 63, PACKAGING_PLAN.md §5). A band of material that
// bends tighter than the material does on its own gets lines across it,
// parallel to the bend axis. Each pattern is an entry in this registry: the
// materials it suits, the tightest radius it reaches in a given band, why it
// cannot be used there, and the lines it draws.
//
// Band coordinates: x across the band (its developed width, 0..width), y
// along the bend axis (0..len). Lines run along y.
//
// Density is worked out, never typed:
// - line patterns (scores): each line lets the band turn by φ = pitch / reach,
//   so the spacing is ρ·φ (ρ the band's neutral radius), held between half and
//   twice the material's pitch;
// - slits (plywood living hinges): the links between two columns twist. A link
//   of free length ℓ with thinner side c twists safely by C·ℓ/c (C the
//   material's allowed shear strain); the turn one column must take at spacing
//   p is p/ρ, so p = sqrt(C·ℓ·ρ) while p ≤ t, else C·ℓ·ρ/t.
// The student may only ask for denser lines (`density` < 1), never sparser.
import type { BendDensity, MaterialKind, MaterialProfile, PatternId } from './types';
import { bendOf, minWeb } from './materials';

export type BandCtx = {
  m: MaterialProfile;
  /** Inner radius (mm). */
  r: number;
  /** Length of the band along its bend axis: how long a line can be (mm). */
  len: number;
  /** The band's developed width across the bend (mm). */
  width: number;
  /** How far it turns (radians). */
  turn: number;
};

/** Why a pattern cannot be used in a band: the radius is tighter than it reaches (`value`: the radius it needs), the band is too short for its lines (`value`: the length it needs), or it is not for this material. */
export type PatternWhy = { key: 'radius' | 'short' | 'material'; value?: number };

export type Seg = { a: { x: number; y: number }; b: { x: number; y: number } };
/** Lines across a band: scores, straight cut lines, and cut paths (milestone 66: a wave slit, open; a diamond, closed). */
export type PatternLines = { scores: Seg[]; cuts: Seg[]; paths: { pts: { x: number; y: number }[]; closed: boolean }[] };

/** A band's pattern as drawn: which, chosen automatically or not, why it falls short (null when it works), its lines and their spacing. */
export type BandPattern = { id: PatternId; auto: boolean; why: PatternWhy | null; lines: PatternLines; spacing: number; count: number };

type Def = {
  id: PatternId;
  kinds: MaterialKind[];
  /** The tightest inner radius it reaches in this band (Infinity: it cannot be made here at all). */
  reach: (c: BandCtx) => number;
  /** Why it cannot be made here regardless of the radius (a band too short for its lines). */
  blocked?: (c: BandCtx) => PatternWhy | null;
  /** Its lines at density f (1: automatic; less: denser). */
  draw: (c: BandCtx, f: number) => { lines: PatternLines; spacing: number; count: number };
};

const neutral = (c: BandCtx) => c.r + bendOf(c.m).k * c.m.thickness;
const none = () => ({ lines: { scores: [], cuts: [], paths: [] } as PatternLines, spacing: 0, count: 0 });

/** Positions of n lines evenly across a band, half a spacing in from each side. */
const across = (width: number, n: number) => Array.from({ length: n }, (_, k) => ((k + 0.5) * width) / n);

/** Score lines: as many as the turn needs at the local spacing, evenly. */
function lineDraw(c: BandCtx, f: number, reach: number) {
  const lim = bendOf(c.m), P = lim.pitch;
  const phi = P / reach;
  const sp = Math.min(2 * P, Math.max(0.5 * P, neutral(c) * phi)) * f;
  const n = Math.max(1, Math.ceil(c.width / sp - 1e-9));
  return { xs: across(c.width, n), spacing: c.width / n, count: n };
}

/** A living hinge's bridges: from the band's edges and between slits (mm). */
export const hingeBridge = (m: MaterialProfile) => Math.max(3, m.thickness);
/** The closest two slit columns may be (mm): a laser's kerf and the heat it leaves limit it. */
export const minSlitSpacing = (m: MaterialProfile) => Math.max(1.2, m.thickness / 2);
/** The longest slit (mm). */
const SLIT_MAX = 24;
/** The shear strain plywood's links may take (starting value for 3 mm: it reproduces 2 mm spacing at R 30 with 20 mm slits). */
export const strainOf = (m: MaterialProfile) => bendOf(m).strain ?? 0.016;

/** How a band's length is shared by slits: their count, length and the links' free length ℓ; null when it is too short for one. */
export function slitLayout(m: MaterialProfile, len: number): { n: number; S: number; ell: number } | null {
  const b = hingeBridge(m);
  const usable = len - 2 * b;
  // as few slits as keep each within the longest (longer links bend tighter, but a longer slit is floppier)
  const n = Math.max(1, Math.ceil((usable + b) / (SLIT_MAX + b) - 1e-9));
  const S = (usable - (n - 1) * b) / n;
  const ell = (S - b) / 2;
  return ell >= 1 ? { n, S, ell } : null;
}
/** The shortest band a living hinge fits: two edge bridges and one slit with links of 1 mm. */
export const slitMinLen = (m: MaterialProfile) => 3 * hingeBridge(m) + 2;

/** Slit column spacing for a neutral radius ρ and link length ℓ. */
export function slitSpacing(m: MaterialProfile, rho: number, ell: number): number {
  const C = strainOf(m), t = m.thickness;
  const p = Math.sqrt(C * ell * rho);
  return p <= t ? p : (C * ell * rho) / t;
}

/** Perforations reach a little tighter than scores on card, as tight as the material's pattern on corrugated. */
const perfReach = (m: MaterialProfile) => bendOf(m).patternR * (m.kind === 'card' ? 0.75 : 1);

/**
 * Plywood living hinges, slit by slit (milestone 66 adds two shapes): straight
 * slits; wave slits (S-shaped: the links between them are longer, so they bend
 * a little tighter, with columns further apart); diamonds (lens-shaped holes:
 * loosest and lightest, least stiff, the tightest of the three). `ell` scales the links' free length,
 * `gap` the closest the columns may be. Starting values, to calibrate with the
 * bend test like the rest.
 */
type SlitKind = { ell: number; gap: number; shape: 'line' | 'wave' | 'diamond' };
const SLITS: SlitKind = { ell: 1, gap: 1, shape: 'line' };
const WAVE: SlitKind = { ell: 1.6, gap: 1.2, shape: 'wave' };
const DIAMOND: SlitKind = { ell: 2.2, gap: 1.3, shape: 'diamond' };

function slitLike(id: PatternId, sk: SlitKind): Def {
  const pmin = (m: MaterialProfile) => minSlitSpacing(m) * sk.gap;
  return {
    id,
    kinds: ['plywood'],
    reach: (c) => {
      const L = slitLayout(c.m, c.len);
      if (!L) return Infinity;
      // the radius at which the spacing reaches its smallest
      const C = strainOf(c.m), t = c.m.thickness, pm = pmin(c.m), ell = L.ell * sk.ell;
      const rho = pm <= t ? (pm * pm) / (C * ell) : (pm * t) / (C * ell);
      return Math.max(0, rho - bendOf(c.m).k * t);
    },
    blocked: (c) => (slitLayout(c.m, c.len) ? null : { key: 'short', value: slitMinLen(c.m) }),
    draw: (c, f) => {
      const L = slitLayout(c.m, c.len);
      if (!L) return none();
      const p = Math.max(pmin(c.m), slitSpacing(c.m, neutral(c), L.ell * sk.ell) * f);
      const n = Math.max(2, Math.ceil(c.width / p - 1e-9));
      const pc = c.width / n;
      const b = hingeBridge(c.m), step = L.S + b;
      const cuts: Seg[] = [], paths: PatternLines['paths'] = [];
      const one = (x: number, y0: number, y1: number) => {
        if (sk.shape === 'line') return void cuts.push({ a: { x, y: y0 }, b: { x, y: y1 } });
        if (sk.shape === 'wave') {
          // two waves along the slit, a quarter of the column spacing either side
          const amp = pc / 4, k = Math.max(8, Math.ceil(y1 - y0));
          const pts = Array.from({ length: k + 1 }, (_, i) => ({ x: x + amp * Math.sin((4 * Math.PI * i) / k), y: y0 + ((y1 - y0) * i) / k }));
          return void paths.push({ pts, closed: false });
        }
        // a diamond: pointed at both ends, as wide as a little under half the column spacing
        const w = Math.min(0.45 * pc, 2.5), e = Math.min((y1 - y0) / 4, 3 * w);
        paths.push({ pts: [{ x, y: y0 }, { x: x + w / 2, y: y0 + e }, { x: x + w / 2, y: y1 - e }, { x, y: y1 }, { x: x - w / 2, y: y1 - e }, { x: x - w / 2, y: y0 + e }], closed: true });
      };
      across(c.width, n).forEach((x, k) => {
        if (k % 2 === 0) {
          for (let j = 0; j < L.n; j++) one(x, b + j * step, b + j * step + L.S);
          return;
        }
        // the other columns are shifted half a step: their slits end on this column's bridges, kept a bridge from the edges
        for (let j = -1; j <= L.n; j++) {
          const y0 = Math.max(b, b + j * step + step / 2), y1 = Math.min(c.len - b, b + j * step + step / 2 + L.S);
          if (y1 - y0 >= b) one(x, y0, y1);
        }
      });
      return { lines: { scores: [], cuts, paths }, spacing: pc, count: n };
    },
  };
}

const DEFS: Def[] = [
  {
    id: 'smooth',
    kinds: ['card', 'corrugated', 'plywood'],
    reach: (c) => bendOf(c.m).smoothR,
    draw: none,
  },
  {
    id: 'score',
    kinds: ['card'],
    reach: (c) => bendOf(c.m).patternR,
    draw: (c, f) => {
      const { xs, spacing, count } = lineDraw(c, f, bendOf(c.m).patternR);
      return { lines: { scores: xs.map((x) => ({ a: { x, y: 0 }, b: { x, y: c.len } })), cuts: [], paths: [] }, spacing, count };
    },
  },
  slitLike('slits', SLITS),
  slitLike('wave', WAVE),
  slitLike('diamond', DIAMOND),
  {
    id: 'kiss',
    kinds: ['corrugated'],
    reach: (c) => bendOf(c.m).patternR,
    draw: (c, f) => {
      // scores in the inner liner only: the band's inside faces up when cut (the piece is mirrored in the file)
      const { xs, spacing, count } = lineDraw(c, f, bendOf(c.m).patternR);
      return { lines: { scores: xs.map((x) => ({ a: { x, y: 0 }, b: { x, y: c.len } })), cuts: [], paths: [] }, spacing, count };
    },
  },
  {
    id: 'perf',
    kinds: ['card', 'corrugated'],
    reach: (c) => perfReach(c.m),
    draw: (c, f) => {
      const { xs, spacing, count } = lineDraw(c, f, perfReach(c.m));
      const card = c.m.kind === 'card';
      const dash = card ? 3 : 5, gap = card ? 1 : 1.5, br = minWeb(c.m);
      const cuts: Seg[] = [];
      xs.forEach((x, k) => {
        // dashes with a bridge from the band's edges; every other line staggered by half a dash
        const y0 = br, y1 = c.len - br, L = y1 - y0;
        if (L < dash) return;
        const n = Math.max(1, Math.round((L + gap) / (dash + gap)));
        const dl = (L - (n - 1) * gap) / n, sh = k % 2 ? (dl + gap) / 2 : 0;
        for (let j = -1; j < n; j++) {
          const a = Math.max(y0, y0 + j * (dl + gap) + sh), b = Math.min(y1, y0 + j * (dl + gap) + sh + dl);
          if (b - a >= Math.min(dl / 2, gap)) cuts.push({ a: { x, y: a }, b: { x, y: b } });
        }
      });
      return { lines: { scores: [], cuts, paths: [] }, spacing, count };
    },
  },
];

const byId = new Map(DEFS.map((x) => [x.id, x]));

/** The patterns a kind of material offers, in the order Automatic tries them. */
export function patternsFor(kind: MaterialKind): PatternId[] {
  return DEFS.filter((x) => x.kinds.includes(kind)).map((x) => x.id);
}

/** Why a pattern cannot be used in this band (null: it can). */
export function patternWhy(id: PatternId, c: BandCtx): PatternWhy | null {
  const def = byId.get(id);
  if (!def || !def.kinds.includes(c.m.kind)) return { key: 'material' };
  const b = def.blocked?.(c);
  if (b) return b;
  const reach = def.reach(c);
  return c.r < reach - 1e-6 ? { key: 'radius', value: Math.ceil(reach * 10) / 10 } : null;
}

/** The tightest radius a pattern reaches in this band (Infinity when it cannot be made there). */
export const patternReach = (id: PatternId, c: BandCtx) => byId.get(id)?.reach(c) ?? Infinity;

/** The tightest radius any of the material's patterns reaches in this band. */
export function bestReach(c: BandCtx): number {
  return Math.min(...patternsFor(c.m.kind).map((id) => (byId.get(id)!.blocked?.(c) ? Infinity : patternReach(id, c))));
}

/**
 * A band's pattern: the student's choice when the material offers it (with
 * why it falls short, if it does), else the first that works here, else the
 * one that reaches tightest (flagged). Drawn at the asked density.
 */
export function bandPattern(c: BandCtx, choice: PatternId | 'auto' | undefined, density: BendDensity = 1): BandPattern {
  // a pattern depends only on these numbers: worked out once (shared, so callers must not change it)
  const m = c.m, b = bendOf(m);
  const key = [m.kind, m.thickness, m.clearance, b.smoothR, b.patternR, b.pitch, b.k, b.strain ?? '', c.r, c.len, c.width, c.turn, choice ?? '', density].join('|');
  const hit = patternCache.get(key);
  if (hit) return hit;
  const out = drawBand(c, choice, density);
  if (patternCache.size > 500) patternCache.clear();
  patternCache.set(key, out);
  return out;
}
const patternCache = new Map<string, BandPattern>();

function drawBand(c: BandCtx, choice: PatternId | 'auto' | undefined, density: BendDensity): BandPattern {
  const ok = patternsFor(c.m.kind);
  let id: PatternId, auto = true;
  if (choice && choice !== 'auto' && ok.includes(choice)) {
    id = choice;
    auto = false;
  } else {
    id = ok.find((x) => !patternWhy(x, c)) ?? ok.reduce((x, y) => (patternReach(y, c) < patternReach(x, c) ? y : x));
  }
  const why = patternWhy(id, c);
  const r = byId.get(id)!.draw(c, density);
  return { id, auto, why, ...r };
}
