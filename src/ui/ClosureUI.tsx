// A lid's closure on its card (milestone 67, PACKAGING_PLAN.md §7): shown
// while it seals its box. Its style (only the material's), the lip's length,
// a thumb notch and dust flaps, and what each edge does.
import { useStore, useT } from '../store/store';
import { NumField } from './NumField';
import { closureId, closureOf, closureStyles, lipLength, sealOf } from '../model/closures';
import { matOf } from '../model/materials';
import { setClosure } from '../model/ops';
import { panelLabel } from '../model/names';
import type { ClosureStyle } from '../model/types';
import { shown, useFeature } from '../easy/features';

export function ClosureSection({ panelId }: { panelId: string }) {
  const t = useT();
  const d = useStore((s) => s.design);
  const apply = useStore((s) => s.apply);
  // the lip, dust flaps and thumb notch are the app's in Quick build; the style stays (PACKAGING_PLAN.md decision 8)
  const adv = shown(useFeature('lid.advanced'));
  const seal = d.connections[closureId(panelId)] ? sealOf(d, panelId) : null;
  if (!seal) return null;
  const cl = closureOf(d, panelId);
  const styles = closureStyles(matOf(d, panelId).kind);
  const lipped = cl.style !== 'rest';
  const flapped = cl.style === 'tuck' || cl.style === 'tuckLock' || cl.style === 'tab';
  const L = d.panels[panelId];
  return (
    <div className="subsection closure" data-testid="closure-section">
      <h4>{t('closure.title')}</h4>
      <p className="note" data-testid="closure-seals">
        {t('closure.seals', { front: panelLabel(d, seal.front, t) })}
      </p>
      {styles.length > 1 && (
        <div className="field">
          <label htmlFor={`cs-${panelId}`}>{t('closure.style')}</label>
          <select id={`cs-${panelId}`} value={cl.style} onChange={(e) => apply((x) => setClosure(x, panelId, { style: e.target.value as ClosureStyle }))} data-testid="closure-style">
            {styles.map((s) => (
              <option key={s} value={s}>
                {t(`closure.${s}`)}
              </option>
            ))}
          </select>
        </div>
      )}
      <p className="note">{t(`closure.${cl.style}.help`)}</p>
      {adv && lipped && cl.style !== 'glued' && (
        <NumField label={t('closure.lip')} value={lipLength(cl, L.h)} unit={t('unit.mm')} min={6} max={60} onCommit={(v) => apply((x) => setClosure(x, panelId, { lip: v }))} testId="closure-lip" />
      )}
      {adv && flapped && (
        <>
          <label className="check">
            <input type="checkbox" checked={cl.dust !== false} onChange={(e) => apply((x) => setClosure(x, panelId, { dust: e.target.checked }))} data-testid="closure-dust" /> {t('closure.dust', { n: seal.sides.length })}
          </label>
          <label className="check">
            <input type="checkbox" checked={!!cl.thumb} onChange={(e) => apply((x) => setClosure(x, panelId, { thumb: e.target.checked }))} data-testid="closure-thumb" /> {t('closure.thumb')}
          </label>
        </>
      )}
    </div>
  );
}
