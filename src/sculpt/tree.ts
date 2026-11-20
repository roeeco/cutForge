// Where a shape sits in the tree of groups, and its frame in the world. Groups
// may carry a stretch (milestone 55), so a parent's matrix need not be rigid.
import type { Quat, Sculpt, V3 } from '../model/types';
import { poseMatrix } from './build';
import { m4, m4Mul, m4Quat, m4Unscaled, Q_ID, type M4 } from './xform';

/** The group a shape belongs to, or null at the top level. */
export function parentOf(sc: Sculpt, id: string): string | null {
  for (const s of Object.values(sc.shapes)) if (s.kind === 'group' && s.children?.includes(id)) return s.id;
  return null;
}

/** Parent frame → world for a shape (its groups' moves, turns and stretches); identity at the top level. */
export function parentMatrix(sc: Sculpt, id: string): M4 {
  const p = parentOf(sc, id);
  if (!p) return m4([0, 0, 0], Q_ID);
  return m4Mul(parentMatrix(sc, p), poseMatrix(sc.shapes[p]));
}

/** The shape's origin and turn in the world (a stretched group's scale left out of the turn). */
export function worldPose(sc: Sculpt, id: string): { at: V3; q: Quat } {
  const s = sc.shapes[id];
  const M = m4Mul(parentMatrix(sc, id), m4(s.at, s.q));
  return { at: [M[12], M[13], M[14]], q: m4Quat(m4Unscaled(M)) };
}
