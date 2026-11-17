// The speed and stability harness (PACKAGING_PLAN.md §11, milestone 61).
// Every later milestone runs its new features through these.
import { freeze } from 'immer';
import type { Design } from '../src/model/types';
import { solve } from '../src/model/ops';
import { parseProject, serializeProject } from '../src/model/serialize';
import { canon, diff } from './fuzz/fuzz';

export { canon, diff };

/** A deep, unfrozen copy. */
export const copy = (d: Design): Design => structuredClone(d) as Design;

/** The design frozen, as the store hands it to views (so memoised derivations are used). */
export const frozen = (d: Design): Design => freeze(copy(d), true);

/** Where solving twice differs from solving once (null when it does not). */
export function idempotence(d: Design): string | null {
  const a = copy(d);
  solve(a);
  const b = copy(a);
  solve(b);
  return diff(a, b);
}

/** Where a design saved and opened again, then solved, differs from itself (null when it does not). */
export function roundTrip(d: Design): string | null {
  const a = copy(d);
  solve(a);
  const b = parseProject(serializeProject(a));
  solve(b);
  return diff(a, b);
}

/**
 * Apply `values` of a setting one after another (each followed by its own
 * solve inside `set`), then the starting value again: where the design then
 * differs from the start, ids included (null when it does not).
 */
export function sweepBack(d: Design, set: (d: Design, v: number) => void, start: number, values: number[]): string | null {
  const a = copy(d);
  set(a, start);
  const before = copy(a);
  for (const v of values) set(a, v);
  set(a, start);
  return diff(before, a);
}

/** Panels that had shapes before `edit` and are gone after it. */
export function lostShapes(d: Design, edit: (d: Design) => void): string[] {
  const a = copy(d);
  const had = a.order.filter((id) => a.panels[id]?.details.length);
  edit(a);
  return had.filter((id) => !a.panels[id]);
}

/** Median time of `fn` over `n` runs (ms), after one warm-up run. */
export function timeOf(fn: () => void, n = 9): number {
  fn();
  const ts: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    fn();
    ts.push(performance.now() - t);
  }
  ts.sort((x, y) => x - y);
  return ts[Math.floor(n / 2)];
}

/** How many times slower `subject` is than `reference`, both timed here (so the ratio holds on any machine). */
export function speedRatio(subject: () => void, reference: () => void, n = 9): number {
  return timeOf(subject, n) / Math.max(1e-3, timeOf(reference, n));
}
