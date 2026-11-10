// The sheet meter (milestone 39) and the one-sheet goals of missions (milestone 40).
import { pack, pieceCopies, placedRect, sheetCount } from '../model/pack';
import { contourArea } from '../geom/vec';
import { profileOf } from '../model/materials';
import type { Design } from '../model/types';

/** Sheets the pieces take and how much of them they use (the working material's sheets, for the thumbnail). */
export function sheetUse(d: Design) {
  const copies = pieceCopies(d);
  const pl = pack(d, copies);
  const n = sheetCount(pl);
  let used = 0, total = 0;
  const seen = new Set<string>();
  for (const c of copies) {
    const p = pl[c.key];
    if (!p) continue;
    used += c.contours.filter((x) => x.role === 'outer').reduce((s, x) => s + Math.abs(contourArea(x.contour)), 0);
    const k = `${p.mat ?? ''}#${p.sheet}`;
    if (!seen.has(k)) {
      seen.add(k);
      const m = profileOf(d, p.mat);
      total += m.sheetW * m.sheetH;
    }
  }
  const first = copies.filter((c) => pl[c.key] && pl[c.key].sheet === 0 && !pl[c.key].mat).map((c) => placedRect(pl[c.key], c.w, c.h));
  return { sheets: Math.max(n, seen.size), pct: total ? Math.round((100 * used) / total) : 0, first, W: d.material.sheetW, H: d.material.sheetH };
}

