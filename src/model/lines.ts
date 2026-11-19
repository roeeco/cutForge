// Lines drawn on a board (milestone 83, LIDS_LINES_PROJECTS_PLAN.md §5):
// open polylines whose segments may bow into arcs, each of a line type. They
// are clipped to the board when pieces are built (a part outside its outline
// or inside a hole is dropped), dashed at export from two numbers per material,
// and checked: a cut from edge to edge would split the piece unseen.
import type { BoardLine, Design, LineType, MaterialProfile, P2, Panel } from './types';
import type { Seg, TaggedContour } from '../geom/types';
import { flattenContour, L } from '../geom/vec';
import { holeCuts, ownOutline } from './outline';
import { matOf } from './materials';

/** A material's dash lengths, [cut, tie] mm: its own, else its kind's (starting points: try them on scrap). */
export function lineDashes(m: MaterialProfile): { perf: [number, number]; crease: [number, number] } {
  if (m.lines) return m.lines;
  if (m.kind === 'card') return { perf: [1.5, 0.7], crease: [4, 2] };
  if (m.kind === 'corrugated') return m.thickness < 2.5 ? { perf: [3, 1.5], crease: [8, 4] } : { perf: [4, 2], crease: [10, 5] };
  return { perf: [4, 2], crease: [10, 5] };
}

/** An arc's centre, radius and sweep from its ends and its bulge (counter-clockwise for a positive bulge). */
export function bulgeArc(a: P2, b: P2, bulge: number): { c: P2; r: number; sweep: number } | null {
  if (Math.abs(bulge) < 1e-9) return null;
  const sweep = 4 * Math.atan(bulge);
  const dx = b.x - a.x, dy = b.y - a.y, chord = Math.hypot(dx, dy);
  if (chord < 1e-9) return null;
  const r = chord / (2 * Math.abs(Math.sin(sweep / 2)));
  // the centre is off the chord's middle, along its left normal for a ccw arc
  const h = (chord / 2) / Math.tan(sweep / 2);
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  return { c: { x: mx - (dy / chord) * h, y: my + (dx / chord) * h }, r, sweep };
}

/** The line as a polyline: arcs flattened to steps of at most 3°. */
export function linePolyline(ln: Pick<BoardLine, 'pts'>): P2[] {
  const out: P2[] = [];
  ln.pts.forEach((p, i) => {
    out.push({ x: p.x, y: p.y });
    const q = ln.pts[i + 1];
    if (!q || !p.bulge) return;
    const arc = bulgeArc(p, q, p.bulge);
    if (!arc) return;
    const a0 = Math.atan2(p.y - arc.c.y, p.x - arc.c.x);
    const n = Math.max(2, Math.ceil(Math.abs(arc.sweep) / (Math.PI / 60)));
    for (let k = 1; k < n; k++) {
      const t = a0 + (arc.sweep * k) / n;
      out.push({ x: arc.c.x + arc.r * Math.cos(t), y: arc.c.y + arc.r * Math.sin(t) });
    }
  });
  return out;
}

/** The pieces of a polyline that lie inside a polygon (or outside it, `keepIn` false): segment against polygon, no polygon clipping. */
function clipToPolygon(pl: P2[], poly: P2[], keepIn: boolean): P2[][] {
  const inside = (q: P2) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  };
  const out: P2[][] = [];
  let cur: P2[] = [];
  for (let i = 0; i + 1 < pl.length; i++) {
    const a = pl[i], b = pl[i + 1];
    // where the segment crosses the polygon, in order along it
    const ts = [0, 1];
    for (let k = 0; k < poly.length; k++) {
      const p = poly[k], q = poly[(k + 1) % poly.length];
      const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: q.x - p.x, y: q.y - p.y };
      const den = r.x * s.y - r.y * s.x;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((p.x - a.x) * s.y - (p.y - a.y) * s.x) / den, u = ((p.x - a.x) * r.y - (p.y - a.y) * r.x) / den;
      if (t > 1e-9 && t < 1 - 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) ts.push(t);
    }
    ts.sort((x, y) => x - y);
    for (let k = 0; k + 1 < ts.length; k++) {
      const t0 = ts[k], t1 = ts[k + 1];
      if (t1 - t0 < 1e-9) continue;
      const at = (t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      const keep = inside(at((t0 + t1) / 2)) === keepIn;
      if (keep) {
        if (!cur.length) cur.push(at(t0));
        cur.push(at(t1));
      } else if (cur.length) {
        out.push(cur);
        cur = [];
      }
    }
  }
  if (cur.length > 1) out.push(cur);
  return out.filter((x) => x.length > 1);
}

/** A line's parts on the board: inside its outline, outside its holes (as polylines). */
export function clippedLine(p: Panel, ln: Pick<BoardLine, 'pts'>): P2[][] {
  const own = ownOutline(p);
  let parts = [linePolyline(ln)];
  const ring = own.rings[0]?.map((e) => e.a);
  if (ring) parts = parts.flatMap((pl) => clipToPolygon(pl, ring, true));
  // holes in the outline, and the holes its cut-out shapes make
  const holes = [...own.holes, ...holeCuts(p).flatMap((h) => h.contours.filter((c) => c.closed).map((c) => flattenContour(c, 0.1)))];
  for (const h of holes) parts = parts.flatMap((pl) => clipToPolygon(pl, h, false));
  return parts;
}

const len = (a: P2, b: P2) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Dashes along a polyline: `cut` mm cut, `tie` mm left, from its start. A
 * perforation starts with a cut so the tear starts; a cut-crease starts with a
 * tie so the edge stays strong. A line shorter than one dash is one dash.
 */
export function dashes(pl: P2[], cut: number, tie: number, startCut: boolean): P2[][] {
  const total = pl.slice(1).reduce((s, q, i) => s + len(pl[i], q), 0);
  if (total <= cut + 1e-9) return startCut ? [pl] : [];
  const out: P2[][] = [];
  const pointAt = (dist: number): { p: P2; i: number } => {
    let acc = 0;
    for (let i = 0; i + 1 < pl.length; i++) {
      const l = len(pl[i], pl[i + 1]);
      if (acc + l >= dist - 1e-12) {
        const t = l > 0 ? (dist - acc) / l : 0;
        return { p: { x: pl[i].x + (pl[i + 1].x - pl[i].x) * t, y: pl[i].y + (pl[i + 1].y - pl[i].y) * t }, i };
      }
      acc += l;
    }
    return { p: pl[pl.length - 1], i: pl.length - 2 };
  };
  const span = (d0: number, d1: number): P2[] => {
    const A = pointAt(d0), B = pointAt(d1);
    return [A.p, ...pl.slice(A.i + 1, B.i + 1), B.p];
  };
  for (let s = startCut ? 0 : tie; s < total - 1e-9; s += cut + tie) out.push(span(s, Math.min(total, s + cut)));
  return out;
}

/** The cut file's contours of a board's lines (piece coordinates through `tf`). */
export function lineContours(d: Design, p: Panel, tf: (q: P2) => P2): TaggedContour[] {
  const out: TaggedContour[] = [];
  if (!p.lines?.length) return out;
  const m = matOf(d, p.id);
  const dash = lineDashes(m);
  const open = (pl: P2[]): Seg[] => pl.slice(1).map((q, i) => L(tf(pl[i]), tf(q)));
  for (const ln of p.lines) {
    const ref = { panelId: p.id, detailId: ln.id };
    for (const pl of clippedLine(p, ln)) {
      if (ln.type === 'crease') out.push({ op: 'score', role: 'line', contour: { closed: false, segs: open(pl) }, ref });
      else if (ln.type === 'guide') out.push({ op: 'guide', role: 'line', contour: { closed: false, segs: open(pl) }, ref });
      else if (ln.type === 'cut') out.push({ op: 'cut', role: 'line', contour: { closed: false, segs: open(pl) }, ref });
      else {
        const [c, t] = ln.type === 'perf' ? dash.perf : dash.crease;
        for (const k of dashes(pl, c, t, ln.type === 'perf')) out.push({ op: 'cut', role: 'line', contour: { closed: false, segs: open(k) }, ref });
      }
    }
  }
  return out;
}

/** Does a cut or perforation run from the board's edge to its edge (both ends on its outline)? It would split the piece. */
export function lineSplits(p: Panel, ln: BoardLine): boolean {
  if (ln.type !== 'cut') return false;
  const ring = ownOutline(p).rings[0]?.map((e) => e.a);
  if (!ring) return false;
  const onEdge = (q: P2) => ring.some((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y)) / l2));
    return Math.hypot(q.x - a.x - (b.x - a.x) * t, q.y - a.y - (b.y - a.y) * t) < 0.05;
  });
  return clippedLine(p, ln).some((pl) => onEdge(pl[0]) && onEdge(pl[pl.length - 1]));
}

/** Is a line wholly off its board? */
export const lineOutside = (p: Panel, ln: BoardLine) => clippedLine(p, ln).length === 0;

/** The types in the order the line card offers them. */
export const LINE_TYPES: LineType[] = ['cut', 'crease', 'perf', 'cutcrease', 'guide'];
