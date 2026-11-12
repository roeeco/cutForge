// Scaling shapes (SKETCH_OVERHAUL.md §4.3): one shape along its own axes, or
// several along the world's. A shape changes its own numbers where it has them
// (sizes, an outline, a height) and its `stretch` only where it has none.
import type { Design, Quat, Sculpt, Shape3, V3 } from '../model/types';
import { buildShape, poseMatrix } from './build';
import { kernelNow, scope } from './kernel';
import { parentMatrix } from './tree';
import { m4, m4Apply, m4InvAffine, m4Mul, m4Unscaled, qRot } from './xform';

const EPS = 1e-6;
const same = (a: number, b: number) => Math.abs(a - b) < EPS;
export const isUniform = (f: V3) => same(f[0], f[1]) && same(f[1], f[2]);
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

/** The rotation of q as a 3×3 grid r[row][col]. */
function rotRows(q: Quat): number[][] {
  const cols = [qRot(q, [1, 0, 0]), qRot(q, [0, 1, 0]), qRot(q, [0, 0, 1])];
  return [0, 1, 2].map((r) => cols.map((c) => c[r]));
}
/** The axes of a 3×3 rotation, by column: which frame axis each own axis lies along; null unless every entry is 0 or ±1. */
function alignedCols(R: number[][]): [number, number, number] | null {
  const out: number[] = [];
  for (let c = 0; c < 3; c++) {
    let hit = -1;
    for (let r = 0; r < 3; r++) {
      const v = Math.abs(R[r][c]);
      if (Math.abs(v - 1) < EPS) hit = r;
      else if (v > EPS) return null;
    }
    if (hit < 0) return null;
    out.push(hit);
  }
  return out as [number, number, number];
}
/** When the turn q maps the shape's own axes onto its frame's axes, the frame axis each own axis lies along; null otherwise. */
export function alignedAxes(q: Quat): [number, number, number] | null {
  return alignedCols(rotRows(q));
}

/** The size the frame shows for a shape: its body's box in its own axes (x, up, z), its stretch included. */
export function shapeSize(sc: Sculpt, id: string): { min: V3; max: V3 } | null {
  const k = kernelNow();
  const s = sc.shapes[id];
  if (!k || !s) return null;
  return scope(() => {
    const m = buildShape(k, sc, id);
    if (m.isEmpty()) return null;
    const own = m.transform(m4InvAffine(m4(s.at, s.q)) as never);
    const bb = own.boundingBox();
    return { min: [...bb.min] as V3, max: [...bb.max] as V3 };
  });
}

/** Multiply the points of an outline (and their corner radii where the scale is the same both ways). */
function scalePts(s: Shape3, sx: number, sy: number) {
  if (!s.sketch) return;
  const uni = same(sx, sy);
  s.sketch.pts = s.sketch.pts.map((p) => {
    const q = { ...p, x: r6(p.x * sx), y: r6(p.y * sy) };
    if (q.r !== undefined && uni) q.r = r6(q.r * sx);
    return q;
  });
}

const mulStretch = (s: Shape3, f: V3) => {
  const v = [0, 1, 2].map((i) => r6((s.stretch?.[i] ?? 1) * f[i])) as V3;
  if (v.every((x) => same(x, 1))) delete s.stretch;
  else s.stretch = v;
};

/** Clamp factors so that no size along an own axis goes below 1 mm. */
function clampFactors(sc: Sculpt, id: string, f: V3): V3 {
  const b = shapeSize(sc, id);
  const out = f.map((x) => (Number.isFinite(x) && x > 0 ? x : 1)) as V3;
  if (!b) return out;
  for (let i = 0; i < 3; i++) {
    const ext = b.max[i] - b.min[i];
    if (ext > 0 && ext * out[i] < 1) out[i] = 1 / ext;
  }
  return out;
}

/** Scale a shape by f along its own axes (x, up, z), keeping the point `anchor` (shape-local, same axes) fixed. */
export function scaleShape(d: Design, id: string, f: V3, anchor: V3): void {
  const sc = d.sculpt;
  const s = sc?.shapes[id];
  if (!sc || !s) return;
  f = clampFactors(sc, id, f);
  if (f.every((x) => same(x, 1))) return;
  const uni = isUniform(f);
  switch (s.kind) {
    case 'box':
    case 'cylinder':
    case 'cone':
    case 'prism':
    case 'pyramid':
    case 'sphere':
    case 'halfsphere': {
      const size = s.size ?? [40, 40, 40];
      s.size = [r6(size[0] * f[0]), r6(size[1] * f[1]), r6(size[2] * f[2])];
      if (s.corners && uni) s.corners = s.corners.map((r) => r6(r * f[0]));
      break;
    }
    case 'torus': {
      const size = s.size ?? [40, 10, 40];
      const tube = r6((s.tube ?? size[1]) * f[1]);
      s.size = [r6(size[0] * f[0]), tube, r6(size[2] * f[2])];
      s.tube = tube;
      break;
    }
    case 'extrude': {
      // own (x, up, z) ↔ sketch (x, y, normal): floor x → x, y → −z, normal → up; upright x → x, y → up, normal → z
      const up = s.sketch?.plane === 'upright';
      const sx = f[0], sy = up ? f[1] : f[2], sn = up ? f[2] : f[1];
      scalePts(s, sx, sy);
      s.height = r6((s.height ?? 20) * sn);
      break;
    }
    case 'revolve': {
      const up = s.sketch?.plane === 'upright';
      // the axis is sketch y: own up on an upright plane, own z on the floor
      const axial = up ? 1 : 2;
      const radial = [0, 1, 2].filter((i) => i !== axial);
      if (s.axis?.kind === 'edge') {
        mulStretch(s, f);
        break;
      }
      const fa = f[axial];
      if (same(f[radial[0]], f[radial[1]])) scalePts(s, f[radial[0]], fa);
      else {
        scalePts(s, 1, fa);
        const g: V3 = [1, 1, 1];
        for (const i of radial) g[i] = f[i];
        mulStretch(s, g);
      }
      break;
    }
    case 'group':
      mulStretch(s, f);
      break;
  }
  // the anchor stays where it was
  const o = qRot(s.q, [anchor[0] - f[0] * anchor[0], anchor[1] - f[1] * anchor[1], anchor[2] - f[2] * anchor[2]]);
  s.at = [r6(s.at[0] + o[0]), r6(s.at[1] + o[1]), r6(s.at[2] + o[2])];
}

/**
 * Scale several shapes by f along the world's axes about a world anchor. A shape
 * turned so its axes lie along the world's takes the factors in its own order;
 * one turned any other way only scales alike in every direction. Returns false
 * (changing nothing) when f is not uniform and such a shape is among them.
 */
export function scaleShapes(d: Design, ids: string[], f: V3, anchor: V3): boolean {
  const sc = d.sculpt;
  if (!sc) return false;
  const live = ids.filter((id) => sc.shapes[id]);
  const plans: { id: string; f: V3; a: V3 }[] = [];
  for (const id of live) {
    const s = sc.shapes[id];
    const W = m4Mul(parentMatrix(sc, id), m4(s.at, s.q));
    const U = m4Unscaled(W);
    const R = [0, 1, 2].map((r) => [0, 1, 2].map((c) => U[c * 4 + r]));
    const ax = alignedCols(R);
    let own: V3;
    if (ax) own = [f[ax[0]], f[ax[1]], f[ax[2]]];
    else if (isUniform(f)) own = [f[0], f[0], f[0]];
    else return false;
    plans.push({ id, f: own, a: m4Apply(m4InvAffine(W), anchor) });
  }
  for (const p of plans) scaleShape(d, p.id, p.f, p.a);
  return true;
}

/** Can these shapes be stretched along the world axes (not only scaled alike)? */
export function canStretch(sc: Sculpt, ids: string[]): boolean {
  return ids.every((id) => {
    const s = sc.shapes[id];
    if (!s) return true;
    const U = m4Unscaled(m4Mul(parentMatrix(sc, id), m4(s.at, s.q)));
    return !!alignedCols([0, 1, 2].map((r) => [0, 1, 2].map((c) => U[c * 4 + r])));
  });
}

export { poseMatrix };
