// The reasons a list's joint kinds are greyed (26 November, `easy/jointWhy.ts`), worked out one kind at a time after
// the card is drawn, so an edit never waits for them: a kind is offered until its answer comes (answers for a design
// state are kept, so a list drawn again for the same state has them at once).
import { useEffect, useState } from 'react';
import type { ConnectionKind, Design } from '../model/types';
import type { KindWhy } from '../easy/jointWhy';
import type { useT } from '../store/store';

export function useKindWhys(d: Design, kinds: ConnectionKind[], why: (k: ConnectionKind) => KindWhy | null, key: string): Partial<Record<ConnectionKind, KindWhy | null>> {
  const [st, setSt] = useState<{ d: Design | null; key: string; whys: Partial<Record<ConnectionKind, KindWhy | null>> }>({ d: null, key: '', whys: {} });
  const sig = kinds.join(',');
  useEffect(() => {
    let alive = true, i = 0;
    const out: Partial<Record<ConnectionKind, KindWhy | null>> = {};
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      if (!alive || i >= kinds.length) return;
      const k = kinds[i++];
      try {
        out[k] = why(k);
      } catch {
        // a probe that fails says nothing: the kind stays offered
        out[k] = null;
      }
      setSt({ d, key, whys: { ...out } });
      timer = setTimeout(step, 0);
    };
    timer = setTimeout(step, 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // the kinds by value; `why` follows `d` and `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, key, sig]);
  return st.d === d && st.key === key ? st.whys : {};
}

/** A kind's reason as words: the check it would fail, by its first sentence. */
export function kindWhyText(t: ReturnType<typeof useT>, w: KindWhy): string {
  if (!w.issue) return t(w.key);
  const full = t(w.issue.key, w.issue.vars as Record<string, string>);
  const first = full.split(/(?<=\.)\s/)[0];
  return t(w.key, { problem: first });
}
