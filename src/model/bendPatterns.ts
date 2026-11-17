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
export type PatternLines = { scores: Seg[]; cuts: Seg[] };

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
const none = () => ({ lines: { scores: [], cuts: [] }, spacing: 0, count: 0 });

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
      return { lines: { scores: xs.map((x) => ({ a: { x, y: 0 }, b: { x, y: c.len } })), cuts: [] }, spacing, count };
    },
  },
  {
    id: 'slits',
    kinds: ['plywood'],
    reach: (c) => {
      const L = slitLayout(c.m, c.len);
      if (!L) return Infinity;
      // the radius at which the spacing reaches its smallest
      const C = strainOf(c.m), t = c.m.thickness, pm = minSlitSpacing(c.m);
      const rho = pm <= t ? (pm * pm) / (C * L.ell) : (pm * t) / (C * L.ell);
      return Math.max(0, rho - bendOf(c.m).k * t);
    },
    blocked: (c) => (slitLayout(c.m, c.len) ? null : { key: 'short', value: slitMinLen(c.m) }),
    draw: (c, f) => {
      const L = slitLayout(c.m, c.len);
      if (!L) return none();
      const p = Math.max(minSlitSpacing(c.m), slitSpacing(c.m, neutral(c), L.ell) * f);
      const n = Math.max(2, Math.ceil(c.width / p - 1e-9));
      const b = hingeBridge(c.m), step = L.S + b;
      const cuts: Seg[] = [];
      across(c.width, n).forEach((x, k) => {
        if (k % 2 === 0) {
          for (let j = 0; j < L.n; j++) cuts.push({ a: { x, y: b + j * step }, b: { x, y: b + j * step + L.S } });
          return;
        }
        // the other columns are shifted half a step: their slits end on this column's bridges, kept a bridge from the edges
        for (let j = -1; j <= L.n; j++) {
          const y0 = Math.max(b, b + j * step + step / 2), y1 = Math.min(c.len - b, b + j * step + step / 2 + L.S);
          if (y1 - y0 >= b) cuts.push({ a: { x, y: y0 }, b: { x, y: y1 } });
        }
      });
      return { lines: { scores: [], cuts }, spacing: c.width / n, count: n };
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
