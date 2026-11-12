// Reading a waffle design from a file or autosave: every field the shape code
// reads is checked; a bad shape is dropped rather than failing the whole file.
import type { Design, Sculpt, Shape3 } from '../model/types';
import { KINDS } from './ops';

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
    const okPts = isObj(k) && (k.plane === 'floor' || k.plane === 'upright') && Array.isArray(k.pts) && k.pts.every((p: any) => isObj(p) && finite(p.x) && finite(p.y));
    if (!okPts) return false;
    for (const p of k.pts) {
      if (p.curve !== undefined && p.curve !== 'auto') delete p.curve;
      if (p.r !== undefined && !(finite(p.r) && p.r >= 0)) delete p.r;
    }
  }
  if ((s.kind === 'extrude' || s.kind === 'revolve') && !s.sketch) return false;
  if (s.axis !== undefined && !(isObj(s.axis) && (s.axis.kind === 'plane' || (s.axis.kind === 'edge' && Number.isInteger(s.axis.i))))) delete s.axis;
  if (s.kind === 'group') s.children = Array.isArray(s.children) ? s.children.filter((c: unknown) => typeof c === 'string') : [];
  else delete s.children;
  if (s.hole !== undefined && s.hole !== true) delete s.hole;
  if (s.stretch !== undefined && !(vec(s.stretch, 3) && s.stretch.every((v: number) => v > 0))) delete s.stretch;
  return true;
}

/** Make a loaded waffle design's shapes safe to build: bad shapes dropped, every shape listed exactly once. */
export function checkSculpt(d: Design) {
  if (d.kind !== 'waffle') return;
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
}
