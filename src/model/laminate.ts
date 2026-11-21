// A face-glued joint (milestone 173, BOXES_PLYWOOD_PLAN.md §4 E1): two boards lying face to face, glued over the area
// they share (a plug lid's two layers, a frame's layers, a spool's hub). Nothing is cut for it: the boards are cut as
// they are and sit stacked in 3D. The joint is found where two parallel boards touch face to face over an area, as
// the export check found them before (`val.notJoined.faceToFace`), and joined by `connectSeam` like any other seam;
// its geometry is only where the glue goes, named on the cut plan (`glueAt`).
import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';
import type { ConnGeom, Connection, Design, P2, Panel } from './types';
import { frameNormal, toLocal, toWorld } from './frame';
import { tOf } from './materials';
import { instancePolys, ownOutline, panelRings } from './outline';
import { v3dot } from '../geom/v3';

/** Faces this close (mm) count as touching. */
const TOUCH = 0.05;
/** The least area two boards must share to be glued face to face (mm²): a strip 5 mm wide and 10 long. */
export const LAMINATE_MIN_AREA = 50;

const ring = (pts: P2[]): [number, number][] => [...pts.map((q) => [q.x, q.y] as [number, number]), [pts[0].x, pts[0].y]];

/** A board's material as a polygon set in its own coordinates: its outline less the holes cut through it. */
function material(p: Panel): MultiPolygon {
  const o = ownOutline(p);
  const outer: Polygon[] = panelRings(p).map((r) => [ring(r.map((e) => e.a))]);
  // holes that stay holes (a cut inside the board, not one that crosses its edge: those are in its rings already)
  const cuts: Polygon[] = [];
  for (const dt of p.details)
    if (dt.op === 'cut')
      for (const ip of instancePolys(dt)) if (!o.consumed.has(`${dt.id}#${ip.inst}`)) for (const q of ip.polys) cuts.push([ring(q)]);
  for (const h of o.holes) cuts.push([ring(h)]);
  try {
    return cuts.length ? polygonClipping.difference(outer as MultiPolygon, ...cuts) : (outer as MultiPolygon);
  } catch {
    return outer as MultiPolygon;
  }
}

function areaOf(mp: MultiPolygon): { area: number; at: P2 } {
  let A = 0, cx = 0, cy = 0;
  for (const poly of mp)
    poly.forEach((r, k) => {
      let a = 0, x = 0, y = 0;
      for (let i = 0; i < r.length - 1; i++) {
        const c = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
        a += c;
        x += (r[i][0] + r[i + 1][0]) * c;
        y += (r[i][1] + r[i + 1][1]) * c;
      }
      // the outer ring adds, the holes take away (whichever way they run)
      const s = (k ? -1 : 1) * Math.sign(a || 1);
      A += (s * a) / 2;
      cx += (s * x) / 6;
      cy += (s * y) / 6;
    });
  return { area: A, at: A > 1e-9 ? { x: cx / A, y: cy / A } : { x: 0, y: 0 } };
}

/** The largest single piece of a polygon set: a glue mark goes inside material, not in a window's middle. */
function largest(mp: MultiPolygon): MultiPolygon {
  let best: Polygon | null = null, bestA = -1;
  for (const p of mp) {
    const a = areaOf([p]).area;
    if (a > bestA) (best = p), (bestA = a);
  }
  return best ? [best] : [];
}

export type LaminateFit = {
  /** The area the two boards share (mm²). */
  area: number;
  /** A point inside the shared area, in each board's own coordinates (where the cut plan says *glue*). */
  atA: P2;
  atB: P2;
};

/**
 * How two boards lie face to face, if they do: parallel, a face of one on a face of the other (not sharing a plane:
 * that is two boards side by side), and sharing an area of material of at least `LAMINATE_MIN_AREA`. Null otherwise.
 */
export function laminateFit(d: Design, A: Panel, B: Panel): LaminateFit | null {
  const nA = frameNormal(A.frame), nB = frameNormal(B.frame);
  if (Math.abs(v3dot(nA, nB)) < 0.9998) return null;
  const tA = tOf(d, A.id), tB = tOf(d, B.id);
  // each board's two faces along A's normal
  const za = [0, tA].map((z) => v3dot(toWorld(A.frame, 0, 0, z), nA)).sort((x, y) => x - y);
  const zb = [0, tB].map((z) => v3dot(toWorld(B.frame, 0, 0, z), nA)).sort((x, y) => x - y);
  // one board's top face on the other's bottom face, their slabs not overlapping
  const stacked = Math.abs(za[1] - zb[0]) < TOUCH || Math.abs(zb[1] - za[0]) < TOUCH;
  if (!stacked) return null;
  // B's material in A's coordinates
  const mA = material(A);
  const mB = material(B).map((poly) => poly.map((r) => r.map(([x, y]) => {
    const q = toLocal(A.frame, toWorld(B.frame, x, y, 0));
    return [q.x, q.y] as [number, number];
  })));
  let shared: MultiPolygon;
  try {
    shared = polygonClipping.intersection(mA, mB as MultiPolygon);
  } catch {
    return null;
  }
  const { area } = areaOf(shared);
  if (area < LAMINATE_MIN_AREA) return null;
  const { at } = areaOf(largest(shared));
  const atB = toLocal(B.frame, toWorld(A.frame, at.x, at.y, 0));
  return { area, atA: at, atB };
}

/** A face-glued joint's geometry: nothing cut, the glue's place on each board; null when they no longer lie face to face. */
export function laminateGeom(d: Design, c: Pick<Connection, 'a' | 'b'>): ConnGeom | null {
  const A = d.panels[c.a.panelId], B = d.panels[c.b.panelId];
  if (!A || !B) return null;
  const f = laminateFit(d, A, B);
  if (!f) return null;
  return { edges: [], holes: [], adds: [], scores: [], flaps3d: [], glueAt: [{ panelId: A.id, at: f.atA }, { panelId: B.id, at: f.atB }] };
}
