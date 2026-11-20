// Guided's one rule for changes (milestone 107): an action that would leave the thing impossible to cut is
// not made, and a note says so (as a fix that brings a new problem is not kept, milestone 92).
import type { Draft } from 'immer';
import type { Design } from '../model/types';
import { useStore } from '../store/store';
import { validate } from '../model/validate';
import { blocking } from '../easy/fix';

/** Blocking problems in `after` that `before` did not have (by key and target). */
export function newProblems(before: Design, after: Design): string[] {
  const sig = (d: Design) => validate(d).filter(blocking).map((i) => `${i.key}:${JSON.stringify(i.target ?? null)}`);
  const had = new Set(sig(before));
  return sig(after).filter((s) => !had.has(s)).map((s) => s.split(':')[0]);
}

const refuse = () => useStore.setState({ guidedNote: { key: 'g.refused', at: Date.now() } });

/** One undo step, kept only when it brings no new blocking problem. */
export function guidedApply(fn: (d: Draft<Design>) => unknown): boolean {
  const st = useStore.getState();
  const was = { design: st.design, past: st.past, future: st.future };
  st.apply(fn);
  const now = useStore.getState().design;
  if (now === was.design) return true;
  if (!newProblems(was.design, now).length) return true;
  useStore.setState(was);
  refuse();
  return false;
}

/** The end of a drag: kept as one undo step, or put back when it brings a new blocking problem. */
export function guidedCommit(): boolean {
  const st = useStore.getState();
  if (st.txnBase && newProblems(st.txnBase, st.design).length) {
    st.cancel();
    refuse();
    return false;
  }
  st.commit();
  return true;
}
