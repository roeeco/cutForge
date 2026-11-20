// Joints chosen for the material and its thickness (milestone 125, SHAPES_TO_DIELINES_PLAN.md
// R6 and decision 12): one pure chooser, used by *Fold it* and *Build from boards*, that
// picks each seam's kind and sizes and says why. Built on what the engine already knows:
// which kinds a material allows (`connectionsFor`, `seamKinds`), flap and tab sizes
// (`autoFlap`, `minTabWidth`), finger limits (`maxFingers`) and the slit lock's minimum.
// Every number here is a starting value, unverified on real stock (DECISIONS.md).
import type { Connection, ConnectionKind, MaterialProfile } from './types';
import type { MsgKey } from '../i18n';
import { CARD_FOLD_MAX } from './materials';

export type SeamRole = 'fold' | 'seam' | 'corner';
export type SeamCtx = {
  mat: MaterialProfile;
  /** A fold kept in a net, a cut seam in a net, or a corner between boards. */
  role: SeamRole;
  /** Its length (mm) and the angle inside the solid (degrees). */
  len: number;
  dihedral: number;
  /** How far each face reaches back from the edge (mm): a flap is never deeper than a third of the shorter. */
  spanA: number;
  spanB: number;
  /** On the face (or board) that closes the form last. */
  closesLast?: boolean;
};
export type SeamChoice = { kind: ConnectionKind; params: Partial<Pick<Connection, 'flap' | 'fingers' | 'tabs' | 'crease' | 'flapTaper'>>; why: MsgKey };

/** A slit lock needs this much seam (`slitLock` makes one tongue from 6 mm; two from 60). */
export const LOCK_MIN = 25;
/** Corner angles fingers and tabs are cut for (a laser cuts square through the sheet). */
const BOARD_MIN = 30, BOARD_MAX = 150;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** A glue flap's depth: the material's range, never more than a third of the shorter face. */
export function flapDepthFor(mat: MaterialProfile, spanA: number, spanB: number): number {
  const [lo, hi] = mat.kind === 'card' ? [8, 15] : mat.thickness <= 2 ? [12, 20] : [18, 25];
  const want = mat.kind === 'card' ? clamp(10 + 4 * (mat.thickness - 0.5), lo, hi) : clamp(lo + 2 * mat.thickness, lo, hi);
  return Math.max(3, Math.min(want, Math.min(spanA, spanB) / 3));
}

/** Tabs on a corrugated seam: as wide as max(8, 5t), as many as fit with gaps as wide. */
export function tabsFor(mat: MaterialProfile, len: number): number {
  const w = Math.max(8, 5 * mat.thickness);
  return Math.max(1, Math.floor((len / w - 1) / 2));
}

/** Fingers on a plywood corner: an odd count, each about max(3t, 10 mm) wide. */
export function fingersFor(mat: MaterialProfile, len: number): number {
  const w = Math.max(3 * mat.thickness, 10);
  let n = Math.max(3, Math.round(len / w));
  if (n % 2 === 0) n += n * w < len ? 1 : -1;
  return Math.max(3, n);
}

/**
 * The joint for one seam (§R6's table). A seam that closes the form last gets a joint that
 * can be closed from outside: a slit lock on card, tabs dropped in on boards.
 */
export function chooseJoint(c: SeamCtx): SeamChoice {
  const { mat, role, len, dihedral } = c;
  const t = mat.thickness;
  const flap = flapDepthFor(mat, c.spanA, c.spanB);
  if (mat.kind === 'card' && t <= CARD_FOLD_MAX + 1e-9) {
    if (role === 'fold') return { kind: 'fold', params: {}, why: 'joint.why.cardFold' };
    if (c.closesLast && len >= LOCK_MIN) return { kind: 'lock', params: { flap }, why: 'joint.why.lockLast' };
    return { kind: 'glue', params: { flap }, why: 'joint.why.cardGlue' };
  }
  if (mat.kind === 'card') {
    // greyboard over 1 mm (116): it does not fold; it is glued edge to edge with a flap of card
    if (role === 'fold') return { kind: 'butt', params: {}, why: 'joint.why.noFold' };
    return { kind: 'glue', params: { flap }, why: 'joint.why.greyGlue' };
  }
  if (mat.kind === 'corrugated') {
    if (role === 'fold') {
      // a sharp fold in thick board: a cut-crease (85), so it closes that far
      const sharp = dihedral < 30 || dihedral > 330;
      return sharp && t > 2 ? { kind: 'fold', params: { crease: 'cutcrease' }, why: 'joint.why.cutCrease' } : { kind: 'fold', params: {}, why: 'joint.why.corrFold' };
    }
    const square = dihedral >= BOARD_MIN && dihedral <= BOARD_MAX;
    const tabsOk = square && len >= (t > 2 ? 3 * Math.max(8, 5 * t) : 30);
    if (tabsOk) return { kind: 'tabslot', params: { tabs: tabsFor(mat, len) }, why: c.closesLast ? 'joint.why.tabsLast' : 'joint.why.corrTabs' };
    if (role === 'corner' && !square) return { kind: 'glue', params: { flap }, why: 'joint.why.outsideAngle' };
    return { kind: 'glue', params: { flap }, why: len < 30 ? 'joint.why.short' : 'joint.why.corrGlue' };
  }
  // plywood: boards only, never folded
  if (role === 'fold') return { kind: 'butt', params: {}, why: 'joint.why.noFold' };
  if (dihedral < BOARD_MIN || dihedral > BOARD_MAX || len < 4 * t) return { kind: 'butt', params: {}, why: len < 4 * t ? 'joint.why.short' : 'joint.why.outsideAngle' };
  if (c.closesLast) return { kind: 'tabslot', params: { tabs: Math.max(1, Math.round(len / 40)) }, why: 'joint.why.tabsLast' };
  if (dihedral >= 60 && dihedral <= 120) return { kind: 'finger', params: { fingers: fingersFor(mat, len) }, why: 'joint.why.fingers' };
  return { kind: 'tabslot', params: { tabs: Math.max(1, Math.round(len / 40)) }, why: 'joint.why.angledTabs' };
}

/**
 * Which face (or board) closes a closed form last: the largest facing up (its outward
 * normal nearest +y), ties to the larger; boards go in through it from outside.
 */
export function closingFace<F extends { key: string; n: [number, number, number]; area: number }>(faces: F[]): string | null {
  let best: F | null = null;
  for (const f of faces) {
    const up = f.n[1];
    if (up < 0.5) continue;
    if (!best || Math.abs(f.area) * up > Math.abs(best.area) * best.n[1] + 1e-9) best = f;
  }
  return best?.key ?? null;
}
