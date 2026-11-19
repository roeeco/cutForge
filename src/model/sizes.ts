// Sizes (milestone 88, LIDS_LINES_PROJECTS_PLAN.md §7.3): a size is the
// master with a row of numbers applied, worked out when it is shown or cut and
// never stored, so a change to the master reaches every size. A design with
// one box takes its width, depth and height; a template its parameters.
// Walls follow the base, a lid of its own its box, a lid that closes the box
// is fitted again; dividers keep their share of the box; shapes and lines are
// not scaled: one near its board's middle stays in the middle, any other
// keeps its distance from the nearer edge.
import type { BoxSize, Design } from './types';
import type { MsgKey } from '../i18n';
import { setPanelSize, setTrayHeight, solve } from './ops';
import { regenerate } from '../templates/registry';
import { outsideFor } from './boxSize';

/** The one box a design's sizes resize (a lid of its own is part of its box), or null. */
export function sizedBox(d: Design): string | null {
  const boxes = Object.values(d.trays ?? {}).filter((t) => !t.lidOf);
  return boxes.length === 1 ? boxes[0].id : null;
}

/** Why a design cannot have sizes (null when it can): sizes need one box, or a template. */
export function sizesWhy(d: Design): MsgKey | null {
  if (d.template) return null;
  const n = Object.values(d.trays ?? {}).filter((t) => !t.lidOf).length;
  return n === 1 ? null : n === 0 ? 'sizes.why.noBox' : 'sizes.why.boxes';
}

/** The master at this size: a copy, its sizes set, solved. The master is not touched. */
export function applySize(master: Design, s: BoxSize): Design {
  const d = structuredClone(master) as Design;
  delete d.sizes;
  if (d.template) {
    const r = regenerate(d, { ...d.template.params, ...(s.params ?? {}) });
    return r.design;
  }
  const tid = sizedBox(d);
  if (!tid) return d;
  const tray = d.trays[tid];
  const B = d.panels[tray.baseId];
  const w0 = B.w, h0 = B.h;
  // a size's numbers are read in the design's size intent (milestone 93)
  const o = outsideFor(d, tid, { w: s.w, d: s.d, h: s.h });
  const w1 = o.w ?? w0, h1 = o.d ?? h0;
  // every board's size before, to keep each shape's place from its nearer edge (or the middle)
  const before = new Map(d.order.map((id) => [id, { w: d.panels[id].w, h: d.panels[id].h }]));
  // dividers keep their share of the base
  for (const id of d.order) {
    const p = d.panels[id];
    if (p?.divider && p.place?.host === B.id) p.divider.at = { x: p.divider.at.x * (w1 / w0), y: p.divider.at.y * (h1 / h0) };
  }
  setPanelSize(d, B.id, w1, h1);
  if (o.h !== undefined) setTrayHeight(d, tid, o.h);
  for (const id of d.order) {
    const p = d.panels[id], b = before.get(id);
    if (!p || !b || (Math.abs(p.w - b.w) < 1e-9 && Math.abs(p.h - b.h) < 1e-9)) continue;
    const keep = (v: number, L0: number, L1: number) => (Math.abs(v - L0 / 2) <= 1 ? L1 / 2 : v < L0 / 2 ? v : L1 - (L0 - v));
    for (const dt of p.details) {
      dt.cx = keep(dt.cx, b.w, p.w);
      dt.cy = keep(dt.cy, b.h, p.h);
    }
    for (const ln of p.lines ?? []) ln.pts = ln.pts.map((q) => ({ ...q, x: keep(q.x, b.w, p.w), y: keep(q.y, b.h, p.h) }));
  }
  solve(d);
  return d;
}
