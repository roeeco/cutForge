// A waffle's picture for submissions and the teacher view (milestone 54): the
// slices standing in place, drawn in a three-quarter view as an SVG (the same
// kind of picture the teacher's list already shows), back to front.
import type { Design } from '../model/types';
import { kernelNow } from '../sculpt/kernel';
import { fmt } from '../export/svg';
import { deriveWaffle, planePoint } from './derive';
import { waffleParts } from './pieces';

const COLOR = { a: '#e8a33d', b: '#4f9fd9' } as const;

export function waffleThumbSvg(d: Design): string | null {
  const k = kernelNow();
  if (!k || d.kind !== 'waffle') return null;
  const m = deriveWaffle(k, d);
  const f = waffleParts(d);
  if (!f.parts.length) return null;
  const c30 = Math.cos(Math.PI / 6), s30 = 0.5;
  // world → screen (y down): a view from the front right, above
  const P = (x: number, y: number, z: number) => [(x - z) * c30, -(y + (x + z) * s30 * 0.6)] as const;
  const shapes: { depth: number; pts: (readonly [number, number])[]; fill: string }[] = [];
  if (f.plate && m.plateY !== null) shapes.push({ depth: -Infinity, pts: f.plate.polys[0].map(([x, nz]) => P(x, m.plateY!, -nz)), fill: '#c9a46a' });
  for (const p of f.parts) {
    const fr = m.frames[p.fam];
    const w = p.polys[0].map(([x, y]) => planePoint(fr, p.at, { x, y }));
    const cx = w.reduce((a, q) => a + q[0], 0) / w.length, cz = w.reduce((a, q) => a + q[2], 0) / w.length;
    shapes.push({ depth: cx + cz, pts: w.map(([x, y, z]) => P(x, y, z)), fill: COLOR[p.fam] });
  }
  shapes.sort((a, b) => a.depth - b.depth);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of shapes) for (const [x, y] of s.pts) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
  const pad = 6, w = x1 - x0 + 2 * pad, h = y1 - y0 + 2 * pad;
  const sw = Math.max(w, h) / 220;
  const body = shapes.map((s) => `  <path d="M${s.pts.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join(' L')} Z" fill="${s.fill}" stroke="#3a3530" stroke-width="${fmt(sw)}" stroke-linejoin="round"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${fmt(x0 - pad)} ${fmt(y0 - pad)} ${fmt(w)} ${fmt(h)}">\n${body}\n</svg>\n`;
}
