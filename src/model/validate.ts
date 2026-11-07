// Pre-export checks, explained in plain language by the UI.
import type { Design, P2 } from './types';
import type { MsgKey } from '../i18n';
import { detailBBox, panelExtras, panelNotches } from './geometry';
import { bboxOf } from '../geom/vec';
import { minWeb as materialMinWeb } from './materials';
import { findOpenSeams } from './seams';
import { leanSupported } from './ops';

export type IssueTarget = { kind: 'panel'; id: string } | { kind: 'detail'; id: string };
export type Issue = { key: MsgKey; vars: Record<string, string | number>; target: IssueTarget };

export function minWeb(d: Design): number {
  return materialMinWeb(d.material);
}

export function validate(d: Design): Issue[] {
  const issues: Issue[] = [];
  const min = minWeb(d);
  const name = (id: string) => d.panels[id]?.name ?? '?';
  for (const id of d.order) {
    const p = d.panels[id];
    if (!p) continue;
    const notches = panelNotches(d, p);
    // inner limits: an edge cut back by joint notches loses that depth
    const inset = notches.map((ns) => Math.max(0, ...ns.map((n) => n.depth)));
    const lim = { x0: inset[3], y0: inset[0], x1: p.w - inset[1], y1: p.h - inset[2] };
    const fitsW = Math.min(p.w, p.h) <= Math.min(d.material.sheetW, d.material.sheetH) - 2 * d.sheetMargin;
    const fitsL = Math.max(p.w, p.h) <= Math.max(d.material.sheetW, d.material.sheetH) - 2 * d.sheetMargin;
    if (!fitsW || !fitsL) issues.push({ key: 'val.tooBig', vars: { panel: p.name }, target: { kind: 'panel', id } });
    const thin = (bb: { minX: number; minY: number; maxX: number; maxY: number }) =>
      bb.minX - lim.x0 < min - 1e-9 || bb.minY - lim.y0 < min - 1e-9 || lim.x1 - bb.maxX < min - 1e-9 || lim.y1 - bb.maxY < min - 1e-9;
    for (const dt of p.details) {
      if (dt.op === 'score') continue;
      const bb = detailBBox(dt);
      if (bb.minX < 0 || bb.minY < 0 || bb.maxX > p.w || bb.maxY > p.h) {
        issues.push({ key: 'val.holeOutside', vars: { panel: p.name }, target: { kind: 'detail', id: dt.id } });
      } else if (dt.op === 'cut' && thin(bb)) {
        issues.push({ key: 'val.tooThin', vars: { panel: p.name, min }, target: { kind: 'detail', id: dt.id } });
      }
    }
    for (const h of panelExtras(d, p).holes) {
      const bb = bboxOf(h as P2[]);
      if (bb.minX < -1e-6 || bb.minY < -1e-6 || bb.maxX > p.w + 1e-6 || bb.maxY > p.h + 1e-6 || thin(bb))
        issues.push({ key: 'val.slotEdge', vars: { panel: p.name, min }, target: { kind: 'panel', id } });
    }
  }
  for (const c of Object.values(d.connections)) {
    if (c.broken) issues.push({ key: 'val.broken', vars: { a: name(c.a.panelId), b: name(c.b.panelId) }, target: { kind: 'panel', id: c.a.panelId } });
    if (c.grown && c.kind === 'lean' && !leanSupported(d, c.b.panelId))
      issues.push({ key: 'val.unsupported', vars: { panel: name(c.b.panelId) }, target: { kind: 'panel', id: c.b.panelId } });
  }
  for (const s of findOpenSeams(d)) {
    if (s.overlapping) issues.push({ key: 'val.overlap', vars: { a: name(s.a.panelId), b: name(s.b.panelId) }, target: { kind: 'panel', id: s.a.panelId } });
  }
  return issues;
}
