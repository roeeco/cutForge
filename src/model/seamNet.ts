// Boards and seams from a face graph (milestone 123): one free board per face, a
// seam fold on each edge the net keeps folded (the child laid flat off its parent,
// walked from each island's first face), and a glue flap or slit lock on each edge
// that is cut. The unfolder (124) chooses the folds and the flap sides; the
// reassembler (126, 127) calls this.
import type { Connection, ConnectionKind, Design } from './types';
import type { EdgeKey, FaceKey, PEdge, Polyhedron } from './polyhedron';
import { addFreePanel } from './ops';

export type SeamPlan = {
  /** Edges kept folded. */
  folds: Set<EdgeKey>;
  /** Cut edges: the face whose board carries the flap. Absent: face `a`. */
  flapOn?: Record<EdgeKey, FaceKey>;
  /** The kind on a cut edge (default glue); 'butt' leaves it unjoined. */
  seam?: (e: PEdge) => ConnectionKind;
  /** Faces left out (openings). */
  open?: Set<FaceKey>;
  /** A face's board id (stable ids from keys); default `f:<key>`. */
  idOf?: (f: FaceKey) => string;
  /** The order islands are walked from: faces earlier in it are parents. Default: the face graph's order. */
  order?: FaceKey[];
};

/** A connection id from an edge key (stable across rebuilds). */
export const seamId = (e: EdgeKey) => `s:${e}`;
export const boardId = (f: FaceKey) => `f:${f}`;

const conn = (id: string, kind: ConnectionKind, a: { panelId: string; edge: string }, b: { panelId: string; edge: string }, e: PEdge): Connection => ({
  id,
  kind,
  pref: kind,
  a,
  b,
  grown: false,
  angle: e.dihedral,
  dir: 'up',
  offset: 0,
  fingers: null,
  tabs: null,
  flap: null,
  foldDir: e.dihedral <= 180 ? 'valley' : 'mountain',
  auto: false,
  seam: true,
  src: e.key,
});

/**
 * Add a board for every face (not left open) and a seam for every edge between two
 * of them. Edges on a face's holes are left unjoined (openings, milestone 130).
 * Returns each face's board id. The design is not solved.
 */
export function addSeamNet(d: Design, P: Polyhedron, plan: SeamPlan): Record<FaceKey, string> {
  const idOf = plan.idOf ?? boardId;
  const open = plan.open ?? new Set<FaceKey>();
  const order = plan.order ?? Object.keys(P.faces);
  const ids: Record<FaceKey, string> = {};
  for (const k of order) {
    const f = P.faces[k];
    if (!f || open.has(k)) continue;
    const id = addFreePanel(d, { id: idOf(k), name: k, frame: f.frame, side: -1, outer: f.outer, holes: f.holes, src: k });
    if (id) ids[k] = id;
  }
  const edgeRef = (face: FaceKey, r: { ring: number; i: number }) => (r.ring === 0 && ids[face] ? { panelId: ids[face], edge: `e${r.i}` } : null);
  // fold edges: walk each island from its first face so every fold has a parent already placed
  const rank = new Map(order.map((k, i) => [k, i]));
  const adj = new Map<FaceKey, PEdge[]>();
  for (const e of Object.values(P.edges))
    if (plan.folds.has(e.key)) {
      adj.set(e.a, [...(adj.get(e.a) ?? []), e]);
      adj.set(e.b, [...(adj.get(e.b) ?? []), e]);
    }
  const placed = new Set<FaceKey>();
  for (const root of order) {
    if (!ids[root] || placed.has(root)) continue;
    placed.add(root);
    const queue = [root];
    while (queue.length) {
      const f = queue.shift()!;
      const out = (adj.get(f) ?? []).slice().sort((x, y) => (rank.get(x.a === f ? x.b : x.a) ?? 0) - (rank.get(y.a === f ? y.b : y.a) ?? 0) || (x.key < y.key ? -1 : 1));
      for (const e of out) {
        const child = e.a === f ? e.b : e.a;
        if (placed.has(child) || !ids[child]) continue;
        const pr = edgeRef(f, e.a === f ? e.ea : e.eb), cr = edgeRef(child, e.a === f ? e.eb : e.ea);
        if (!pr || !cr) continue;
        placed.add(child);
        queue.push(child);
        d.connections[seamId(e.key)] = { ...conn(seamId(e.key), 'fold', pr, cr, e), hingeOf: cr.panelId };
      }
    }
  }
  // every other edge between two boards: cut, closed by a flap (or left as it is)
  for (const e of Object.values(P.edges)) {
    if (d.connections[seamId(e.key)]) continue;
    const ra = edgeRef(e.a, e.ea), rb = edgeRef(e.b, e.eb);
    if (!ra || !rb) continue;
    const kind = plan.seam?.(e) ?? 'glue';
    const onB = plan.flapOn?.[e.key] === e.b;
    d.connections[seamId(e.key)] = conn(seamId(e.key), kind, onB ? rb : ra, onB ? ra : rb, e);
  }
  return ids;
}
