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
export type Finished = { parts: CutPart[]; crossings: Crossing[]; problems: Problem[] };

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
    const out: CutPart[] = parts.map((p) => {
      const slots = slotsOf.get(p.key)!;
      let polys = p.polys;
      if (slots.length) {
        const cut = cs.get(p.key)!.subtract(k.CrossSection.ofPolygons(slots, 'NonZero'));
        polys = orderRings(cut.toPolygons().map((r) => r.map(([x, y]) => [x, y] as [number, number])));
        if (cut.decompose().length > 1) problems.push({ kind: 'split', part: p.label, fam: p.fam, sliceId: p.sliceId });
      }
      return { ...p, polys, engrave: [], held: held.has(p.key), bbox: bboxOf(polys) };
    });
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
    return { parts: out, crossings, problems };
  });
}
