// The base plate on the waffle card (WAFFLE_MODE.md §6.5): on or off, its shape, margin and where the sculpture is cut flat.
import { useStore, useT } from '../../store/store';
import type { Design } from '../../model/types';
import { NumField, Segmented } from '../../ui/NumField';
import { setBase } from '../ops';
import { baseModel } from './model';

const edit = (base: Parameters<typeof setBase>[2]) => {
  const m = baseModel();
  if (m) useStore.getState().apply((d) => setBase(d as Design, m, base));
};

export function PlateFields() {
  const t = useT();
  const base = useStore((s) => s.design.waffle?.base);
  return (
    <div className="subsection" data-testid="plate-fields">
      <label className="check">
        <input type="checkbox" checked={!!base} onChange={(e) => edit(e.target.checked ? {} : null)} data-testid="plate-on" /> {t('base.on')}
      </label>
      {base && (
        <>
          <Segmented
            label={t('base.shape')}
            value={base.shape}
            options={(['rect', 'round', 'outline'] as const).map((k) => ({ value: k, label: t(`base.${k}`), testId: `plate-${k}` }))}
            onChange={(v) => edit({ shape: v as 'rect' | 'round' | 'outline' })}
          />
          <NumField label={t('base.margin')} value={base.margin} unit={t('unit.mm')} min={0} onCommit={(v) => edit({ margin: Math.max(0, v) })} testId="plate-margin" />
          <NumField label={t('base.flat')} value={base.flat} unit={t('unit.mm')} min={0} onCommit={(v) => edit({ flat: Math.max(0, v) })} testId="plate-flat" />
          <p className="note">{t('base.help')}</p>
        </>
      )}
    </div>
  );
}
