// Slots that slide together (WAFFLE_MODE.md §6.3) and the problems found on the
// way (§6.4); milestone 53 adds the base plate and labels here.
//
// An A slice and a B slice meet along a vertical line L. J = the material both
// keep on L, as height intervals. One split height m per crossing: A's slot
// runs from m up through A's top, B's from m down through B's bottom, so along
// L everything A keeps is below m and everything B keeps is above it, and each
// B slice dropped straight down meets no A material. Slot directions never
// alternate.
import type { Design } from '../model/types';
import type { TaggedContour } from '../geom/types';
import { scope, type CrossSection, type Kernel } from '../sculpt/kernel';
import { orderRings, type Fam, type Part, type Poly, type WaffleModel } from './derive';
import { partLabel, partnerLabel } from './labels';

/** A part ready to cut: its rings (slotted) and what is engraved on it. */
export type CutPart = Part & { engrave: TaggedContour[]; held: boolean; bbox: { x0: number; y0: number; x1: number; y1: number } };
/** Where an A slice and a B slice cross: the line's place in each plane, the shared material, the split height. */
export type Crossing = { a: string; b: string; xa: number; xb: number; J: [number, number][]; m: number; splits: boolean; thin: boolean; aParts: string[]; bParts: string[] };
export type Problem =
  | { kind: 'unheld'; part: string; fam: Fam; sliceId: string; at: number }
  | { kind: 'split'; part: string; fam: Fam; sliceId: string }
  | { kind: 'thin'; part: string; fam: Fam; sliceId: string }
  | { kind: 'close'; fam: Fam; a: string; b: string; ids: [string, string] }
  | { kind: 'big'; part: string; fam: Fam; sliceId: string };
/** A tab down through the base plate: the part it is on, where along its slice, how wide. */
export type Tab = { part: string; fam: Fam; at: number; x: number; w: number };
/** The base plate as a part: its outline (floor coordinates x, −z) with a slot for every tab, and its label. */
export type PlatePart = { key: 'w:base'; label: string; polys: Poly[]; engrave: TaggedContour[]; bbox: { x0: number; y0: number; x1: number; y1: number }; tabs: Tab[] };
export type Finished = { parts: CutPart[]; crossings: Crossing[]; problems: Problem[]; plate: PlatePart | null };

/** The base plate's engraved label (the same in both languages, like A and B). */
export const BASE_LABEL = 'Base';

/** Ratios of an interval tried for the split height, best first. */
export const RATIOS = [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65];

/** The least material beside or beyond a slot (mm): plywood max(2t, 3), card and corrugated 3t. */
export function minLigament(d: Design): number {
  const t = d.material.thickness;
  return d.material.kind === 'plywood' ? Math.max(2 * t, 3) : 3 * t;
}

/** Heights where a vertical line x = X is inside the rings (even-odd), as intervals. */
export function lineIntervals(polys: Poly[], X: number): [number, number][] {
  const ys: number[] = [];
  for (const r of polys)
    for (let i = 0; i < r.length; i++) {
      const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length];
      if (x0 > X !== x1 > X) ys.push(y0 + ((X - x0) * (y1 - y0)) / (x1 - x0));
    }
  ys.sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < ys.length; i += 2) if (ys[i + 1] - ys[i] > 1e-6) out.push([ys[i], ys[i + 1]]);
  return out;
}
function unionIv(list: [number, number][]): [number, number][] {
  const s = [...list].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const iv of s) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], iv[1]);
    else out.push([...iv]);
  }
  return out;
}
function intersectIv(a: [number, number][], b: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const x of a)
    for (const y of b) {
      const lo = Math.max(x[0], y[0]), hi = Math.min(x[1], y[1]);
      if (hi - lo > 1e-6) out.push([lo, hi]);
    }
  return out.sort((p, q) => p[0] - q[0]);
}
const bboxOf = (polys: Poly[]) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of polys) for (const [x, y] of r) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
  return { x0, y0, x1, y1 };
};
const rect = (x0: number, x1: number, y0: number, y1: number): Poly => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

export function finishParts(k: Kernel, d: Design, m: WaffleModel): Finished {
  return scope(() => {
    const w = m.slot;
    const lig = minLigament(d);
    const parts = m.parts;
    const cs = new Map<string, CrossSection>(parts.map((p) => [p.key, k.CrossSection.ofPolygons(p.polys, 'NonZero')]));
    const bb = new Map(parts.map((p) => [p.key, bboxOf(p.polys)]));
    const bySlice = (fam: Fam, id: string) => parts.filter((p) => p.fam === fam && p.sliceId === id);
    const sliceTop = (ps: Part[]) => Math.max(...ps.map((p) => bb.get(p.key)!.y1));
    const sliceBottom = (ps: Part[]) => Math.min(...ps.map((p) => bb.get(p.key)!.y0));
    const regions = (c: CrossSection) => c.decompose().length;
    const slotsOf = new Map<string, Poly[]>(parts.map((p) => [p.key, []]));
    const held = new Set<string>();
    const crossings: Crossing[] = [];
    const A = m.slices.filter((s) => s.fam === 'a'), B = m.slices.filter((s) => s.fam === 'b');
    for (const sa of A) {
      const pa = bySlice('a', sa.id);
      if (!pa.length) continue;
      for (const sb of B) {
        const pb = bySlice('b', sb.id);
        if (!pb.length) continue;
        // the line where the planes meet: x = at_b in A's plane, x = −at_a in B's
        const xa = sb.at, xb = -sa.at;
        const ivA = new Map(pa.map((p) => [p.key, lineIntervals(p.polys, xa)]));
        const ivB = new Map(pb.map((p) => [p.key, lineIntervals(p.polys, xb)]));
        const J = intersectIv(unionIv([...ivA.values()].flat()), unionIv([...ivB.values()].flat()));
        if (!J.length) continue;
        const touches = (iv: [number, number][]) => iv.some((x) => J.some((j) => Math.min(x[1], j[1]) - Math.max(x[0], j[0]) > 1e-6));
        const aParts = pa.filter((p) => touches(ivA.get(p.key)!)).map((p) => p.key);
        const bParts = pb.filter((p) => touches(ivB.get(p.key)!)).map((p) => p.key);
        const topA = sliceTop(pa) + 1, botB = sliceBottom(pb) - 1;
        // candidates: on each interval of J, tallest first
        const order = [...J].sort((p, q) => q[1] - q[0] - (p[1] - p[0]));
        type Cand = { m: number; split: number; thin: number; dr: number };
        let best: Cand | null = null;
        const better = (x: Cand, y: Cand | null) => !y || x.split < y.split || (x.split === y.split && (x.thin < y.thin || (x.thin === y.thin && x.dr < y.dr - 1e-9)));
        for (const iv of order) {
          for (const r of RATIOS) {
            const mm = iv[0] + r * (iv[1] - iv[0]);
            const thin = (mm - iv[0] < lig ? 1 : 0) + (iv[1] - mm < lig ? 1 : 0);
            const c0: Cand = { m: mm, split: 0, thin, dr: Math.abs(r - 0.5) };
            // splitting is costly to test: skip a candidate that cannot beat the best on the cheap terms
            if (best && best.split === 0 && !better({ ...c0, split: 0 }, best)) continue;
            const ra = rect(xa - w / 2, xa + w / 2, mm, topA), rb = rect(xb - w / 2, xb + w / 2, botB, mm);
            let split = 0;
            for (const key of aParts) if (regions(cs.get(key)!.subtract([ra])) > 1) split++;
            for (const key of bParts) if (regions(cs.get(key)!.subtract([rb])) > 1) split++;
            const c: Cand = { ...c0, split };
            if (better(c, best)) best = c;
            if (best && best.split === 0 && best.thin === 0 && best.dr === 0) break;
          }
          if (best && best.split === 0 && best.thin === 0 && best.dr === 0) break;
        }
        const mm = best!.m;
        // slots reach 1 mm past the outline, so no hair-thin sliver is left
        for (const key of aParts) slotsOf.get(key)!.push(rect(xa - w / 2, xa + w / 2, mm, topA));
        for (const key of bParts) slotsOf.get(key)!.push(rect(xb - w / 2, xb + w / 2, botB, mm));
        for (const key of [...aParts, ...bParts]) held.add(key);
        crossings.push({ a: sa.id, b: sb.id, xa, xb, J, m: mm, splits: best!.split > 0, thin: best!.thin > 0, aParts, bParts });
      }
    }
    const problems: Problem[] = [];
    const tabs: Tab[] = [];
    const out: CutPart[] = parts.map((p) => {
      const slots = slotsOf.get(p.key)!;
      let cut = cs.get(p.key)!;
      if (slots.length) cut = cut.subtract(k.CrossSection.ofPolygons(slots, 'NonZero'));
      if (slots.length && cut.decompose().length > 1) problems.push({ kind: 'split', part: p.label, fam: p.fam, sliceId: p.sliceId });
      // tabs down through the base plate, on straight runs of the bottom outline along the plate's top
      if (m.plateY !== null) {
        const mine = placeTabs(polysOfCs(cut), m.plateY, m.t, w, crossings.filter((c) => c.bParts.includes(p.key)).map((c) => c.xb));
        for (const x of mine) tabs.push({ part: p.key, fam: p.fam, at: p.at, x: x.c, w: x.w });
        if (mine.length) {
          cut = cut.add(k.CrossSection.ofPolygons(mine.map((x) => rect(x.c - x.w / 2, x.c + x.w / 2, m.plateY! - m.t, m.plateY! + 0.01)), 'NonZero'));
          held.add(p.key);
        }
      }
      const polys = slots.length || tabs.some((x) => x.part === p.key) ? orderRings(polysOfCs(cut)) : p.polys;
      return { ...p, polys, engrave: [], held: held.has(p.key), bbox: bboxOf(polys) };
    });
    // the base plate: its outline with a slot for every tab (the tab plus the clearance each way)
    let plate: PlatePart | null = null;
    if (m.plate && m.plateY !== null) {
      const holes = tabs.map((tb) => {
        const f = m.frames[tb.fam];
        const hu = (tb.w + (w - m.t)) / 2, hv = w / 2;
        return [[-hu, -hv], [hu, -hv], [hu, hv], [-hu, hv]].map(([u, v]) => {
          const px = f.c[0] + f.s[0] * (tb.x + u) + f.n[0] * (tb.at + v), pz = f.c[2] + f.s[2] * (tb.x + u) + f.n[2] * (tb.at + v);
          return [px, -pz] as [number, number];
        });
      });
      let pc = k.CrossSection.ofPolygons(m.plate, 'NonZero');
      if (holes.length) pc = pc.subtract(k.CrossSection.ofPolygons(holes, 'NonZero'));
      const polys = orderRings(polysOfCs(pc));
      plate = { key: 'w:base', label: BASE_LABEL, polys, engrave: [], bbox: bboxOf(polys), tabs };
    }
    for (const c of crossings)
      if (c.thin)
        for (const key of [...c.aParts, ...c.bParts]) {
          const p = parts.find((x) => x.key === key)!;
          if (!problems.some((x) => x.kind === 'thin' && x.part === p.label)) problems.push({ kind: 'thin', part: p.label, fam: p.fam, sliceId: p.sliceId });
        }
    for (const p of out) if (!p.held) problems.push({ kind: 'unheld', part: p.label, fam: p.fam, sliceId: p.sliceId, at: (p.bbox.x0 + p.bbox.x1) / 2 });
    // slices of one family too close together
    for (const fam of ['a', 'b'] as Fam[]) {
      const sl = m.slices.filter((s) => s.fam === fam);
      for (let i = 0; i + 1 < sl.length; i++) if (sl[i + 1].at - sl[i].at < m.t + 2 - 1e-6) problems.push({ kind: 'close', fam, a: sl[i].label, b: sl[i + 1].label, ids: [sl[i].id, sl[i + 1].id] });
    }
    // larger than the sheet both ways
    const W = d.material.sheetW - 2 * d.sheetMargin, H = d.material.sheetH - 2 * d.sheetMargin;
    for (const p of out) {
      const pw = p.bbox.x1 - p.bbox.x0, ph = p.bbox.y1 - p.bbox.y0;
      if ((pw > W || ph > H) && (ph > W || pw > H)) problems.push({ kind: 'big', part: p.label, fam: p.fam, sliceId: p.sliceId });
    }
    return { parts: out, crossings, problems, plate };
  });
}

/**
 * Engraved labels (milestone 53), added only when the pieces are built (the cut plan, the export):
 * each part's label at its deepest point, the partner's beside each slot mouth, and the plate's.
 */
export function labelParts(m: WaffleModel, f: Finished): Finished {
  const w = m.slot;
  const crossings = f.crossings;
  const parts = m.parts;
  const out = f.parts.map((p) => ({ ...p, engrave: [...p.engrave] }));
  const plate = f.plate ? { ...f.plate, engrave: [...f.plate.engrave] } : null;
    // labels: each part's at its deepest point, the partner's beside each slot mouth
    const sliceLabel = new Map(m.slices.map((sl) => [`${sl.fam}:${sl.id}`, sl.label]));
    for (const p of out) {
      p.engrave.push(...partLabel(p.polys, p.label, p.key));
      let n = 0;
      for (const c of crossings) {
        const isA = c.aParts.includes(p.key), isB = c.bParts.includes(p.key);
        if (!isA && !isB) continue;
        const x = isA ? c.xa : c.xb;
        const iv = lineIntervals(parts.find((q) => q.key === p.key)!.polys, x);
        if (!iv.length) continue;
        const mouth = isA ? Math.max(...iv.map((v) => v[1])) : Math.min(...iv.map((v) => v[0]));
        const partner = sliceLabel.get(isA ? `b:${c.b}` : `a:${c.a}`) ?? '';
        p.engrave.push(...partnerLabel(p.polys, partner, p.key, n++, x, w / 2, mouth, isA));
      }
    }
    if (plate) plate.engrave.push(...partLabel(plate.polys, plate.label, plate.key));
  return { ...f, parts: out, plate };
}

const polysOfCs = (c: CrossSection): Poly[] => c.toPolygons().map((r) => r.map(([x, y]) => [x, y] as [number, number]));

/**
 * Tabs on a part's bottom outline where it runs along the plate's top (y = Y) for more than 3t: width
 * max(3t, 8 mm) clamped to the run, one per run under 60 mm and two above (at 25% and 75%), each
 * keeping t + 2 mm from any B slot mouth (`mouths`: slot centres, `w` their width).
 */
export function placeTabs(polys: Poly[], Y: number, t: number, w: number, mouths: number[]): { c: number; w: number }[] {
  const runs: [number, number][] = [];
  for (const r of polys)
    for (let i = 0; i < r.length; i++) {
      const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length];
      if (Math.abs(y0 - Y) < 1e-4 && Math.abs(y1 - Y) < 1e-4) runs.push([Math.min(x0, x1), Math.max(x0, x1)]);
    }
  const merged = unionIv(runs).filter(([a, b]) => b - a > 3 * t);
  const out: { c: number; w: number }[] = [];
  const keep = t + 2;
  for (const [a, b] of merged) {
    const len = b - a;
    const tw = Math.min(Math.max(3 * t, 8), len);
    const want = len < 60 ? [0.5] : [0.25, 0.75];
    for (const f of want) {
      let c = a + f * len;
      // the stretches of the run where a tab's middle may sit
      const lo = a + tw / 2, hi = b - tw / 2;
      const banned = mouths.map((x) => [x - w / 2 - keep - tw / 2, x + w / 2 + keep + tw / 2] as [number, number]);
      const ok = (x: number) => x >= lo - 1e-9 && x <= hi + 1e-9 && !banned.some(([p, q]) => x > p + 1e-9 && x < q - 1e-9);
      if (!ok(c)) {
        const options = [lo, hi, ...banned.flat()].filter(ok).sort((p, q) => Math.abs(p - c) - Math.abs(q - c));
        if (!options.length) continue;
        c = options[0];
      }
      if (!out.some((o) => Math.abs(o.c - c) < tw)) out.push({ c, w: tw });
    }
  }
  return out;
}
