// Waffle shape edits (WAFFLE_MODE.md §5): pure functions on a design (an immer
// draft in the store), so every edit goes through the existing history.
import type { Design, Quat, Sculpt, Shape3, ShapeKind, V3 } from '../model/types';
import type { MaterialProfile } from '../model/types';
import { createDesign, newId } from '../model/ops';
import { DEFAULT_MATERIAL } from '../model/materials';
import { m4, m4Apply, m4Inv, m4Mul, m4Quat, qAxis, qMul, qNorm, Q_ID, type M4 } from './xform';

export const PRIMITIVES = ['box', 'cylinder', 'cone', 'prism', 'pyramid', 'sphere', 'halfsphere', 'torus'] as const;
export type Primitive = (typeof PRIMITIVES)[number];

/** A new waffle design: no boards, an empty set of shapes. */
export function createWaffleDesign(material: MaterialProfile = DEFAULT_MATERIAL): Design {
  return { ...createDesign(material), kind: 'waffle', sculpt: { shapes: {}, order: [] } };
}
export const isWaffle = (d: Pick<Design, 'kind'>) => d.kind === 'waffle';

/** The design's shapes (made when missing: a waffle file with no `sculpt` opens empty). */
export function sculptOf(d: Design): Sculpt {
  d.sculpt ??= { shapes: {}, order: [] };
  return d.sculpt;
}

/** The group a shape belongs to, or null at the top level. */
export function parentOf(sc: Sculpt, id: string): string | null {
  for (const s of Object.values(sc.shapes)) if (s.kind === 'group' && s.children?.includes(id)) return s.id;
  return null;
}
/** The list a shape is in: its group's members or the top-level order. */
function siblings(sc: Sculpt, id: string): string[] {
  const p = parentOf(sc, id);
  return p ? (sc.shapes[p].children ??= []) : sc.order;
}

/** Parent frame → world for a shape (its group's chain); identity at the top level. */
export function parentMatrix(sc: Sculpt, id: string): M4 {
  const p = parentOf(sc, id);
  if (!p) return m4([0, 0, 0], Q_ID);
  const g = sc.shapes[p];
  return m4Mul(parentMatrix(sc, p), m4(g.at, g.q));
}
/** The shape's origin and turn in the world. */
export function worldPose(sc: Sculpt, id: string): { at: V3; q: Quat } {
  const s = sc.shapes[id];
  const M = m4Mul(parentMatrix(sc, id), m4(s.at, s.q));
  return { at: [M[12], M[13], M[14]], q: m4Quat(M) };
}

/** The default size of a new primitive on a footprint w × d, h tall. */
export function primitiveShape(kind: Primitive, foot: { x: number; z: number; w: number; d: number; y?: number }, h: number): Omit<Shape3, 'id' | 'name'> {
  const w = Math.max(1, foot.w), d = Math.max(1, foot.d);
  const base = { kind, at: [foot.x, foot.y ?? 0, foot.z] as V3, q: [...Q_ID] as Quat };
  switch (kind) {
    case 'box':
      return { ...base, size: [w, h, d] };
    case 'cylinder':
      return { ...base, size: [w, h, d] };
    case 'cone':
      return { ...base, size: [w, h, d], top: 0 };
    case 'prism':
      return { ...base, size: [w, h, d], n: 6 };
    case 'pyramid':
      return { ...base, size: [w, h, d], n: 4, top: 0 };
    case 'sphere':
      return { ...base, size: [w, Math.max(w, d), d] };
    case 'halfsphere':
      return { ...base, size: [w, Math.max(w, d) / 2, d] };
    case 'torus': {
      const tube = Math.max(2, Math.round(Math.min(w, d) / 4));
      return { ...base, size: [w, tube, d], tube };
    }
  }
}

/** Add a shape at the top level (or into a group); returns its id. */
export function addShape(d: Design, s: Omit<Shape3, 'id' | 'name'> & { name?: string }, into?: string | null): string {
  const sc = sculptOf(d);
  const id = newId('s');
  sc.shapes[id] = { name: '', ...s, id } as Shape3;
  if (into && sc.shapes[into]?.kind === 'group') {
    const g = sc.shapes[into];
    // given in world coordinates: into the group's frame
    const inv = m4Inv(m4Mul(parentMatrix(sc, into), m4(g.at, g.q)));
    const M = m4Mul(inv, m4(s.at, s.q));
    sc.shapes[id].at = [M[12], M[13], M[14]];
    sc.shapes[id].q = m4Quat(M);
    (g.children ??= []).push(id);
  } else sc.order.push(id);
  return id;
}

export function updateShape(d: Design, id: string, patch: Partial<Shape3>) {
  const s = d.sculpt?.shapes[id];
  if (!s) return;
  Object.assign(s, patch);
  if (s.kind === 'torus' && patch.size) s.tube = s.size![1];
  if (s.kind === 'torus' && patch.tube !== undefined && s.size) s.size = [s.size[0], patch.tube, s.size[2]];
}

/** Every id in a shape's subtree (itself first). */
export function subtree(sc: Sculpt, id: string, out: string[] = []): string[] {
  const s = sc.shapes[id];
  if (!s || out.includes(id)) return out;
  out.push(id);
  for (const c of s.children ?? []) subtree(sc, c, out);
  return out;
}

export function deleteShapes(d: Design, ids: string[]) {
  const sc = d.sculpt;
  if (!sc) return;
  for (const id of ids) {
    if (!sc.shapes[id]) continue;
    const list = siblings(sc, id);
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    for (const x of subtree(sc, id)) delete sc.shapes[x];
  }
}

/** Solid ↔ Hole for these shapes (or set it). */
export function setHole(d: Design, ids: string[], hole?: boolean) {
  const sc = d.sculpt;
  if (!sc) return;
  const to = hole ?? !ids.every((id) => sc.shapes[id]?.hole);
  for (const id of ids) {
    const s = sc.shapes[id];
    if (!s) continue;
    if (to) s.hole = true;
    else delete s.hole;
  }
}

/** Copies of these shapes (with their members), moved by `off` (world mm); returns the copies' ids. */
export function duplicateShapes(d: Design, ids: string[], off: V3 = [10, 0, 10]): string[] {
  const sc = d.sculpt;
  if (!sc) return [];
  const out: string[] = [];
  const copy = (id: string): string => {
    const s = sc.shapes[id];
    const nid = newId('s');
    sc.shapes[nid] = { ...JSON.parse(JSON.stringify(s)), id: nid };
    if (s.children) sc.shapes[nid].children = s.children.map(copy);
    return nid;
  };
  for (const id of ids) {
    if (!sc.shapes[id]) continue;
    const nid = copy(id);
    const list = siblings(sc, id);
    list.splice(list.indexOf(id) + 1, 0, nid);
    out.push(nid);
  }
  moveShapes(d, out, off);
  return out;
}

/** Move shapes by a world offset (members of a group: converted into its frame). */
export function moveShapes(d: Design, ids: string[], off: V3) {
  const sc = d.sculpt;
  if (!sc) return;
  for (const id of ids) {
    const s = sc.shapes[id];
    if (!s) continue;
    const P = parentMatrix(sc, id);
    // a direction: the inverse turn only
    const inv = m4Inv(P);
    const o = m4Apply([...inv.slice(0, 12), 0, 0, 0, 1], off);
    s.at = [round6(s.at[0] + o[0]), round6(s.at[1] + o[1]), round6(s.at[2] + o[2])];
  }
}
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

/** Put a shape's origin at a world point. */
export function placeShape(d: Design, id: string, at: V3) {
  const sc = d.sculpt;
  const s = sc?.shapes[id];
  if (!sc || !s) return;
  const cur = worldPose(sc, id).at;
  moveShapes(d, [id], [at[0] - cur[0], at[1] - cur[1], at[2] - cur[2]]);
}

/** Turn shapes by `deg` about a world axis through a world pivot. */
export function turnShapes(d: Design, ids: string[], axis: V3, deg: number, pivot: V3) {
  const sc = d.sculpt;
  if (!sc || !deg) return;
  const R = qAxis(axis, deg);
  for (const id of ids) {
    const s = sc.shapes[id];
    if (!s) continue;
    const P = parentMatrix(sc, id), Pinv = m4Inv(P);
    // world turn about the pivot, expressed in the parent's frame
    const W = m4Mul(P, m4(s.at, s.q));
    const T = m4Mul(m4(pivot, Q_ID), m4Mul(m4([0, 0, 0], R), m4([-pivot[0], -pivot[1], -pivot[2]], Q_ID)));
    const L = m4Mul(Pinv, m4Mul(T, W));
    s.at = [round6(L[12]), round6(L[13]), round6(L[14])];
    s.q = qNorm(m4Quat(L));
  }
}

export function resetTurn(d: Design, ids: string[]) {
  for (const id of ids) {
    const s = d.sculpt?.shapes[id];
    if (s) s.q = [...Q_ID] as Quat;
  }
}

/** Group shapes that share a parent: one shape, its Solids joined minus its Holes. Returns the group's id. */
export function groupShapes(d: Design, ids: string[]): string | null {
  const sc = d.sculpt;
  if (!sc) return null;
  const live = ids.filter((id) => sc.shapes[id]);
  if (live.length < 2) return null;
  const p = parentOf(sc, live[0]);
  if (live.some((id) => parentOf(sc, id) !== p)) return null;
  const list = p ? sc.shapes[p].children! : sc.order;
  const at = Math.min(...live.map((id) => list.indexOf(id)));
  const gid = newId('s');
  const kids = list.filter((id) => live.includes(id));
  // the group shows the colour of its first Solid
  const color = kids.map((id) => sc.shapes[id]).find((x) => !x.hole && x.color)?.color;
  sc.shapes[gid] = { id: gid, name: '', kind: 'group', at: [0, 0, 0], q: [...Q_ID] as Quat, children: kids, ...(color ? { color } : {}) };
  const rest = list.filter((id) => !live.includes(id));
  rest.splice(Math.max(0, at), 0, gid);
  list.splice(0, list.length, ...rest);
  return gid;
}

/** Ungroup: the members come back exactly where they were (the group's move and turn baked in). */
export function ungroupShape(d: Design, gid: string): string[] {
  const sc = d.sculpt;
  const g = sc?.shapes[gid];
  if (!sc || !g || g.kind !== 'group') return [];
  const G = m4(g.at, g.q);
  const kids = (g.children ?? []).filter((c) => sc.shapes[c]);
  for (const c of kids) {
    const s = sc.shapes[c];
    const M = m4Mul(G, m4(s.at, s.q));
    s.at = [round6(M[12]), round6(M[13]), round6(M[14])];
    s.q = qNorm(qMul(g.q, s.q));
    // a hole group's members stay holes: its Solids become Holes too
    if (g.hole && !s.hole) s.hole = true;
  }
  const list = siblings(sc, gid);
  const i = list.indexOf(gid);
  list.splice(i, 1, ...kids);
  delete sc.shapes[gid];
  return kids;
}

/** A shape's kind label key suffix and its number among shapes of that kind (creation order). */
export function shapeNumber(sc: Sculpt, id: string): number {
  const s = sc.shapes[id];
  if (!s) return 0;
  const same = Object.values(sc.shapes).filter((x) => x.kind === s.kind).map((x) => x.id);
  return same.indexOf(id) + 1;
}

export const KINDS: ShapeKind[] = [...PRIMITIVES, 'extrude', 'revolve', 'group'];
