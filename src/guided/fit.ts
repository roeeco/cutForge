// *Make it fit* (milestone 107, GUIDED_MODE.md §3.3): grow the box by what a lot of objects needs, and give
// all of it to that lot's space; the other spaces keep their sizes. Pure functions on a design.
import type { Design } from '../model/types';
import { compartments, contentFit, inCell, type Compartment } from '../easy/objects';
import { dividersOn, isDivider } from '../model/dividers';
import { solve } from '../model/ops';
import { validate } from '../model/validate';
import { boxTrayOf, insideSize, setInsideSize } from './box';

const tooBig = (d: Design) => validate(d).some((i) => i.key === 'val.tooBig' || i.key === 'val.tooBigGrain');
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** Is the base a rectangle (four straight sides)? Others are scaled instead. */
function isRect(d: Design, baseId: string): boolean {
  const b = d.panels[baseId];
  return b?.sketch.kind === 'poly' && b.sketch.pts.length === 4 && !b.sketch.round;
}

/** Put a lot in the middle of the space it is in. */
function centre(d: Design, id: string) {
  const c = d.contents?.find((x) => x.id === id);
  if (!c) return;
  const k = compartments(d, c.baseId).find((x) => inCell(x, c));
  if (!k) return;
  c.x = (k.x0 + k.x1) / 2;
  c.y = (k.y0 + k.y1) / 2;
}

/**
 * Grow a rectangular box by `need` and give all of it to the space `cell`: the box grows from its base's
 * corner, so every divider beyond the space's far side (in either direction) moves by the same amount.
 */
function growRect(d: Design, base: string, cell: Compartment, need: { w: number; d: number; h: number }) {
  const size = insideSize(d);
  if (!size) return;
  const moves: { id: string; dx: number; dy: number }[] = [];
  for (const id of dividersOn(d, base)) {
    const p = d.panels[id];
    if (!isDivider(p)) continue;
    const dx = need.w > 0 && p.divider.at.x >= cell.x1 - 1e-6 ? need.w : 0;
    const dy = need.d > 0 && p.divider.at.y >= cell.y1 - 1e-6 ? need.d : 0;
    if (dx || dy) moves.push({ id, dx, dy });
  }
  setInsideSize(d, { w: size.w + need.w, d: size.d + need.d, h: size.h + need.h });
  for (const m of moves) {
    const p = d.panels[m.id];
    if (isDivider(p)) p.divider = { ...p.divider, at: { x: p.divider.at.x + m.dx, y: p.divider.at.y + m.dy } };
  }
  solve(d);
}

/**
 * Grow `d` in place until the lot `contentId` fits; false (with `d` partly changed: run it on a copy) when it
 * cannot, or the box would no longer fit the sheet. A lot that fits already changes nothing.
 */
export function fitInPlace(d: Design, contentId: string): boolean {
  const lot = () => d.contents!.find((x) => x.id === contentId)!;
  const tray = boxTrayOf(d);
  if (!d.contents?.some((x) => x.id === contentId) || !tray) return false;
  const first = contentFit(d, lot());
  if (first.ok) return true;
  if (!first.cell) return false;
  const base = d.trays[tray].baseId;
  for (let i = 0; i < 6; i++) {
    const f = contentFit(d, lot());
    if (f.ok || !f.cell) break;
    if (isRect(d, base)) {
      // the need is rounded to 0.1 mm: a lot can still be a hair short after one grow, so top it up
      const n = (v: number, was: number) => (v > 0 ? v : i > 0 && was > 0 ? 0.1 : 0);
      growRect(d, base, f.cell, { w: n(f.need.w, first.need.w), d: n(f.need.d, first.need.d), h: n(f.need.h, first.need.h) });
    } else {
      // not a rectangle: larger all round, a little at a time
      const now = insideSize(d)!;
      const grow = Math.max(f.need.w, f.need.d, 1);
      const k = (Math.min(now.w, now.d) + grow) / Math.min(now.w, now.d);
      setInsideSize(d, { w: now.w * k, d: now.d * k, h: now.h + f.need.h });
      solve(d);
    }
    centre(d, contentId);
  }
  return contentFit(d, lot()).ok && !tooBig(d);
}

/** The design with the lot made to fit, or null when it cannot all fit on one sheet. */
export function fitContent(d: Design, contentId: string): Design | null {
  const c = clone(d);
  return fitInPlace(c, contentId) ? c : null;
}
