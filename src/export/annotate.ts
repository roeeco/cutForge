// The dieline as a document (milestone 89, LIDS_LINES_PROJECTS_PLAN.md §9):
// what a piece says about itself — its boards' names, its blank size, the
// word *glue* on each glue flap — in the piece's own coordinates. The cut
// plan draws them as text behind *Dimensions*; the export outlines them onto
// the GUIDE layer when asked (off by default, so files do not change).
import type { Design, P2 } from '../model/types';
import type { TaggedContour } from '../geom/types';
import type { PieceCopy } from '../model/pack';
import { applyX, polygonContour } from '../geom/vec';
import { outlineText } from '../text/outline';
import { fmtNum } from '../i18n';

export type Annotation = { text: string; at: P2; size: number; kind: 'name' | 'size' | 'glue' };

/** A piece's annotations, piece-local (its box from (0, 0) to (w, h)); `name` gives a board's label. */
export function annotations(d: Design, c: PieceCopy, name: (panelId: string) => string, unit = 'mm'): Annotation[] {
  const out: Annotation[] = [];
  const shift = (q: P2) => ({ x: q.x - c.origin.x, y: q.y - c.origin.y });
  for (const n of c.panels) {
    const p = d.panels[n.panelId];
    if (!p) continue;
    const size = Math.max(2, Math.min(5, Math.min(p.w, p.h) / 8));
    out.push({ text: name(p.id), at: shift(applyX(n.xf, { x: p.w / 2, y: p.h / 2 })), size, kind: 'name' });
    // glue flaps cut from this board: the word on each, so the student knows where the glue goes
    for (const conn of Object.values(d.connections)) {
      if (conn.kind !== 'glue' || !conn.geom) continue;
      for (const a of conn.geom.adds) {
        if (a.panelId !== p.id || a.poly.length < 3) continue;
        const m = a.poly.reduce((s, q) => ({ x: s.x + q.x / a.poly.length, y: s.y + q.y / a.poly.length }), { x: 0, y: 0 });
        out.push({ text: 'glue', at: shift(applyX(n.xf, m)), size: 2, kind: 'glue' });
      }
    }
  }
  // the blank's overall size, at its bottom left, inside it
  out.push({ text: `${fmtNum(c.w)} × ${fmtNum(c.h)} ${unit}`, at: { x: 2, y: 2 }, size: 2.5, kind: 'size' });
  return out;
}

/** The annotations as outlined text on the GUIDE layer (LightBurn must not need the font). */
export function annotationContours(list: Annotation[]): TaggedContour[] {
  const out: TaggedContour[] = [];
  for (const a of list) {
    const o = outlineText(a.text, 'rubik', a.size);
    if (!o) continue;
    // names and glue centred on their point; the size from its corner
    const dx = a.kind === 'size' ? a.at.x - o.minX : a.at.x - (o.minX + o.maxX) / 2;
    const dy = a.kind === 'size' ? a.at.y - o.minY : a.at.y - (o.minY + o.maxY) / 2;
    for (const p of o.polys) out.push({ op: 'guide', role: 'line', contour: polygonContour(p.map((q) => ({ x: q.x + dx, y: q.y + dy }))) });
  }
  return out;
}
