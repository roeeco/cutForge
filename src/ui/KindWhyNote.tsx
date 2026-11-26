// The note under a joint kind list (26 November): the kinds this design's construction does not take, those with the
// same reason on one line (a carton's folded corner keeps every other kind for one reason).
import { useT } from '../store/store';
import type { ConnectionKind } from '../model/types';
import type { KindWhy } from '../easy/jointWhy';
import { kindWhyText } from './useKindWhys';

export function KindWhyNote({ whys, label, testId }: { whys: Partial<Record<ConnectionKind, KindWhy | null>>; label: (k: ConnectionKind) => string; testId: string }) {
  const t = useT();
  const groups = new Map<string, ConnectionKind[]>();
  for (const [k, w] of Object.entries(whys) as [ConnectionKind, KindWhy | null][]) {
    if (!w) continue;
    const text = kindWhyText(t, w);
    groups.set(text, [...(groups.get(text) ?? []), k]);
  }
  if (!groups.size) return null;
  return (
    <div className="note" data-testid={testId}>
      {t('joints.notHere')}
      <ul className="why-list">
        {[...groups].map(([text, ks]) => (
          <li key={text} data-kind={ks.join(' ')}>
            {ks.map(label).join(', ')}: {text}
          </li>
        ))}
      </ul>
    </div>
  );
}
