// Where the stage's handles for a board's edge endings go (milestone 163,
// GROW_ENDINGS_PLAN.md): the grown fold's controls on each ending. A length
// arrow on the ending's far edge, pulled along the ending as it lies (a
// folded flap along its fold, a fold-over's liner down the wall, a lip along
// the face it is glued to), and for a flap a hinge ring about its crease with
// a grown fold's numbers. Pure: the view puts the points through its display
// transforms (`spot`).
import type { Design, Flap3d, Frame, P2, V3 } from './types';
import { boardEndings, LIP, type Ending } from './endings';
import { edgeFeatures, flapSpec } from './edgeFeatures';
import { findEdge, segDir, segInward, segLength } from './edges';
import { tOf } from './materials';
import { foldOverGeom } from './foldover';
import { connectionGeom } from './seams';
import { matDir, toWorld } from './frame';
import { v3add, v3mul, v3norm } from '../geom/v3';

/** Points in `frame`'s coordinates (x, y and depth into the material), moved on the stage as `spot` is: a folding part, or a board. */
export type EndingSpot = { flap: Flap3d } | { panel: string };
export type LocalPt = [number, number, number];

export type EndingHandle = {
  edge: string;
  kind: 'free' | 'meets';
  /** What it is: a free edge's ending, or `lip`. */
  ending: Ending | 'lip';
  value: number;
  min: number;
  max: number;
  spot: EndingSpot;
  frame: Frame;
  crease: LocalPt;
  far: LocalPt;
  /** A flap's fold: its ring about the crease, on its board (model coordinates; moved with `panel`). */
  hinge?: { value: number; panel: string; o: V3; x: V3; y: V3; r: number };
};

const mid = (a: P2, b: P2): P2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** The handles of a board's edge endings (milestone 163): one per ending that has a length. */
export function endingHandles(d: Design, panelId: string): EndingHandle[] {
  const p = d.panels[panelId];
  if (!p) return [];
  const t = tOf(d, panelId);
  const out: EndingHandle[] = [];
  const hits = edgeFeatures(d, panelId).filter((h) => h.panelId === panelId);
  for (const r of boardEndings(d, panelId)) {
    if (r.kind === 'free') {
      if (r.ending === 'none') continue;
      const e = findEdge(p, r.edge);
      if (!e) continue;
      const L = segLength(e), dir = segDir(e), inw = segInward(e);
      const at = (s: number, o: number): P2 => ({ x: e.a.x + dir.x * s - inw.x * o, y: e.a.y + dir.y * s - inw.y * o });
      if (r.ending === 'foldover') {
        const fo = p.foldOvers!.find((f) => findEdge(p, f.edge)?.key === r.edge)!;
        const g = foldOverGeom(d, p, fo);
        if (!g) continue;
        const { e: le, x0, x1, q0, q1 } = g.liner;
        const ld = segDir(le), li = segInward(le);
        const lat = (s: number, q: number): P2 => ({ x: le.a.x + ld.x * s + li.x * q, y: le.a.y + ld.y * s + li.y * q });
        const s = (x0 + x1) / 2, c = lat(s, q0), f = lat(s, q1);
        // the liner lies on the wall's inner face, a thickness behind it
        out.push({ edge: r.edge, kind: 'free', ending: 'foldover', value: r.len, min: 5, max: p.h - t, spot: { panel: panelId }, frame: p.frame, crease: [c.x, c.y, 1.5 * t], far: [f.x, f.y, 1.5 * t] });
        continue;
      }
      const f = p.edgeFlaps!.find((x) => findEdge(p, x.edge)?.key === r.edge)!;
      const s = flapSpec(f, t);
      const sm = (s.inset[0] + L - s.inset[1]) / 2;
      const c = at(sm, 0), far = at(sm, s.len);
      const hinged = hits.find((h) => h.kind === 'flap' && h.key === f.id)?.out.hinged[0];
      const spot: EndingSpot = hinged ? { flap: hinged } : { panel: panelId };
      const frame = hinged?.frame ?? p.frame;
      // the ring's knob sits a fifth of the way along the crease, as a grown fold's does: clear of the length arrow in the middle
      const room = Math.max(0, L - s.inset[0] - s.inset[1]);
      const k = at(s.inset[0] + Math.min(room * 0.2, 40), 0);
      const o = toWorld(p.frame, k.x, k.y, t / 2);
      const x = v3norm(v3add(v3mul(p.frame.u, inw.x), v3mul(p.frame.v, inw.y)));
      out.push({
        edge: r.edge,
        kind: 'free',
        ending: r.ending,
        value: s.len,
        min: 2,
        max: 200,
        spot,
        frame,
        crease: [c.x, c.y, t / 2],
        far: [far.x, far.y, t / 2],
        ...(r.hinge !== null ? { hinge: { value: r.hinge, panel: panelId, o, x, y: matDir(p.frame), r: Math.max(8, Math.min(s.len * 0.8, 30)) } } : {}),
      });
      continue;
    }
    // where two edges meet: the lip's width, along the face it is glued to
    if (r.joint !== LIP || r.width === null) continue;
    const c = d.connections[r.conn];
    const g = c && connectionGeom(d, c);
    const f = g?.flaps3d[0];
    if (!f || f.poly.length < 4) continue;
    const R = d.panels[f.panelId];
    if (!R) continue;
    const n = f.poly.length;
    const cr = mid(f.poly[0], f.poly[n - 1]), fa = mid(f.poly[1], f.poly[n - 2]);
    const z = (f.z0 + f.z1) / 2;
    out.push({ edge: r.edge, kind: 'meets', ending: 'lip', value: r.width, min: 3, max: 100, spot: { flap: f }, frame: f.frame ?? R.frame, crease: [cr.x, cr.y, z], far: [fa.x, fa.y, z] });
  }
  return out;
}

/** A handle's point in model coordinates, before any display transform (for tests and for a board not moved by the fold view). */
export function handleModelPt(h: EndingHandle, pt: LocalPt): V3 {
  return toWorld(h.frame, pt[0], pt[1], pt[2]);
}
