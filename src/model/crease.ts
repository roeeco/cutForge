// Where a crease folds (the overhaul of 19 November).
//
// A board folds about the line where the mid-planes of its two parts meet:
// the middle of the corner the two slabs share. Laid flat, each part keeps
// its length along its mid-plane, so in the net
//   - the score is drawn on that line (at 90°, t/2 inside the parent's edge),
//   - each part lies as far from the score as its mid-plane is from that line
//     in 3D, and
//   - the material's fold allowance is only a calibration: extra length a
//     real crease takes (0 by default).
// This is the packaging rule of thumb "a panel between two scores is its
// inside size plus one thickness". Before, a strip as wide as the fold
// allowance (about t) was added outside every fold with the score in its
// middle, so a folded box came out about 2t larger than its 3D model: its
// dividers were short and its walls stopped short of their neighbours.
import type { Design, P2, Panel, V3 } from './types';
import { edgeInwardLocal, edgeLocal, matDir, toWorld } from './frame';
import { findEdge, type EdgeArg } from './edges';
import { matOf, tOf } from './materials';
import { v3add, v3dot, v3mul, v3norm, v3sub } from '../geom/v3';

/**
 * A fold between `P`'s edge `pe` and `C`'s edge `ce` as they stand in 3D:
 * `sP` how deep inside P's edge the crease lies, `sC` how deep inside C's
 * edge. Null when the two mid-planes do not meet (parallel boards).
 */
export function creaseDepths(d: Design, P: Panel, pe: EdgeArg, C: Panel, ce: EdgeArg): { sP: number; sC: number } | null {
  if (!findEdge(P, pe) || !findEdge(C, ce)) return null;
  const mid = (p: Panel, e: EdgeArg): { o: V3; inw: V3; u: V3 } => {
    const [a, b] = edgeLocal(p, e);
    const i = edgeInwardLocal(p, e);
    const o = v3add(toWorld(p.frame, a.x, a.y), v3mul(matDir(p.frame), tOf(d, p.id) / 2));
    const inw = v3norm(v3add(v3mul(p.frame.u, i.x), v3mul(p.frame.v, i.y)));
    const u = v3norm(v3sub(toWorld(p.frame, b.x, b.y), toWorld(p.frame, a.x, a.y)));
    return { o, inw, u };
  };
  const p = mid(P, pe), c = mid(C, ce);
  // solve p.o + s·p.inw = c.o + r·c.inw across the fold (along the edge drops out)
  const w0 = v3sub(c.o, p.o);
  const w = v3sub(w0, v3mul(p.u, v3dot(w0, p.u)));
  const k = v3dot(p.inw, c.inw);
  if (Math.abs(k * k - 1) < 1e-6) return null;
  const a1 = v3dot(w, p.inw), a2 = v3dot(w, c.inw);
  const r = (a2 - a1 * k) / (k * k - 1);
  const s = a1 + r * k;
  return { sP: s, sC: r };
}

/**
 * How a fold lies in the net: `a` how far out from P's edge C's edge lies
 * (negative: inside it), the fold allowance included; `score` how deep inside
 * P's edge the score is drawn.
 */
export function foldLay(d: Design, P: Panel, pe: EdgeArg, C: Panel, ce: EdgeArg): { a: number; score: number } {
  const fa = matOf(d, P.id).foldAllowance;
  const k = creaseDepths(d, P, pe, C, ce);
  // boards lying in one plane or folded flat: no corner to take up, the score on the edge
  if (!k) return { a: fa, score: -fa / 2 };
  return { a: fa - (k.sP + k.sC), score: k.sP - fa / 2 };
}

/** A point `depth` inside an edge segment's line at `s` along it (local). */
export function along(a: P2, b: P2, inw: P2, s: number, depth: number): P2 {
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: a.x + ((b.x - a.x) / l) * s + inw.x * depth, y: a.y + ((b.y - a.y) / l) * s + inw.y * depth };
}
