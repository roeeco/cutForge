// Editing an outline in the 2D view (milestone 104, DIELINE_DNA_PLAN.md D0b-2):
// a shape, a board's own outline, a grown wall's corners, or one of a board's
// drawn lines, through the sketch engine (milestone 102). Pure: each edit is a
// function of the design and the target, called inside one `apply` (or one
// `preview` for a drag), so it is tested without a browser.
//
// - A shape's graph is in its own frame (mm about its centre, not turned) and
//   is kept on it (`Detail.sketch`), so its curves and corners stay editable.
// - A board's graph is one closed loop whose segments are its edge ids
//   (`graphBoard`: refused unless still one closed simple loop).
// - A wall (a grown board) has its four corners as points; only its top two
//   move (`setWallCorner`), nothing is added or removed.
// - A line is one open chain of its points, its arcs kept.
import type { BoardLine, Design, Detail, P2, Panel, SketchGraph, WallCorner } from '../model/types';
import { boardGraph, graphBoard, graphShape, shapeGraph } from './cutforge';
import { removePt, setCorner, setLength, setPt, setSegKind, splitSeg } from './ops';
import { segsAt } from './model';
import { findDetail, parentConnection, setWallCorner, updateLine } from '../model/ops';
import { wallCorners } from '../model/edges';
import { outlineWhy } from '../model/outlineWhy';

export type Edit2D = { kind: 'shape' | 'board' | 'line'; id: string; panelId: string };

/** Where a target's graph lives on its board: its graph, and the maps between its frame and the board's. */
export type Target = { g: SketchGraph; toBoard: (q: P2) => P2; fromBoard: (q: P2) => P2; wall: boolean; closed: boolean };

const findLine = (p: Panel, id: string): BoardLine | undefined => p.lines?.find((l) => l.id === id);

function lineGraph(ln: BoardLine): SketchGraph {
  const g: SketchGraph = { pts: {}, segs: {}, order: [] };
  ln.pts.forEach((q, i) => (g.pts[`q${i}`] = { x: q.x, y: q.y }));
  for (let i = 0; i + 1 < ln.pts.length; i++) {
    const b = ln.pts[i].bulge;
    g.segs[`l${i}`] = b ? { a: `q${i}`, b: `q${i + 1}`, k: 'arc', bulge: b } : { a: `q${i}`, b: `q${i + 1}`, k: 'line' };
    g.order.push(`l${i}`);
  }
  return g;
}

/** An open chain's points in order, with each segment's bulge on its first point; null when it is not one open chain. */
function openChain(g: SketchGraph): (P2 & { bulge?: number })[] | null {
  const ids = g.order.filter((id) => g.segs[id]);
  if (!ids.length) return null;
  const deg = new Map<string, number>();
  for (const id of ids) for (const e of [g.segs[id].a, g.segs[id].b]) deg.set(e, (deg.get(e) ?? 0) + 1);
  const ends = [...deg].filter(([, n]) => n === 1).map(([p]) => p);
  if (ends.length !== 2 || [...deg.values()].some((n) => n > 2)) return null;
  const out: (P2 & { bulge?: number })[] = [];
  const used = new Set<string>();
  let pt = ends[0];
  while (true) {
    const next = ids.find((id) => !used.has(id) && (g.segs[id].a === pt || g.segs[id].b === pt));
    const q = g.pts[pt];
    if (!next) {
      out.push({ x: q.x, y: q.y });
      break;
    }
    used.add(next);
    const s = g.segs[next];
    // walking an arc backwards turns its bulge round
    const bulge = s.k === 'arc' ? (s.a === pt ? s.bulge : -s.bulge) : 0;
    out.push(bulge ? { x: q.x, y: q.y, bulge } : { x: q.x, y: q.y });
    pt = s.a === pt ? s.b : s.a;
  }
  return used.size === ids.length ? out : null;
}

const WALL: WallCorner[] = ['bl', 'br', 'tr', 'tl'];

/** The target's graph and frame, or null when it cannot be edited here. */
export function targetOf(d: Design, t: Edit2D): Target | null {
  const p = d.panels[t.panelId];
  if (!p) return null;
  const id = (q: P2) => ({ x: q.x, y: q.y });
  if (t.kind === 'shape') {
    const f = findDetail(d, t.id);
    if (!f || f.panel.id !== t.panelId) return null;
    const dt = f.detail;
    const g = shapeGraph(dt);
    if (!g) return null;
    const a = ((dt.rot ?? 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return {
      g,
      toBoard: (q) => ({ x: dt.cx + c * q.x - s * q.y, y: dt.cy + s * q.x + c * q.y }),
      fromBoard: (q) => ({ x: (q.x - dt.cx) * c + (q.y - dt.cy) * s, y: -(q.x - dt.cx) * s + (q.y - dt.cy) * c }),
      wall: false,
      closed: true,
    };
  }
  if (t.kind === 'line') {
    const ln = findLine(p, t.id);
    return ln ? { g: lineGraph(ln), toBoard: id, fromBoard: id, wall: false, closed: false } : null;
  }
  if (outlineWhy(d, t.panelId)) return null;
  if (p.sketch.kind === 'wall') {
    const c = wallCorners(p.w, p.h, p.sketch);
    const g: SketchGraph = { pts: {}, segs: {}, order: [] };
    WALL.forEach((k, i) => (g.pts[k] = { x: c[i].x, y: c[i].y, ...(k === 'bl' || k === 'br' ? { lock: true as const } : {}) }));
    WALL.forEach((k, i) => {
      g.segs[`e${i}`] = { a: k, b: WALL[(i + 1) % 4], k: 'line' };
      g.order.push(`e${i}`);
    });
    return { g, toBoard: id, fromBoard: id, wall: true, closed: true };
  }
  const g = boardGraph(p, !!parentConnection(d, t.panelId));
  return g ? { g, toBoard: id, fromBoard: id, wall: false, closed: true } : null;
}

/** Write a target's graph back: false (nothing changed) when it is refused. */
export function writeTarget(d: Design, t: Edit2D, g: SketchGraph): boolean {
  const p = d.panels[t.panelId];
  if (!p) return false;
  if (t.kind === 'shape') return graphShape(d, t.id, g);
  if (t.kind === 'line') {
    const pts = openChain(g);
    if (!pts || pts.length < 2) return false;
    updateLine(d, t.id, { pts });
    return true;
  }
  if (p.sketch.kind === 'wall') {
    // only the top corners move; the bottom ones stay on the edge the wall stands on
    const rect = { tl: { x: 0, y: p.h }, tr: { x: p.w, y: p.h } };
    let ok = true;
    for (const k of ['tr', 'tl'] as const) {
      const q = g.pts[k];
      if (q && !setWallCorner(d, t.panelId, k, { dx: q.x - rect[k].x, dy: q.y - rect[k].y })) ok = false;
    }
    return ok;
  }
  return graphBoard(d, t.panelId, g);
}

/** Move one point to a place in the board's coordinates. */
export function movePoint(d: Design, t: Edit2D, ptId: string, at: P2): boolean {
  const tg = targetOf(d, t);
  if (!tg || !tg.g.pts[ptId] || tg.g.pts[ptId].lock) return false;
  if (!setPt(tg.g, ptId, tg.fromBoard(at))) return false;
  return writeTarget(d, t, tg.g);
}

/** Split a segment at its middle (`+`): the new point's id, or null. Not on a wall. */
export function insertPoint(d: Design, t: Edit2D, segId: string): string | null {
  const tg = targetOf(d, t);
  if (!tg || tg.wall || !tg.g.segs[segId]) return null;
  const id = splitSeg(tg.g, segId, 0.5);
  return id && writeTarget(d, t, tg.g) ? id : null;
}

/** Remove a point (its neighbours joined). Refused under three points on a closed outline, two on a line, and on a wall. */
export function deletePoint(d: Design, t: Edit2D, ptId: string): boolean {
  const tg = targetOf(d, t);
  if (!tg || tg.wall || !tg.g.pts[ptId]) return false;
  if (Object.keys(tg.g.pts).length <= (tg.closed ? 3 : 2)) return false;
  if (!removePt(tg.g, ptId)) return false;
  return writeTarget(d, t, tg.g);
}

/** Sharp, rounded or cut corners at these points (a size in mm): how many could not be (not a corner between two straight lines). */
export function setCorners(d: Design, t: Edit2D, ptIds: string[], kind: 'sharp' | 'round' | 'cut', size: number): number {
  const tg = targetOf(d, t);
  if (!tg || tg.wall) return ptIds.length;
  const skipped = setCorner(tg.g, ptIds, kind === 'sharp' ? null : kind === 'round' ? { r: size } : { ch: size });
  // a board stores a rounded corner, not a cut one
  if (t.kind === 'board' && kind === 'cut') return ptIds.length;
  if (!writeTarget(d, t, tg.g)) return ptIds.length;
  return skipped;
}

/** Straight or curved segments. */
export function setCurved(d: Design, t: Edit2D, segIds: string[], curved: boolean): boolean {
  const tg = targetOf(d, t);
  if (!tg || tg.wall) return false;
  if (!setSegKind(tg.g, segIds, curved ? 'bez' : 'line')) return false;
  return writeTarget(d, t, tg.g);
}

/** A straight segment's length typed: its start stays (or the other end when `fixed` names it), the moved end alone on a closed outline. */
export function setSegmentLength(d: Design, t: Edit2D, segId: string, len: number, fixed?: string): boolean {
  const tg = targetOf(d, t);
  const s = tg?.g.segs[segId];
  if (!tg || !s || tg.wall || s.k !== 'line' || !(len > 0)) return false;
  if (!setLength(tg.g, segId, len, { fixed: fixed ?? s.a })) return false;
  return writeTarget(d, t, tg.g);
}

/** The points next to a point (for the card's angle and the corner's lines). */
export const linesAt = (g: SketchGraph, ptId: string) => segsAt(g, ptId);

/** Can this be edited in the 2D view, and how: the target for a shape, a line, or a board. */
export function canEdit(d: Design, t: Edit2D): boolean {
  return !!targetOf(d, t);
}

export type { Detail };
