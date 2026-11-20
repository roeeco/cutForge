// CutForge's boards and shapes as sketch graphs, and back (milestone 102,
// DIELINE_DNA_PLAN.md D0b-1). The 2D outline editing (milestone 104) edits a
// graph and writes it back here.
//
// A root board's outline is one closed ring whose edges carry ids that joints
// and grown boards refer to (`Sketch.edgeIds`): its graph is one closed chain
// whose segment ids are those edge ids, and writing back keeps every id it
// still has (a segment split in two keeps its id on its first piece, as
// `insertVertex` does). A point's rounded corner is `SkPt.r`; an edge drawn as
// a curve (`curve: 'auto'` on its first point) is a Bezier segment, its exact
// shape still the board's own curve rule. A shape (a cut-out, an engraving…)
// has no ids to keep: it may hold several outlines and holes.
import type { Detail, Design, P2, Panel, SketchGraph, SkPt, SkSeg } from '../model/types';
import { nextEdgeId, normalizeSketch, parentConnection, solve } from '../model/ops';
import { isSimplePolygon } from '../model/ops';
import { polygonArea } from '../geom/vec';
import { sketchRegion } from './regions';
import { scaleSketch } from './ops';

const ptId = (i: number) => `p${i}`;

/** A straight Bezier (handles a third of the chord): how an `auto` curved edge sits in the graph. */
const softBez = (a: P2, b: P2): SkSeg => ({ a: '', b: '', k: 'bez', ha: { x: (b.x - a.x) / 3, y: (b.y - a.y) / 3 }, hb: { x: (a.x - b.x) / 3, y: (a.y - b.y) / 3 } });

/** A root board drawn as points, as a graph; null for a board that is not one (round, grown, a wall). */
export function boardGraph(p: Panel, hasParent = false): SketchGraph | null {
  const s = p.sketch;
  if (hasParent || s.kind !== 'poly' || s.round) return null;
  const g: SketchGraph = { pts: {}, segs: {}, order: [] };
  const n = s.pts.length;
  s.pts.forEach((q, i) => {
    const pt: SkPt = { x: q.x, y: q.y };
    if (q.curve === 'round' && q.r) pt.r = q.r;
    g.pts[ptId(i)] = pt;
  });
  for (let i = 0; i < n; i++) {
    const a = s.pts[i], b = s.pts[(i + 1) % n];
    const id = s.edgeIds[i] ?? `e${i}`;
    g.segs[id] = a.curve === 'auto' ? { ...softBez(a, b), a: ptId(i), b: ptId((i + 1) % n) } : { a: ptId(i), b: ptId((i + 1) % n), k: 'line' };
    g.order.push(id);
  }
  return g;
}

/** The single closed chain of a graph, walked in order: [point, outgoing segment] pairs; null when it is not one closed loop. */
export function closedLoop(g: SketchGraph): { pt: string; seg: string }[] | null {
  const live = g.order.filter((id) => g.segs[id] && !g.segs[id].cons);
  if (live.length < 3 || live.length !== Object.keys(g.segs).length) return null;
  const at = new Map<string, string[]>();
  for (const id of live) for (const e of [g.segs[id].a, g.segs[id].b]) at.set(e, [...(at.get(e) ?? []), id]);
  if ([...at.values()].some((l) => l.length !== 2) || at.size !== live.length) return null;
  const out: { pt: string; seg: string }[] = [];
  let seg = live[0], pt = g.segs[seg].a;
  for (let k = 0; k < live.length; k++) {
    out.push({ pt, seg });
    const s = g.segs[seg];
    const next = s.a === pt ? s.b : s.a;
    const other = at.get(next)!.find((x) => x !== seg)!;
    pt = next;
    seg = other;
  }
  return seg === live[0] && pt === g.segs[live[0]].a ? out : null;
}

/** The edge id a segment had before it was split (`splitSeg` names the pieces `<id>a`, `<id>b`, …). */
const rootId = (id: string, known: Set<string>): string | null => {
  let x = id;
  while (x && !known.has(x) && /[ab]$/.test(x)) x = x.slice(0, -1);
  return known.has(x) ? x : null;
};

/**
 * Write a board's graph back (one edit of the design): refused (false, nothing
 * changed) unless it is still one closed loop of lines and curves without
 * construction lines, and a simple polygon. Every edge keeps its id where it
 * still exists; a piece of a split edge after the first, or a new edge, gets a
 * new one.
 */
export function graphBoard(d: Design, panelId: string, g: SketchGraph): boolean {
  const p = d.panels[panelId];
  if (!p || p.sketch.kind !== 'poly' || parentConnection(d, panelId)) return false;
  const loop = closedLoop(g);
  if (!loop) return false;
  let pts = loop.map((x) => g.pts[x.pt]);
  let segs = loop.map((x) => x.seg);
  // counter-clockwise, as the board's outline is
  if (polygonArea(pts) < 0) {
    const r = loop.map((x) => x).reverse();
    // walking backwards: each point's outgoing segment is the one that came into it
    pts = r.map((x) => g.pts[x.pt]);
    segs = r.map((_x, i) => r[(i + 1) % r.length].seg);
  }
  if (!isSimplePolygon(pts) || polygonArea(pts) <= 0) return false;
  const known = new Set(p.sketch.edgeIds);
  const used = new Set<string>();
  const ids: string[] = [];
  for (const sid of segs) {
    const root = rootId(sid, known);
    if (root && !used.has(root)) {
      used.add(root);
      ids.push(root);
    } else ids.push('');
  }
  // new ids after every kept one, so none repeats
  const all = [...p.sketch.edgeIds];
  for (let i = 0; i < ids.length; i++)
    if (!ids[i]) {
      ids[i] = nextEdgeId(all);
      all.push(ids[i]);
    }
  p.sketch = {
    kind: 'poly',
    pts: pts.map((q, i) => ({ x: q.x, y: q.y, ...(q.r ? { curve: 'round' as const, r: q.r } : g.segs[segs[i]].k !== 'line' ? { curve: 'auto' as const } : {}) })),
    edgeIds: ids,
  };
  normalizeSketch(p);
  solve(d);
  return true;
}

/** A shape as a graph in its own frame (millimetres about its centre, not turned): its kept graph, or one made from its outline; null for text. */
export function shapeGraph(dt: Detail): SketchGraph | null {
  if (dt.sketch) return JSON.parse(JSON.stringify(dt.sketch)) as SketchGraph;
  const g: SketchGraph = { pts: {}, segs: {}, order: [] };
  let k = 0;
  const pt = (x: number, y: number, r?: number) => {
    const id = `p${k++}`;
    g.pts[id] = r ? { x, y, r } : { x, y };
    return id;
  };
  const seg = (s: SkSeg) => {
    const id = `g${g.order.length}`;
    g.segs[id] = s;
    g.order.push(id);
  };
  const loop = (ids: string[]) => ids.forEach((a, i) => seg({ a, b: ids[(i + 1) % ids.length], k: 'line' }));
  const W = dt.w / 2, H = dt.h / 2;
  switch (dt.shape) {
    case 'rect':
      loop([pt(-W, -H), pt(W, -H), pt(W, H), pt(-W, H)]);
      return g;
    case 'roundrect': {
      const r = Math.min(dt.r ?? 0, W, H);
      loop([pt(-W, -H, r), pt(W, -H, r), pt(W, H, r), pt(-W, H, r)]);
      return g;
    }
    case 'circle': {
      if (Math.abs(dt.w - dt.h) > 1e-6) return null;
      const a = pt(-W, 0), b = pt(W, 0);
      seg({ a, b, k: 'arc', bulge: 1 });
      seg({ a: b, b: a, k: 'arc', bulge: 1 });
      return g;
    }
    case 'polygon':
    case 'path':
      for (const poly of dt.path?.polys ?? []) loop(poly.map((q) => pt(q.x * dt.w, q.y * dt.h)));
      return g.order.length ? g : null;
    default:
      return null;
  }
}

/**
 * The outlines a shape's graph cuts (its region: outer rings counter-clockwise,
 * holes clockwise), in board coordinates, for a shape at `cx, cy` turned `rot`.
 */
export function shapeRings(g: SketchGraph, cx: number, cy: number, rot = 0): P2[][] {
  const a = (rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return sketchRegion(g).flat().map((ring) => ring.map((q) => ({ x: cx + c * q.x - s * q.y, y: cy + s * q.x + c * q.y })));
}

/**
 * Write a shape's graph back as a polygon or path in its unit box (its region
 * flattened; milestone 104 keeps the graph itself): the box re-fitted, the
 * centre moved with it, the turn kept. Refused (false) when it fills nothing.
 */
export function graphShape(d: Design, detailId: string, g: SketchGraph): boolean {
  for (const p of Object.values(d.panels)) {
    const dt = p.details.find((x) => x.id === detailId);
    if (!dt) continue;
    const rings = sketchRegion(g).flat();
    if (!rings.length) return false;
    const xs = rings.flat().map((q) => q.x), ys = rings.flat().map((q) => q.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const w = Math.max(0.5, x1 - x0), h = Math.max(0.5, y1 - y0);
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const a = ((dt.rot ?? 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    dt.cx += c * mx - s * my;
    dt.cy += s * mx + c * my;
    dt.w = w;
    dt.h = h;
    dt.shape = rings.length > 1 ? 'path' : 'polygon';
    dt.path = { polys: rings.map((r) => r.map((q) => ({ x: (q.x - mx) / w, y: (q.y - my) / h }))) };
    // the graph itself is kept (milestone 104): its curves and corners stay editable; centred on the shape like its outline
    const k: SketchGraph = JSON.parse(JSON.stringify(g));
    for (const q of Object.values(k.pts)) (q.x -= mx), (q.y -= my);
    dt.sketch = k;
    delete dt.regular;
    delete dt.r;
    return true;
  }
  return false;
}

/**
 * A shape's kept graph follows its size (milestone 104): when its width or
 * height changes (the frame, the card, a fix), the graph is scaled about its
 * centre so its outline fills the new box, as the flattened outline in the
 * unit box already does. Arcs become curves under a scale that is not alike.
 */
export function fitShapeSketch(dt: Detail) {
  const g = dt.sketch;
  if (!g) return;
  const rings = sketchRegion(g).flat();
  if (!rings.length) return;
  const xs = rings.flat().map((q) => q.x), ys = rings.flat().map((q) => q.y);
  const w0 = Math.max(...xs) - Math.min(...xs), h0 = Math.max(...ys) - Math.min(...ys);
  if (w0 <= 0 || h0 <= 0) return;
  const sx = dt.w / w0, sy = dt.h / h0;
  if (Math.abs(sx - 1) < 1e-9 && Math.abs(sy - 1) < 1e-9) return;
  const mx = (Math.max(...xs) + Math.min(...xs)) / 2, my = (Math.max(...ys) + Math.min(...ys)) / 2;
  for (const q of Object.values(g.pts)) (q.x -= mx), (q.y -= my);
  scaleSketch(g, sx, sy);
}

/** Is this a well-formed graph (finite numbers, segments whose ends exist, bulges within ±50, each segment listed once)? */
export function sketchOk(x: unknown): x is SketchGraph {
  if (!x || typeof x !== 'object') return false;
  const g = x as SketchGraph;
  if (!g.pts || !g.segs || !Array.isArray(g.order)) return false;
  const fin = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1e6;
  for (const p of Object.values(g.pts)) if (!p || !fin(p.x) || !fin(p.y) || (p.r !== undefined && !fin(p.r))) return false;
  const ids = Object.keys(g.segs);
  if (ids.length === 0 || ids.length !== g.order.length || ids.some((id) => !g.order.includes(id))) return false;
  for (const s of Object.values(g.segs)) {
    if (!g.pts[s.a] || !g.pts[s.b]) return false;
    if (s.k === 'arc' && (!fin(s.bulge) || Math.abs(s.bulge) > 50)) return false;
    if (s.k === 'bez' && (!fin(s.ha?.x) || !fin(s.ha?.y) || !fin(s.hb?.x) || !fin(s.hb?.y))) return false;
    if (s.k !== 'line' && s.k !== 'arc' && s.k !== 'bez') return false;
  }
  return true;
}
