// Reading a waffle design from a file or autosave: every field the shape code
// reads is checked; a bad shape is dropped rather than failing the whole file.
import type { Design, Sculpt, Shape3 } from '../model/types';
import { isSculpture, KINDS } from './ops';
import { outlineToGraph } from './round';

const isObj = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);
const finite = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < 1e6;
const vec = (x: unknown, n: number) => Array.isArray(x) && x.length === n && x.every(finite);

function shapeOk(s: any, id: string): s is Shape3 {
  if (!isObj(s) || s.id !== id || !KINDS.includes(s.kind) || !vec(s.at, 3) || !vec(s.q, 4)) return false;
  if (typeof s.name !== 'string') s.name = '';
  if (s.size !== undefined && !(vec(s.size, 3) && s.size.every((v: number) => v > 0))) delete s.size;
  if (s.kind !== 'group' && s.kind !== 'extrude' && s.kind !== 'revolve' && !s.size) s.size = [40, 40, 40];
  for (const f of ['n', 'top', 'tube', 'height', 'angle'] as const) if (s[f] !== undefined && !finite(s[f])) delete s[f];
  if (s.corners !== undefined && !(Array.isArray(s.corners) && s.corners.every((r: unknown) => finite(r) && (r as number) >= 0))) delete s.corners;
  if (s.sketch !== undefined) {
    const k = s.sketch;
    if (!isObj(k) || (k.plane !== 'floor' && k.plane !== 'upright')) return false;
    if (Array.isArray(k.pts)) {
      // a milestone-50 outline: a closed chain of points
      if (!k.pts.every((p: any) => isObj(p) && finite(p.x) && finite(p.y))) return false;
      const pts = k.pts.map((p: any) => ({ x: p.x, y: p.y, ...(p.curve === 'auto' ? { curve: 'auto' as const } : {}), ...(finite(p.r) && p.r > 0 ? { r: p.r } : {}) }));
      s.sketch = { plane: k.plane, v: 2, ...outlineToGraph(pts) };
      if (s.axis?.kind === 'edge' && Number.isInteger(s.axis.i)) s.axis = { kind: 'seg', id: `g${((s.axis.i % pts.length) + pts.length) % pts.length}` };
    }
    if (!graphOk(s.sketch)) return false;
  }
  if ((s.kind === 'extrude' || s.kind === 'revolve') && !s.sketch) return false;
  if (s.axis !== undefined && !(isObj(s.axis) && (s.axis.kind === 'plane' || (s.axis.kind === 'seg' && typeof s.axis.id === 'string' && s.sketch?.segs[s.axis.id]?.k === 'line')))) delete s.axis;
  if (s.kind === 'group') s.children = Array.isArray(s.children) ? s.children.filter((c: unknown) => typeof c === 'string') : [];
  else delete s.children;
  if (s.hole !== undefined && s.hole !== true) delete s.hole;
  if (s.stretch !== undefined && !(vec(s.stretch, 3) && s.stretch.every((v: number) => v > 0))) delete s.stretch;
  if (s.facets !== undefined && !(Number.isInteger(s.facets) && s.facets >= 3 && s.facets <= 64)) delete s.facets;
  return true;
}

const pt2 = (p: any) => isObj(p) && finite(p.x) && finite(p.y);

/** A sketch graph made safe: bad points and segments dropped; false when no segment is left. */
function graphOk(k: any): boolean {
  if (!isObj(k.pts) || !isObj(k.segs)) return false;
  k.v = 2;
  for (const [id, p] of Object.entries<any>(k.pts)) {
    if (!pt2(p)) {
      delete k.pts[id];
      continue;
    }
    for (const f of ['r', 'ch'] as const) if (p[f] !== undefined && !(finite(p[f]) && p[f] > 0)) delete p[f];
    for (const f of ['smooth', 'lock'] as const) if (p[f] !== undefined && p[f] !== true) delete p[f];
  }
  for (const [id, g] of Object.entries<any>(k.segs)) {
    const ok =
      isObj(g) &&
      typeof g.a === 'string' &&
      typeof g.b === 'string' &&
      !!k.pts[g.a] &&
      !!k.pts[g.b] &&
      (g.k === 'line' || (g.k === 'arc' && finite(g.bulge) && Math.abs(g.bulge) <= 50) || (g.k === 'bez' && pt2(g.ha) && pt2(g.hb)));
    if (!ok) delete k.segs[id];
    else if (g.cons !== undefined && g.cons !== true) delete g.cons;
  }
  // every segment listed once, in order
  const order: string[] = Array.isArray(k.order) ? k.order.filter((g: unknown, i: number, all: unknown[]) => typeof g === 'string' && k.segs[g] && all.indexOf(g) === i) : [];
  for (const g of Object.keys(k.segs)) if (!order.includes(g)) order.push(g);
  k.order = order;
  return order.length > 0;
}

/** Make a loaded waffle design's shapes safe to build: bad shapes dropped, every shape listed exactly once. */
export function checkSculpt(d: Design) {
  if (!isSculpture(d)) return;
  const raw = (d as any).sculpt;
  const sc: Sculpt = isObj(raw) && isObj(raw.shapes) ? (raw as Sculpt) : { shapes: {}, order: [] };
  for (const id of Object.keys(sc.shapes)) if (!shapeOk(sc.shapes[id], id)) delete sc.shapes[id];
  const placed = new Set<string>();
  const visit = (list: string[]) => list.filter((id) => {
    if (!sc.shapes[id] || placed.has(id)) return false;
    placed.add(id);
    const s = sc.shapes[id];
    if (s.kind === 'group') s.children = visit(s.children ?? []);
    return true;
  });
  sc.order = visit(Array.isArray(sc.order) ? sc.order : []);
  // shapes no list reaches are dropped
  for (const id of Object.keys(sc.shapes)) if (!placed.has(id)) delete sc.shapes[id];
  d.sculpt = sc;
  if (d.waffle !== undefined && !isObj(d.waffle)) delete d.waffle;
  if (d.outcome !== undefined && d.outcome !== 'waffle' && d.outcome !== 'fold') delete d.outcome;
}
