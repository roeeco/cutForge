// Telescoping lids (milestone 46, CURVED_WALLS.md §6.3). A lid can't grow off
// a curved top edge (a curved crease can't fold with one side flat), so a lid
// for a box is a shallow tray of the box's outline, grown outward by the wall
// thickness and the fit clearance, turned over and resting on the box: a hat
// box lid. It is a tray like any other (`Tray.lidOf` names the box's tray);
// its base's outline and place follow the box on every solve.
import type { Design, Panel, SketchPt, Tray } from './types';
import { matDir } from './frame';
import { matOf, tOf } from './materials';

/** A new lid's rim (mm, its outer height less its top). */
export const LID_RIM = 12;

/** How far a lid's outline stands out from its box's: the box wall's thickness and the fit clearance. */
export function lidGap(d: Design, box: Tray): number {
  const m = matOf(d, box.baseId);
  return m.thickness + m.clearance;
}

/** A polygon outline grown outward by g: each straight edge moved out by g, rounded corners' radii grown by g (an offset of an arc is an arc). */
export function grownPts(pts: SketchPt[], g: number): SketchPt[] {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) area += pts[i].x * pts[(i + 1) % n].y - pts[(i + 1) % n].x * pts[i].y;
  const s = area >= 0 ? 1 : -1;
  return pts.map((V, i) => {
    const P = pts[(i + n - 1) % n], N = pts[(i + 1) % n];
    // outward normals of the edges in and out (right of a CCW edge)
    const n1 = norm({ x: (V.y - P.y) * s, y: -(V.x - P.x) * s }), n2 = norm({ x: (N.y - V.y) * s, y: -(N.x - V.x) * s });
    const bx = n1.x + n2.x, by = n1.y + n2.y;
    const k = (bx * n1.x + by * n1.y) || 1;
    const q: SketchPt = { x: V.x + (g * bx) / k, y: V.y + (g * by) / k };
    if (V.curve) q.curve = V.curve;
    if (V.curve === 'round' && V.r) q.r = V.r + g;
    return q;
  });
}
const norm = (v: { x: number; y: number }) => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};

/**
 * Put a lid's base where its box needs it: the box base's outline grown by
 * the gap (a round base stays round, its sizes grown), from (0, 0), turned
 * over and lying on the box's walls (its underside a clearance above their
 * tops). Its shapes stay where they are on it.
 */
export function placeLid(d: Design, lid: Panel, box: Tray) {
  const B = d.panels[box.baseId];
  if (!B || B.sketch.kind !== 'poly') return;
  const g = lidGap(d, box), m = matOf(d, box.baseId);
  const r = B.sketch.round;
  const grown = grownPts(B.sketch.pts, g);
  // rounded corners lie inside their points: the points bound the outline
  const x0 = Math.min(...grown.map((q) => q.x)), y0 = Math.min(...grown.map((q) => q.y));
  const pts = grown.map((q) => ({ ...q, x: q.x - x0, y: q.y - y0 }));
  lid.sketch = { kind: 'poly', pts, edgeIds: [...B.sketch.edgeIds], ...(r ? { round: { ...r, ...(r.rEnd !== undefined ? { rEnd: r.rEnd + g } : {}) } } : {}) };
  lid.w = Math.max(...pts.map((q) => q.x));
  lid.h = Math.max(...pts.map((q) => q.y));
  const up = matDir(B.frame);
  const lift = box.height + m.clearance + tOf(d, lid.id);
  const f = B.frame;
  const at = (k: number) => f.o[k] + f.u[k] * x0 + f.v[k] * y0 + up[k] * lift;
  lid.frame = { o: [at(0), at(1), at(2)], u: [...f.u], v: [...f.v], side: (-f.side) as 1 | -1 };
}

/** Keep every lid on its box (`solve`, before trays are reconciled); a lid whose box went stays as a plain tray where it is. */
export function reconcileLids(d: Design) {
  for (const t of Object.values(d.trays ?? {})) {
    if (!t.lidOf) continue;
    const box = d.trays[t.lidOf];
    const lid = d.panels[t.baseId];
    if (!box || !d.panels[box.baseId] || !lid) {
      delete t.lidOf;
      continue;
    }
    placeLid(d, lid, box);
  }
}

/** The lid on a box's tray, if it has one. */
export const lidOn = (d: Design, trayId: string): Tray | undefined => Object.values(d.trays ?? {}).find((t) => t.lidOf === trayId);
