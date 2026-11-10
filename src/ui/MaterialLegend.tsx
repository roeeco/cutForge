// With more than one material in use (milestone 36): a small legend by the
// view settings, one chip per material with its board count. Clicking a chip
// selects those boards.
import { panelSel, useStore, useT } from '../store/store';
import { materialsInUse, matIdOf, mixedMaterials } from '../model/materials';
import { boardTintCss } from '../views/palette';
import { materialName } from './materialName';

export function MaterialLegend() {
  const t = useT();
  const d = useStore((s) => s.design);
  if (!mixedMaterials(d)) return null;
  const list = materialsInUse(d).filter((m) => m.count > 0);
  return (
    <div className="mat-legend" role="group" aria-label={t('legend.title')} data-testid="material-legend">
      {list.map((m) => {
        const ids = d.order.filter((id) => d.panels[id] && matIdOf(d, id) === m.id);
        const name = materialName(t, m.profile);
        return (
          <button
            key={m.id}
            className="mat-chip"
            onClick={() => ids.length && useStore.getState().select(panelSel(ids))}
            title={t('legend.select', { name })}
            aria-label={t('legend.select', { name })}
            data-testid={`legend-${m.id}`}
          >
            <span className="swatch" style={{ background: boardTintCss(d, ids[0] ?? '', 0) }} />
            <span>{t('legend.count', { name, n: m.count })}</span>
          </button>
        );
      })}
    </div>
  );
}
