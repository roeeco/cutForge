// Parts (milestone 183, BOXES_PLYWOOD_PLAN.md E10; BOXES_PRESETS_PLAN.md §5 "Parts: shapes, not presets"): shapes
// with their own sizes, drawn from those sizes each time they change (as text is drawn from its letters), offered in
// the Shapes tool on any board, as a cut, an engraving or a board of their own. boxes.py's gears, pulley, knobs, hole
// patterns, fan hole, NEMA pattern, seven-segment pattern, drill gauge and jigsaw were read for what they make and
// their usual sizes (a behaviour reference only: THIRD_PARTY.md); every outline here is written fresh. The gear's is
// the textbook one: an involute of its base circle above it, and below, the path the corner of a standard rack cutter
// sweeps as the gear rolls on its pitch line (the undercut a small gear has), each tooth thinned by a backlash.
//
// A part's outline is in mm about its centre, y up. A *piece* (gear, pulley, knob) is one outline and the holes in it
// (its bore): made a board, the outline is the board and the holes are cut in it; on a board, the outline is what is
// cut or engraved (its bore only engraved, `partPolys`). A *pattern* (holes, fan grille, NEMA, digits, drill gauge) is
// holes to cut in a board; made a board, it is cut in a plate round it (`partPlate`).
import type { MsgKey } from '../i18n';
import type { P2 } from './types';

export type PartKind = 'gear' | 'pulley' | 'knob' | 'holes' | 'fan' | 'nema' | 'digits' | 'gauge';
/** A part's sizes: its kind and its words (numbers in mm or degrees, or a choice's value). */
export type PartSpec = { kind: PartKind; p: Record<string, number | string> };

export type PartParam = {
  key: string;
  label: MsgKey;
  type: 'number' | 'int' | 'choice';
  unit?: 'mm' | 'deg';
  min?: number;
  max?: number;
  step?: number;
  default: number | string;
  options?: { value: string; label: MsgKey }[];
};
export type PartDef = { kind: PartKind; key: MsgKey; icon: string; piece: boolean; params: PartParam[] };

const num = (key: string, label: MsgKey, min: number, max: number, dflt: number, step = 0.5, unit: 'mm' | 'deg' = 'mm'): PartParam => ({ key, label, type: 'number', unit, min, max, default: dflt, step });
const int = (key: string, label: MsgKey, min: number, max: number, dflt: number): PartParam => ({ key, label, type: 'int', min, max, default: dflt });
const choice = (key: string, label: MsgKey, values: string[], dflt: string, prefix: string): PartParam => ({ key, label, type: 'choice', default: dflt, options: values.map((v) => ({ value: v, label: `${prefix}.${v}` as MsgKey })) });
const BORES = ['round', 'dflat', 'hex'];

/** The parts, in the Shapes menu's order. */
export const PARTS: PartDef[] = [
  {
    kind: 'gear', key: 'part.gear', icon: 'gear', piece: true,
    params: [num('module', 'part.module', 1, 10, 2, 0.25), int('teeth', 'part.teeth', 8, 120, 20), num('angle', 'part.angle', 14.5, 25, 20, 0.5, 'deg'), num('bore', 'part.bore', 0, 100, 6), choice('boreKind', 'part.boreKind', BORES, 'round', 'part.boreKind'), num('backlash', 'part.backlash', 0, 1, 0.2, 0.05)],
  },
  {
    kind: 'pulley', key: 'part.pulley', icon: 'pulley', piece: true,
    params: [choice('profile', 'part.profile', ['gt2', 'gt3', 't5'], 'gt2', 'part.profile'), int('teeth', 'part.teeth', 10, 150, 30), num('bore', 'part.bore', 0, 100, 5), choice('boreKind', 'part.boreKind', BORES, 'round', 'part.boreKind')],
  },
  {
    kind: 'knob', key: 'part.knob', icon: 'knob', piece: true,
    params: [choice('style', 'part.knobStyle', ['concave', 'wavy'], 'concave', 'part.knobStyle'), num('diameter', 'part.diameter', 15, 200, 40), int('bites', 'part.bites', 5, 24, 8), num('depth', 'part.depth', 1, 20, 3), num('bore', 'part.bore', 0, 50, 6), choice('boreKind', 'part.boreKind', BORES, 'dflat', 'part.boreKind'), num('flat', 'part.flat', 0.3, 5, 1, 0.1)],
  },
  {
    kind: 'holes', key: 'part.holes', icon: 'holes', piece: false,
    params: [choice('grid', 'part.grid', ['hex', 'square'], 'hex', 'part.grid'), choice('area', 'part.area', ['rect', 'circle'], 'rect', 'part.area'), num('width', 'part.width', 10, 1000, 80, 1), num('height', 'part.height', 10, 1000, 60, 1), num('hole', 'part.hole', 1, 50, 5), num('pitch', 'part.pitch', 2, 100, 8)],
  },
  {
    kind: 'fan', key: 'part.fan', icon: 'fan', piece: false,
    params: [choice('size', 'part.fanSize', ['40', '60', '80', '92', '120'], '80', 'part.fanSize'), int('slots', 'part.slots', 3, 16, 8), num('web', 'part.web', 1, 10, 2.5), num('swirl', 'part.swirl', 0, 90, 40, 1, 'deg'), choice('screws', 'part.screws', ['yes', 'no'], 'yes', 'part.screws')],
  },
  {
    kind: 'nema', key: 'part.nema', icon: 'nema', piece: false,
    params: [choice('size', 'part.nemaSize', ['14', '17', '23'], '17', 'part.nemaSize')],
  },
  {
    kind: 'digits', key: 'part.digits', icon: 'digits', piece: false,
    params: [int('count', 'part.count', 1, 8, 1), num('height', 'part.height', 10, 300, 40, 1), num('stroke', 'part.stroke', 1, 40, 5), num('gap', 'part.gap', 0.5, 10, 1, 0.25), num('slant', 'part.slant', 0, 15, 8, 1, 'deg')],
  },
  {
    kind: 'gauge', key: 'part.gauge', icon: 'gauge', piece: false,
    params: [num('from', 'part.from', 1, 30, 2), num('to', 'part.to', 1, 40, 10), num('step', 'part.step', 0.1, 5, 0.5, 0.1)],
  },
];

export const partDef = (k: PartKind) => PARTS.find((x) => x.kind === k)!;
export const PART_KINDS = PARTS.map((x) => x.kind);

/** A part's words with its defaults filled in and every number held to its limits. */
export function partParams(spec: PartSpec): Record<string, number | string> {
  const def = partDef(spec.kind);
  const out: Record<string, number | string> = {};
  for (const q of def.params) {
    const v = spec.p[q.key];
    if (q.type === 'choice') out[q.key] = q.options!.some((o) => o.value === v) ? (v as string) : (q.default as string);
    else {
      let n = typeof v === 'number' && Number.isFinite(v) ? v : (q.default as number);
      n = Math.max(q.min ?? -Infinity, Math.min(q.max ?? Infinity, n));
      out[q.key] = q.type === 'int' ? Math.round(n) : n;
    }
  }
  return out;
}

export const defaultPart = (k: PartKind): PartSpec => ({ kind: k, p: partParams({ kind: k, p: {} }) });

// --- small geometry ---

const TAU = 2 * Math.PI;
const polar = (r: number, a: number): P2 => ({ x: r * Math.cos(a), y: r * Math.sin(a) });
/** A circle as a polygon, CCW, fine enough for the laser (a side of 1 mm at most, 12 sides at least). */
export function circlePoly(cx: number, cy: number, r: number, n = Math.max(12, Math.min(96, Math.ceil((TAU * r) / 1)))): P2[] {
  return Array.from({ length: n }, (_, i) => ({ x: cx + r * Math.cos((TAU * i) / n), y: cy + r * Math.sin((TAU * i) / n) }));
}
const area = (q: P2[]) => q.reduce((s, p, i) => s + p.x * q[(i + 1) % q.length].y - q[(i + 1) % q.length].x * p.y, 0) / 2;
const ccw = (q: P2[]) => (area(q) < 0 ? [...q].reverse() : q);
/** Drop points closer than `eps` to the one before (and the last to the first). */
function dedupe(q: P2[], eps = 1e-4): P2[] {
  const out: P2[] = [];
  for (const p of q) if (!out.length || Math.hypot(p.x - out[out.length - 1].x, p.y - out[out.length - 1].y) > eps) out.push(p);
  while (out.length > 2 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= eps) out.pop();
  return out;
}

/** A bore: round, round with a flat (a D shaft: the flat `flat` mm in from the round), or a hexagon `d` across its flats (a nut). */
export function borePoly(kind: string, d: number, flat = 1): P2[] {
  const r = d / 2;
  if (kind === 'hex') {
    const R = r / Math.cos(Math.PI / 6);
    return Array.from({ length: 6 }, (_, i) => polar(R, (TAU * i) / 6));
  }
  if (kind === 'dflat') {
    // the round, cut by a chord `flat` in from it (at the top)
    const f = Math.min(Math.max(0.1, flat), r * 0.9);
    const y0 = r - f, a0 = Math.asin(y0 / r);
    const pts: P2[] = [];
    const n = Math.max(16, Math.ceil(TAU * r));
    // from the flat's right end round the long way to its left end
    for (let i = 0; i <= n; i++) pts.push(polar(r, a0 - ((TAU - (Math.PI - 2 * a0)) * i) / n));
    return ccw(dedupe(pts));
  }
  return circlePoly(0, 0, r);
}

// --- the gear ---

const inv = (a: number) => Math.tan(a) - a;

/** A spur gear's circles (mm): pitch, base, tip (addendum) and root (dedendum) radii. */
export function gearCircles(module: number, teeth: number, angleDeg = 20): { r: number; rb: number; ra: number; rf: number } {
  const r = (module * teeth) / 2, a = (angleDeg * Math.PI) / 180;
  return { r, rb: r * Math.cos(a), ra: r + module, rf: r - 1.25 * module };
}

/** Centre distance of two gears of one module meshing (standard, no profile shift). */
export const gearCentres = (module: number, z1: number, z2: number) => (module * (z1 + z2)) / 2;

/**
 * A tooth's half-angle at radius ρ (radians from its centre line): the smaller of the involute flank's (above the base
 * circle) and the rack cutter's corner's sweep (the trochoid, from the root up); the tooth thinned by `backlash` at
 * the pitch circle.
 */
function toothHalfAngle(m: number, z: number, alpha: number, backlash: number): (rho: number) => number {
  const r = (m * z) / 2, rb = r * Math.cos(alpha), h = 1.25 * m;
  const s = (Math.PI * m) / 2 - backlash;
  const thp = s / (2 * r);
  // the rack's tooth, as wide at the pitch line as the gear's space; its corner `h` into the gear
  const xc = (Math.PI * m) / 2 - ((Math.PI * m - s) / 2 - h * Math.tan(alpha));
  const yc = r - h;
  return (rho: number) => {
    const inv0 = rho >= rb ? thp + inv(alpha) - inv(Math.acos(Math.min(1, rb / rho))) : Infinity;
    const k = Math.sqrt(Math.max(0, rho * rho - yc * yc));
    const phi = (xc + k) / r;
    const tro = phi - Math.atan2(k, yc);
    return Math.min(inv0, tro);
  };
}

/** A spur gear's outline, CCW about its centre, a tooth centred on +x. */
export function gearOutline(m: number, z: number, angleDeg = 20, backlash = 0.2): P2[] {
  const alpha = (angleDeg * Math.PI) / 180;
  const { ra, rf } = gearCircles(m, z, angleDeg);
  const H = toothHalfAngle(m, z, alpha, Math.min(backlash, (Math.PI * m) / 4));
  // the tip: where the tooth still has width (a small gear's teeth may come to a point below the addendum)
  let top = ra;
  if (H(top) < 0.02 / top) {
    let lo = rf, hi = ra;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (H(mid) > 0.02 / mid) lo = mid;
      else hi = mid;
    }
    top = lo;
  }
  // radii up the flank, closer near the root, where the fillet turns
  const N = 14;
  const rhos = Array.from({ length: N + 1 }, (_, i) => rf + (top - rf) * (1 - Math.cos((Math.PI * i) / (2 * N))));
  const pitch = TAU / z;
  const pts: P2[] = [];
  for (let k = 0; k < z; k++) {
    const c = k * pitch;
    // the right flank up, over the tip, the left flank down, then the root to the next tooth
    for (const rho of rhos) pts.push(polar(rho, c - Math.max(0, H(rho))));
    const ht = Math.max(0, H(top));
    for (let i = 1; i < 4; i++) pts.push(polar(top, c - ht + (2 * ht * i) / 4));
    for (const rho of [...rhos].reverse()) pts.push(polar(rho, c + Math.max(0, H(rho))));
    const a0 = c + H(rf), a1 = c + pitch - H(rf);
    const n = Math.max(1, Math.ceil(((a1 - a0) * rf) / 1));
    for (let i = 1; i < n; i++) pts.push(polar(rf, a0 + ((a1 - a0) * i) / n));
  }
  return dedupe(pts, 1e-3);
}

// --- the pulley ---

/** Timing belts (a simple profile: a round-bottomed groove per tooth, not the belt makers' exact curves): pitch, pitch line offset, groove depth and width (mm). */
export const BELTS: Record<string, { pitch: number; pld: number; depth: number; width: number }> = {
  gt2: { pitch: 2, pld: 0.254, depth: 0.75, width: 1.14 },
  gt3: { pitch: 3, pld: 0.381, depth: 1.14, width: 1.7 },
  t5: { pitch: 5, pld: 0.3, depth: 1.2, width: 2.65 },
};

/** A timing pulley's outer diameter: its pitch circle less the belt's pitch line offset each side. */
export const pulleyDiameter = (profile: string, teeth: number) => {
  const b = BELTS[profile] ?? BELTS.gt2;
  return (teeth * b.pitch) / Math.PI - 2 * b.pld;
};

export function pulleyOutline(profile: string, teeth: number): P2[] {
  const b = BELTS[profile] ?? BELTS.gt2;
  const R = pulleyDiameter(profile, teeth) / 2;
  const pitch = TAU / teeth;
  const w = b.width / 2;
  // a groove: straight sides down to `bottom`, then half an ellipse to the groove's depth
  const bottom = Math.max(0, b.depth - w), round = b.depth - bottom;
  const g = Math.asin(Math.min(0.99, w / R)), lip = R * (1 - Math.cos(g));
  const pts: P2[] = [];
  for (let k = 0; k < teeth; k++) {
    const c = k * pitch;
    // the land between grooves, on the outer circle
    const l0 = c + g, l1 = c + pitch - g;
    for (let i = 0; i <= 4; i++) pts.push(polar(R, l0 + ((l1 - l0) * i) / 4));
    // the next groove, centred on c + pitch, in its own frame: along the rim, and down from it
    const gc = c + pitch;
    const ux = Math.cos(gc), uy = Math.sin(gc), tx = -uy, ty = ux;
    const at = (along: number, down: number): P2 => ({ x: (R - down) * ux + along * tx, y: (R - down) * uy + along * ty });
    if (bottom > lip + 0.01) pts.push(at(-w, bottom));
    for (let i = 1; i < 8; i++) {
      const a = Math.PI + (Math.PI * i) / 8;
      pts.push(at(w * Math.cos(a), bottom - round * Math.sin(a)));
    }
    if (bottom > lip + 0.01) pts.push(at(w, bottom));
  }
  return ccw(dedupe(pts, 1e-3));
}

// --- the knob ---

export function knobOutline(style: string, diameter: number, bites: number, depth: number): P2[] {
  const R = diameter / 2, n = Math.max(3, Math.round(bites));
  const dep = Math.min(depth, R * 0.4);
  if (style === 'wavy') {
    const per = 24, pts: P2[] = [];
    for (let i = 0; i < n * per; i++) {
      const a = (TAU * i) / (n * per);
      pts.push(polar(R - (dep * (1 - Math.cos(n * a))) / 2, a));
    }
    return pts;
  }
  // concave: n round bites into the rim, each spanning half the pitch
  const g = Math.PI / (2 * n);
  const d = Math.max(dep, R * (1 - Math.cos(g)) + 0.2);
  const a = R - d;
  const rr = (R * R + a * a - 2 * R * a * Math.cos(g)) / (2 * (R * Math.cos(g) - a));
  const Rc = a + rr;
  const pts: P2[] = [];
  for (let k = 0; k < n; k++) {
    const c = (TAU * k) / n;
    // the rim from the last bite to this one
    const r0 = c - TAU / n + g, r1 = c - g;
    const nr = Math.max(2, Math.ceil(((r1 - r0) * R) / 1.5));
    for (let i = 0; i < nr; i++) pts.push(polar(R, r0 + ((r1 - r0) * i) / nr));
    // the bite: an arc of the circle about (Rc, c), from where it meets the rim, in towards the centre
    const cx = Rc * Math.cos(c), cy = Rc * Math.sin(c);
    const p0 = polar(R, c - g), p1 = polar(R, c + g);
    const b0 = Math.atan2(p0.y - cy, p0.x - cx), b1 = Math.atan2(p1.y - cy, p1.x - cx);
    // the short way through the side facing the centre (angle c + π)
    let sweep = b1 - b0;
    while (sweep > 0) sweep -= TAU;
    while (sweep < -TAU) sweep += TAU;
    const nb = Math.max(6, Math.ceil((Math.abs(sweep) * rr) / 1));
    for (let i = 0; i <= nb; i++) pts.push({ x: cx + rr * Math.cos(b0 + (sweep * i) / nb), y: cy + rr * Math.sin(b0 + (sweep * i) / nb) });
  }
  return ccw(dedupe(pts, 1e-3));
}

// --- patterns ---

/** Hole centres filling a w × h rectangle or a circle w across, on a hex or square grid, each hole wholly inside. */
export function holeCentres(grid: string, areaKind: string, w: number, h: number, hole: number, pitch: number): P2[] {
  const p = Math.max(pitch, hole + 0.5);
  const Hh = areaKind === 'circle' ? w : h;
  const dy = grid === 'hex' ? (p * Math.sqrt(3)) / 2 : p;
  const inside = (q: P2) => (areaKind === 'circle' ? Math.hypot(q.x, q.y) <= w / 2 - hole / 2 + 1e-9 : Math.abs(q.x) <= w / 2 - hole / 2 + 1e-9 && Math.abs(q.y) <= Hh / 2 - hole / 2 + 1e-9);
  // a lattice over the area, its odd rows half a pitch along on a hex grid, then the holes it fits centred in it
  const mx = Math.ceil(w / p) + 1, my = Math.ceil(Hh / dy) + 1;
  const lattice: P2[] = [];
  for (let j = -my; j <= my; j++) for (let i = -mx; i <= mx; i++) lattice.push({ x: i * p + (grid === 'hex' && Math.abs(j) % 2 === 1 ? p / 2 : 0), y: j * dy });
  const kept = lattice.filter(inside);
  if (!kept.length) return [];
  const xs = kept.map((q) => q.x), ys = kept.map((q) => q.y);
  const ox = (Math.min(...xs) + Math.max(...xs)) / 2, oy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const shifted = lattice.map((q) => ({ x: q.x - ox, y: q.y - oy })).filter(inside);
  return (shifted.length >= kept.length ? shifted : kept).slice(0, MAX_HOLES);
}
/** The most holes one pattern has. */
export const MAX_HOLES = 1500;

/** Fans' sizes: the grille's diameter, the screws' spacing and holes (mm). */
export const FANS: Record<string, { grille: number; screws: number; hole: number }> = {
  '40': { grille: 37, screws: 32, hole: 3.4 },
  '60': { grille: 57, screws: 50, hole: 4.3 },
  '80': { grille: 76, screws: 71.5, hole: 4.3 },
  '92': { grille: 88, screws: 82.5, hole: 4.3 },
  '120': { grille: 114, screws: 105, hole: 4.3 },
};

/** A fan grille: `slots` holes swirling round a hub between curved spokes `web` wide. */
export function fanSlots(D: number, slots: number, web: number, swirlDeg: number): P2[][] {
  const R = D / 2, n = Math.max(3, Math.round(slots));
  // the hub: big enough that each slot is wider than the web at its inner end (a web too wide for so many slots is narrowed)
  const web0 = Math.min(web, (R * 0.6 * TAU) / (n * 1.6));
  const r0 = Math.max(R * 0.22, (n * web0 * 1.6) / TAU);
  const sw = (swirlDeg * Math.PI) / 180;
  const ang = (rho: number) => (sw * (rho - r0)) / Math.max(1, R - r0);
  const steps = 16, out: P2[][] = [];
  for (let k = 0; k < n; k++) {
    const c = (TAU * k) / n;
    const right: P2[] = [], left: P2[] = [];
    for (let i = 0; i <= steps; i++) {
      const rho = r0 + ((R - r0) * i) / steps;
      const half = web0 / 2 / rho;
      right.push(polar(rho, c + ang(rho) + half));
      left.push(polar(rho, c + TAU / n + ang(rho) - half));
    }
    // out along one spoke, round the rim, back along the next, round the hub
    const rim: P2[] = [], hub: P2[] = [];
    const a0 = c + ang(R) + web0 / 2 / R, a1 = c + TAU / n + ang(R) - web0 / 2 / R;
    for (let i = 1; i < 6; i++) rim.push(polar(R, a0 + ((a1 - a0) * i) / 6));
    const h0 = c + TAU / n - web0 / 2 / r0, h1 = c + web0 / 2 / r0;
    for (let i = 1; i < 4; i++) hub.push(polar(r0, h0 + ((h1 - h0) * i) / 4));
    out.push(ccw(dedupe([...right, ...rim, ...left.reverse(), ...hub], 1e-3)));
  }
  return out;
}

/** Stepper motors' faces (NEMA sizes): the face, the boss's hole, the screws' spacing and their holes (mm). */
export const NEMA: Record<string, { face: number; boss: number; screws: number; hole: number }> = {
  14: { face: 35.2, boss: 23, screws: 26, hole: 3.4 },
  17: { face: 42.3, boss: 23, screws: 31, hole: 3.4 },
  23: { face: 56.4, boss: 38.5, screws: 47.1, hole: 5.2 },
};

/** A seven-segment pattern: `count` digits, each `height` tall, segments `stroke` wide with `gap` between them, leaning by `slant`. */
export function sevenSegments(count: number, height: number, stroke: number, gap: number, slantDeg: number): P2[][] {
  const Hh = height, s = Math.min(stroke, Hh / 5), W = Math.max(Hh * 0.55, 3 * s);
  const step = W + Math.max(s * 1.5, Hh * 0.2);
  const k = Math.tan((slantDeg * Math.PI) / 180);
  const seg = (a: P2, b: P2): P2[] => {
    // a hexagon from a to b, `s` wide, its ends pointed and drawn back by half the gap
    const L = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / L, uy = (b.y - a.y) / L, nx = -uy, ny = ux;
    const e = gap / 2 + 0.0, hw = s / 2;
    const pa = { x: a.x + ux * e, y: a.y + uy * e }, pb = { x: b.x - ux * e, y: b.y - uy * e };
    return [pa, { x: pa.x + ux * hw + nx * -hw, y: pa.y + uy * hw + ny * -hw }, { x: pb.x - ux * hw + nx * -hw, y: pb.y - uy * hw + ny * -hw }, pb, { x: pb.x - ux * hw + nx * hw, y: pb.y - uy * hw + ny * hw }, { x: pa.x + ux * hw + nx * hw, y: pa.y + uy * hw + ny * hw }];
  };
  const out: P2[][] = [];
  const n = Math.max(1, Math.round(count));
  for (let i = 0; i < n; i++) {
    const ox = -((n - 1) * step) / 2 + i * step;
    const x0 = ox - W / 2 + s / 2, x1 = ox + W / 2 - s / 2, yT = Hh / 2 - s / 2, yB = -Hh / 2 + s / 2;
    const lines: [P2, P2][] = [
      [{ x: x0, y: yT }, { x: x1, y: yT }],
      [{ x: x1, y: yT }, { x: x1, y: 0 }],
      [{ x: x1, y: 0 }, { x: x1, y: yB }],
      [{ x: x0, y: yB }, { x: x1, y: yB }],
      [{ x: x0, y: 0 }, { x: x0, y: yB }],
      [{ x: x0, y: yT }, { x: x0, y: 0 }],
      [{ x: x0, y: 0 }, { x: x1, y: 0 }],
    ];
    for (const [a, b] of lines) out.push(ccw(seg(a, b).map((q) => ({ x: q.x + k * q.y, y: q.y }))));
  }
  return out;
}

/** A drill gauge's holes, from `from` to `to` mm by `step`, at most 40. */
export function gaugeSizes(from: number, to: number, step: number): number[] {
  const a = Math.min(from, to), b = Math.max(from, to), s = Math.max(0.1, step);
  const out: number[] = [];
  for (let k = 0; out.length < 40; k++) {
    const v = Math.round((a + k * s) * 100) / 100;
    if (v > b + 1e-9) break;
    out.push(v);
  }
  return out;
}

/** A drill gauge's layout: each hole's centre and size, and where its size is engraved (below it), about the pattern's centre. */
export function gaugeLayout(from: number, to: number, step: number): { holes: { x: number; y: number; d: number }[]; labels: { x: number; y: number; text: string; size: number }[]; w: number; h: number } {
  const sizes = gaugeSizes(from, to, step);
  const rows = sizes.length > 10 ? 2 : 1;
  const per = Math.ceil(sizes.length / rows);
  const big = Math.max(...sizes);
  const label = Math.max(3, Math.min(5, big * 0.5));
  const gapX = Math.max(4, big * 0.5);
  const rowH = big + label + 4;
  const holes: { x: number; y: number; d: number }[] = [], labels: { x: number; y: number; text: string; size: number }[] = [];
  let w = 0;
  for (let r = 0; r < rows; r++) {
    const row = sizes.slice(r * per, (r + 1) * per);
    const pitch = Math.max(...row) + gapX;
    w = Math.max(w, row.length * pitch);
    row.forEach((d, i) => {
      const x = -((row.length - 1) * pitch) / 2 + i * pitch;
      const y = ((rows - 1) * rowH) / 2 - r * rowH + label / 2 + 1;
      holes.push({ x, y, d });
      labels.push({ x, y: y - big / 2 - label / 2 - 1.5, text: String(d), size: label });
    });
  }
  return { holes, labels, w, h: rows * rowH };
}

// --- a part's outline ---

export type PartOutline = { polys: P2[][]; piece: boolean };

/** A part's outlines, in mm about its centre. A piece's first outline is its own; the rest are its bore. */
export function partOutline(spec: PartSpec): PartOutline {
  const q = partParams(spec);
  const n = (k: string) => Number(q[k]), s = (k: string) => String(q[k]);
  const bore = (outerR: number) => {
    const d = Math.min(n('bore'), outerR * 1.2);
    return d >= 1 ? [borePoly(s('boreKind'), d, spec.kind === 'knob' ? n('flat') : Math.max(0.5, d * 0.1))] : [];
  };
  switch (spec.kind) {
    case 'gear': {
      const g = gearCircles(n('module'), n('teeth'), n('angle'));
      return { polys: [gearOutline(n('module'), n('teeth'), n('angle'), n('backlash')), ...bore(g.rf - n('module'))], piece: true };
    }
    case 'pulley': {
      const R = pulleyDiameter(s('profile'), n('teeth')) / 2;
      return { polys: [pulleyOutline(s('profile'), n('teeth')), ...bore(R - 2)], piece: true };
    }
    case 'knob':
      return { polys: [knobOutline(s('style'), n('diameter'), n('bites'), n('depth')), ...bore(n('diameter') / 2 - n('depth') - 2)], piece: true };
    case 'holes': {
      const cs = holeCentres(s('grid'), s('area'), n('width'), n('height'), n('hole'), n('pitch'));
      const r = n('hole') / 2, sides = Math.max(12, Math.min(32, Math.ceil(TAU * r)));
      return { polys: cs.map((c) => circlePoly(c.x, c.y, r, sides)), piece: false };
    }
    case 'fan': {
      const f = FANS[s('size')] ?? FANS['80'];
      const polys = fanSlots(f.grille, n('slots'), n('web'), n('swirl'));
      if (s('screws') === 'yes') for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) polys.push(circlePoly((x * f.screws) / 2, (y * f.screws) / 2, f.hole / 2, 16));
      return { polys, piece: false };
    }
    case 'nema': {
      const m = NEMA[s('size')] ?? NEMA[17];
      const polys = [circlePoly(0, 0, m.boss / 2)];
      for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) polys.push(circlePoly((x * m.screws) / 2, (y * m.screws) / 2, m.hole / 2, 16));
      return { polys, piece: false };
    }
    case 'digits':
      return { polys: sevenSegments(n('count'), n('height'), n('stroke'), n('gap'), n('slant')), piece: false };
    case 'gauge': {
      const L = gaugeLayout(n('from'), n('to'), n('step'));
      return { polys: L.holes.map((h) => circlePoly(h.x, h.y, h.d / 2, Math.max(12, Math.min(48, Math.ceil(Math.PI * h.d))))), piece: false };
    }
  }
}

/** The outline's box: its size and its centre (about the part's own centre). */
export function partBox(polys: P2[][]): { w: number; h: number; cx: number; cy: number } {
  const pts = polys.flat();
  if (!pts.length) return { w: 1, h: 1, cx: 0, cy: 0 };
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { w: Math.max(0.5, x1 - x0), h: Math.max(0.5, y1 - y0), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/** How far a pattern's plate reaches past its holes (mm), when it is made a board. */
export const PLATE_MARGIN = 8;

/**
 * The plate a pattern is cut in when it is made a board of its own, about the part's centre: a circle round a circular
 * hole pattern or a fan grille, else a rectangle a margin round the holes (a NEMA pattern's the motor's face; a drill
 * gauge's room for its sizes below its holes).
 */
export function partPlate(spec: PartSpec): P2[] {
  const q = partParams(spec);
  if (spec.kind === 'holes' && q.area === 'circle') return circlePoly(0, 0, Number(q.width) / 2 + PLATE_MARGIN, 72);
  if (spec.kind === 'fan') {
    const f = FANS[String(q.size)] ?? FANS['80'];
    const half = Math.max(f.grille / 2, f.screws / 2 + f.hole) + PLATE_MARGIN / 2;
    return rectPoly(-half, -half, half, half);
  }
  if (spec.kind === 'nema') {
    const m = NEMA[String(q.size)] ?? NEMA[17];
    const half = m.face / 2 + PLATE_MARGIN / 2;
    return rectPoly(-half, -half, half, half);
  }
  if (spec.kind === 'holes') {
    const w = Number(q.width) / 2 + PLATE_MARGIN, h = Number(q.height) / 2 + PLATE_MARGIN;
    return rectPoly(-w, -h, w, h);
  }
  if (spec.kind === 'gauge') {
    const L = gaugeLayout(Number(q.from), Number(q.to), Number(q.step));
    const w = L.w / 2 + PLATE_MARGIN, h = L.h / 2 + PLATE_MARGIN;
    return rectPoly(-w, -h, w, h);
  }
  const b = partBox(partOutline(spec).polys);
  return rectPoly(b.cx - b.w / 2 - PLATE_MARGIN, b.cy - b.h / 2 - PLATE_MARGIN, b.cx + b.w / 2 + PLATE_MARGIN, b.cy + b.h / 2 + PLATE_MARGIN);
}
const rectPoly = (x0: number, y0: number, x1: number, y1: number): P2[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

// --- the puzzle cut ---

/**
 * Jigsaw cut lines over a w × h rectangle from (0, 0) (milestone 83's lines): `cols` × `rows` pieces, each edge between
 * two with a round tab (an arc of 270° on a neck narrower than it), the tabs turned one way or the other by a fixed
 * pattern so every piece interlocks. Each line runs from edge to edge: lines that cut the board into pieces on purpose.
 */
export function puzzleLines(w: number, h: number, cols: number, rows: number): { x: number; y: number; bulge?: number }[][] {
  const out: { x: number; y: number; bulge?: number }[][] = [];
  const flip = (i: number, j: number) => ((i * 7 + j * 13 + ((i * j) % 3)) % 2 === 0 ? 1 : -1);
  // a tab on the stretch from a to b (along x in its own frame), bulging to side `s`
  const run = (a: P2, b: P2, n: number, side: (k: number) => number) => {
    const L = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
    const pts: { x: number; y: number; bulge?: number }[] = [{ x: a.x, y: a.y }];
    const cell = L / n;
    for (let k = 0; k < n; k++) {
      const s0 = k * cell, c0 = s0 + cell * 0.4, c1 = s0 + cell * 0.6;
      const p0 = { x: a.x + ux * c0, y: a.y + uy * c0 }, p1 = { x: a.x + ux * c1, y: a.y + uy * c1 };
      // an arc of 270° from p0 to p1: bulge tan(270°/4); its sign the side it stands out to
      pts.push({ ...p0, bulge: -2.414 * side(k) });
      pts.push(p1);
    }
    pts.push({ x: b.x, y: b.y });
    return pts.map((q) => ({ x: Math.round(q.x * 1000) / 1000, y: Math.round(q.y * 1000) / 1000, ...(q.bulge ? { bulge: q.bulge } : {}) }));
  };
  for (let i = 1; i < cols; i++) out.push(run({ x: (w * i) / cols, y: 0 }, { x: (w * i) / cols, y: h }, rows, (k) => flip(i, k)));
  for (let j = 1; j < rows; j++) out.push(run({ x: 0, y: (h * j) / rows }, { x: w, y: (h * j) / rows }, cols, (k) => flip(k + 31, j)));
  return out;
}
