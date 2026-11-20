// Which shape each part of the solid's surface came from, and whether it is flat,
// ruled (unrolls without stretching) or curved (SKETCH_OVERHAUL.md §9.2). For
// folding later; nothing here is shown to students yet.
//
// manifold 3.5.4 keeps each leaf body's original id through the booleans
// (`runOriginalID`, one run of triangles per source), and gives every planar
// facet its own `faceID`; a tessellated cylinder wall is many facets. So facets
// are grouped by run and faceID, then the facets of a curved surface are merged
// into one face per shape, by the shape's kind and the facet's direction in the
// shape's own frame.
import type { P2, Sculpt, Shape3, V3 } from '../model/types';
import { buildSolid, poseMatrix, shapeOfOriginal, shapeMatrix } from './build';
import { kernelNow, scope, type Kernel } from './kernel';
import { parentMatrix } from './tree';
import { m4Apply, m4InvAffine, m4Mul } from './xform';
import { allCuts, trimmedSegPoints } from '../sketch/flatten';

export type Face = { shapeId: string; faceId: number; tris: Uint32Array; kind: 'flat' | 'ruled' | 'curved'; normal?: V3 };

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V): V => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** The straight pieces of a sketch's lines (between corner cuts), in sketch coordinates. */
function straightPieces(s: Shape3): [P2, P2][] {
  const sk = s.sketch;
  if (!sk) return [];
  const cuts = allCuts(sk);
  return sk.order.filter((g) => sk.segs[g] && !sk.segs[g].cons && sk.segs[g].k === 'line').map((g) => {
    const p = trimmedSegPoints(sk, g, cuts);
    return [p[0], p[p.length - 1]] as [P2, P2];
  });
}
const onPiece = (p: P2, [a, b]: [P2, P2]) => {
  const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) < 0.05;
};

/** The solid's faces: flat ones as manifold made them, each curved surface merged into one face per shape. */
export function solidFaces(k: Kernel, sc: Sculpt): Face[] {
  return scope(() => {
    const m = buildSolid(k, sc);
    if (m.isEmpty()) return [];
    const mesh = m.getMesh();
    const np = mesh.numProp, vp = mesh.vertProperties, tv = mesh.triVerts;
    const P = (i: number): V => [vp[i * np], vp[i * np + 1], vp[i * np + 2]];
    const nTri = tv.length / 3;
    const faceID = mesh.faceID ?? new Uint32Array(nTri).map((_, i) => i);
    const out: Face[] = [];
    for (let r = 0; r < mesh.runOriginalID.length; r++) {
      const shapeId = shapeOfOriginal(mesh.runOriginalID[r]);
      const s = shapeId ? sc.shapes[shapeId] : undefined;
      if (!s || !shapeId) continue;
      // the shape's own frame: its up axis, and (for a sketch) world → sketch coordinates
      const pose = m4Mul(parentMatrix(sc, shapeId), poseMatrix(s));
      const up = norm(sub(m4Apply(pose, [0, 1, 0]) as V, m4Apply(pose, [0, 0, 0]) as V));
      const sketchInv = s.sketch ? m4InvAffine(m4Mul(parentMatrix(sc, shapeId), shapeMatrix(s))) : null;
      const sketchN = s.sketch ? norm(sub(m4Apply(m4Mul(parentMatrix(sc, shapeId), shapeMatrix(s)), [0, 0, 1]) as V, m4Apply(m4Mul(parentMatrix(sc, shapeId), shapeMatrix(s)), [0, 0, 0]) as V)) : null;
      const pieces = s.kind === 'extrude' ? straightPieces(s) : [];
      const curvedSketch = !!s.sketch && (Object.values(s.sketch.segs).some((g) => !g.cons && g.k !== 'line') || Object.values(s.sketch.pts).some((p) => (p.r ?? 0) > 0 || (p.ch ?? 0) > 0));
      // facets by faceID
      const groups = new Map<number, number[]>();
      for (let t = mesh.runIndex[r] / 3; t < mesh.runIndex[r + 1] / 3; t++) {
        const f = faceID[t];
        const g = groups.get(f);
        if (g) g.push(t);
        else groups.set(f, [t]);
      }
      const merged: { tris: number[]; faceId: number; kind: Face['kind'] }[] = [];
      const mergeInto = (kind: Face['kind'], tris: number[], fid: number) => {
        const m0 = merged.find((x) => x.kind === kind);
        if (m0) (m0.tris.push(...tris), (m0.faceId = Math.min(m0.faceId, fid)));
        else merged.push({ tris: [...tris], faceId: fid, kind });
      };
      for (const [fid, tris] of groups) {
        const a = P(tv[tris[0] * 3]), b = P(tv[tris[0] * 3 + 1]), c = P(tv[tris[0] * 3 + 2]);
        const n = norm(cross(sub(b, a), sub(c, a)));
        let planar = true;
        for (const t of tris)
          for (let j = 0; j < 3 && planar; j++) if (Math.abs(dot(sub(P(tv[t * 3 + j]), a), n)) > 0.01) planar = false;
        const along = (axis: V | null) => !!axis && Math.abs(Math.abs(dot(n, axis)) - 1) < 1e-4;
        let kind: Face['kind'] | 'flat' = planar ? 'flat' : 'curved';
        // facets of curved surfaces are merged by the shape's kind
        switch (s.kind) {
          case 'cylinder':
          case 'cone':
            if (!along(up)) kind = 'ruled';
            break;
          case 'sphere':
          case 'torus':
            kind = 'curved';
            break;
          case 'halfsphere':
            if (!(planar && along(up))) kind = 'curved';
            break;
          case 'revolve':
            if (!(planar && tris.length > 2)) kind = curvedSketch ? 'curved' : 'ruled';
            break;
          case 'extrude':
            if (planar && !along(sketchN) && sketchInv) {
              // a wall over a straight line of the sketch stays flat; over an arc, curve or cut it is ruled
              const cen = [0, 1, 2].map((i) => tris.reduce((acc, t) => acc + P(tv[t * 3])[i] + P(tv[t * 3 + 1])[i] + P(tv[t * 3 + 2])[i], 0) / (tris.length * 3)) as V;
              const l = m4Apply(sketchInv, cen);
              if (!pieces.some((pc) => onPiece({ x: l[0], y: l[1] }, pc))) kind = 'ruled';
            }
            break;
        }
        if (kind === 'flat') out.push({ shapeId, faceId: fid, tris: Uint32Array.from(tris), kind: 'flat', normal: n });
        else mergeInto(kind, tris, fid);
      }
      for (const x of merged) out.push({ shapeId, faceId: x.faceId, tris: Uint32Array.from(x.tris), kind: x.kind });
    }
    return out;
  });
}

/** Can the solid be folded from flat card: the shapes whose surface is curved (does not unroll). */
export function foldable(sc: Sculpt): { ok: boolean; curved: string[] } {
  const k = kernelNow();
  if (!k) return { ok: false, curved: [] };
  const curved = [...new Set(solidFaces(k, sc).filter((f) => f.kind === 'curved').map((f) => f.shapeId))];
  return { ok: !curved.length, curved };
}
