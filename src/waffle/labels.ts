// Engraved labels (WAFFLE_MODE.md §6.6): each part's label at the point
// deepest inside it (the pole of inaccessibility, our own grid refinement),
// shrunk to fit from 8 mm down to 3 mm, else on the guide layer; and beside
// each slot mouth the partner's label in 3 mm text.
import type { P2 } from '../model/types';
import type { TaggedContour } from '../geom/types';
import { polygonContour } from '../geom/vec';
import { outlineText } from '../text/outline';
import type { Poly } from './derive';

/** Distance from a point to the rings' edges, positive inside (even-odd), negative outside. */
export function signedDist(polys: Poly[], x: number, y: number): number {
  let inside = false, best = Infinity;
  for (const r of polys)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [ax, ay] = r[i], [bx, by] = r[j];
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
      best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
    }
  return inside ? best : -best;
}

/**
 * The point deepest inside the rings: a grid over the box, then finer grids
 * around the best point until the step is under `precision` mm.
 */
export function poleOfInaccessibility(polys: Poly[], precision = 0.25): { x: number; y: number; d: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of polys) for (const [x, y] of r) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
  const N = 10;
  let best = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, d: signedDist(polys, (x0 + x1) / 2, (y0 + y1) / 2) };
  let cx = best.x, cy = best.y, hw = (x1 - x0) / 2, hh = (y1 - y0) / 2;
  // several seeds on the coarse grid keep a narrow part's best region from being missed
  for (let it = 0; it < 40 && Math.max(hw, hh) * 2 / N > precision / 4; it++) {
    for (let i = 0; i <= N; i++)
      for (let j = 0; j <= N; j++) {
        const x = cx - hw + (2 * hw * i) / N, y = cy - hh + (2 * hh * j) / N;
        const d = signedDist(polys, x, y);
        if (d > best.d) best = { x, y, d };
      }
    cx = best.x;
    cy = best.y;
    hw /= 4;
    hh /= 4;
  }
  return best;
}

/** Text outlines placed with their centre at (x, y), or null when the font is not loaded. */
function textAt(text: string, size: number, x: number, y: number): { polys: P2[][]; w: number; h: number } | null {
  const o = outlineText(text, 'rubik', size);
  if (!o) return null;
  const cx = (o.minX + o.maxX) / 2, cy = (o.minY + o.maxY) / 2;
  return { polys: o.polys.map((p) => p.map((q) => ({ x: q.x - cx + x, y: q.y - cy + y }))), w: o.maxX - o.minX, h: o.maxY - o.minY };
}

/** Every point of the text at least `gap` mm inside the rings. */
function fits(polys: Poly[], t: { polys: P2[][] }, gap: number): boolean {
  for (const g of t.polys) for (const p of g) if (signedDist(polys, p.x, p.y) < gap) return false;
  return true;
}

const toContours = (t: { polys: P2[][] }, op: 'engrave' | 'guide', key: string, id: string): TaggedContour[] =>
  t.polys.filter((p) => p.length >= 3).map((p) => ({ op, role: 'fill', contour: polygonContour(p), ref: { pieceKey: key, detailId: id } }));

export const LABEL_MAX = 8;
export const LABEL_MIN = 3;
export const PARTNER = 3;
/** Labels keep this far from every cut (mm). */
export const LABEL_GAP = 1;

/** A part's label at its pole, as large as fits (8 → 3 mm), else on the guide layer. */
export function partLabel(polys: Poly[], text: string, key: string): TaggedContour[] {
  const pole = poleOfInaccessibility(polys);
  // the circle of radius d about the pole is inside the part: text whose box fits in it, with the gap, is inside
  for (let s = LABEL_MAX; s >= LABEL_MIN - 1e-9; s -= 0.5) {
    const t = textAt(text, s, pole.x, pole.y);
    if (!t) return [];
    if (Math.hypot(t.w, t.h) / 2 <= pole.d - LABEL_GAP) return toContours(t, 'engrave', key, 'label');
  }
  // the smallest size, checked point by point (a long thin part), else the guide layer only
  const t = textAt(text, LABEL_MIN, pole.x, pole.y);
  if (!t) return [];
  return toContours(t, fits(polys, t, LABEL_GAP) ? 'engrave' : 'guide', key, 'label');
}

/**
 * The partner's label beside a slot mouth, inside the part: `x` the slot's
 * centre, `half` its half width, `mouth` the outline's height there, `down`
 * true when the slot opens from the top (the label goes below the mouth).
 */
export function partnerLabel(polys: Poly[], text: string, key: string, n: number, x: number, half: number, mouth: number, down: boolean): TaggedContour[] {
  const probe = textAt(text, PARTNER, 0, 0);
  if (!probe) return [];
  const dy = (LABEL_GAP + 0.5 + probe.h / 2) * (down ? -1 : 1);
  for (const step of [0, 1, 2, 3])
    for (const side of [1, -1]) {
      const cx = x + side * (half + LABEL_GAP + 0.5 + probe.w / 2);
      const cy = mouth + dy + (down ? -1 : 1) * step * 2;
      if (signedDist(polys, cx, cy) < Math.hypot(probe.w, probe.h) / 2 + LABEL_GAP) continue;
      return toContours(textAt(text, PARTNER, cx, cy)!, 'engrave', key, `partner${n}`);
    }
  return [];
}
