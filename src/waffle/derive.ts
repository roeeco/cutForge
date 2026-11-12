// Stage 2's derivation (WAFFLE_MODE.md §3.3, §6.1–6.2): the solid → two
// crossing families of slice planes → each plane's section → regions → parts.
// Everything here is derived at render time from the saved shapes and
// settings, and cached under the solid's key, the settings and the material.
import type { Design, P2, V3, WaffleFamily, WaffleSpec } from '../model/types';
import { buildSolid, solidKey } from '../sculpt/build';
import { scope, type CrossSection, type Kernel, type Manifold } from '../sculpt/kernel';
import { matOf } from '../model/materials';

export type Fam = 'a' | 'b';
/** A family's frame in top view: `s` along its slices, `n` their normal; `c` the solid's centre on the floor. */
export type FamFrame = { s: V3; n: V3; c: V3 };
export type Poly = [number, number][];
/** One slice plane: its family, stable id, position along the family's normal (mm from the centre) and its label number. */
export type SliceDef = { fam: Fam; id: string; at: number; num: number; label: string };
/** One region of a slice's section: a part to cut (outer ring CCW first, then holes), in the plane's (s, up) mm. */
export type Part = { key: string; label: string; fam: Fam; sliceId: string; sliceLabel: string; at: number; polys: Poly[]; area: number };

export type WaffleModel = {
  spec: WaffleSpec;
  frames: Record<Fam, FamFrame>;
  /** The solid's extent along each family's normal (mm from the centre). */
  ext: Record<Fam, [number, number]>;
  slices: SliceDef[];
  parts: Part[];
  /** Regions left out as too small or too thin. */
  tiny: number;
  empty: boolean;
  /** Material thickness and slot width (thickness + clearance). */
  t: number;
  slot: number;
  /** The solid's lowest and highest points (mm). */
  y0: number;
  y1: number;
};

export const LETTER: Record<Fam, string> = { a: 'A', b: 'B' };
/** The separator in part labels and keys (`A3·2`): not one of the piece-key separators (`@`, `#`, `~`). */
export const PART_SEP = '·';

/** Family frames for a turn (degrees about the vertical): at 0°, A is seen face-on from the front and B from the side. */
export function famFrames(turn: number, c: V3): Record<Fam, FamFrame> {
  const r = (turn * Math.PI) / 180, co = Math.cos(r), si = Math.sin(r);
  return { a: { s: [co, 0, -si], n: [si, 0, co], c }, b: { s: [-si, 0, -co], n: [co, 0, -si], c } };
}

/** World → a slice plane's frame: x along the slice, y up, z along the normal from the plane (manifold's Mat4). */
export function planeXform(f: FamFrame, at: number): number[] {
  const { s, n, c } = f;
  const tx = -(s[0] * c[0] + s[2] * c[2]), tz = -(n[0] * c[0] + n[2] * c[2]) - at;
  // rows: s, up, n (column-major storage)
  return [s[0], 0, n[0], 0, s[1], 1, n[1], 0, s[2], 0, n[2], 0, tx, 0, tz, 1];
}
/** A point of a slice plane (x along the slice, y up) in the world. */
export function planePoint(f: FamFrame, at: number, p: P2): V3 {
  return [f.c[0] + f.s[0] * p.x + f.n[0] * at, p.y, f.c[2] + f.s[2] * p.x + f.n[2] * at];
}

/** Slices per family by default: one per 35 mm of extent, 3 to 9. */
export const defaultCount = (extent: number) => Math.max(3, Math.min(9, Math.round(extent / 35)));

/** The settings in force: the saved ones, or the defaults for this solid. */
export function effectiveSpec(spec: WaffleSpec | undefined, ext: Record<Fam, [number, number]>): WaffleSpec {
  if (spec) return spec;
  return { turn: 0, a: { spacing: { by: 'count', n: defaultCount(ext.a[1] - ext.a[0]) } }, b: { spacing: { by: 'count', n: defaultCount(ext.b[1] - ext.b[0]) } } };
}

/** A family's slice positions: the student's, or evenly spaced (centred in equal bands, never at the very tip). */
export function familyPositions(fam: Fam, f: WaffleFamily, ext: [number, number]): { id: string; at: number }[] {
  if (f.slices) return [...f.slices].sort((x, y) => x.at - y.at);
  const [lo, hi] = ext, w = hi - lo;
  if (!(w > 0)) return [];
  let ats: number[];
  if (f.spacing.by === 'count') {
    const n = Math.max(1, Math.min(60, Math.round(f.spacing.n)));
    ats = Array.from({ length: n }, (_, i) => lo + ((i + 0.5) * w) / n);
  } else {
    const g = Math.max(1, f.spacing.mm);
    const n = Math.max(1, Math.min(60, Math.floor(w / g)));
    ats = Array.from({ length: n }, (_, i) => (lo + hi) / 2 + (i - (n - 1) / 2) * g);
  }
  return ats.map((at, i) => ({ id: `${fam}${i + 1}`, at: Math.round(at * 1000) / 1000 }));
}

/** A slice's section in its plane, as a kernel CrossSection (the caller's scope frees it). */
export function sectionAt(solid: Manifold, f: FamFrame, at: number): CrossSection {
  return solid.transform(planeXform(f, at) as never).slice(0).simplify(0.01);
}

function polysOf(cs: CrossSection): Poly[] {
  return cs.toPolygons().map((p) => p.map(([x, y]) => [x, y] as [number, number]));
}
const ringArea = (r: Poly) => {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x0, y0] = r[i], [x1, y1] = r[(i + 1) % r.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
};
/** Outer ring first (CCW), then holes (CW). */
export function orderRings(polys: Poly[]): Poly[] {
  const rings = polys.map((r) => ({ r, a: ringArea(r) }));
  const outer = rings.filter((x) => x.a > 0).sort((x, y) => y.a - x.a);
  const holes = rings.filter((x) => x.a <= 0);
  return [...outer.map((x) => x.r), ...holes.map((x) => x.r)];
}

const cache = new Map<string, WaffleModel>();

/** The waffle of a design: frames, slices and parts (no slots yet: see slots.ts). */
export function deriveWaffle(k: Kernel, d: Design): WaffleModel {
  const sc = d.sculpt;
  const mat = d.material;
  const t = mat.thickness;
  const clearance = d.waffle?.clearance ?? mat.clearance;
  const key = JSON.stringify([sc ? solidKey(sc) : '', d.waffle ?? null, t, clearance]);
  const hit = cache.get(key);
  if (hit) return hit;
  const model = scope(() => {
    const solid = buildSolid(k, sc);
    const empty = solid.isEmpty();
    const bb = empty ? { min: [0, 0, 0], max: [0, 0, 0] } : solid.boundingBox();
    const c: V3 = [(bb.min[0] + bb.max[0]) / 2, 0, (bb.min[2] + bb.max[2]) / 2];
    // extents along each family's normal: the solid's box in the family's frame
    const extOf = (f: FamFrame): [number, number] => {
      if (empty) return [0, 0];
      const b2 = solid.transform(planeXform(f, 0) as never).boundingBox();
      return [b2.min[2], b2.max[2]];
    };
    let frames = famFrames(d.waffle?.turn ?? 0, c);
    const ext = { a: extOf(frames.a), b: extOf(frames.b) };
    const spec = effectiveSpec(d.waffle, ext);
    frames = famFrames(spec.turn, c);
    const slices: SliceDef[] = [];
    const parts: Part[] = [];
    let tiny = 0;
    for (const fam of ['a', 'b'] as Fam[]) {
      const pos = familyPositions(fam, spec[fam], ext[fam]);
      pos.forEach((p, i) => slices.push({ fam, id: p.id, at: p.at, num: i + 1, label: `${LETTER[fam]}${i + 1}` }));
    }
    for (const sl of slices) {
      if (empty) break;
      const sec = sectionAt(solid, frames[sl.fam], sl.at);
      const regions = sec.decompose();
      const kept: { polys: Poly[]; area: number; x: number }[] = [];
      for (const r of regions) {
        const area = r.area();
        // too small, or narrower than 2t everywhere: left out (an info line, not a problem)
        if (area < (3 * t) ** 2 || r.offset(-t * 0.999, 'Miter').isEmpty()) {
          tiny++;
          continue;
        }
        const b = r.bounds();
        kept.push({ polys: orderRings(polysOf(r)), area, x: (b.min[0] + b.max[0]) / 2 });
      }
      kept.sort((p, q) => p.x - q.x);
      kept.forEach((r, i) => {
        const label = kept.length > 1 ? `${sl.label}${PART_SEP}${i + 1}` : sl.label;
        parts.push({ key: `w:${label}`, label, fam: sl.fam, sliceId: sl.id, sliceLabel: sl.label, at: sl.at, polys: r.polys, area: r.area });
      });
    }
    return { spec, frames, ext, slices, parts, tiny, empty, t, slot: t + clearance, y0: bb.min[1], y1: bb.max[1] } as WaffleModel;
  });
  cache.set(key, model);
  if (cache.size > 30) cache.delete(cache.keys().next().value as string);
  return model;
}

/** The material a waffle is cut from (the working one). */
export const waffleMat = (d: Design) => matOf(d, '');
