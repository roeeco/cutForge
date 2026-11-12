// The waffle's checks (WAFFLE_MODE.md §6.4): each names the part and, where one
// exists, offers a fix. Problems are warnings: the file is always made.
import type { Design } from '../model/types';
import type { Issue } from '../model/validate';
import { kernelNow } from '../sculpt/kernel';
import { LETTER, type Fam } from './derive';
import type { Problem } from './finish';
import type { Finished } from './finish';

export type WaffleFix =
  | { kind: 'addSlice'; fam: Fam; at: number }
  | { kind: 'nudge'; fam: Fam; sliceId: string; problem: 'split' | 'thin' }
  | { kind: 'groupHole'; id: string };
export type WaffleIssue = Issue & { fix?: WaffleFix };

const other = (f: Fam): Fam => (f === 'a' ? 'b' : 'a');

/** A part's place along its slice → the other family's position through it (B's normal is A's direction; A's is −B's). */
export const throughAt = (fam: Fam, x: number) => (fam === 'a' ? x : -x);

export function problemIssue(p: Problem): WaffleIssue {
  switch (p.kind) {
    case 'unheld':
      return { key: 'val.w.unheld', vars: { part: p.part }, target: { kind: 'slice', family: p.fam, id: p.sliceId }, fix: { kind: 'addSlice', fam: other(p.fam), at: throughAt(p.fam, p.at) } };
    case 'split':
      return { key: 'val.w.split', vars: { part: p.part }, target: { kind: 'slice', family: p.fam, id: p.sliceId }, fix: { kind: 'nudge', fam: p.fam, sliceId: p.sliceId, problem: 'split' } };
    case 'thin':
      return { key: 'val.w.thin', vars: { part: p.part }, target: { kind: 'slice', family: p.fam, id: p.sliceId }, fix: { kind: 'nudge', fam: p.fam, sliceId: p.sliceId, problem: 'thin' } };
    case 'close':
      return { key: 'val.w.close', vars: { a: p.a, b: p.b }, target: { kind: 'slice', family: p.fam, id: p.ids[1] } };
    case 'big':
      return { key: 'val.w.big', vars: { part: p.part }, target: { kind: 'slice', family: p.fam, id: p.sliceId } };
  }
}

/** Top-level holes: they cut nothing. */
export function lonelyHoles(d: Design): string[] {
  const sc = d.sculpt;
  return sc ? sc.order.filter((id) => sc.shapes[id]?.hole) : [];
}

export function waffleChecks(d: Design, r: Finished | null): WaffleIssue[] {
  const out: WaffleIssue[] = [];
  for (const id of lonelyHoles(d)) out.push({ key: 'sculpt.holeAlone', vars: {}, target: { kind: 'shape', id }, fix: { kind: 'groupHole', id } });
  if (!kernelNow() || !r) return out;
  if (!r.parts.length) out.push({ key: 'val.w.empty', vars: {}, target: { kind: 'none', id: '' } });
  for (const p of r.problems) out.push(problemIssue(p));
  return out;
}

export { LETTER };
