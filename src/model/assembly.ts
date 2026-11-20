// Assembly of a made model (milestone 131, SHAPES_TO_DIELINES_PLAN.md R12): the order its
// cut seams are closed in, numbered, so each flap and its partner edge carry one number on
// the guide layer, the steps view walks through them and the spec sheet lists them.
// The form closes last at its open face, or else at the face that closes last (R6).
import type { Connection, Design } from './types';
import { closingFace } from './jointChoice';
import { frameNormal } from './frame';

export type Step = { n: number; conn: string; a: string; b: string; kind: Connection['kind'] };

const isSeam = (c: Connection) => !!c.src && !c.broken && c.kind !== 'fold';

/**
 * The seams of a made model in the order they are closed: piece by piece (largest first),
 * then by how far their boards are from the piece's first board along its folds, the seams
 * of the face that closes last at the end. Boards (corners) are ordered the same way.
 */
export function assemblySteps(d: Design): Step[] {
  if (!d.make) return [];
  const made = d.order.filter((id) => d.panels[id]?.src);
  if (!made.length) return [];
  // the boards that close last: those round an opening (a board with an edge joined to nothing), else the chooser's
  const last = new Set<string>();
  if (d.make.open?.length) {
    const joined = new Map<string, number>();
    for (const c of Object.values(d.connections)) for (const id of [c.a.panelId, c.b.panelId]) joined.set(id, (joined.get(id) ?? 0) + 1);
    for (const id of made) {
      const p = d.panels[id];
      const edges = p.sketch.kind === 'poly' ? p.sketch.pts.length : 4;
      if ((joined.get(id) ?? 0) < edges) last.add(id);
    }
  }
  const lastFace = closingFace(made.map((id) => ({ key: id, n: frameNormal(d.panels[id].frame).map((x) => -x) as [number, number, number], area: d.panels[id].w * d.panels[id].h })));
  if (lastFace && !last.size) last.add(lastFace);
  // depth of each board from its piece's first board, along seam folds
  const depth = new Map<string, number>();
  const folds = Object.values(d.connections).filter((c) => c.seam && c.kind === 'fold' && !c.broken);
  for (const root of made) {
    if (depth.has(root)) continue;
    depth.set(root, 0);
    const queue = [root];
    while (queue.length) {
      const p = queue.shift()!;
      for (const c of folds) {
        const o = c.a.panelId === p ? c.b.panelId : c.b.panelId === p ? c.a.panelId : null;
        if (o && !depth.has(o)) {
          depth.set(o, depth.get(p)! + 1);
          queue.push(o);
        }
      }
    }
  }
  const rank = new Map(made.map((id, i) => [id, i]));
  const seams = Object.values(d.connections).filter(isSeam);
  const key = (c: Connection) => {
    const closes = last.has(c.a.panelId) || last.has(c.b.panelId) ? 1 : 0;
    const dep = Math.max(depth.get(c.a.panelId) ?? 0, depth.get(c.b.panelId) ?? 0);
    const r = Math.min(rank.get(c.a.panelId) ?? 0, rank.get(c.b.panelId) ?? 0);
    return [closes, dep, r];
  };
  seams.sort((x, y) => {
    const a = key(x), b = key(y);
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || (x.src! < y.src! ? -1 : 1);
  });
  return seams.map((c, i) => ({ n: i + 1, conn: c.id, a: c.a.panelId, b: c.b.panelId, kind: c.kind }));
}

/** Each seam's number (its step), by connection id. */
export function seamNumbers(d: Design): Map<string, number> {
  return new Map(assemblySteps(d).map((s) => [s.conn, s.n]));
}
