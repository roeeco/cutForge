// Guided's one rule for changes (milestone 107): an action that would leave the thing impossible to cut is
// not made, and a note says so (as a fix that brings a new problem is not kept, milestone 92).
import type { Draft } from 'immer';
import type { Design } from '../model/types';
import { useStore } from '../store/store';
import { validate, type Issue } from '../model/validate';
import { blocking } from '../easy/fix';

/** Blocking problems in `after` that `before` did not have (by key and target). */
export function newProblems(before: Design, after: Design): string[] {
  return newIssues(before, after).map((i) => i.key);
}

/** The new blocking problems themselves (milestone 142: the note says the first one, not only "impossible to cut"). */
export function newIssues(before: Design, after: Design): Issue[] {
  const sig = (i: Issue) => `${i.key}:${JSON.stringify(i.target ?? null)}`;
  const had = new Set(validate(before).filter(blocking).map(sig));
  return validate(after).filter(blocking).filter((i) => !had.has(sig(i)));
}

const refuse = (why?: Issue, d?: Design) => useStore.setState({ guidedNote: { key: why ? 'g.refusedWhy' : 'g.refused', why, whyDesign: d, at: Date.now() } });

/** One undo step, kept only when it brings no new blocking problem. */
export function guidedApply(fn: (d: Draft<Design>) => unknown): boolean {
  const st = useStore.getState();
  const was = { design: st.design, past: st.past, future: st.future };
  st.apply(fn);
  const now = useStore.getState().design;
  if (now === was.design) return true;
  const fresh = newIssues(was.design, now);
  if (!fresh.length) return true;
  useStore.setState(was);
  refuse(fresh[0], now);
  return false;
}

/** The end of a drag: kept as one undo step, or put back when it brings a new blocking problem. */
export function guidedCommit(): boolean {
  const st = useStore.getState();
  const fresh = st.txnBase ? newIssues(st.txnBase, st.design) : [];
  if (fresh.length) {
    const now = st.design;
    st.cancel();
    refuse(fresh[0], now);
    return false;
  }
  st.commit();
  return true;
}
