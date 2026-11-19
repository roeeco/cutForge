// Guided's side sheet (milestone 105): with nothing selected, the thing itself in at most four rows.
import { useDeferredValue, useMemo, type ReactNode } from 'react';
import { useStore, useT } from '../store/store';
import { thingFacts } from './thing';

export function SideSheet({ children }: { children?: ReactNode }) {
  const t = useT();
  const live = useStore((s) => s.design);
  const d = useDeferredValue(live);
  const f = useMemo(() => thingFacts(d), [d]);
  return (
    <aside className="g-sheet card" aria-label={t('g.sheet.label')} data-testid="g-sheet">
      <h3 dir="auto" data-testid="g-sheet-name">
        {d.name || t('g.untitled')}
      </h3>
      {f.inside && (
        <dl className="g-facts">
          <dt>{t('g.sheet.inside')}</dt>
          <dd data-testid="g-sheet-inside">
            <bdi dir="ltr">{t('g.sheet.size', { w: f.inside.w, d: f.inside.d, h: f.inside.h })}</bdi> {t('unit.mm')}
          </dd>
          <dt>{t('g.sheet.spacesLabel')}</dt>
          <dd data-testid="g-sheet-spaces">{f.spaces === 1 ? t('g.sheet.space1') : t('g.sheet.spaces', { n: f.spaces })}</dd>
          <dt>{t('g.sheet.lid')}</dt>
          <dd data-testid="g-sheet-lid">{t(`lid.kind.${f.lid ?? 'none'}`)}</dd>
        </dl>
      )}
      {children}
    </aside>
  );
}
