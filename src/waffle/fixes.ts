// Applying a check's fix (WAFFLE_MODE.md §6.4).
import { produce } from 'immer';
import type { Design } from '../model/types';
import { kernelNow } from '../sculpt/kernel';
import { groupShapes } from '../sculpt/ops';
import { worldBox } from '../sculpt/ui/geom';
import { newId } from '../model/ops';
import { deriveWaffle, type Fam, type WaffleModel } from './derive';
import { ensureSpec, minGap, moveSlice } from './ops';
import { finishParts } from './finish';
import type { WaffleFix } from './checks';

/** A slice of a family at a position (the fix for a part nothing holds). Returns its id. */
export function addSliceAt(d: Design, m: WaffleModel, fam: Fam, at: number): string {
  const f = ensureSpec(d, m)[fam];
  f.slices ??= m.slices.filter((s) => s.fam === fam).map((s) => ({ id: s.id, at: s.at }));
  const id = newId('sl');
  f.slices.push({ id, at: Math.round(at * 1000) / 1000 });
  return id;
}

/** Nudges tried for a slice, nearest first: ±t up to ±10 mm. */
export function nudges(t: number): number[] {
  const out: number[] = [];
  for (let x = Math.max(0.5, Math.round(t * 2) / 2); x <= 10 + 1e-9; x += x < 2 ? 0.5 : 1) out.push(x, -x);
  return out;
}

/** The nearest nudge of a slice that clears its problem, or null. */
export function findNudge(d: Design, fam: Fam, sliceId: string, problem: 'split' | 'thin'): number | null {
  const k = kernelNow();
  if (!k) return null;
  const m = deriveWaffle(k, d);
  const sl = m.slices.find((s) => s.fam === fam && s.id === sliceId);
  if (!sl) return null;
  for (const dx of nudges(m.t)) {
    const nd = produce(d, (x) => void moveSlice(x as Design, m, fam, sliceId, sl.at + dx));
    const nm = deriveWaffle(k, nd);
    const moved = nm.slices.find((s) => s.fam === fam && s.id === sliceId);
    if (!moved || Math.abs(moved.at - (sl.at + dx)) > 1e-6) continue;
    const fin = finishParts(k, nd, nm);
    if (!fin.problems.some((p) => p.kind === problem && 'sliceId' in p && p.sliceId === sliceId)) return dx;
  }
  return null;
}

/** Apply a fix to a design draft; returns false when nothing could be done (a nudge that clears nothing). */
export function applyFix(d: Design, fix: WaffleFix): boolean {
  const k = kernelNow();
  if (!k) return false;
  if (fix.kind === 'groupHole') {
    const sc = d.sculpt;
    const hb = sc && worldBox(sc, fix.id);
    if (!sc || !hb) return false;
    // the hole joins the top-level solids its box touches
    const touch = sc.order.filter((id) => {
      if (id === fix.id || sc.shapes[id]?.hole) return false;
      const b = worldBox(sc, id);
      return !!b && [0, 1, 2].every((i) => b.min[i] <= hb.max[i] + 1e-6 && hb.min[i] <= b.max[i] + 1e-6);
    });
    if (!touch.length) return false;
    return !!groupShapes(d, [...touch, fix.id]);
  }
  const m = deriveWaffle(k, d);
  if (fix.kind === 'addSlice') {
    addSliceAt(d, m, fix.fam, fix.at);
    return true;
  }
  const dx = findNudge(d, fix.fam, fix.sliceId, fix.problem);
  if (dx === null) return false;
  const sl = m.slices.find((s) => s.fam === fix.fam && s.id === fix.sliceId)!;
  moveSlice(d, m, fix.fam, fix.sliceId, sl.at + dx);
  return true;
}

export { minGap };
