// Pre-export checks, explained in plain language by the UI.
import type { Design } from './types';
import type { MsgKey } from '../i18n';
import { panelNotches } from './geometry';
import { contourBBox } from '../geom/vec';
import { detailContour } from './geometry';

export type Issue = { key: MsgKey; vars: Record<string, string | number>; target: { kind: 'panel'; id: string } | { kind: 'detail'; id: string } };

/** Smallest safe web of material between a cut and an edge. */
export function minWeb(d: Design): number {
  return d.material.kind === 'plywood' ? 2 : d.material.kind === 'corrugated' ? 3 : 1.5;
}

export function validate(d: Design): Issue[] {
  const issues: Issue[] = [];
  const min = minWeb(d);
  for (const id of d.order) {
    const p = d.panels[id];
    if (!p) continue;
    const notches = panelNotches(d, p);
    // inner limits: an edge with joint notches is cut back by their depth
    const inset = notches.map((ns) => Math.max(0, ...ns.map((n) => n.depth)));
    const lim = { x0: inset[3], y0: inset[0], x1: p.w - inset[1], y1: p.h - inset[2] };
    const fitsW = Math.min(p.w, p.h) <= Math.min(d.material.sheetW, d.material.sheetH) - 2 * d.sheetMargin;
    const fitsL = Math.max(p.w, p.h) <= Math.max(d.material.sheetW, d.material.sheetH) - 2 * d.sheetMargin;
    if (!fitsW || !fitsL) issues.push({ key: 'val.tooBig', vars: { panel: p.name }, target: { kind: 'panel', id } });
    for (const dt of p.details) {
      if (dt.op === 'score') continue;
      const bb = contourBBox(detailContour(dt));
      if (bb.minX < 0 || bb.minY < 0 || bb.maxX > p.w || bb.maxY > p.h) {
        issues.push({ key: 'val.holeOutside', vars: { panel: p.name }, target: { kind: 'detail', id: dt.id } });
      } else if (
        dt.op === 'cut' &&
        (bb.minX - lim.x0 < min - 1e-9 || bb.minY - lim.y0 < min - 1e-9 || lim.x1 - bb.maxX < min - 1e-9 || lim.y1 - bb.maxY < min - 1e-9)
      ) {
        issues.push({ key: 'val.tooThin', vars: { panel: p.name, min }, target: { kind: 'detail', id: dt.id } });
      }
    }
  }
  return issues;
}
