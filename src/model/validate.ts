// Pre-export checks, explained in plain language by the UI.
import type { Design, P2 } from './types';
import type { MsgKey } from '../i18n';
import { detailBBox, panelExtras, panelNotches, panelOutline } from './geometry';
import { bboxOf } from '../geom/vec';
import { minWeb as materialMinWeb } from './materials';
import { findOpenSeams } from './seams';
import { leanSupported } from './ops';
import { templateIssues } from '../templates/registry';
import { detailInstances, shapeContours, textBox } from './geometry';
import { flattenContour, pointInPolygon, segDistPoint } from '../geom/vec';
import { pack, pieceCopies, placementXform } from './pack';
import { applyX } from '../geom/vec';
import polygonClipping from 'polygon-clipping';
import { outlineText } from '../text/outline';
import type { FontId } from '../text/fonts';

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
    const inset = [0, 1, 2, 3].map((e) => Math.max(0, ...(notches[`e${e}`] ?? []).map((n) => n.depth)));
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
    const outline = panelOutline(p, notches);
    for (const h of panelExtras(d, p).holes) {
      // a slot must lie inside the manufactured outline with at least a web of material around it
      const inside = h.every((q) => pointInPolygon(q, outline));
      if (!inside || webTo(h, outline) < min - 1e-6) issues.push({ key: 'val.slotEdge', vars: { panel: p.name, min }, target: { kind: 'panel', id } });
    }
  }
  for (const c of Object.values(d.connections)) {
    if (c.broken) issues.push({ key: 'val.broken', vars: { a: name(c.a.panelId), b: name(c.b.panelId) }, target: { kind: 'panel', id: c.a.panelId } });
    if (c.grown && c.kind === 'lean' && !leanSupported(d, c.b.panelId))
      issues.push({ key: 'val.unsupported', vars: { panel: name(c.b.panelId) }, target: { kind: 'panel', id: c.b.panelId } });
  }
  issues.push(...shapeIssues(d), ...sheetIssues(d));
  for (const ti of templateIssues(d)) issues.push({ key: ti.key, vars: ti.vars, target: { kind: 'panel', id: d.panels[ti.panel] ? ti.panel : d.order[0] } });
  for (const s of findOpenSeams(d)) {
    if (s.overlapping) issues.push({ key: 'val.overlap', vars: { a: name(s.a.panelId), b: name(s.b.panelId) }, target: { kind: 'panel', id: s.a.panelId } });
  }
  return issues;
}

/** Smallest distance from a closed polygon's edges to a ring's edges (they do not cross). */
export function webTo(poly: P2[], ring: P2[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++)
    for (let j = 0; j < ring.length; j++) {
      best = Math.min(best, segDistPoint(poly[i], ring[j], ring[(j + 1) % ring.length]), segDistPoint(ring[j], poly[i], poly[(i + 1) % poly.length]));
    }
  return best;
}

type Poly = [number, number][];
const ring = (pts: { x: number; y: number }[]): Poly => pts.map((p) => [Math.round(p.x * 1e6) / 1e6, Math.round(p.y * 1e6) / 1e6]);
function overlapArea(a: Poly, b: Poly): number {
  try {
    const r = polygonClipping.intersection([a], [b]);
    let area = 0;
    for (const poly of r)
      poly.forEach((rg, i) => {
        let s = 0;
        for (let k = 0; k < rg.length - 1; k++) s += rg[k][0] * rg[k + 1][1] - rg[k + 1][0] * rg[k][1];
        area += (i === 0 ? 1 : -1) * Math.abs(s / 2);
      });
    return area;
  } catch {
    return 0;
  }
}

/** Text that failed to outline, cut-through letters with islands, and cut shapes that overlap (doubled cut lines). */
function shapeIssues(d: Design): Issue[] {
  const out: Issue[] = [];
  for (const id of d.order) {
    const p = d.panels[id];
    if (!p) continue;
    const cuts: { id: string; poly: Poly; bb: [number, number, number, number] }[] = [];
    for (const dt of p.details) {
      if (dt.shape === 'text' && dt.text) {
        const tb = textBox(dt);
        const o = outlineText(dt.text.value, dt.text.font as FontId, dt.text.size);
        if (!tb.ok) out.push({ key: 'val.textFailed', vars: { panel: p.name, chars: o?.missing.join(' ') ?? '' }, target: { kind: 'detail', id: dt.id } });
        if (dt.op === 'cut' && o && o.polys.some((a, i) => o.polys.some((b, j) => i !== j && pointInPolygon(a[0], b))))
          out.push({ key: 'val.stencil', vars: { panel: p.name }, target: { kind: 'detail', id: dt.id } });
        continue; // letters are allowed to touch each other
      }
      if (dt.op !== 'cut') continue;
      for (const inst of detailInstances(dt))
        for (const c of shapeContours(inst)) {
          const pts = flattenContour(c, 0.05);
          const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
          cuts.push({ id: dt.id, poly: ring(pts), bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
        }
    }
    const flagged = new Set<string>();
    for (let i = 0; i < cuts.length; i++)
      for (let j = i + 1; j < cuts.length; j++) {
        const a = cuts[i], b = cuts[j];
        if (a.bb[0] > b.bb[2] + 1e-6 || b.bb[0] > a.bb[2] + 1e-6 || a.bb[1] > b.bb[3] + 1e-6 || b.bb[1] > a.bb[3] + 1e-6) continue;
        const touching = overlapArea(a.poly, b.poly) > 1e-4;
        const key = `${a.id}|${b.id}`;
        if (touching && !flagged.has(key)) {
          flagged.add(key);
          out.push({ key: 'val.shapesOverlap', vars: { panel: p.name }, target: { kind: 'detail', id: b.id } });
        }
      }
  }
  return out;
}

/** Pieces that overlap each other or lie outside their sheet (after manual moves). */
function sheetIssues(d: Design): Issue[] {
  const out: Issue[] = [];
  const copies = pieceCopies(d);
  const pl = pack(d, copies);
  const W = d.material.sheetW, H = d.material.sheetH;
  const placed = copies
    .filter((c) => pl[c.key])
    .map((c) => {
      const xf = placementXform(pl[c.key], c.h);
      const outer = c.contours.find((x) => x.role === 'outer');
      const pts = outer ? flattenContour(outer.contour, 0.2).map((q) => applyX(xf, q)) : [];
      const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
      return { c, sheet: pl[c.key].sheet, poly: ring(pts), bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
    });
  const name = (k: string) => d.panels[k]?.name ?? '?';
  for (const a of placed)
    if (a.bb[0] < -1e-6 || a.bb[1] < -1e-6 || a.bb[2] > W + 1e-6 || a.bb[3] > H + 1e-6)
      out.push({ key: 'val.offSheet', vars: { panel: name(a.c.pieceKey), copy: a.c.copy + 1 }, target: { kind: 'panel', id: a.c.pieceKey } });
  for (let i = 0; i < placed.length; i++)
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i], b = placed[j];
      if (a.sheet !== b.sheet || a.bb[0] > b.bb[2] || b.bb[0] > a.bb[2] || a.bb[1] > b.bb[3] || b.bb[1] > a.bb[3]) continue;
      if (overlapArea(a.poly, b.poly) > 1e-3)
        out.push({ key: 'val.piecesOverlap', vars: { a: name(a.c.pieceKey), b: name(b.c.pieceKey) }, target: { kind: 'panel', id: b.c.pieceKey } });
    }
  return out;
}
