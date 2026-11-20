// The protractor (milestone 132, SHAPES_TO_DIELINES_PLAN.md R13): the angle between two faces,
// with the joint CutForge would choose there for the design's material (R6's words).
import type { ConnectionKind, MaterialProfile, V3 } from '../model/types';
import { chooseJoint } from '../model/jointChoice';

/** Two faces' outward normals: the angle inside the solid between them (convex: 180° less the turn between the normals), and the joint for it. */
export function protractorReading(n1: V3, n2: V3, mat: MaterialProfile): { deg: number; kind: ConnectionKind } {
  const l1 = Math.hypot(...n1) || 1, l2 = Math.hypot(...n2) || 1;
  const c = Math.max(-1, Math.min(1, (n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2]) / (l1 * l2)));
  const deg = 180 - (Math.acos(c) * 180) / Math.PI;
  const role = mat.kind === 'plywood' ? 'corner' : 'seam';
  return { deg, kind: chooseJoint({ mat, role, len: 60, dihedral: deg, spanA: 60, spanB: 60 }).kind };
}
